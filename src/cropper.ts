import { GRID_COLS, GRID_ROWS } from './config.js';

export interface CropBlobs {
  raw: Blob[][];   // [row][col]
}

// ---------------------------------------------------------------------------
// Reference constants (calibrated from 1560×877 RHTER reference screenshot)
// ---------------------------------------------------------------------------
const REF_W = 1560;
const REF_H = 877;
const REF_ROW_BOUNDS: [number, number][] = [
  [80,  333],
  [343, 596],
  [606, 860],
];
const REF_CONTENT_X_START = 28;
const REF_CONTENT_X_END   = 1340;
const REF_GAP_MIN = 8;
const REF_GAP_MAX = 20;
const BACKGROUND_RGB: [number, number, number] = [52, 55, 61];
const NUM_COLS = 24;

// ---------------------------------------------------------------------------
// Gap detection
// ---------------------------------------------------------------------------

function boxFilter(arr: number[], size: number): number[] {
  const half = Math.floor(size / 2);
  const out = new Array<number>(arr.length);
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

function percentile25(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.25);
  return sorted[idx];
}

/**
 * Detects 25 column boundaries (for 24 columns) by scanning dark vertical
 * gaps in row 0 of the image. Throws if exactly 23 gaps are not found.
 */
function detectColumnBoundaries(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
): number[] {
  const scaleX = imgWidth  / REF_W;
  const scaleY = imgHeight / REF_H;

  const yTop    = Math.round(REF_ROW_BOUNDS[0][0] * scaleY);
  const yBottom = Math.round(REF_ROW_BOUNDS[0][1] * scaleY);
  const xStart  = Math.round(REF_CONTENT_X_START * scaleX);
  const xEnd    = Math.round(REF_CONTENT_X_END   * scaleX);
  const gapMin  = REF_GAP_MIN  * scaleX;
  const gapMax  = REF_GAP_MAX  * scaleX;
  const smoothSize = Math.max(3, Math.round(3 * scaleX));

  if (imgWidth < 1500 || imgHeight < 800) {
    console.warn(`Gap detection: image ${imgWidth}×${imgHeight} is smaller than expected (~1560×877). Crops may be misaligned.`);
  }

  const stripWidth  = xEnd - xStart;
  const stripHeight = yBottom - yTop;
  const imageData   = ctx.getImageData(xStart, yTop, stripWidth, stripHeight);
  const data        = imageData.data;

  // Compute per-column mean Euclidean distance from BACKGROUND_RGB
  const [br, bg, bb] = BACKGROUND_RGB;
  const colScores = new Array<number>(stripWidth).fill(0);

  for (let col = 0; col < stripWidth; col++) {
    let sum = 0;
    for (let row = 0; row < stripHeight; row++) {
      const idx = (row * stripWidth + col) * 4;
      const dr = data[idx]     - br;
      const dg = data[idx + 1] - bg;
      const db = data[idx + 2] - bb;
      sum += Math.sqrt(dr * dr + dg * dg + db * db);
    }
    colScores[col] = sum / stripHeight;
  }

  const smoothed  = boxFilter(colScores, smoothSize);
  const threshold = percentile25(smoothed);
  const isDark    = smoothed.map(v => v < threshold);

  // Find contiguous dark runs (gaps)
  const gaps: { mid: number; width: number }[] = [];
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
      const width  = gapEnd - gapStart;
      const mid    = Math.floor((gapStart + gapEnd) / 2) + xStart;
      gaps.push({ mid, width });
    }
  }

  const realGaps = gaps.filter(g => g.width >= gapMin && g.width <= gapMax);

  if (realGaps.length !== 23) {
    throw new Error(
      `Gap detection found ${realGaps.length} gaps, expected 23. Screenshot may be cropped or layout changed.`
    );
  }

  const avgColWidth = (realGaps[22].mid - realGaps[0].mid) / 22;
  const boundaries: number[] = [
    Math.round(realGaps[0].mid - avgColWidth),
    ...realGaps.map(g => g.mid),
    Math.round(realGaps[22].mid + avgColWidth),
  ];

  return boundaries;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function cropCell(
  source: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
  row: number, col: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`toBlob returned null for row ${row} col ${col}`));
    }, 'image/png');
  });
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width  = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Crops a RHTER screenshot into a GRID_ROWS × GRID_COLS grid of Blob objects.
 * Column boundaries are detected dynamically via gap detection.
 */
export async function cropScreenshot(file: File): Promise<CropBlobs> {
  const source = await fileToCanvas(file);
  const ctx    = source.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  const scaleY       = source.height / REF_H;
  const boundaries   = detectColumnBoundaries(ctx, source.width, source.height);
  const rowBounds    = REF_ROW_BOUNDS.map(([y0, y1]): [number, number] => [
    Math.round(y0 * scaleY),
    Math.round(y1 * scaleY),
  ]);

  if (GRID_ROWS !== 3 || GRID_COLS !== NUM_COLS) {
    throw new Error(`Config mismatch: expected 3×24 grid, got ${GRID_ROWS}×${GRID_COLS}`);
  }

  const raw = await Promise.all(
    Array.from({ length: GRID_ROWS }, (_, row) => {
      const [yTop, yBottom] = rowBounds[row];
      return Promise.all(
        Array.from({ length: GRID_COLS }, (_, col) => {
          const xLeft  = boundaries[col];
          const xRight = boundaries[col + 1];
          return cropCell(source, xLeft, yTop, xRight - xLeft, yBottom - yTop, row, col);
        }),
      );
    }),
  );

  return { raw };
}

/**
 * Draws a grid overlay on the preview canvas using the same detected boundaries,
 * so the user sees exactly what will be cropped.
 */
export function drawGridOverlay(
  file: File,
  onReady: (canvas: HTMLCanvasElement) => void,
  onError?: (err: Error) => void,
): void {
  createImageBitmap(file).then(bitmap => {
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.maxWidth = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const err = new Error('Could not get 2D context for grid overlay');
      if (onError) onError(err); else console.error(err);
      return;
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    let boundaries: number[];
    try {
      boundaries = detectColumnBoundaries(ctx, canvas.width, canvas.height);
    } catch (err) {
      if (onError) onError(err as Error); else console.error(err);
      return;
    }

    const scaleY   = canvas.height / REF_H;
    const rowBounds = REF_ROW_BOUNDS.map(([y0, y1]) => [
      Math.round(y0 * scaleY),
      Math.round(y1 * scaleY),
    ]);

    ctx.strokeStyle = 'rgba(98,238,183,0.8)';
    ctx.lineWidth   = 1;

    // Row lines
    const rowYs = [rowBounds[0][0], ...rowBounds.map(([, y1]) => y1)];
    for (const y of rowYs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Column lines from detected boundaries
    for (const x of boundaries) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    onReady(canvas);
  }).catch(err => {
    if (onError) onError(err as Error); else console.error(err);
  });
}
