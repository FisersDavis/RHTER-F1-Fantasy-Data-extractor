import { renderUploadStep } from './uploadStep.js';
import { renderReviewStep } from './reviewStep.js';
import { renderAnalysisStep } from './analysisStep.js';

export type WizardState = {
  step: 0 | 1 | 2;
  budget: number;
  pickedTeamId: number | null;
  sortKey: 'kelly' | 'p50' | 'p95' | 'budget';
};

const STATE_KEY = 'wizardState';
const STEP_LABELS = ['UPLOAD', 'REVIEW', 'ANALYSIS'];

function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch { /* ignore */ }
  return { step: 0, budget: 105, pickedTeamId: null, sortKey: 'kelly' };
}

function saveState(state: WizardState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function buildNav(state: WizardState, root: HTMLElement): HTMLElement {
  const nav = document.createElement('div');
  nav.className = 'sticky top-0 z-50 bg-bg border-b border-border px-[40px] py-[14px] flex items-center justify-between';

  const left = document.createElement('div');
  left.className = 'flex items-center gap-3';
  const logo = document.createElement('span');
  logo.className = 'font-mono font-bold text-[13px] tracking-[0.1em] text-text';
  logo.textContent = 'RHTER';
  left.appendChild(logo);
  nav.appendChild(left);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-6';

  const budgetPair = makePair('BUDGET', `${state.budget}M`);
  right.appendChild(budgetPair);

  if (state.step > 0) {
    const flagCount = getFlagCount();
    const flagPair = makePair('FLAGS', String(flagCount));
    if (flagCount > 0) flagPair.querySelector('.kv-value')!.classList.add('text-accent');
    right.appendChild(flagPair);
  }

  nav.appendChild(right);
  return nav;
}

function makePair(label: string, value: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-end';
  const lbl = document.createElement('span');
  lbl.className = 'text-[8px] text-muted uppercase tracking-[0.18em] font-mono';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'kv-value text-[12px] font-mono text-text';
  val.textContent = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  return wrap;
}

function getFlagCount(): number {
  try {
    const raw = localStorage.getItem('reviewedViolins');
    if (!raw) return 0;
    const arr = JSON.parse(raw) as Array<{ flagged?: boolean }>;
    return arr.filter(v => v.flagged).length;
  } catch { return 0; }
}

function buildStepIndicator(currentStep: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center justify-center px-[40px] py-[20px] border-b border-border';

  STEP_LABELS.forEach((label, i) => {
    const isDone = i < currentStep;
    const isActive = i === currentStep;

    const item = document.createElement('div');
    item.className = 'flex items-center gap-2';

    const box = document.createElement('div');
    box.className = 'w-[20px] h-[20px] flex items-center justify-center border text-[10px] font-mono font-bold';
    if (isDone) {
      box.className += ' border-muted text-muted';
      box.innerHTML = `<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="currentColor" stroke-width="1.5"/></svg>`;
    } else if (isActive) {
      box.className += ' bg-white text-bg border-white';
      box.textContent = String(i + 1);
    } else {
      box.className += ' border-border text-border';
      box.textContent = String(i + 1);
    }

    const lbl = document.createElement('span');
    lbl.className = `text-[9px] uppercase tracking-[0.18em] font-mono ${isActive ? 'text-text' : 'text-muted'}`;
    lbl.textContent = label;

    item.appendChild(box);
    item.appendChild(lbl);
    wrap.appendChild(item);

    if (i < STEP_LABELS.length - 1) {
      const line = document.createElement('div');
      line.className = `w-[48px] h-[1px] mx-3 ${isDone ? 'bg-muted' : 'bg-border'}`;
      wrap.appendChild(line);
    }
  });

  return wrap;
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'sticky bottom-0 bg-bg border-t border-border px-[40px] py-[14px] flex items-center justify-between';

  const left = document.createElement('span');
  left.className = 'text-[8px] text-muted uppercase tracking-[0.18em] font-mono';
  left.textContent = 'RHTER // F1 FANTASY ANALYSIS TOOL';

  const right = document.createElement('span');
  right.className = 'text-[8px] text-muted uppercase tracking-[0.18em] font-mono';
  right.textContent = 'MODEL: KELLY CRITERION // 2026 SEASON';

  footer.appendChild(left);
  footer.appendChild(right);
  return footer;
}

export function initWizard(root: HTMLElement): void {
  const state = loadState();

  function render(): void {
    root.innerHTML = '';
    root.appendChild(buildNav(state, root));
    root.appendChild(buildStepIndicator(state.step));

    const main = document.createElement('main');
    main.className = 'flex-1 px-[40px] py-[32px]';

    if (state.step === 0) renderUploadStep(main, onPipelineComplete);
    else if (state.step === 1) renderReviewStep(main, state, onDataApproved, onBack);
    else renderAnalysisStep(main, state, onPick, onBack);

    root.appendChild(main);
    root.appendChild(buildFooter());
  }

  function onPipelineComplete(): void {
    state.step = 1;
    saveState(state);
    render();
  }

  function onDataApproved(): void {
    state.step = 2;
    saveState(state);
    render();
  }

  function onBack(): void {
    state.step = Math.max(0, state.step - 1) as 0 | 1 | 2;
    saveState(state);
    render();
  }

  function onPick(teamId: number | null): void {
    state.pickedTeamId = teamId;
    saveState(state);
    render();
  }

  render();
}
