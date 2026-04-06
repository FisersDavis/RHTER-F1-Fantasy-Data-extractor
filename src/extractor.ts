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

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const PROMPT_PASS1 = `You are extracting structured data from an F1 fantasy violin plot image.
The image shows one violin plot with:
- A header row at the top containing: budget required (M), avg_xpts, avg_xpts_dollar_impact, avg_budget_uplift
- A y-axis with percentile scores
- Five driver abbreviations at the bottom (3 uppercase letters each)
- Exactly one driver has a multiplier (2X or 3X)

Extract and return ONLY a JSON object with these exact fields (no markdown, no prose):
{
  "p05": number,
  "p25": number,
  "p50": number,
  "p75": number,
  "p95": number,
  "avg_xpts": number,
  "avg_xpts_dollar_impact": number,
  "budget_required": number,
  "avg_budget_uplift": number or null,
  "driver_1": "XXX",
  "driver_2": "XXX",
  "driver_3": "XXX",
  "driver_4": "XXX",
  "driver_5": "XXX",
  "driver_1_2x": boolean,
  "driver_2_2x": boolean,
  "driver_3_2x": boolean,
  "driver_4_2x": boolean,
  "driver_5_2x": boolean
}
Read labels top-to-bottom, left-to-right. Do not guess — only report what you can clearly see.`;

const PROMPT_PASS2 = `You are verifying an extraction from an F1 fantasy violin plot image.
Re-read the image carefully. Return ONLY a JSON object with the same fields as before:
{
  "p05": number, "p25": number, "p50": number, "p75": number, "p95": number,
  "avg_xpts": number, "avg_xpts_dollar_impact": number, "budget_required": number,
  "avg_budget_uplift": number or null,
  "driver_1": "XXX", "driver_2": "XXX", "driver_3": "XXX", "driver_4": "XXX", "driver_5": "XXX",
  "driver_1_2x": boolean, "driver_2_2x": boolean, "driver_3_2x": boolean,
  "driver_4_2x": boolean, "driver_5_2x": boolean
}`;

function parseGeminiResponse(raw: string): RawExtraction {
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  const obj = JSON.parse(cleaned);

  const drivers: Driver[] = [];
  for (let i = 1; i <= 5; i++) {
    drivers.push({
      name: String(obj[`driver_${i}`] ?? '???').toUpperCase().slice(0, 3),
      multiplier: obj[`driver_${i}_2x`] ? '2X' : null,
    });
  }

  return {
    header: {
      budget_required: Number(obj.budget_required),
      avg_xpts: Number(obj.avg_xpts),
      avg_xpts_dollar_impact: Number(obj.avg_xpts_dollar_impact),
      avg_budget_uplift: obj.avg_budget_uplift != null ? Number(obj.avg_budget_uplift) : null,
    },
    percentiles: {
      p05: Number(obj.p05),
      p25: Number(obj.p25),
      p50: Number(obj.p50),
      p75: Number(obj.p75),
      p95: Number(obj.p95),
    },
    drivers,
    raw_response: raw,
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

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const json = await response.json() as GeminiResponse;
  return json.candidates[0].content.parts[0].text;
}

function extractionsAgree(a: RawExtraction, b: RawExtraction): boolean {
  const pa = a.percentiles, pb = b.percentiles;
  if (pa.p50 !== pb.p50) return false;
  if (pa.p05 !== pb.p05 || pa.p95 !== pb.p95) return false;
  const da = a.drivers.map(d => d.name).join('');
  const db = b.drivers.map(d => d.name).join('');
  return da === db;
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

export const rateLimiter = new RateLimiter(15);

/**
 * Extracts structured data from a single preprocessed crop PNG Blob.
 * Runs pass 1; if it disagrees with pass 2, marks the result needsReview.
 */
export async function extractCrop(blob: Blob, apiKey: string): Promise<ExtractionResult> {
  await rateLimiter.acquire();
  const raw1 = await callGemini(blob, apiKey, PROMPT_PASS1);
  const ext1 = parseGeminiResponse(raw1);

  await rateLimiter.acquire();
  const raw2 = await callGemini(blob, apiKey, PROMPT_PASS2);
  const ext2 = parseGeminiResponse(raw2);

  return {
    extraction: ext1,
    needsReview: !extractionsAgree(ext1, ext2),
  };
}
