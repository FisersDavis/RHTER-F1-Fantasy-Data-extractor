export type RunMode = 'full' | 'debug';

/** Expected crop count for a full RHTER screenshot grid. */
export const FULL_CROP_COUNT = 72;

export function formatRunModeSubtitle(runMode: RunMode, plannedTotal: number): string {
  if (runMode === 'full') {
    return `RUN MODE: FULL (${FULL_CROP_COUNT} CROPS)`;
  }
  return `RUN MODE: DEBUG (UP TO ${plannedTotal} CROPS)`;
}
