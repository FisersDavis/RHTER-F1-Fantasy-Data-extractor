import { TEAMS } from './config.js';
import type { ViolinCrop, Percentiles } from './types.js';

const DRIVER_RE = /^[A-Z]{3}$/;
const VALID_MULTIPLIERS = new Set(['2X', '3X', null]);
const SCORE_MIN = 0;
const SCORE_MAX = 1000;
const BUDGET_MIN = 80;
const BUDGET_MAX = 130;

function validatePercentiles(p: Percentiles, reasons: string[]): void {
  const vals = [p.p05, p.p25, p.p50, p.p75, p.p95];
  for (const v of vals) {
    if (v < SCORE_MIN || v > SCORE_MAX) {
      reasons.push(`Percentile out of range: ${v}`);
    }
  }
  // Monotonicity: p05 ≤ p25 ≤ p50 ≤ p75 ≤ p95
  if (!(p.p05 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95)) {
    reasons.push(`Percentiles not monotonically increasing: ${vals.join(',')}`);
  }
}

function validateDrivers(crop: ViolinCrop, reasons: string[]): void {
  if (crop.drivers.length !== 5) {
    reasons.push(`Expected 5 drivers, got ${crop.drivers.length}`);
  }
  const multipliers = crop.drivers.filter(d => d.multiplier != null);
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

function validateConstructors(crop: ViolinCrop, reasons: string[]): void {
  for (const which of ['cn1', 'cn2'] as const) {
    const team = crop.constructors[which].team;
    if (!TEAMS.includes(team)) {
      reasons.push(`Unknown constructor team: "${team}" in ${which}`);
    }
  }
}

function validateHeader(crop: ViolinCrop, reasons: string[]): void {
  if (crop.header.budget_required < BUDGET_MIN || crop.header.budget_required > BUDGET_MAX) {
    reasons.push(`Budget out of plausible range: ${crop.header.budget_required}M`);
  }
  if (crop.header.avg_xpts < SCORE_MIN || crop.header.avg_xpts > SCORE_MAX) {
    reasons.push(`avg_xpts out of range: ${crop.header.avg_xpts}`);
  }
}

/**
 * Validates a ViolinCrop in-place:
 * - Populates `flag_reasons`
 * - Sets `flagged = true` if any reason is found
 * - Sets `confidence = 'low'` if any reason is found
 *
 * Returns the mutated crop.
 */
export function validateCrop(crop: ViolinCrop): ViolinCrop {
  const reasons: string[] = [];
  validatePercentiles(crop.percentiles, reasons);
  validateDrivers(crop, reasons);
  validateConstructors(crop, reasons);
  validateHeader(crop, reasons);

  crop.flag_reasons = reasons;
  crop.flagged = reasons.length > 0;
  if (reasons.length > 0) crop.confidence = 'low';
  return crop;
}
