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

  const results: ViolinCrop[] = [];
  localStorage.setItem(INCREMENTAL_KEY, JSON.stringify([]));

  let completed = 0;
  const total = raw.length * raw[0].length;

  for (let row = 0; row < raw.length; row++) {
    for (let col = 0; col < raw[row].length; col++) {
      onProgress({
        completed,
        total,
        currentLabel: `Extracting crop ${completed + 1} of ${total} (row ${row}, col ${col})…`,
      });

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

      // Stage 4: validate
      validateCrop(crop);

      results.push(crop);
      completed++;

      // Incremental save
      localStorage.setItem(INCREMENTAL_KEY, JSON.stringify(results));
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
