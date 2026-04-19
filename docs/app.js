"use strict";
(() => {
  // src/config.ts
  var CONSTRUCTOR_COLORS = {
    MCL: "#FF8700",
    MER: "#00D2BE",
    RED: "#001B5E",
    FER: "#DC0000",
    WIL: "#0057FF",
    VRB: "#6AB4E4",
    AST: "#006F49",
    HAA: "#FFFFFF",
    AUD: "#7A0028",
    ALP: "#FF87BC",
    CAD: "#C0C0C0"
  };
  var TEAMS = Object.keys(CONSTRUCTOR_COLORS);
  var CONSTRUCTOR_LAB = {
    MCL: [68.46, 39.35, 74.86],
    MER: [75.95, -47.29, -2.29],
    RED: [13.18, 21.15, -42.18],
    FER: [45.94, 71.64, 60.11],
    WIL: [44.28, 44.59, -87.96],
    VRB: [70.39, -9.72, -31.11],
    AST: [40.98, -37.14, 13.68],
    HAA: [100, 0, 0],
    AUD: [24.61, 47.74, 14.01],
    ALP: [71.02, 51.37, -6.9],
    CAD: [77.7, 0, 0]
  };
  var GRID_COLS = 24;
  var GRID_ROWS = 3;

  // src/cropper.ts
  var REF_W = 1560;
  var REF_H = 877;
  var REF_ROW_BOUNDS = [
    [80, 333],
    [343, 596],
    [606, 860]
  ];
  var REF_CONTENT_X_START = 28;
  var REF_CONTENT_X_END = 1340;
  var REF_GAP_MIN = 8;
  var REF_GAP_MAX = 20;
  var BACKGROUND_RGB = [52, 55, 61];
  var NUM_COLS = 24;
  function boxFilter(arr, size) {
    const half = Math.floor(size / 2);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
        sum += arr[j];
        count++;
      }
      out[i] = sum / count;
    }
    return out;
  }
  function percentile25(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.25);
    return sorted[idx];
  }
  function detectColumnBoundaries(ctx, imgWidth, imgHeight) {
    const scaleX = imgWidth / REF_W;
    const scaleY = imgHeight / REF_H;
    const yTop = Math.round(REF_ROW_BOUNDS[0][0] * scaleY);
    const yBottom = Math.round(REF_ROW_BOUNDS[0][1] * scaleY);
    const xStart = Math.round(REF_CONTENT_X_START * scaleX);
    const xEnd = Math.round(REF_CONTENT_X_END * scaleX);
    const gapMin = REF_GAP_MIN * scaleX;
    const gapMax = REF_GAP_MAX * scaleX;
    const smoothSize = Math.max(3, Math.round(3 * scaleX));
    if (imgWidth < 1500 || imgHeight < 800) {
      console.warn(`Gap detection: image ${imgWidth}\xD7${imgHeight} is smaller than expected (~1560\xD7877). Crops may be misaligned.`);
    }
    const stripWidth = xEnd - xStart;
    const stripHeight = yBottom - yTop;
    const imageData = ctx.getImageData(xStart, yTop, stripWidth, stripHeight);
    const data = imageData.data;
    const [br, bg, bb] = BACKGROUND_RGB;
    const colScores = new Array(stripWidth).fill(0);
    for (let col = 0; col < stripWidth; col++) {
      let sum = 0;
      for (let row = 0; row < stripHeight; row++) {
        const idx = (row * stripWidth + col) * 4;
        const dr = data[idx] - br;
        const dg = data[idx + 1] - bg;
        const db = data[idx + 2] - bb;
        sum += Math.sqrt(dr * dr + dg * dg + db * db);
      }
      colScores[col] = sum / stripHeight;
    }
    const smoothed = boxFilter(colScores, smoothSize);
    const threshold = percentile25(smoothed);
    const isDark = smoothed.map((v) => v < threshold);
    const gaps = [];
    let inGap = false;
    let gapStart = 0;
    for (let x = 0; x <= isDark.length; x++) {
      const dark = x < isDark.length && isDark[x];
      if (dark && !inGap) {
        inGap = true;
        gapStart = x;
      } else if (!dark && inGap) {
        inGap = false;
        const gapEnd = x;
        const width = gapEnd - gapStart;
        const mid = Math.floor((gapStart + gapEnd) / 2) + xStart;
        gaps.push({ mid, width });
      }
    }
    const realGaps = gaps.filter((g) => g.width >= gapMin && g.width <= gapMax);
    if (realGaps.length !== 23) {
      throw new Error(
        `Gap detection found ${realGaps.length} gaps, expected 23. Screenshot may be cropped or layout changed.`
      );
    }
    const avgColWidth = (realGaps[22].mid - realGaps[0].mid) / 22;
    const boundaries = [
      Math.round(realGaps[0].mid - avgColWidth),
      ...realGaps.map((g) => g.mid),
      Math.round(realGaps[22].mid + avgColWidth)
    ];
    return boundaries;
  }
  async function cropCell(source, x, y, w, h, row, col) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2D context");
    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob)
          resolve(blob);
        else
          reject(new Error(`toBlob returned null for row ${row} col ${col}`));
      }, "image/png");
    });
  }
  async function fileToCanvas(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2D context");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }
  async function cropScreenshot(file) {
    const source = await fileToCanvas(file);
    const ctx = source.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2D context");
    const scaleY = source.height / REF_H;
    const boundaries = detectColumnBoundaries(ctx, source.width, source.height);
    const rowBounds = REF_ROW_BOUNDS.map(([y0, y1]) => [
      Math.round(y0 * scaleY),
      Math.round(y1 * scaleY)
    ]);
    if (GRID_ROWS !== 3 || GRID_COLS !== NUM_COLS) {
      throw new Error(`Config mismatch: expected 3\xD724 grid, got ${GRID_ROWS}\xD7${GRID_COLS}`);
    }
    const raw = await Promise.all(
      Array.from({ length: GRID_ROWS }, (_, row) => {
        const [yTop, yBottom] = rowBounds[row];
        return Promise.all(
          Array.from({ length: GRID_COLS }, (_2, col) => {
            const xLeft = boundaries[col];
            const xRight = boundaries[col + 1];
            return cropCell(source, xLeft, yTop, xRight - xLeft, yBottom - yTop, row, col);
          })
        );
      })
    );
    return { raw };
  }

  // src/preprocessor.ts
  async function preprocessCrop(blob) {
    const bitmap = await createImageBitmap(blob);
    const w = bitmap.width;
    const h = bitmap.height;
    const invertCanvas = document.createElement("canvas");
    invertCanvas.width = w;
    invertCanvas.height = h;
    const invertCtx = invertCanvas.getContext("2d");
    if (!invertCtx)
      throw new Error("Could not get 2D context for invert canvas");
    invertCtx.drawImage(bitmap, 0, 0);
    const imageData = invertCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    invertCtx.putImageData(imageData, 0, 0);
    const scale = 3;
    const upCanvas = document.createElement("canvas");
    upCanvas.width = w * scale;
    upCanvas.height = h * scale;
    const upCtx = upCanvas.getContext("2d");
    if (!upCtx)
      throw new Error("Could not get 2D context for upscale canvas");
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = "high";
    upCtx.drawImage(invertCanvas, 0, 0, w * scale, h * scale);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = w * scale;
    finalCanvas.height = h * scale;
    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx)
      throw new Error("Could not get 2D context for final canvas");
    finalCtx.filter = "contrast(1.4)";
    finalCtx.drawImage(upCanvas, 0, 0);
    bitmap.close();
    return finalCanvas;
  }
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob)
          resolve(blob);
        else
          reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    });
  }

  // src/extractor.ts
  var GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";
  var EXPECTED_LINES = 14;
  var PROMPT = `Read this violin plot crop top-to-bottom. Return exactly 14 lines of plain text, nothing else.

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
Exactly one driver has a (2X) multiplier marker \u2014 append " 2X" after that driver's code.

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
  function parseGeminiResponse(raw) {
    const lines = raw.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const flags = [];
    if (lines.length !== EXPECTED_LINES) {
      flags.push(`line_count_mismatch (got ${lines.length}, expected ${EXPECTED_LINES})`);
    }
    const headerKeys = ["budget_required", "avg_xpts", "avg_xpts_dollar_impact", "avg_budget_uplift"];
    const headerValues = {};
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
    const pctKeys = ["p95", "p75", "p50", "p25", "p05"];
    const pctValues = {};
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
    const drivers = [];
    for (let j = 0; j < 5; j++) {
      const i = 9 + j;
      if (i < lines.length) {
        const raw_line = lines[i].toUpperCase();
        if (raw_line.endsWith(" 2X")) {
          drivers.push({ name: raw_line.slice(0, -3).trim(), multiplier: "2X" });
        } else if (raw_line.endsWith("2X")) {
          drivers.push({ name: raw_line.slice(0, -2).trim(), multiplier: "2X" });
        } else {
          drivers.push({ name: raw_line, multiplier: null });
        }
      } else {
        drivers.push({ name: "???", multiplier: null });
      }
    }
    return {
      extraction: {
        header: {
          budget_required: headerValues.budget_required,
          avg_xpts: headerValues.avg_xpts,
          avg_xpts_dollar_impact: headerValues.avg_xpts_dollar_impact,
          avg_budget_uplift: headerValues.avg_budget_uplift
        },
        percentiles: {
          p95: pctValues.p95,
          p75: pctValues.p75,
          p50: pctValues.p50,
          p25: pctValues.p25,
          p05: pctValues.p05
        },
        drivers,
        raw_response: raw
      },
      flags
    };
  }
  async function callGemini(blob, apiKey, prompt) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/png", data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 512 }
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9e4);
    let response;
    try {
      response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Gemini API request timed out after 90s");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }
    const json = await response.json();
    const candidate = json.candidates?.[0];
    if (!candidate?.content?.parts?.[0]?.text) {
      throw new Error("Gemini returned no usable candidate (safety filter or empty response)");
    }
    return candidate.content.parts[0].text;
  }
  var RateLimiter = class {
    constructor(limit) {
      this.limit = limit;
      this.tokens = limit;
      this.lastRefill = Date.now();
    }
    async acquire() {
      for (; ; ) {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        if (elapsed >= 6e4) {
          this.tokens = this.limit;
          this.lastRefill = now;
        }
        if (this.tokens > 0) {
          this.tokens--;
          return;
        }
        const wait = 6e4 - (Date.now() - this.lastRefill) + 100;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  };
  var rateLimiter = new RateLimiter(14);
  async function extractCrop(blob, apiKey) {
    await rateLimiter.acquire();
    const raw = await callGemini(blob, apiKey, PROMPT);
    const { extraction, flags } = parseGeminiResponse(raw);
    return {
      extraction,
      needsReview: flags.length > 0
    };
  }

  // src/colorExtractor.ts
  function srgbToLinear(c) {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }
  function rgbToLab(r, g, b) {
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);
    const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
    const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
    const Z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
    function f(t) {
      return t > 8856e-6 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    }
    const fx = f(X / 0.95047);
    const fy = f(Y / 1);
    const fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE76(a, b) {
    return Math.sqrt(
      Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)
    );
  }
  function rgbToHsl(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min)
      return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rn)
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn)
      h = ((bn - rn) / d + 2) / 6;
    else
      h = ((rn - gn) / d + 4) / 6;
    return { h, s, l };
  }
  function extractConstructors(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Could not get 2D context");
    const w = canvas.width;
    const h = canvas.height;
    const xStart = Math.floor(w * 0.1);
    const xEnd = Math.floor(w * 0.9);
    const yStart = Math.floor(h * 0.3);
    const yEnd = Math.floor(h * 0.7);
    const sampleW = xEnd - xStart;
    const sampleH = yEnd - yStart;
    const imageData = ctx.getImageData(xStart, yStart, sampleW, sampleH);
    const pixels = imageData.data;
    const leftSums = { r: 0, g: 0, b: 0 };
    const rightSums = { r: 0, g: 0, b: 0 };
    let leftCount = 0, rightCount = 0;
    const midX = sampleW / 2;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const pixelIdx = i / 4;
      const px = pixelIdx % sampleW;
      const { s } = rgbToHsl(r, g, b);
      const isColored = s > 0.5;
      const isWhite = r > 200 && g > 200 && b > 200 && s < 0.15;
      if (!isColored && !isWhite)
        continue;
      if (px < midX) {
        leftSums.r += r;
        leftSums.g += g;
        leftSums.b += b;
        leftCount++;
      } else {
        rightSums.r += r;
        rightSums.g += g;
        rightSums.b += b;
        rightCount++;
      }
    }
    return {
      cn1: nearestTeam(leftSums, leftCount),
      cn2: nearestTeam(rightSums, rightCount)
    };
  }
  function nearestTeam(sums, count) {
    if (count === 0)
      return "UNK";
    const avg = rgbToLab(
      Math.round(sums.r / count),
      Math.round(sums.g / count),
      Math.round(sums.b / count)
    );
    let best = TEAMS[0];
    let bestDist = Infinity;
    for (const team of TEAMS) {
      const ref = CONSTRUCTOR_LAB[team];
      if (!ref)
        continue;
      const dist = deltaE76(avg, ref);
      if (dist < bestDist) {
        bestDist = dist;
        best = team;
      }
    }
    return best;
  }

  // src/validator.ts
  var DRIVER_RE = /^[A-Z]{3}$/;
  var VALID_MULTIPLIERS = /* @__PURE__ */ new Set(["2X", "3X", null]);
  var SCORE_MIN = 0;
  var SCORE_MAX = 1e3;
  var BUDGET_MIN = 80;
  var BUDGET_MAX = 130;
  function validatePercentiles(p, reasons) {
    const vals = [p.p05, p.p25, p.p50, p.p75, p.p95];
    for (const v of vals) {
      if (v < SCORE_MIN || v > SCORE_MAX) {
        reasons.push(`Percentile out of range: ${v}`);
      }
    }
    if (!(p.p05 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95)) {
      reasons.push(`Percentiles not monotonically increasing: ${vals.join(",")}`);
    }
  }
  function validateDrivers(crop, reasons) {
    if (crop.drivers.length !== 5) {
      reasons.push(`Expected 5 drivers, got ${crop.drivers.length}`);
    }
    const multipliers = crop.drivers.filter((d) => d.multiplier != null);
    if (multipliers.length !== 1) {
      reasons.push(`Expected exactly 1 driver with multiplier, got ${multipliers.length}`);
    }
    for (const d of crop.drivers) {
      if (!DRIVER_RE.test(d.name)) {
        reasons.push(`Invalid driver abbreviation: "${d.name}"`);
      }
      if (!VALID_MULTIPLIERS.has(d.multiplier)) {
        reasons.push(`Unknown multiplier: "${d.multiplier}"`);
      }
    }
  }
  function validateConstructors(crop, reasons) {
    for (const which of ["cn1", "cn2"]) {
      const team = crop.constructors[which].team;
      if (!TEAMS.includes(team)) {
        reasons.push(`Unknown constructor team: "${team}" in ${which}`);
      }
    }
  }
  function validateHeader(crop, reasons) {
    if (crop.header.budget_required < BUDGET_MIN || crop.header.budget_required > BUDGET_MAX) {
      reasons.push(`Budget out of plausible range: ${crop.header.budget_required}M`);
    }
    if (crop.header.avg_xpts < SCORE_MIN || crop.header.avg_xpts > SCORE_MAX) {
      reasons.push(`avg_xpts out of range: ${crop.header.avg_xpts}`);
    }
  }
  function validateCrop(crop) {
    const reasons = [];
    validatePercentiles(crop.percentiles, reasons);
    validateDrivers(crop, reasons);
    validateConstructors(crop, reasons);
    validateHeader(crop, reasons);
    crop.flag_reasons = reasons;
    crop.flagged = reasons.length > 0;
    if (reasons.length > 0)
      crop.confidence = "low";
    return crop;
  }

  // src/settingsPanel.ts
  var STORAGE_KEY = "rhter_gemini_key";
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY);
  }

  // src/dataStore.ts
  function importJSON(array) {
    if (!Array.isArray(array))
      throw new Error("Expected an array");
    for (const item of array) {
      if (item.row == null || item.col == null || !item.header || !item.percentiles || !item.drivers || !item.constructors) {
        throw new Error(`Invalid violin object at row=${item.row} col=${item.col}`);
      }
    }
    localStorage.setItem("importedViolins", JSON.stringify(array));
    const flagged = array.filter((v) => v.flagged || v.confidence !== "high").length;
    return { count: array.length, flagged };
  }
  function saveReviewedDataset(array) {
    localStorage.setItem("reviewedViolins", JSON.stringify(array));
  }
  function getReviewedDataset() {
    const raw = localStorage.getItem("reviewedViolins");
    return raw ? JSON.parse(raw) : null;
  }
  function getImportedViolins() {
    const raw = localStorage.getItem("importedViolins");
    return raw ? JSON.parse(raw) : null;
  }

  // src/pipelineOrchestrator.ts
  var INCREMENTAL_KEY = "pipeline_incremental";
  var TEST_CROP_LIMIT = 1;
  async function runPipeline(file, onProgress) {
    const apiKey = getApiKey();
    if (!apiKey)
      throw new Error("No Gemini API key set. Go to Settings first.");
    onProgress({ completed: 0, total: 72, currentLabel: "Cropping screenshot\u2026" });
    const { raw } = await cropScreenshot(file);
    window.__lastCrops = { raw };
    const results = [];
    localStorage.setItem(INCREMENTAL_KEY, JSON.stringify([]));
    let completed = 0;
    if (!raw.length || !raw[0].length)
      throw new Error("No crops produced from screenshot");
    const total = Math.min(raw.length * raw[0].length, TEST_CROP_LIMIT);
    outer:
      for (let row = 0; row < raw.length; row++) {
        for (let col = 0; col < raw[row].length; col++) {
          if (completed >= TEST_CROP_LIMIT)
            break outer;
          onProgress({
            completed,
            total,
            currentLabel: `Extracting crop ${completed + 1} of ${total} (row ${row}, col ${col})\u2026`
          });
          try {
            const rawBlob = raw[row][col];
            const preprocessedCanvas = await preprocessCrop(rawBlob);
            const preprocessedBlob = await canvasToBlob(preprocessedCanvas);
            const rawCanvas = document.createElement("canvas");
            const rawBitmap = await createImageBitmap(rawBlob);
            rawCanvas.width = rawBitmap.width;
            rawCanvas.height = rawBitmap.height;
            const rawCtx = rawCanvas.getContext("2d");
            if (!rawCtx)
              throw new Error("Could not get context for raw canvas");
            rawCtx.drawImage(rawBitmap, 0, 0);
            rawBitmap.close();
            const { cn1, cn2 } = extractConstructors(rawCanvas);
            if (window.__debugPreprocess) {
              const debugUrl = URL.createObjectURL(preprocessedBlob);
              const a = document.createElement("a");
              a.href = debugUrl;
              a.download = `crop_debug_r${row}_c${col}.png`;
              a.click();
              URL.revokeObjectURL(debugUrl);
            }
            const { extraction, needsReview } = await extractCrop(preprocessedBlob, apiKey);
            const crop = {
              row,
              col,
              header: extraction.header,
              percentiles: extraction.percentiles,
              drivers: extraction.drivers,
              constructors: {
                cn1: { color_rgb: null, team: cn1 },
                cn2: { color_rgb: null, team: cn2 }
              },
              confidence: needsReview ? "low" : "high",
              flagged: needsReview,
              flag_reasons: needsReview ? ["two-pass disagreement"] : [],
              raw_response: extraction.raw_response
            };
            validateCrop(crop);
            if (needsReview && !crop.flag_reasons.includes("two-pass disagreement")) {
              crop.flag_reasons.push("two-pass disagreement");
              crop.flagged = true;
            }
            results.push(crop);
          } catch (err) {
            console.error(`Crop [${row},${col}] failed:`, err);
          }
          completed++;
          localStorage.setItem(INCREMENTAL_KEY, JSON.stringify(results));
          onProgress({ completed, total, currentLabel: `Extracting crop ${completed} of ${total}\u2026` });
        }
      }
    importJSON(results);
    localStorage.removeItem(INCREMENTAL_KEY);
    return results;
  }

  // src/ui/uploadStep.ts
  var PHASE_LABELS = ["UPLOADING", "PARSING ROWS", "VALIDATING", "FINALISING"];
  function saveApiKey(key) {
    localStorage.setItem("rhter_gemini_key", key);
  }
  function buildApiKeyCard(onSaved) {
    const card = document.createElement("div");
    card.className = "mb-6 p-[20px] bg-bg1 border border-border flex flex-col gap-3";
    const label = document.createElement("span");
    label.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
    label.textContent = "API KEY REQUIRED";
    card.appendChild(label);
    const row = document.createElement("div");
    row.className = "flex items-end gap-4";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "GEMINI API KEY";
    input.className = "flex-1 bg-transparent border-b border-border font-mono text-[12px] text-text py-[4px] outline-none placeholder:text-muted";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "SAVE";
    saveBtn.className = "border border-accent text-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100";
    saveBtn.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key)
        return;
      saveApiKey(key);
      onSaved();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        saveBtn.click();
    });
    row.appendChild(input);
    row.appendChild(saveBtn);
    card.appendChild(row);
    return card;
  }
  function buildDropZone(onFile) {
    const zone = document.createElement("div");
    zone.className = "min-h-[360px] border border-dashed border-border bg-bg1 flex items-center justify-center cursor-pointer transition-colors duration-150";
    const inner = document.createElement("div");
    inner.className = "flex flex-col items-center gap-3";
    const icon = document.createElement("div");
    icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4v16M8 12l8-8 8 8M6 24h20" stroke="#444" stroke-width="1.5"/></svg>`;
    const heading = document.createElement("span");
    heading.className = "font-mono text-[11px] uppercase tracking-[0.18em] text-text";
    heading.textContent = "DROP SCREENSHOT HERE";
    const sub = document.createElement("span");
    sub.className = "font-mono text-[9px] text-dim";
    sub.textContent = "or click to browse";
    inner.appendChild(icon);
    inner.appendChild(heading);
    inner.appendChild(sub);
    zone.appendChild(inner);
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "hidden";
    zone.appendChild(fileInput);
    zone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file)
        onFile(file);
    });
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.remove("border-border");
      zone.classList.add("border-white", "bg-bg2");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("border-white", "bg-bg2");
      zone.classList.add("border-border");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("border-white", "bg-bg2");
      zone.classList.add("border-border");
      const file = e.dataTransfer?.files[0];
      if (file)
        onFile(file);
    });
    return zone;
  }
  function buildProgressSection(phaseIndex, percent, label) {
    const wrap = document.createElement("div");
    wrap.className = "min-h-[360px] bg-bg1 border border-border flex flex-col justify-center px-[40px] gap-4";
    const phaseLabel = document.createElement("span");
    phaseLabel.className = "font-mono text-[9px] uppercase tracking-[0.18em] text-dim";
    phaseLabel.textContent = label ?? PHASE_LABELS[phaseIndex] ?? "PROCESSING";
    wrap.appendChild(phaseLabel);
    const track = document.createElement("div");
    track.className = "w-full h-[2px] bg-bg2";
    const fill = document.createElement("div");
    fill.className = percent >= 100 ? "h-[2px] bg-white transition-[width] duration-[250ms] ease-linear" : "h-[2px] bg-accent transition-[width] duration-[250ms] ease-linear";
    fill.style.width = `${percent}%`;
    track.appendChild(fill);
    wrap.appendChild(track);
    return wrap;
  }
  function buildInfoGrid() {
    const grid = document.createElement("div");
    grid.className = "grid grid-cols-3 gap-8 mt-6";
    const lastSession = localStorage.getItem("wizardState");
    let lastSessionText = "NO PREVIOUS SESSION";
    if (lastSession) {
      try {
        const s = JSON.parse(lastSession);
        if (s.step > 0)
          lastSessionText = `STEP ${s.step + 1} IN PROGRESS`;
      } catch {
      }
    }
    const cols = [
      {
        label: "WHAT HAPPENS NEXT",
        lines: ["1. CROP IMAGE (72 VIOLINS)", "2. EXTRACT NUMBERS (GEMINI)", "3. IDENTIFY TEAM COLORS", "4. VALIDATE + FLAG"]
      },
      {
        label: "EXTRACTION TIME",
        lines: ["~90 SECONDS", "FOR 72 CROPS"]
      },
      {
        label: "LAST SESSION",
        lines: [lastSessionText]
      }
    ];
    for (const col of cols) {
      const div = document.createElement("div");
      div.className = "flex flex-col gap-2";
      const lbl = document.createElement("span");
      lbl.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
      lbl.textContent = col.label;
      div.appendChild(lbl);
      for (const line of col.lines) {
        const p = document.createElement("span");
        p.className = "text-[11px] font-mono text-dim";
        p.textContent = line;
        div.appendChild(p);
      }
      grid.appendChild(div);
    }
    return grid;
  }
  function renderUploadStep(container, onComplete) {
    const hasKey = !!getApiKey();
    let uploadAreaEl = null;
    function showUploadArea() {
      if (uploadAreaEl)
        uploadAreaEl.remove();
      const wrap = document.createElement("div");
      wrap.id = "upload-area";
      const zone = buildDropZone(startPipeline);
      wrap.appendChild(zone);
      const demoBtn = document.createElement("button");
      demoBtn.textContent = "SIMULATE WITH DEMO DATA";
      demoBtn.className = "mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px] hover:border-text hover:text-text transition-colors duration-100";
      demoBtn.addEventListener("click", () => {
        injectDemoData();
        onComplete();
      });
      wrap.appendChild(demoBtn);
      wrap.appendChild(buildInfoGrid());
      container.appendChild(wrap);
      uploadAreaEl = wrap;
    }
    function startPipeline(file) {
      if (!uploadAreaEl)
        return;
      uploadAreaEl.innerHTML = "";
      let phaseIndex = 0;
      let percent = 0;
      const progress = buildProgressSection(phaseIndex, percent);
      uploadAreaEl.appendChild(progress);
      runPipeline(file, (p) => {
        percent = Math.round(p.completed / p.total * 100);
        phaseIndex = Math.min(3, Math.floor(p.completed / p.total * 4));
        uploadAreaEl.innerHTML = "";
        const updated = buildProgressSection(phaseIndex, percent, p.currentLabel.toUpperCase());
        uploadAreaEl.appendChild(updated);
        if (percent >= 100) {
          setTimeout(onComplete, 400);
        }
      }).catch((err) => {
        uploadAreaEl.innerHTML = "";
        const errMsg = document.createElement("p");
        errMsg.className = "font-mono text-[11px] text-accent p-[20px]";
        errMsg.textContent = `PIPELINE ERROR: ${err.message}`;
        uploadAreaEl.appendChild(errMsg);
        uploadAreaEl.appendChild(buildDropZone(startPipeline));
      });
    }
    function injectDemoData() {
      const demo = generateDemoViolins();
      localStorage.setItem("importedViolins", JSON.stringify(demo));
      localStorage.setItem("reviewedViolins", JSON.stringify(demo));
    }
    if (!hasKey) {
      container.appendChild(buildApiKeyCard(() => {
        container.innerHTML = "";
        renderUploadStep(container, onComplete);
      }));
    }
    showUploadArea();
  }
  function generateDemoViolins() {
    const DRIVER_SETS = [
      ["VER", "NOR", "PIA"],
      ["HAM", "RUS", "LEC"],
      ["SAI", "ALO", "STR"],
      ["TSU", "GAS", "OCO"],
      ["HUL", "MAG", "BOT"],
      ["ZHO", "LAW", "COL"]
    ];
    const CN_PAIRS = [
      ["MCL", "RED"],
      ["MER", "FER"],
      ["AMR", "WIL"],
      ["ALP", "HAA"],
      ["MCL", "MER"],
      ["RED", "FER"]
    ];
    const TEAM_COLORS2 = {
      MCL: [255, 103, 0],
      RED: [30, 65, 255],
      MER: [6, 211, 191],
      FER: [221, 24, 24],
      AMR: [0, 107, 60],
      WIL: [0, 90, 255],
      ALP: [255, 135, 188],
      HAA: [182, 186, 189]
    };
    const violins = [];
    for (let i = 0; i < 6; i++) {
      const p50 = 80 + Math.round(Math.random() * 40);
      const spread = 10 + Math.round(Math.random() * 20);
      const [cn1, cn2] = CN_PAIRS[i];
      violins.push({
        row: Math.floor(i / 3),
        col: i % 3,
        header: {
          budget_required: 95 + Math.round(Math.random() * 20),
          avg_xpts: p50,
          avg_xpts_dollar_impact: 0.8,
          avg_budget_uplift: null
        },
        percentiles: {
          p05: p50 - spread * 2,
          p25: p50 - spread,
          p50,
          p75: p50 + spread,
          p95: p50 + spread * 2
        },
        drivers: DRIVER_SETS[i].map((name, j) => ({ name, multiplier: j === 0 ? "2X" : null })),
        constructors: {
          cn1: { color_rgb: TEAM_COLORS2[cn1] ?? null, team: cn1 },
          cn2: { color_rgb: TEAM_COLORS2[cn2] ?? null, team: cn2 }
        },
        confidence: "high",
        flagged: i === 2,
        flag_reasons: i === 2 ? ["P95 OUTLIER"] : [],
        raw_response: ""
      });
    }
    return violins;
  }

  // src/ui/reviewStep.ts
  function renderReviewStep(container, state, onApprove, onBack) {
    let violins = getImportedViolins() ?? [];
    let filterMode = "all";
    const section = document.createElement("div");
    section.className = "flex flex-col gap-4";
    container.appendChild(section);
    const budgetCard = document.createElement("div");
    budgetCard.className = "bg-bg1 border border-border p-[28px] grid grid-cols-3 gap-8";
    const col1 = document.createElement("div");
    col1.className = "flex flex-col gap-1";
    const budgetLbl = document.createElement("span");
    budgetLbl.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
    budgetLbl.textContent = "BUDGET";
    const budgetInput = document.createElement("input");
    budgetInput.type = "number";
    budgetInput.step = "0.1";
    budgetInput.value = String(state.budget);
    budgetInput.className = "bg-transparent border-b border-accent text-[32px] font-mono font-bold text-text w-[120px] outline-none";
    col1.appendChild(budgetLbl);
    col1.appendChild(budgetInput);
    budgetCard.appendChild(col1);
    const col2 = document.createElement("div");
    col2.className = "flex flex-col gap-1";
    const teamsLbl = document.createElement("span");
    teamsLbl.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
    teamsLbl.textContent = "TEAMS IN BUDGET";
    const teamsVal = document.createElement("span");
    teamsVal.className = "text-[32px] font-mono font-bold text-text";
    col2.appendChild(teamsLbl);
    col2.appendChild(teamsVal);
    budgetCard.appendChild(col2);
    const col3 = document.createElement("div");
    col3.className = "flex flex-col gap-2";
    const statsLabel = document.createElement("span");
    statsLabel.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
    statsLabel.textContent = "EXTRACTION STATS";
    col3.appendChild(statsLabel);
    const statParsed = makeStatPair("TEAMS PARSED", String(violins.length));
    const statFlagged = makeStatPair("FLAGGED", String(violins.filter((v) => v.flagged).length));
    const statConf = makeStatPair("CONFIDENCE", violins.length ? `${Math.round(violins.filter((v) => v.confidence === "high").length / violins.length * 100)}%` : "\u2014");
    col3.appendChild(statParsed);
    col3.appendChild(statFlagged);
    col3.appendChild(statConf);
    budgetCard.appendChild(col3);
    section.appendChild(budgetCard);
    const toolbar = document.createElement("div");
    toolbar.className = "flex items-center justify-between";
    const flagCountLabel = document.createElement("span");
    flagCountLabel.className = "font-mono text-[10px] uppercase tracking-[0.18em]";
    const toggleGroup = document.createElement("div");
    toggleGroup.className = "flex gap-4";
    const toggleAll = document.createElement("button");
    toggleAll.className = "font-mono text-[10px] uppercase tracking-[0.18em]";
    toggleAll.textContent = "ALL ROWS";
    const toggleFlagged = document.createElement("button");
    toggleFlagged.className = "font-mono text-[10px] uppercase tracking-[0.18em]";
    toggleFlagged.textContent = "\u2691 FLAGGED ONLY";
    toggleGroup.appendChild(toggleFlagged);
    toggleGroup.appendChild(toggleAll);
    toolbar.appendChild(flagCountLabel);
    toolbar.appendChild(toggleGroup);
    section.appendChild(toolbar);
    const tableWrap = document.createElement("div");
    tableWrap.className = "border border-border";
    section.appendChild(tableWrap);
    const actionBar = document.createElement("div");
    actionBar.className = "sticky bottom-0 bg-bg border-t border-border px-[40px] py-[14px] flex items-center justify-between";
    const backBtn = document.createElement("button");
    backBtn.textContent = "\u2190 BACK";
    backBtn.className = "border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100";
    backBtn.addEventListener("click", onBack);
    const rightBar = document.createElement("div");
    rightBar.className = "flex items-center gap-4";
    const approveBtn = document.createElement("button");
    approveBtn.textContent = "APPROVE DATA + CONTINUE \u2192";
    approveBtn.className = "bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px]";
    rightBar.appendChild(approveBtn);
    actionBar.appendChild(backBtn);
    actionBar.appendChild(rightBar);
    container.appendChild(actionBar);
    function updateBudgetCount() {
      const budget = parseFloat(budgetInput.value) || Infinity;
      teamsVal.textContent = String(violins.filter((v) => v.header.budget_required <= budget).length);
    }
    function updateFlagState() {
      const unresolved = violins.filter((v) => v.flagged).length;
      flagCountLabel.textContent = `${unresolved} FLAG${unresolved !== 1 ? "S" : ""}`;
      flagCountLabel.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${unresolved > 0 ? "text-accent" : "text-dim"}`;
      approveBtn.disabled = unresolved > 0;
      approveBtn.classList.toggle("opacity-30", unresolved > 0);
      approveBtn.classList.toggle("cursor-not-allowed", unresolved > 0);
      approveBtn.onclick = unresolved > 0 ? null : () => {
        saveReviewedDataset(violins);
        onApprove();
      };
    }
    function renderTable() {
      tableWrap.innerHTML = "";
      const header = document.createElement("div");
      header.className = "grid border-b border-border";
      header.style.gridTemplateColumns = "44px 84px 1fr 72px 72px 72px 76px 100px";
      ["ROW", "BUDGET", "LINEUP", "P50", "P75", "P95", "KELLY", "STATUS"].forEach((col) => {
        const th = document.createElement("div");
        th.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono px-[8px] py-[10px]";
        th.textContent = col;
        header.appendChild(th);
      });
      tableWrap.appendChild(header);
      const displayViolins = filterMode === "flagged" ? violins.filter((v) => v.flagged) : violins;
      for (const violin of displayViolins) {
        const kelly = estimateKellyForDisplay(violin);
        const isFlagged = violin.flagged;
        const row = document.createElement("div");
        row.className = `grid border-b border-border font-mono text-[11px] ${isFlagged ? "border-l-2 border-accent bg-[rgba(232,64,28,0.12)]" : "bg-bg1 hover:bg-bg2"}`;
        row.style.gridTemplateColumns = "44px 84px 1fr 72px 72px 72px 76px 100px";
        const p = violin.percentiles;
        const cells = [
          String(violin.row * 24 + violin.col + 1),
          `${violin.header.budget_required}M`,
          violin.drivers.map((d) => d.multiplier ? `${d.name}(${d.multiplier})` : d.name).join(" ") + ` [${violin.constructors.cn1.team}][${violin.constructors.cn2.team}]`,
          String(p.p50),
          String(p.p75),
          isFlagged ? `${p.p95} \u2691` : String(p.p95),
          (kelly * 100).toFixed(0) + "%",
          ""
        ];
        cells.forEach((text, ci) => {
          const td = document.createElement("div");
          td.className = `px-[8px] py-[10px] ${ci === 6 ? "text-accent" : ""} ${ci === 5 && isFlagged ? "text-accent" : ""}`;
          if (ci === 7) {
            if (isFlagged) {
              const editBtn = document.createElement("button");
              editBtn.textContent = "EDIT";
              editBtn.className = "border border-accent text-accent font-mono text-[9px] px-[8px] py-[3px] mr-1";
              editBtn.addEventListener("click", () => toggleEditPanel(violin, row));
              const okBtn = document.createElement("button");
              okBtn.textContent = "OK";
              okBtn.className = "border border-border text-dim font-mono text-[9px] px-[8px] py-[3px]";
              okBtn.addEventListener("click", () => {
                violin.flagged = false;
                saveReviewedDataset(violins);
                updateFlagState();
                renderTable();
              });
              td.appendChild(editBtn);
              td.appendChild(okBtn);
            }
          } else {
            td.textContent = text;
          }
          row.appendChild(td);
        });
        tableWrap.appendChild(row);
      }
    }
    function toggleEditPanel(violin, row) {
      const existing = row.nextElementSibling;
      if (existing?.classList.contains("edit-panel")) {
        existing.remove();
        return;
      }
      const panel = document.createElement("div");
      panel.className = "edit-panel bg-[#120a08] border-l-2 border-accent p-[16px] grid grid-cols-4 gap-4";
      const fields = [
        { label: "P50", key: "p50" },
        { label: "P75", key: "p75" },
        { label: "P95", key: "p95" }
      ];
      for (const field of fields) {
        const wrap = document.createElement("div");
        wrap.className = "flex flex-col gap-1";
        const lbl = document.createElement("span");
        lbl.className = "text-[8px] uppercase tracking-[0.18em] text-muted font-mono";
        lbl.textContent = field.label;
        const inp = document.createElement("input");
        inp.type = "number";
        inp.value = String(violin.percentiles[field.key]);
        inp.className = "bg-transparent border-b border-border text-text font-mono text-[12px] w-full outline-none py-[4px]";
        inp.addEventListener("change", () => {
          violin.percentiles[field.key] = parseFloat(inp.value) || violin.percentiles[field.key];
        });
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        panel.appendChild(wrap);
      }
      const confirmWrap = document.createElement("div");
      confirmWrap.className = "flex items-end";
      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "CONFIRM VALUES";
      confirmBtn.className = "border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100";
      confirmBtn.addEventListener("click", () => {
        violin.flagged = false;
        saveReviewedDataset(violins);
        panel.remove();
        updateFlagState();
        renderTable();
      });
      confirmWrap.appendChild(confirmBtn);
      panel.appendChild(confirmWrap);
      row.insertAdjacentElement("afterend", panel);
    }
    function setFilter(mode) {
      filterMode = mode;
      toggleAll.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === "all" ? "text-text" : "text-muted"}`;
      toggleFlagged.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === "flagged" ? "text-text" : "text-muted"}`;
      renderTable();
    }
    toggleAll.addEventListener("click", () => setFilter("all"));
    toggleFlagged.addEventListener("click", () => setFilter("flagged"));
    budgetInput.addEventListener("blur", () => {
      state.budget = parseFloat(budgetInput.value) || 105;
      localStorage.setItem("userBudget", String(state.budget));
      updateBudgetCount();
    });
    budgetInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        budgetInput.blur();
    });
    setFilter("all");
    updateBudgetCount();
    updateFlagState();
  }
  function makeStatPair(label, value) {
    const wrap = document.createElement("div");
    wrap.className = "flex justify-between gap-4";
    const lbl = document.createElement("span");
    lbl.className = "text-[9px] uppercase tracking-[0.18em] text-muted font-mono";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "text-[11px] font-mono text-text";
    val.textContent = value;
    wrap.appendChild(lbl);
    wrap.appendChild(val);
    return wrap;
  }
  function estimateKellyForDisplay(violin) {
    const pts = [
      [violin.percentiles.p05, 0.05],
      [violin.percentiles.p25, 0.25],
      [violin.percentiles.p50, 0.5],
      [violin.percentiles.p75, 0.75],
      [violin.percentiles.p95, 0.95]
    ];
    const threshold = violin.percentiles.p50;
    let p = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, c0] = pts[i];
      const [s1, c1] = pts[i + 1];
      if (threshold >= s0 && threshold <= s1) {
        const t = (threshold - s0) / (s1 - s0);
        p = 1 - (c0 + t * (c1 - c0));
        break;
      }
    }
    const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
    const f = (b * p - (1 - p)) / Math.max(b, 1e-4);
    return Math.max(0, Math.min(1, f));
  }

  // src/ui/analysisStep.ts
  var TEAM_COLORS = {
    MER: "#06d3bf",
    FER: "#dd1818",
    RBR: "#1e41ff",
    MCL: "#ff6700",
    AMR: "#006b3c",
    WIL: "#005aff",
    ALP: "#ff87bc",
    HAA: "#b6babd",
    KIC: "#52e252",
    SAU: "#9b0000",
    RED: "#1e41ff"
  };
  var SORT_LABELS = {
    kelly: "KELLY SCORE",
    p50: "P50 XPTS",
    p95: "P95 CEILING",
    budget: "BUDGET"
  };
  function estimateWinProb(percentiles, threshold) {
    const pts = [
      [percentiles.p05, 0.05],
      [percentiles.p25, 0.25],
      [percentiles.p50, 0.5],
      [percentiles.p75, 0.75],
      [percentiles.p95, 0.95]
    ];
    if (threshold <= pts[0][0])
      return 1 - pts[0][1];
    if (threshold >= pts[4][0])
      return 1 - pts[4][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, c0] = pts[i];
      const [s1, c1] = pts[i + 1];
      if (threshold >= s0 && threshold <= s1) {
        const t = (threshold - s0) / (s1 - s0);
        return 1 - (c0 + t * (c1 - c0));
      }
    }
    return 0;
  }
  function calcKelly(violin, threshold) {
    const p = estimateWinProb(violin.percentiles, threshold);
    const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
    const f = (b * p - (1 - p)) / Math.max(b, 1e-4);
    return Math.max(0, Math.min(1, f));
  }
  function computeRanked(violins, budget, sortKey) {
    const p50s = violins.map((v) => v.percentiles.p50).sort((a, b) => a - b);
    const threshold = p50s[Math.floor(p50s.length / 2)];
    const entries = violins.map((v, i) => ({
      violin: v,
      kelly: calcKelly(v, threshold),
      teamId: i,
      overBudget: v.header.budget_required > budget
    }));
    const sortFns = {
      kelly: (a, b) => b.kelly - a.kelly,
      p50: (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
      p95: (a, b) => b.violin.percentiles.p95 - a.violin.percentiles.p95,
      budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required
    };
    const fn = sortFns[sortKey] ?? sortFns["kelly"];
    return [...entries.filter((e) => !e.overBudget).sort(fn), ...entries.filter((e) => e.overBudget).sort(fn)];
  }
  function buildDistBar(pct, max) {
    const wrap = document.createElement("div");
    wrap.className = "relative h-[10px] w-full my-2";
    const whisker = document.createElement("div");
    whisker.className = "absolute h-[1px] bg-muted/40 top-[50%]";
    whisker.style.left = `${pct.p05 / max * 100}%`;
    whisker.style.width = `${(pct.p95 - pct.p05) / max * 100}%`;
    const box = document.createElement("div");
    box.className = "absolute h-[6px] bg-text top-[50%] -translate-y-1/2";
    box.style.left = `${pct.p25 / max * 100}%`;
    box.style.width = `${(pct.p75 - pct.p25) / max * 100}%`;
    const tick = document.createElement("div");
    tick.className = "absolute w-[2px] h-[10px] bg-white top-[50%] -translate-y-1/2";
    tick.style.left = `${pct.p50 / max * 100}%`;
    wrap.appendChild(whisker);
    wrap.appendChild(box);
    wrap.appendChild(tick);
    return wrap;
  }
  function buildLineup(violin) {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-2 font-mono text-[11px] text-text flex-wrap";
    for (const d of violin.drivers) {
      const span = document.createElement("span");
      span.textContent = d.multiplier ? `${d.name}(${d.multiplier})` : d.name;
      wrap.appendChild(span);
    }
    const sep = document.createElement("span");
    sep.className = "text-muted";
    sep.textContent = "//";
    wrap.appendChild(sep);
    for (const cn of [violin.constructors.cn1, violin.constructors.cn2]) {
      const dot = document.createElement("span");
      dot.className = "w-[8px] h-[8px] rounded-full inline-block";
      dot.style.background = TEAM_COLORS[cn.team] ?? "#888";
      dot.title = cn.team;
      wrap.appendChild(dot);
      const lbl = document.createElement("span");
      lbl.textContent = cn.team;
      wrap.appendChild(lbl);
    }
    return wrap;
  }
  function buildGuideRails(max) {
    const pctPoints = [0.05, 0.25, 0.5, 0.75, 0.95];
    const labels = ["P5", "P25", "P50", "P75", "P95"];
    const rails = document.createElement("div");
    rails.className = "absolute inset-0 pointer-events-none z-0";
    pctPoints.forEach((pct, i) => {
      const line = document.createElement("div");
      line.className = `absolute top-0 bottom-0 border-l ${i === 2 ? "border-white/20" : i === 1 || i === 3 ? "border-white/10" : "border-white/5"}`;
      line.style.left = `${pct * 100}%`;
      rails.appendChild(line);
    });
    const header = document.createElement("div");
    header.className = "relative h-[20px] mb-1";
    pctPoints.forEach((pct, i) => {
      const lbl = document.createElement("span");
      lbl.className = "absolute text-[8px] text-muted font-mono uppercase -translate-x-1/2";
      lbl.style.left = `${pct * 100}%`;
      lbl.textContent = labels[i];
      header.appendChild(lbl);
    });
    return { rails, header };
  }
  function renderAnalysisStep(container, state, onPick, onBack) {
    const violins = getReviewedDataset();
    if (!violins || !violins.length) {
      const msg = document.createElement("p");
      msg.className = "font-mono text-[11px] text-dim";
      msg.textContent = "NO DATA. GO BACK AND APPROVE DATA IN THE REVIEW STEP.";
      container.appendChild(msg);
      const backBtn = document.createElement("button");
      backBtn.textContent = "\u2190 BACK";
      backBtn.className = "mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px]";
      backBtn.addEventListener("click", onBack);
      container.appendChild(backBtn);
      return;
    }
    let currentSortKey = state.sortKey;
    let pickedTeamId = state.pickedTeamId;
    const section = document.createElement("div");
    section.className = "flex flex-col gap-4";
    container.appendChild(section);
    const controlsBar = document.createElement("div");
    controlsBar.className = "bg-bg1 border border-border p-[16px] flex items-center justify-between";
    const modelGroup = document.createElement("div");
    modelGroup.className = "flex gap-2 items-center";
    const modelLbl = document.createElement("span");
    modelLbl.className = "text-[8px] uppercase tracking-[0.18em] text-muted font-mono mr-2";
    modelLbl.textContent = "MODEL";
    const kellyBtn = document.createElement("button");
    kellyBtn.textContent = "KELLY";
    kellyBtn.className = "bg-accent text-white font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]";
    modelGroup.appendChild(modelLbl);
    modelGroup.appendChild(kellyBtn);
    controlsBar.appendChild(modelGroup);
    const sortGroup = document.createElement("div");
    sortGroup.className = "flex gap-4";
    const sortKeys = ["kelly", "p50", "p95", "budget"];
    const sortBtns = {};
    sortKeys.forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = (key === currentSortKey ? "\u25B6 " : "") + SORT_LABELS[key];
      btn.className = `font-mono text-[9px] uppercase tracking-[0.18em] ${key === currentSortKey ? "text-text border-b border-accent pb-[2px]" : "text-muted"}`;
      btn.addEventListener("click", () => {
        currentSortKey = key;
        state.sortKey = currentSortKey;
        render();
      });
      sortBtns[key] = btn;
      sortGroup.appendChild(btn);
    });
    controlsBar.appendChild(sortGroup);
    section.appendChild(controlsBar);
    const listWrap = document.createElement("div");
    listWrap.className = "relative";
    section.appendChild(listWrap);
    function render() {
      listWrap.innerHTML = "";
      const ranked = computeRanked(violins, state.budget, currentSortKey);
      if (!ranked.length)
        return;
      const max = Math.max(...violins.map((v) => v.percentiles.p95));
      const { rails, header: railHeader } = buildGuideRails(max);
      listWrap.appendChild(railHeader);
      const innerWrap = document.createElement("div");
      innerWrap.className = "relative";
      innerWrap.appendChild(rails);
      const top = ranked[0];
      innerWrap.appendChild(buildTopPickCard(top, max, pickedTeamId, (id) => {
        pickedTeamId = pickedTeamId === id ? null : id;
        onPick(pickedTeamId);
      }));
      ranked.slice(1).forEach((entry, i) => {
        innerWrap.appendChild(buildRankedRow(entry, i + 2, max, pickedTeamId, (id) => {
          pickedTeamId = pickedTeamId === id ? null : id;
          onPick(pickedTeamId);
        }));
      });
      listWrap.appendChild(innerWrap);
      const backBtn = document.createElement("button");
      backBtn.textContent = "\u2190 BACK";
      backBtn.className = "mt-6 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100";
      backBtn.addEventListener("click", onBack);
      listWrap.appendChild(backBtn);
    }
    render();
  }
  function buildTopPickCard(entry, max, pickedTeamId, onPick) {
    const card = document.createElement("div");
    card.className = "relative z-10 bg-[rgba(232,64,28,0.12)] border-l-[3px] border-accent p-[28px] grid grid-cols-4 gap-6";
    const col1 = document.createElement("div");
    col1.className = "flex flex-col gap-2";
    col1.appendChild(buildLineup(entry.violin));
    col1.appendChild(buildDistBar(entry.violin.percentiles, max));
    const pctLbls = document.createElement("div");
    pctLbls.className = "flex justify-between font-mono text-[8px] text-dim";
    ["P5", "P25", "P50", "P75", "P95"].forEach((l, i) => {
      const s = document.createElement("span");
      s.textContent = l;
      if (i === 2)
        s.className = "text-text";
      pctLbls.appendChild(s);
    });
    col1.appendChild(pctLbls);
    card.appendChild(col1);
    const col2 = document.createElement("div");
    col2.className = "flex flex-col gap-1";
    const avgLbl = document.createElement("span");
    avgLbl.className = "text-[8px] uppercase tracking-[0.18em] text-muted font-mono";
    avgLbl.textContent = "AVG EXPECTED PTS";
    const avgVal = document.createElement("span");
    avgVal.className = "text-[12px] text-dim font-mono";
    avgVal.textContent = String(entry.violin.header.avg_xpts);
    col2.appendChild(avgLbl);
    col2.appendChild(avgVal);
    card.appendChild(col2);
    const col3 = document.createElement("div");
    col3.className = "flex flex-col gap-1";
    const kellyLbl = document.createElement("span");
    kellyLbl.className = "text-[8px] uppercase tracking-[0.18em] text-muted font-mono";
    kellyLbl.textContent = "KELLY SCORE";
    const kellyVal = document.createElement("span");
    kellyVal.className = "text-[36px] font-bold text-accent font-mono";
    kellyVal.textContent = (entry.kelly * 100).toFixed(0) + "%";
    col3.appendChild(kellyLbl);
    col3.appendChild(kellyVal);
    card.appendChild(col3);
    const col4 = document.createElement("div");
    col4.className = "flex items-stretch";
    const pickBtn = document.createElement("button");
    const isPicked = pickedTeamId === entry.teamId;
    pickBtn.textContent = isPicked ? "\u2713 PICKED" : "PICK THIS TEAM";
    pickBtn.className = isPicked ? "w-full bg-bg3 text-text border border-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]" : "w-full bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]";
    pickBtn.addEventListener("click", () => onPick(entry.teamId));
    col4.appendChild(pickBtn);
    card.appendChild(col4);
    return card;
  }
  function buildRankedRow(entry, rank, max, pickedTeamId, onPick) {
    const isPicked = pickedTeamId === entry.teamId;
    const row = document.createElement("div");
    row.className = `relative z-10 grid border-b border-border transition-colors duration-100 ${isPicked ? "border-l-2 border-accent bg-bg3" : "bg-bg1 hover:bg-white/[0.02]"}`;
    row.style.gridTemplateColumns = "auto 1fr auto auto auto";
    const rankEl = document.createElement("div");
    rankEl.className = "px-[12px] py-[16px] font-mono text-[11px] text-dim w-[44px]";
    rankEl.textContent = `#${rank}`;
    row.appendChild(rankEl);
    const lineupCol = document.createElement("div");
    lineupCol.className = "px-[8px] py-[12px] flex flex-col gap-1";
    lineupCol.appendChild(buildLineup(entry.violin));
    lineupCol.appendChild(buildDistBar(entry.violin.percentiles, max));
    row.appendChild(lineupCol);
    const avgEl = document.createElement("div");
    avgEl.className = "px-[12px] py-[16px] font-mono text-[12px] text-dim self-center";
    avgEl.textContent = String(entry.violin.header.avg_xpts);
    row.appendChild(avgEl);
    const kellyEl = document.createElement("div");
    kellyEl.className = "px-[12px] py-[16px] font-mono text-[18px] font-bold text-accent self-center";
    kellyEl.textContent = (entry.kelly * 100).toFixed(0) + "%";
    row.appendChild(kellyEl);
    const pickEl = document.createElement("div");
    pickEl.className = "px-[12px] py-[16px] self-center";
    const pickBtn = document.createElement("button");
    pickBtn.textContent = isPicked ? "\u2713 PICKED" : "PICK";
    pickBtn.className = isPicked ? "border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]" : "border border-border text-dim font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px] hover:border-text hover:text-text transition-colors duration-100";
    pickBtn.addEventListener("click", () => onPick(entry.teamId));
    pickEl.appendChild(pickBtn);
    row.appendChild(pickEl);
    return row;
  }

  // src/ui/wizardShell.ts
  var STATE_KEY = "wizardState";
  var STEP_LABELS = ["UPLOAD", "REVIEW", "ANALYSIS"];
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw)
        return JSON.parse(raw);
    } catch {
    }
    return { step: 0, budget: 105, pickedTeamId: null, sortKey: "kelly" };
  }
  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  function buildNav(state, root2) {
    const nav = document.createElement("div");
    nav.className = "sticky top-0 z-50 bg-bg border-b border-border px-[40px] py-[14px] flex items-center justify-between";
    const left = document.createElement("div");
    left.className = "flex items-center gap-3";
    const logo = document.createElement("span");
    logo.className = "font-mono font-bold text-[13px] tracking-[0.1em] text-text";
    logo.textContent = "RHTER";
    left.appendChild(logo);
    nav.appendChild(left);
    const right = document.createElement("div");
    right.className = "flex items-center gap-6";
    const budgetPair = makePair("BUDGET", `${state.budget}M`);
    right.appendChild(budgetPair);
    if (state.step > 0) {
      const flagCount = getFlagCount();
      const flagPair = makePair("FLAGS", String(flagCount));
      if (flagCount > 0)
        flagPair.querySelector(".kv-value").classList.add("text-accent");
      right.appendChild(flagPair);
    }
    nav.appendChild(right);
    return nav;
  }
  function makePair(label, value) {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col items-end";
    const lbl = document.createElement("span");
    lbl.className = "text-[8px] text-muted uppercase tracking-[0.18em] font-mono";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "kv-value text-[12px] font-mono text-text";
    val.textContent = value;
    wrap.appendChild(lbl);
    wrap.appendChild(val);
    return wrap;
  }
  function getFlagCount() {
    try {
      const raw = localStorage.getItem("reviewedViolins");
      if (!raw)
        return 0;
      const arr = JSON.parse(raw);
      return arr.filter((v) => v.flagged).length;
    } catch {
      return 0;
    }
  }
  function buildStepIndicator(currentStep) {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center justify-center px-[40px] py-[20px] border-b border-border";
    STEP_LABELS.forEach((label, i) => {
      const isDone = i < currentStep;
      const isActive = i === currentStep;
      const item = document.createElement("div");
      item.className = "flex items-center gap-2";
      const box = document.createElement("div");
      box.className = "w-[20px] h-[20px] flex items-center justify-center border text-[10px] font-mono font-bold";
      if (isDone) {
        box.className += " border-muted text-muted";
        box.innerHTML = `<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="currentColor" stroke-width="1.5"/></svg>`;
      } else if (isActive) {
        box.className += " bg-white text-bg border-white";
        box.textContent = String(i + 1);
      } else {
        box.className += " border-border text-border";
        box.textContent = String(i + 1);
      }
      const lbl = document.createElement("span");
      lbl.className = `text-[9px] uppercase tracking-[0.18em] font-mono ${isActive ? "text-text" : "text-muted"}`;
      lbl.textContent = label;
      item.appendChild(box);
      item.appendChild(lbl);
      wrap.appendChild(item);
      if (i < STEP_LABELS.length - 1) {
        const line = document.createElement("div");
        line.className = `w-[48px] h-[1px] mx-3 ${isDone ? "bg-muted" : "bg-border"}`;
        wrap.appendChild(line);
      }
    });
    return wrap;
  }
  function buildFooter() {
    const footer = document.createElement("div");
    footer.className = "sticky bottom-0 bg-bg border-t border-border px-[40px] py-[14px] flex items-center justify-between";
    const left = document.createElement("span");
    left.className = "text-[8px] text-muted uppercase tracking-[0.18em] font-mono";
    left.textContent = "RHTER // F1 FANTASY ANALYSIS TOOL";
    const right = document.createElement("span");
    right.className = "text-[8px] text-muted uppercase tracking-[0.18em] font-mono";
    right.textContent = "MODEL: KELLY CRITERION // 2026 SEASON";
    footer.appendChild(left);
    footer.appendChild(right);
    return footer;
  }
  function initWizard(root2) {
    const state = loadState();
    function render() {
      root2.innerHTML = "";
      root2.appendChild(buildNav(state, root2));
      root2.appendChild(buildStepIndicator(state.step));
      const main = document.createElement("main");
      main.className = "flex-1 px-[40px] py-[32px]";
      if (state.step === 0)
        renderUploadStep(main, onPipelineComplete);
      else if (state.step === 1)
        renderReviewStep(main, state, onDataApproved, onBack);
      else
        renderAnalysisStep(main, state, onPick, onBack);
      root2.appendChild(main);
      root2.appendChild(buildFooter());
    }
    function onPipelineComplete() {
      state.step = 1;
      saveState(state);
      render();
    }
    function onDataApproved() {
      state.step = 2;
      saveState(state);
      render();
    }
    function onBack() {
      state.step = Math.max(0, state.step - 1);
      saveState(state);
      render();
    }
    function onPick(teamId) {
      state.pickedTeamId = teamId;
      saveState(state);
      render();
    }
    render();
  }

  // src/app.ts
  var root = document.getElementById("wizard-root");
  if (root)
    initWizard(root);
})();
