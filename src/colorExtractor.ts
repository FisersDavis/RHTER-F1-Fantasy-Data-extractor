import { CONSTRUCTOR_LAB, TEAMS } from './config.js';

interface RGB { r: number; g: number; b: number; }
type Lab = [number, number, number];

function srgbToLinear(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function rgbToLab(r: number, g: number, b: number): Lab {
  // sRGB → linear
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  // linear RGB → XYZ (D65)
  const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const Z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;

  // XYZ → Lab (D65 reference white)
  function f(t: number): number {
    return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  }
  const fx = f(X / 0.95047);
  const fy = f(Y / 1.00000);
  const fz = f(Z / 1.08883);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2),
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if      (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else                 h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

/**
 * Samples pixels from the center region of an (uninverted) crop canvas,
 * averages the foreground colors for the left half (cn1) and right half (cn2),
 * and returns the nearest constructor team for each.
 *
 * @param canvas - The raw (non-inverted) crop canvas
 * @returns { cn1: string, cn2: string } — constructor team codes
 */
export function extractConstructors(canvas: HTMLCanvasElement): { cn1: string; cn2: string } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  const w = canvas.width;
  const h = canvas.height;

  // Sample middle 40% height × 80% width
  const xStart = Math.floor(w * 0.10);
  const xEnd   = Math.floor(w * 0.90);
  const yStart = Math.floor(h * 0.30);
  const yEnd   = Math.floor(h * 0.70);
  const sampleW = xEnd - xStart;
  const sampleH = yEnd - yStart;

  const imageData = ctx.getImageData(xStart, yStart, sampleW, sampleH);
  const pixels = imageData.data;

  const leftSums:  RGB = { r: 0, g: 0, b: 0 };
  const rightSums: RGB = { r: 0, g: 0, b: 0 };
  let leftCount = 0, rightCount = 0;
  const midX = sampleW / 2;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const pixelIdx = i / 4;
    const px = pixelIdx % sampleW;

    // Keep colored pixels (saturation > 0.5) or bright white (HAA — all channels > 200,
    // saturation < 0.15 to exclude near-white UI chrome and anti-aliased edges)
    const { s } = rgbToHsl(r, g, b);
    const isColored = s > 0.5;
    const isWhite   = r > 200 && g > 200 && b > 200 && s < 0.15;
    if (!isColored && !isWhite) continue;

    if (px < midX) {
      leftSums.r += r; leftSums.g += g; leftSums.b += b; leftCount++;
    } else {
      rightSums.r += r; rightSums.g += g; rightSums.b += b; rightCount++;
    }
  }

  return {
    cn1: nearestTeam(leftSums,  leftCount),
    cn2: nearestTeam(rightSums, rightCount),
  };
}

/** Returns the nearest constructor team code for a given RGB sum + pixel count. */
function nearestTeam(sums: RGB, count: number): string {
  if (count === 0) return 'UNK';
  const avg: Lab = rgbToLab(
    Math.round(sums.r / count),
    Math.round(sums.g / count),
    Math.round(sums.b / count),
  );
  let best = TEAMS[0];
  let bestDist = Infinity;
  for (const team of TEAMS) {
    const ref = CONSTRUCTOR_LAB[team];
    if (!ref) continue;
    const dist = deltaE76(avg, ref);
    if (dist < bestDist) { bestDist = dist; best = team; }
  }
  return best;
}
