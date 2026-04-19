import { cropScreenshot } from './cropper.js';
import { preprocessCrop, canvasToBlob } from './preprocessor.js';
import { extractCrop } from './extractor.js';
import { extractConstructors } from './colorExtractor.js';
import { validateCrop } from './validator.js';
import { getApiKey } from './settingsPanel.js';
import { importJSON } from './dataStore.js';
import type { ViolinCrop } from './types.js';

export interface PipelineProgress {
  completed: number;
  total: number;
  currentLabel: string;
}

export type ProgressCallback = (p: PipelineProgress) => void;

const INCREMENTAL_KEY = 'pipeline_incremental';

// Set to a small number during UI testing; remove (or set to Infinity) for full runs.
const TEST_CROP_LIMIT = 1;

/**
 * Runs the full pipeline (stages 0–4) on a screenshot file.
 * Saves each result to localStorage incrementally.
 * Calls `onProgress` after each crop completes.
 * Returns the final array of ViolinCrop objects.
 */
export async function runPipeline(
  file: File,
  onProgress: ProgressCallback,
): Promise<ViolinCrop[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No Gemini API key set. Go to Settings first.');

  // Stage 0: crop
  onProgress({ completed: 0, total: 72, currentLabel: 'Cropping screenshot…' });
  const { raw } = await cropScreenshot(file);
  (window as unknown as Record<string, unknown>).__lastCrops = { raw };

  const results: ViolinCrop[] = [];
  localStorage.setItem(INCREMENTAL_KEY, JSON.stringify([]));

  let completed = 0;
  if (!raw.length || !raw[0].length) throw new Error('No crops produced from screenshot');
  const total = Math.min(raw.length * raw[0].length, TEST_CROP_LIMIT);

  outer: for (let row = 0; row < raw.length; row++) {
    for (let col = 0; col < raw[row].length; col++) {
      if (completed >= TEST_CROP_LIMIT) break outer;
      onProgress({
        completed,
        total,
        currentLabel: `Extracting crop ${completed + 1} of ${total} (row ${row}, col ${col})…`,
      });

      try {
        const rawBlob = raw[row][col];

        // Stage 1: preprocess
        const preprocessedCanvas = await preprocessCrop(rawBlob);
        const preprocessedBlob   = await canvasToBlob(preprocessedCanvas);

        // Stage 3: color extraction uses the raw (uninverted) crop
        const rawCanvas = document.createElement('canvas');
        const rawBitmap = await createImageBitmap(rawBlob);
        rawCanvas.width  = rawBitmap.width;
        rawCanvas.height = rawBitmap.height;
        const rawCtx = rawCanvas.getContext('2d');
        if (!rawCtx) throw new Error('Could not get context for raw canvas');
        rawCtx.drawImage(rawBitmap, 0, 0);
        rawBitmap.close();
        const { cn1, cn2 } = extractConstructors(rawCanvas);

        // DEBUG: download preprocessed crop to inspect before sending to Gemini
        if ((window as any).__debugPreprocess) {
          const debugUrl = URL.createObjectURL(preprocessedBlob);
          const a = document.createElement('a');
          a.href = debugUrl;
          a.download = `crop_debug_r${row}_c${col}.png`;
          a.click();
          URL.revokeObjectURL(debugUrl);
        }

        // Stage 2: extract numbers
        const { extraction, needsReview } = await extractCrop(preprocessedBlob, apiKey);

        // Assemble ViolinCrop
        const crop: ViolinCrop = {
          row,
          col,
          header: extraction.header,
          percentiles: extraction.percentiles,
          drivers: extraction.drivers,
          constructors: {
            cn1: { color_rgb: null, team: cn1 },
            cn2: { color_rgb: null, team: cn2 },
          },
          confidence: needsReview ? 'low' : 'high',
          flagged: needsReview,
          flag_reasons: needsReview ? ['two-pass disagreement'] : [],
          raw_response: extraction.raw_response,
        };

        // Stage 4: validate — re-merge two-pass flag since validator replaces flag_reasons
        validateCrop(crop);
        if (needsReview && !crop.flag_reasons.includes('two-pass disagreement')) {
          crop.flag_reasons.push('two-pass disagreement');
          crop.flagged = true;
        }

        results.push(crop);
      } catch (err) {
        console.error(`Crop [${row},${col}] failed:`, err);
      }

      completed++;

      // Incremental save (includes successful crops only)
      localStorage.setItem(INCREMENTAL_KEY, JSON.stringify(results));
      onProgress({ completed, total, currentLabel: `Extracting crop ${completed} of ${total}…` });
    }
  }

  // Finalise — import into the main store
  importJSON(results);
  localStorage.removeItem(INCREMENTAL_KEY);

  return results;
}

/**
 * Returns any in-progress incremental results (for crash recovery).
 */
export function getIncrementalResults(): ViolinCrop[] | null {
  const raw = localStorage.getItem(INCREMENTAL_KEY);
  return raw ? JSON.parse(raw) as ViolinCrop[] : null;
}
