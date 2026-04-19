import type { WizardState } from './wizardShell.js';
export function renderReviewStep(
  container: HTMLElement,
  state: WizardState,
  onApprove: () => void,
  onBack: () => void
): void {
  const p = document.createElement('p');
  p.className = 'text-dim font-mono text-[12px]';
  p.textContent = 'REVIEW STEP — COMING SOON';
  container.appendChild(p);
}
