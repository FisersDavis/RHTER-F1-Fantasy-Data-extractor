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

  const blobs: Blob[][] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const rowBlobs: Blob[] = [];
    const [yStart, yEnd] = ROW_Y[row];
    for (let col = 0; col < GRID_COLS; col++) {
      const [xStart, xEnd] = COL_X[col];
      const blob = await cropCell(source, xStart, yStart, xEnd - xStart, yEnd - yStart);
      rowBlobs.push(blob);
    }
    blobs.push(rowBlobs);
  }

  return { raw: blobs };
}

/**
 * Draws a grid overlay on the preview canvas for visual confirmation.
 * Returns the canvas element (append it to the DOM where needed).
 */
export function drawGridOverlay(
  file: File,
  onReady: (canvas: HTMLCanvasElement) => void,
): void {
  createImageBitmap(file).then(bitmap => {
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.maxWidth = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Draw row lines
    ctx.strokeStyle = 'rgba(98,238,183,0.8)';
    ctx.lineWidth = 1;
    for (const [, yEnd] of ROW_Y) {
      ctx.beginPath();
      ctx.moveTo(0, yEnd);
      ctx.lineTo(canvas.width, yEnd);
      ctx.stroke();
    }
    // Draw column lines
    for (const [, xEnd] of COL_X) {
      ctx.beginPath();
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, canvas.height);
      ctx.stroke();
    }

    onReady(canvas);
  });
}
