import type { Header, Percentiles, Driver } from './types.js';

export interface RawExtraction {
  header: Header;
  percentiles: Percentiles;
  drivers: Driver[];
  raw_response: string;
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

const EXPECTED_LINES = 14;

const PROMPT = `Read this violin plot crop top-to-bottom. Return exactly 14 lines of plain text, nothing else.

Lines 1-4: the four header numbers at the top, reading top-to-bottom:
1. Budget Required (e.g. 103.2)
2. Avg. xPts (e.g. 245.1)
3. Avg. xPts + ($ impact) (e.g. 248.3)
4. Avg. Budget Uplift (e.g. 2.1)

Lines 5-9: the five percentile values shown on/beside the violin body, top-to-bottom:
5. 95th percentile
6. 75th percentile
7. 50th percentile (median)
8. 25th percentile
9. 5th percentile

Lines 10-14: the five driver abbreviations at the bottom, top-to-bottom.
Each is a 3-letter uppercase code (e.g. NOR, PIA, VER).
Exactly one driver has a (2X) multiplier marker — append " 2X" after that driver's code.

Example output:
103.2
245.1
248.3
2.1
310.5
270.2
245.0
220.1
180.3
NOR 2X
PIA
VER
HAM
LEC`;

interface ParseResult {
  extraction: RawExtraction;
  flags: string[];
}

function parseGeminiResponse(raw: string): ParseResult {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const flags: string[] = [];

  if (lines.length !== EXPECTED_LINES) {
    flags.push(`line_count_mismatch (got ${lines.length}, expected ${EXPECTED_LINES})`);
  }

  const headerKeys = ['budget_required', 'avg_xpts', 'avg_xpts_dollar_impact', 'avg_budget_uplift'] as const;
  const headerValues: Record<string, number | null> = {};
  for (let i = 0; i < 4; i++) {
    const key = headerKeys[i];
    if (i < lines.length) {
      const n = parseFloat(lines[i]);
      if (isNaN(n)) {
        headerValues[key] = null;
        flags.push(`parse_error: line ${i + 1} not a number: ${JSON.stringify(lines[i])}`);
      } else {
        headerValues[key] = n;
      }
    } else {
      headerValues[key] = null;
    }
  }

  const pctKeys = ['p95', 'p75', 'p50', 'p25', 'p05'] as const;
  const pctValues: Record<string, number | null> = {};
  for (let j = 0; j < 5; j++) {
    const key = pctKeys[j];
    const i = 4 + j;
    if (i < lines.length) {
      const n = parseFloat(lines[i]);
      if (isNaN(n)) {
        pctValues[key] = null;
        flags.push(`parse_error: line ${i + 1} not a number: ${JSON.stringify(lines[i])}`);
      } else {
        pctValues[key] = n;
      }
    } else {
      pctValues[key] = null;
    }
  }

  const drivers: Driver[] = [];
  for (let j = 0; j < 5; j++) {
    const i = 9 + j;
    if (i < lines.length) {
      const raw_line = lines[i].toUpperCase();
      if (raw_line.endsWith(' 2X')) {
        drivers.push({ name: raw_line.slice(0, -3).trim(), multiplier: '2X' });
      } else if (raw_line.endsWith('2X')) {
        drivers.push({ name: raw_line.slice(0, -2).trim(), multiplier: '2X' });
      } else {
        drivers.push({ name: raw_line, multiplier: null });
      }
    } else {
      drivers.push({ name: '???', multiplier: null });
    }
  }

  return {
    extraction: {
      header: {
        budget_required: headerValues.budget_required as number,
        avg_xpts: headerValues.avg_xpts as number,
        avg_xpts_dollar_impact: headerValues.avg_xpts_dollar_impact as number,
        avg_budget_uplift: headerValues.avg_budget_uplift,
      },
      percentiles: {
        p95: pctValues.p95 as number,
        p75: pctValues.p75 as number,
        p50: pctValues.p50 as number,
        p25: pctValues.p25 as number,
        p05: pctValues.p05 as number,
      },
      drivers,
      raw_response: raw,
    },
    flags,
  };
}

async function callGemini(blob: Blob, apiKey: string, prompt: string): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/png', data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Gemini API request timed out after 90s');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const json = await response.json() as GeminiResponse;
  const candidate = json.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned no usable candidate (safety filter or empty response)');
  }
  return candidate.content.parts[0].text;
}

export interface ExtractionResult {
  extraction: RawExtraction;
  needsReview: boolean;
}

/**
 * Token-bucket rate limiter: max `limit` requests per 60 seconds.
 */
class RateLimiter {
  private tokens: number;
  private readonly limit: number;
  private lastRefill: number;

  constructor(limit: number) {
    this.limit = limit;
    this.tokens = limit;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed >= 60_000) {
        this.tokens = this.limit;
        this.lastRefill = now;
      }
      if (this.tokens > 0) {
        this.tokens--;
        return;
      }
      const wait = 60_000 - (Date.now() - this.lastRefill) + 100;
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// 14 tokens/min: one Gemini call per crop = 14 RPM — safely under the 15 RPM free tier limit.
export const rateLimiter = new RateLimiter(14);

export async function extractCrop(blob: Blob, apiKey: string): Promise<ExtractionResult> {
  await rateLimiter.acquire();
  const raw = await callGemini(blob, apiKey, PROMPT);
  const { extraction, flags } = parseGeminiResponse(raw);
  return {
    extraction,
    needsReview: flags.length > 0,
  };
}
