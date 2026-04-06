/**
 * Preprocesses a raw violin crop Blob:
 *   1. Invert pixels (dark background → light)
 *   2. Upscale 3× with LANCZOS-equivalent (createImageBitmap + drawImage)
 *   3. Boost contrast via CSS filter
 *
 * Returns a canvas element ready to be toBlob'd or passed to colorExtractor.
 */
export async function preprocessCrop(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;

  // Step 1: draw to an offscreen canvas and invert pixels
  const invertCanvas = document.createElement('canvas');
  invertCanvas.width = w;
  invertCanvas.height = h;
  const invertCtx = invertCanvas.getContext('2d');
  if (!invertCtx) throw new Error('Could not get 2D context for invert canvas');

  invertCtx.drawImage(bitmap, 0, 0);
  const imageData = invertCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i];     // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // alpha unchanged
  }
  invertCtx.putImageData(imageData, 0, 0);

  // Step 2: upscale 3× using drawImage (browser uses bilinear interpolation)
  const scale = 3;
  const upCanvas = document.createElement('canvas');
  upCanvas.width  = w * scale;
  upCanvas.height = h * scale;
  const upCtx = upCanvas.getContext('2d');
  if (!upCtx) throw new Error('Could not get 2D context for upscale canvas');
  upCtx.imageSmoothingEnabled = true;
  upCtx.imageSmoothingQuality = 'high';
  upCtx.drawImage(invertCanvas, 0, 0, w * scale, h * scale);

  // Step 3: contrast boost — draw through a filter onto a final canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width  = w * scale;
  finalCanvas.height = h * scale;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) throw new Error('Could not get 2D context for final canvas');
  finalCtx.filter = 'contrast(1.4)';
  finalCtx.drawImage(upCanvas, 0, 0);

  bitmap.close();
  return finalCanvas;
}

/**
 * Converts a canvas to a PNG Blob.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}
