import type { WizardState } from './wizardShell.js';
export function renderAnalysisStep(
  container: HTMLElement,
  state: WizardState,
  onPick: (teamId: number | null) => void,
  onBack: () => void
): void {
  const p = document.createElement('p');
  p.className = 'text-dim font-mono text-[12px]';
  p.textContent = 'ANALYSIS STEP — COMING SOON';
  container.appendChild(p);
}
