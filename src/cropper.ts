import { GRID_COLS, GRID_ROWS } from './config.js';

export interface CropBlobs {
  raw: Blob[][];   // [row][col]
}

// Placeholder grid boundaries for 2000×1124 reference screenshot.
// Calibrate these against a real RHTER screenshot in Task 11.
const ROW_Y: [number, number][] = [
  [50,  373],   // row 0: y_start, y_end
  [373, 707],   // row 1
  [707, 1042],  // row 2
];

const COL_X: [number, number][] = (() => {
  // 24 equally-spaced columns across x=10..1990
  const cols: [number, number][] = [];
  const xStart = 10, xEnd = 1990;
  const colW = (xEnd - xStart) / GRID_COLS;
  for (let c = 0; c < GRID_COLS; c++) {
    cols.push([Math.round(xStart + c * colW), Math.round(xStart + (c + 1) * colW)]);
  }
  return cols;
})();

async function cropCell(
  source: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
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
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

/**
 * Loads an image File into an HTMLCanvasElement.
 */
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

/**
 * Crops a RHTER screenshot into a GRID_ROWS × GRID_COLS grid of Blob objects.
 */
export async function cropScreenshot(file: File): Promise<CropBlobs> {
  const source = await fileToCanvas(file);

  const raw = await Promise.all(
    Array.from({ length: GRID_ROWS }, (_, row) => {
      const [yStart, yEnd] = ROW_Y[row];
      return Promise.all(
        Array.from({ length: GRID_COLS }, (_, col) => {
          const [xStart, xEnd] = COL_X[col];
          return cropCell(source, xStart, yStart, xEnd - xStart, yEnd - yStart);
        }),
      );
    }),
  );

  return { raw };
}

/**
 * Draws a grid overlay on the preview canvas for visual confirmation.
 * Returns the canvas element (append it to the DOM where needed).
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

    ctx.strokeStyle = 'rgba(98,238,183,0.8)';
    ctx.lineWidth = 1;

    // Draw row boundaries (top edge of first row + bottom edge of each row)
    const rowBoundaries = [ROW_Y[0][0], ...ROW_Y.map(([, yEnd]) => yEnd)];
    for (const y of rowBoundaries) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    // Draw column boundaries (left edge of first column + right edge of each column)
    const colBoundaries = [COL_X[0][0], ...COL_X.map(([, xEnd]) => xEnd)];
    for (const x of colBoundaries) {
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
