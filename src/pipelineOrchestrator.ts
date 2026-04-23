import { cropScreenshot } from './cropper.js';
import { preprocessCrop, canvasToBlob } from './preprocessor.js';
import { extractCrop } from './extractor.js';
import { extractConstructors } from './colorExtractor.js';
import { validateCrop } from './validator.js';
import {
  importJSON,
  resetPipelineIncremental,
  writePipelineIncremental,
  clearPipelineIncremental,
  readPipelineIncremental,
} from './dataStore.js';
import type { ViolinCrop } from './types.js';
import type { RunMode } from './runMode.js';
import { FULL_CROP_COUNT } from './runMode.js';

export interface PipelineDebugHooks {
  onPreprocessedBlob?(ctx: { row: number; col: number; blob: Blob }): void;
}

export interface PipelineProgress {
  completed: number;
  total: number;
  currentLabel: string;
  runMode: RunMode;
}

export type ProgressCallback = (p: PipelineProgress) => void;

export interface PipelineIncrementalPersistence {
  reset: () => void;
  save: (crops: ViolinCrop[]) => void;
  clear: () => void;
}

export interface PipelineRunOptions {
  /** Gemini API key from the host app (never read from UI modules inside the orchestrator). */
  apiKey: string;
  debugMode?: boolean;
  cropLimit?: number | null;
  /** When true, assigns `window.__lastCrops` with raw grid after cropping (for advanced debugging only). */
  exposeLastCrops?: boolean;
  debugHooks?: PipelineDebugHooks;
  /** Override default localStorage incremental persistence (e.g. for tests). */
  incrementalPersistence?: PipelineIncrementalPersistence;
}

export interface FailedCrop {
  row: number;
  col: number;
  message: string;
}

export interface PipelineRunSummary {
  totalPlanned: number;
  attempted: number;
  succeeded: number;
  failed: number;
  failedCrops: FailedCrop[];
  debugMode: boolean;
  runMode: RunMode;
}

export interface PipelineRunResult {
  crops: ViolinCrop[];
  summary: PipelineRunSummary;
}

function normaliseCropLimit(value?: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  if (rounded < 1) return null;
  return rounded;
}

function defaultIncremental(): PipelineIncrementalPersistence {
  return {
    reset: () => resetPipelineIncremental(),
    save: (crops) => writePipelineIncremental(crops),
    clear: () => clearPipelineIncremental(),
  };
}

/**
 * Runs the full pipeline (stages 0–4) on a screenshot file.
 * Saves each result via incremental persistence (default: localStorage).
 * Calls `onProgress` after each crop completes.
 */
export async function runPipeline(
  file: File,
  onProgress: ProgressCallback,
  options: PipelineRunOptions,
): Promise<PipelineRunResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error('No Gemini API key set. Go to Settings first.');

  const debugMode = Boolean(options.debugMode);
  const runMode: RunMode = debugMode ? 'debug' : 'full';

  onProgress({
    completed: 0,
    total: FULL_CROP_COUNT,
    currentLabel: 'Cropping screenshot…',
    runMode,
  });

  const { raw } = await cropScreenshot(file);
  if (options.exposeLastCrops) {
    (window as unknown as Record<string, unknown>).__lastCrops = { raw };
  }

  const results: ViolinCrop[] = [];
  const failedCrops: FailedCrop[] = [];
  const incremental = options.incrementalPersistence ?? defaultIncremental();
  incremental.reset();

  let completed = 0;
  if (!raw.length || !raw[0].length) throw new Error('No crops produced from screenshot');
  const available = raw.length * raw[0].length;
  const requestedLimit = debugMode ? normaliseCropLimit(options.cropLimit) : null;
  const total = requestedLimit == null ? available : Math.min(available, requestedLimit);

  onProgress({
    completed: 0,
    total,
    currentLabel: 'Starting extraction…',
    runMode,
  });

  const hooks = options.debugHooks;

  outer: for (let row = 0; row < raw.length; row++) {
    for (let col = 0; col < raw[row].length; col++) {
      if (completed >= total) break outer;
      onProgress({
        completed,
        total,
        currentLabel: `Extracting crop ${completed + 1} of ${total} (row ${row}, col ${col})${debugMode ? ' [DEBUG]' : ''}…`,
        runMode,
      });

      try {
        const rawBlob = raw[row][col];

        const preprocessedCanvas = await preprocessCrop(rawBlob);
        const preprocessedBlob = await canvasToBlob(preprocessedCanvas);

        const rawCanvas = document.createElement('canvas');
        const rawBitmap = await createImageBitmap(rawBlob);
        rawCanvas.width = rawBitmap.width;
        rawCanvas.height = rawBitmap.height;
        const rawCtx = rawCanvas.getContext('2d');
        if (!rawCtx) throw new Error('Could not get context for raw canvas');
        rawCtx.drawImage(rawBitmap, 0, 0);
        rawBitmap.close();
        const { cn1, cn2 } = extractConstructors(rawCanvas);

        hooks?.onPreprocessedBlob?.({ row, col, blob: preprocessedBlob });

        const { extraction, needsReview } = await extractCrop(preprocessedBlob, apiKey);

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

        validateCrop(crop);
        if (needsReview && !crop.flag_reasons.includes('two-pass disagreement')) {
          crop.flag_reasons.push('two-pass disagreement');
          crop.flagged = true;
        }

        results.push(crop);
      } catch (err) {
        console.error(`Crop [${row},${col}] failed:`, err);
        const message = err instanceof Error ? err.message : String(err);
        failedCrops.push({ row, col, message });
      }

      completed++;

      incremental.save(results);
      onProgress({ completed, total, currentLabel: `Extracting crop ${completed} of ${total}…`, runMode });
    }
  }

  importJSON(results);
  incremental.clear();

  const summary: PipelineRunSummary = {
    totalPlanned: total,
    attempted: completed,
    succeeded: results.length,
    failed: failedCrops.length,
    failedCrops,
    debugMode,
    runMode,
  };

  return { crops: results, summary };
}

/**
 * Returns any in-progress incremental results (for crash recovery).
 */
export function getIncrementalResults(): ViolinCrop[] | null {
  return readPipelineIncremental();
}
