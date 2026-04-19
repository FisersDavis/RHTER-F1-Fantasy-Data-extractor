# Wizard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-tab navigation shell with a 3-step wizard (Upload → Review → Analysis) that matches the design handoff — dark theme, Space Mono, red accent, no green.

**Architecture:** `wizardShell.ts` becomes the new entry point, owning chrome (nav bar, step indicator, footer) and `WizardState` persisted to localStorage. Each step is a dedicated render module (`uploadStep.ts`, `reviewStep.ts`, `analysisStep.ts`) that owns only DOM — data/calculation logic stays in the existing `review.ts` and `analysis.ts`. Tailwind standalone CLI compiles `src/input.css` → `docs/style.css`.

**Tech Stack:** Vanilla TypeScript, Tailwind CSS standalone CLI (no npm), Space Mono via Google Fonts CDN, existing pipeline (`pipelineOrchestrator.ts`, `dataStore.ts`, `review.ts`, `analysis.ts`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `tailwind.config.js` | Create | All design tokens (colors, fonts, border-radius) |
| `src/input.css` | Create | `@tailwind` directives only |
| `src/ui/wizardShell.ts` | Create | Chrome: nav, step indicator, footer; WizardState + localStorage; step dispatch |
| `src/ui/uploadStep.ts` | Create | Upload step DOM: API key card, drop zone, progress bar, demo button, info grid |
| `src/ui/reviewStep.ts` | Create | Review step DOM: budget card, table, inline edit panel, action bar |
| `src/ui/analysisStep.ts` | Create | Analysis step DOM: controls bar, guide rails, top pick card, ranked list |
| `src/app.ts` | Replace | Delete 5-tab shell; import and call `initWizard()` from `wizardShell.ts` |
| `docs/index.html` | Modify | Add Space Mono CDN links; update CSP for Google Fonts; remove old `<header>/<nav>` |
| `docs/style.css` | Build artifact | Tailwind output — not hand-edited |
| `src/review.ts` | No change | Pure data/calculation logic, `initReview` export stays but DOM code is dead after this |
| `src/analysis.ts` | No change | Pure data/calculation logic, `initAnalysis` export stays but DOM code is dead after this |

**Note on review.ts and analysis.ts:** The spec says "DOM-building code is stripped and moved". However, because these files are tightly coupled (data + DOM interleaved), the safest approach is to leave them untouched as a fallback and build the new step files that re-implement DOM from scratch calling the same data layer (`getReviewedDataset`, `getImportedViolins`, `computeRankedList`). This avoids breaking the existing data pipeline while the wizard is wired up. After the wizard is validated end-to-end, a follow-up cleanup task can strip DOM from `review.ts`/`analysis.ts`.

---

## Task 1: Tailwind Build Setup

**Files:**
- Create: `tailwind.config.js`
- Create: `src/input.css`
- Download: `tailwindcss.exe` (standalone CLI)

- [ ] **Step 1: Create `tailwind.config.js`**

```js
module.exports = {
  content: ['./src/**/*.ts', './docs/index.html'],
  theme: {
    extend: {
      colors: {
        bg:           '#0a0a0a',
        bg1:          '#111111',
        bg2:          '#161616',
        bg3:          '#1c1c1c',
        border:       '#222222',
        border2:      '#2a2a2a',
        muted:        '#444444',
        sub:          '#666666',
        dim:          '#888888',
        text:         '#e8e8e8',
        accent:       '#e8401c',
        'accent-dim': 'rgba(232,64,28,0.12)',
        'accent-border': 'rgba(232,64,28,0.40)',
        team: {
          MER: '#06d3bf', FER: '#dd1818', RBR: '#1e41ff',
          MCL: '#ff6700', AMR: '#006b3c', WIL: '#005aff',
          ALP: '#ff87bc', HAA: '#b6babd', KIC: '#52e252', SAU: '#9b0000',
        }
      },
      fontFamily: { mono: ['"Space Mono"', 'monospace'] },
      borderRadius: { DEFAULT: '0', none: '0' },
      fontSize: { label: ['9px', { letterSpacing: '0.18em' }] },
    }
  }
}
```

- [ ] **Step 2: Create `src/input.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Download Tailwind standalone CLI**

Run in the project root (Windows bash):
```bash
curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe
mv tailwindcss-windows-x64.exe tailwindcss.exe
```

- [ ] **Step 4: Run a first build to verify config is valid**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css
```

Expected: `docs/style.css` is written, no errors. The file will be large (full Tailwind base) — that's normal at this stage. Minified production build comes in the final task.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js src/input.css docs/style.css
git commit -m "build: add Tailwind standalone CLI config and first build"
```

---

## Task 2: Update `docs/index.html`

**Files:**
- Modify: `docs/index.html`

The current HTML has a `<header>` with `<h1>` and `<nav id="main-nav">`. The wizard shell will own all chrome so we strip that. We also add Space Mono and update the CSP to allow Google Fonts.

- [ ] **Step 1: Replace `docs/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com; worker-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;">
    <title>RHTER F1 Fantasy</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
</head>
<body class="bg-bg text-text font-mono min-h-screen flex flex-col">
    <div id="wizard-root" class="flex flex-col min-h-screen"></div>
    <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rebuild CSS (so new classes are included)**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css
```

- [ ] **Step 3: Open `docs/index.html` in browser**

Expected: Page is black (`#0a0a0a` background), no content yet (wizard not wired). Space Mono loads (check DevTools → Network → Fonts). No Courier New anywhere.

- [ ] **Step 4: Commit**

```bash
git add docs/index.html docs/style.css
git commit -m "feat: update index.html for wizard shell — Space Mono, dark bg, stripped nav"
```

---

## Task 3: Wizard Shell (`src/ui/wizardShell.ts`)

**Files:**
- Create: `src/ui/wizardShell.ts`

This file owns all chrome and state. It does NOT own step content — it delegates to step render functions (stubs in this task, filled in later tasks).

- [ ] **Step 1: Create `src/ui/` directory placeholder**

```bash
mkdir -p "src/ui"
```

- [ ] **Step 2: Create `src/ui/wizardShell.ts`**

```typescript
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
    const raw = localStorage.getItem('reviewedDataset');
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
```

- [ ] **Step 3: Create stub files so TypeScript resolves imports**

Create `src/ui/uploadStep.ts`:
```typescript
export function renderUploadStep(container: HTMLElement, onComplete: () => void): void {
  const p = document.createElement('p');
  p.className = 'text-dim font-mono text-[12px]';
  p.textContent = 'UPLOAD STEP — COMING SOON';
  container.appendChild(p);
}
```

Create `src/ui/reviewStep.ts`:
```typescript
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
```

Create `src/ui/analysisStep.ts`:
```typescript
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
```

- [ ] **Step 4: Update `src/app.ts` to use wizard shell**

Replace the entire file:
```typescript
import { initWizard } from './ui/wizardShell.js';

const root = document.getElementById('wizard-root');
if (root) initWizard(root);
```

- [ ] **Step 5: Rebuild CSS**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css
```

- [ ] **Step 6: Compile TypeScript**

```bash
npx tsc --noEmit
```

Expected: Zero errors. If TypeScript complains about `src/ui/` not being in `tsconfig.json`, check `tsconfig.json` — the `include` or `rootDir` may need updating to cover `src/ui/`.

- [ ] **Step 7: Open `docs/index.html` in browser**

Expected: Dark page with sticky nav bar (showing `RHTER` logo), 3-step indicator (step 1 active), footer at bottom, and "UPLOAD STEP — COMING SOON" placeholder in the main area.

- [ ] **Step 8: Commit**

```bash
git add src/ui/wizardShell.ts src/ui/uploadStep.ts src/ui/reviewStep.ts src/ui/analysisStep.ts src/app.ts docs/style.css
git commit -m "feat: wizard shell chrome — nav, step indicator, footer, state persistence"
```

---

## Task 4: Upload Step (`src/ui/uploadStep.ts`)

**Files:**
- Modify: `src/ui/uploadStep.ts` (replace stub)

Imports: `runPipeline` from `../pipelineOrchestrator.js`, `getApiKey` from `../settingsPanel.js`, `saveApiKey` (need to check — currently `settingsPanel.ts` exports `getApiKey` but no `saveApiKey`; we'll write an inline save using `localStorage.setItem('geminiApiKey', key)`).

- [ ] **Step 1: Replace `src/ui/uploadStep.ts` with full implementation**

```typescript
import { runPipeline } from '../pipelineOrchestrator.js';
import { getApiKey } from '../settingsPanel.js';

const PHASE_LABELS = ['UPLOADING', 'PARSING ROWS', 'VALIDATING', 'FINALISING'];

function saveApiKey(key: string): void {
  localStorage.setItem('geminiApiKey', key);
}

function buildApiKeyCard(onSaved: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'mb-6 p-[20px] bg-bg1 border border-border flex flex-col gap-3';

  const label = document.createElement('span');
  label.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  label.textContent = 'API KEY REQUIRED';
  card.appendChild(label);

  const row = document.createElement('div');
  row.className = 'flex items-end gap-4';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'GEMINI API KEY';
  input.className = 'flex-1 bg-transparent border-b border-border font-mono text-[12px] text-text py-[4px] outline-none placeholder:text-muted';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'SAVE';
  saveBtn.className = 'border border-accent text-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100';

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) return;
    saveApiKey(key);
    onSaved();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });

  row.appendChild(input);
  row.appendChild(saveBtn);
  card.appendChild(row);
  return card;
}

function buildDropZone(onFile: (file: File) => void): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'min-h-[360px] border border-dashed border-border bg-bg1 flex items-center justify-center cursor-pointer transition-colors duration-150';

  const inner = document.createElement('div');
  inner.className = 'flex flex-col items-center gap-3';

  const icon = document.createElement('div');
  icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4v16M8 12l8-8 8 8M6 24h20" stroke="#444" stroke-width="1.5"/></svg>`;

  const heading = document.createElement('span');
  heading.className = 'font-mono text-[11px] uppercase tracking-[0.18em] text-text';
  heading.textContent = 'DROP SCREENSHOT HERE';

  const sub = document.createElement('span');
  sub.className = 'font-mono text-[9px] text-dim';
  sub.textContent = 'or click to browse';

  inner.appendChild(icon);
  inner.appendChild(heading);
  inner.appendChild(sub);
  zone.appendChild(inner);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';
  zone.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) onFile(file);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.className = zone.className.replace('border-border', 'border-white bg-bg2');
  });
  zone.addEventListener('dragleave', () => {
    zone.className = zone.className.replace('border-white bg-bg2', 'border-border');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.className = zone.className.replace('border-white bg-bg2', 'border-border');
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  });

  return zone;
}

function buildProgressSection(phaseIndex: number, percent: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'min-h-[360px] bg-bg1 border border-border flex flex-col justify-center px-[40px] gap-4';

  const phaseLabel = document.createElement('span');
  phaseLabel.className = 'font-mono text-[9px] uppercase tracking-[0.18em] text-dim';
  phaseLabel.textContent = PHASE_LABELS[phaseIndex] ?? 'PROCESSING';
  wrap.appendChild(phaseLabel);

  const track = document.createElement('div');
  track.className = 'w-full h-[2px] bg-bg2';
  const fill = document.createElement('div');
  fill.className = percent >= 100 ? 'h-[2px] bg-white transition-[width] duration-[250ms] ease-linear' : 'h-[2px] bg-accent transition-[width] duration-[250ms] ease-linear';
  fill.style.width = `${percent}%`;
  track.appendChild(fill);
  wrap.appendChild(track);

  return wrap;
}

function buildInfoGrid(): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-8 mt-6';

  const lastSession = localStorage.getItem('wizardState');
  let lastSessionText = 'NO PREVIOUS SESSION';
  if (lastSession) {
    try {
      const s = JSON.parse(lastSession);
      if (s.step > 0) lastSessionText = `STEP ${s.step + 1} IN PROGRESS`;
    } catch { /* ignore */ }
  }

  const cols: Array<{ label: string; lines: string[] }> = [
    {
      label: 'WHAT HAPPENS NEXT',
      lines: ['1. CROP IMAGE (72 VIOLINS)', '2. EXTRACT NUMBERS (GEMINI)', '3. IDENTIFY TEAM COLORS', '4. VALIDATE + FLAG']
    },
    {
      label: 'EXTRACTION TIME',
      lines: ['~90 SECONDS', 'FOR 72 CROPS']
    },
    {
      label: 'LAST SESSION',
      lines: [lastSessionText]
    },
  ];

  for (const col of cols) {
    const div = document.createElement('div');
    div.className = 'flex flex-col gap-2';

    const lbl = document.createElement('span');
    lbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
    lbl.textContent = col.label;
    div.appendChild(lbl);

    for (const line of col.lines) {
      const p = document.createElement('span');
      p.className = 'text-[11px] font-mono text-dim';
      p.textContent = line;
      div.appendChild(p);
    }

    grid.appendChild(div);
  }

  return grid;
}

export function renderUploadStep(container: HTMLElement, onComplete: () => void): void {
  const hasKey = !!getApiKey();
  let uploadAreaEl: HTMLElement | null = null;

  function showUploadArea(): void {
    if (uploadAreaEl) uploadAreaEl.remove();

    const wrap = document.createElement('div');
    wrap.id = 'upload-area';

    const zone = buildDropZone(startPipeline);
    wrap.appendChild(zone);

    const demoBtn = document.createElement('button');
    demoBtn.textContent = 'SIMULATE WITH DEMO DATA';
    demoBtn.className = 'mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px] hover:border-text hover:text-text transition-colors duration-100';
    demoBtn.addEventListener('click', () => {
      injectDemoData();
      onComplete();
    });
    wrap.appendChild(demoBtn);
    wrap.appendChild(buildInfoGrid());

    container.appendChild(wrap);
    uploadAreaEl = wrap;
  }

  function startPipeline(file: File): void {
    if (!uploadAreaEl) return;
    uploadAreaEl.innerHTML = '';

    let phaseIndex = 0;
    let percent = 0;
    const progress = buildProgressSection(phaseIndex, percent);
    uploadAreaEl.appendChild(progress);

    runPipeline(file, (p) => {
      percent = Math.round((p.completed / p.total) * 100);
      phaseIndex = Math.min(3, Math.floor((p.completed / p.total) * 4));

      uploadAreaEl!.innerHTML = '';
      const updated = buildProgressSection(phaseIndex, percent);
      uploadAreaEl!.appendChild(updated);

      if (percent >= 100) {
        setTimeout(onComplete, 400);
      }
    }).catch((err: Error) => {
      uploadAreaEl!.innerHTML = '';
      const errMsg = document.createElement('p');
      errMsg.className = 'font-mono text-[11px] text-accent p-[20px]';
      errMsg.textContent = `PIPELINE ERROR: ${err.message}`;
      uploadAreaEl!.appendChild(errMsg);
      uploadAreaEl!.appendChild(buildDropZone(startPipeline));
    });
  }

  function injectDemoData(): void {
    const demo = generateDemoViolins();
    localStorage.setItem('importedViolins', JSON.stringify(demo));
    localStorage.setItem('reviewedDataset', JSON.stringify(demo));
  }

  if (!hasKey) {
    container.appendChild(buildApiKeyCard(() => {
      container.innerHTML = '';
      renderUploadStep(container, onComplete);
    }));
  }

  showUploadArea();
}

function generateDemoViolins(): unknown[] {
  const DRIVER_SETS = [
    ['VER', 'NOR', 'PIA'],
    ['HAM', 'RUS', 'LEC'],
    ['SAI', 'ALO', 'STR'],
    ['TSU', 'GAS', 'OCO'],
    ['HUL', 'MAG', 'BOT'],
    ['ZHO', 'LAW', 'COL'],
  ];
  const CN_PAIRS = [
    ['MCL', 'RED'], ['MER', 'FER'], ['AMR', 'WIL'],
    ['ALP', 'HAA'], ['MCL', 'MER'], ['RED', 'FER'],
  ];
  const TEAM_COLORS: Record<string, [number, number, number]> = {
    MCL: [255, 103, 0], RED: [30, 65, 255], MER: [6, 211, 191],
    FER: [221, 24, 24], AMR: [0, 107, 60], WIL: [0, 90, 255],
    ALP: [255, 135, 188], HAA: [182, 186, 189],
  };

  const violins = [];
  for (let i = 0; i < 6; i++) {
    const p50 = 80 + Math.round(Math.random() * 40);
    const spread = 10 + Math.round(Math.random() * 20);
    const [cn1, cn2] = CN_PAIRS[i];
    violins.push({
      row: Math.floor(i / 3),
      col: i % 3,
      header: {
        budget_required: 95 + Math.round(Math.random() * 20),
        avg_xpts: p50,
        avg_xpts_dollar_impact: 0.8,
        avg_budget_uplift: null,
      },
      percentiles: {
        p05: p50 - spread * 2,
        p25: p50 - spread,
        p50,
        p75: p50 + spread,
        p95: p50 + spread * 2,
      },
      drivers: DRIVER_SETS[i].map((name, j) => ({ name, multiplier: j === 0 ? '2X' : null })),
      constructors: {
        cn1: { color_rgb: TEAM_COLORS[cn1] ?? null, team: cn1 },
        cn2: { color_rgb: TEAM_COLORS[cn2] ?? null, team: cn2 },
      },
      confidence: 'high' as const,
      flagged: i === 2,
      flag_reasons: i === 2 ? ['P95 OUTLIER'] : [],
      raw_response: '',
    });
  }
  return violins;
}
```

- [ ] **Step 2: Rebuild CSS**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css
```

- [ ] **Step 3: Compile TypeScript**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 4: Open `docs/index.html` in browser with no API key set**

Expected: API key card appears above the drop zone. Enter any text, press Save. Card collapses. Drop zone appears. Drag state changes border color. Demo button visible.

- [ ] **Step 5: Click "SIMULATE WITH DEMO DATA"**

Expected: Wizard advances to step 2 (Review step — still shows "REVIEW STEP — COMING SOON").

- [ ] **Step 6: Reload page**

Expected: Step 2 is restored from localStorage (step indicator shows step 2 active).

- [ ] **Step 7: Commit**

```bash
git add src/ui/uploadStep.ts docs/style.css
git commit -m "feat: upload step — API key card, drop zone, progress bar, demo data"
```

---

## Task 5: Review Step (`src/ui/reviewStep.ts`)

**Files:**
- Modify: `src/ui/reviewStep.ts` (replace stub)

Data source: `getImportedViolins()` from `../dataStore.js`. The step owns DOM; business logic (flag counting, budget filtering) is inline in this file since `review.ts` interleaves DOM tightly.

- [ ] **Step 1: Replace `src/ui/reviewStep.ts` with full implementation**

```typescript
import { getImportedViolins, saveReviewedDataset } from '../dataStore.js';
import { CONSTRUCTOR_COLORS } from '../config.js';
import type { WizardState } from './wizardShell.js';
import type { ViolinCrop } from '../types.js';

type FilterMode = 'all' | 'flagged';

export function renderReviewStep(
  container: HTMLElement,
  state: WizardState,
  onApprove: () => void,
  onBack: () => void
): void {
  let violins: ViolinCrop[] = getImportedViolins() ?? [];
  let filterMode: FilterMode = 'all';

  const section = document.createElement('div');
  section.className = 'flex flex-col gap-4';
  container.appendChild(section);

  // Budget card
  const budgetCard = document.createElement('div');
  budgetCard.className = 'bg-bg1 border border-border p-[28px] grid grid-cols-3 gap-8';

  const col1 = document.createElement('div');
  col1.className = 'flex flex-col gap-1';
  const budgetLbl = document.createElement('span');
  budgetLbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  budgetLbl.textContent = 'BUDGET';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.step = '0.1';
  budgetInput.value = String(state.budget);
  budgetInput.className = 'bg-transparent border-b border-accent text-[32px] font-mono font-bold text-text w-[120px] outline-none';
  col1.appendChild(budgetLbl);
  col1.appendChild(budgetInput);
  budgetCard.appendChild(col1);

  const col2 = document.createElement('div');
  col2.className = 'flex flex-col gap-1';
  const teamsLbl = document.createElement('span');
  teamsLbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  teamsLbl.textContent = 'TEAMS IN BUDGET';
  const teamsVal = document.createElement('span');
  teamsVal.className = 'text-[32px] font-mono font-bold text-text';
  col2.appendChild(teamsLbl);
  col2.appendChild(teamsVal);
  budgetCard.appendChild(col2);

  const col3 = document.createElement('div');
  col3.className = 'flex flex-col gap-2';
  const statsLabel = document.createElement('span');
  statsLabel.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  statsLabel.textContent = 'EXTRACTION STATS';
  col3.appendChild(statsLabel);
  const statParsed = makeStatPair('TEAMS PARSED', String(violins.length));
  const statFlagged = makeStatPair('FLAGGED', String(violins.filter(v => v.flagged).length));
  const statConf = makeStatPair('CONFIDENCE', violins.length ? `${Math.round(violins.filter(v => v.confidence === 'high').length / violins.length * 100)}%` : '—');
  col3.appendChild(statParsed);
  col3.appendChild(statFlagged);
  col3.appendChild(statConf);
  budgetCard.appendChild(col3);

  section.appendChild(budgetCard);

  // Table toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center justify-between';
  const flagCountLabel = document.createElement('span');
  flagCountLabel.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  const toggleGroup = document.createElement('div');
  toggleGroup.className = 'flex gap-4';
  const toggleAll = document.createElement('button');
  toggleAll.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  toggleAll.textContent = 'ALL ROWS';
  const toggleFlagged = document.createElement('button');
  toggleFlagged.className = 'font-mono text-[10px] uppercase tracking-[0.18em]';
  toggleFlagged.textContent = '⚑ FLAGGED ONLY';
  toggleGroup.appendChild(toggleFlagged);
  toggleGroup.appendChild(toggleAll);
  toolbar.appendChild(flagCountLabel);
  toolbar.appendChild(toggleGroup);
  section.appendChild(toolbar);

  // Table
  const tableWrap = document.createElement('div');
  tableWrap.className = 'border border-border';
  section.appendChild(tableWrap);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.className = 'sticky bottom-0 bg-bg border-t border-border px-[40px] py-[14px] flex items-center justify-between';
  const backBtn = document.createElement('button');
  backBtn.textContent = '← BACK';
  backBtn.className = 'border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100';
  backBtn.addEventListener('click', onBack);
  const rightBar = document.createElement('div');
  rightBar.className = 'flex items-center gap-4';
  const approveBtn = document.createElement('button');
  approveBtn.textContent = 'APPROVE DATA + CONTINUE →';
  approveBtn.className = 'bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px] py-[8px]';
  rightBar.appendChild(approveBtn);
  actionBar.appendChild(backBtn);
  actionBar.appendChild(rightBar);
  container.appendChild(actionBar);

  function updateBudgetCount(): void {
    const budget = parseFloat(budgetInput.value) || Infinity;
    teamsVal.textContent = String(violins.filter(v => v.header.budget_required <= budget).length);
  }

  function updateFlagState(): void {
    const unresolved = violins.filter(v => v.flagged).length;
    flagCountLabel.textContent = `${unresolved} FLAG${unresolved !== 1 ? 'S' : ''}`;
    flagCountLabel.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${unresolved > 0 ? 'text-accent' : 'text-dim'}`;
    approveBtn.classList.toggle('opacity-30', unresolved > 0);
    approveBtn.classList.toggle('cursor-not-allowed', unresolved > 0);
    approveBtn.onclick = unresolved > 0 ? null : () => { saveReviewedDataset(violins); onApprove(); };
  }

  function renderTable(): void {
    tableWrap.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'grid border-b border-border';
    header.style.gridTemplateColumns = '44px 84px 1fr 72px 72px 72px 76px 100px';
    ['ROW', 'BUDGET', 'LINEUP', 'P50', 'P75', 'P95', 'KELLY', 'STATUS'].forEach(col => {
      const th = document.createElement('div');
      th.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono px-[8px] py-[10px]';
      th.textContent = col;
      header.appendChild(th);
    });
    tableWrap.appendChild(header);

    const displayViolins = filterMode === 'flagged' ? violins.filter(v => v.flagged) : violins;

    for (const violin of displayViolins) {
      const kelly = estimateKellyForDisplay(violin);
      const isFlagged = violin.flagged;

      const row = document.createElement('div');
      row.className = `grid border-b border-border font-mono text-[11px] ${isFlagged ? 'border-l-2 border-accent bg-[rgba(232,64,28,0.12)]' : 'bg-bg1 hover:bg-bg2'}`;
      row.style.gridTemplateColumns = '44px 84px 1fr 72px 72px 72px 76px 100px';

      const p = violin.percentiles;
      const cells = [
        String(violin.row * 24 + violin.col + 1),
        `${violin.header.budget_required}M`,
        violin.drivers.map(d => d.multiplier ? `${d.name}(${d.multiplier})` : d.name).join(' ') + ` [${violin.constructors.cn1.team}][${violin.constructors.cn2.team}]`,
        String(p.p50),
        String(p.p75),
        isFlagged ? `${p.p95} ⚑` : String(p.p95),
        (kelly * 100).toFixed(0) + '%',
        '',
      ];

      cells.forEach((text, ci) => {
        const td = document.createElement('div');
        td.className = `px-[8px] py-[10px] ${ci === 6 ? 'text-accent' : ''} ${ci === 5 && isFlagged ? 'text-accent' : ''}`;
        if (ci === 7) {
          if (isFlagged) {
            const editBtn = document.createElement('button');
            editBtn.textContent = 'EDIT';
            editBtn.className = 'border border-accent text-accent font-mono text-[9px] px-[8px] py-[3px] mr-1';
            editBtn.addEventListener('click', () => toggleEditPanel(violin, row));
            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
            okBtn.className = 'border border-border text-dim font-mono text-[9px] px-[8px] py-[3px]';
            okBtn.addEventListener('click', () => {
              violin.flagged = false;
              saveReviewedDataset(violins);
              updateFlagState();
              renderTable();
            });
            td.appendChild(editBtn);
            td.appendChild(okBtn);
          }
        } else {
          td.textContent = text;
        }
        row.appendChild(td);
      });

      tableWrap.appendChild(row);
    }
  }

  function toggleEditPanel(violin: ViolinCrop, row: HTMLElement): void {
    const existing = row.nextElementSibling;
    if (existing?.classList.contains('edit-panel')) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.className = 'edit-panel bg-[#120a08] border-l-2 border-accent p-[16px] grid grid-cols-4 gap-4';

    const fields: Array<{ label: string; key: keyof typeof violin.percentiles }> = [
      { label: 'P50', key: 'p50' },
      { label: 'P75', key: 'p75' },
      { label: 'P95', key: 'p95' },
    ];

    for (const field of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col gap-1';
      const lbl = document.createElement('span');
      lbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
      lbl.textContent = field.label;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = String(violin.percentiles[field.key]);
      inp.className = 'bg-transparent border-b border-border text-text font-mono text-[12px] w-full outline-none py-[4px]';
      inp.addEventListener('change', () => {
        (violin.percentiles[field.key] as number) = parseFloat(inp.value) || violin.percentiles[field.key];
      });
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      panel.appendChild(wrap);
    }

    const confirmWrap = document.createElement('div');
    confirmWrap.className = 'flex items-end';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'CONFIRM VALUES';
    confirmBtn.className = 'border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100';
    confirmBtn.addEventListener('click', () => {
      violin.flagged = false;
      saveReviewedDataset(violins);
      panel.remove();
      updateFlagState();
      renderTable();
    });
    confirmWrap.appendChild(confirmBtn);
    panel.appendChild(confirmWrap);

    row.insertAdjacentElement('afterend', panel);
  }

  function setFilter(mode: FilterMode): void {
    filterMode = mode;
    toggleAll.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === 'all' ? 'text-text' : 'text-muted'}`;
    toggleFlagged.className = `font-mono text-[10px] uppercase tracking-[0.18em] ${mode === 'flagged' ? 'text-text' : 'text-muted'}`;
    renderTable();
  }

  toggleAll.addEventListener('click', () => setFilter('all'));
  toggleFlagged.addEventListener('click', () => setFilter('flagged'));

  budgetInput.addEventListener('blur', () => {
    state.budget = parseFloat(budgetInput.value) || 105;
    localStorage.setItem('userBudget', String(state.budget));
    updateBudgetCount();
  });
  budgetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') budgetInput.blur();
  });

  setFilter('all');
  updateBudgetCount();
  updateFlagState();
}

function makeStatPair(label: string, value: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex justify-between gap-4';
  const lbl = document.createElement('span');
  lbl.className = 'text-[9px] uppercase tracking-[0.18em] text-muted font-mono';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'text-[11px] font-mono text-text';
  val.textContent = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  return wrap;
}

function estimateKellyForDisplay(violin: ViolinCrop): number {
  const pts: [number, number][] = [
    [violin.percentiles.p05, 0.05],
    [violin.percentiles.p25, 0.25],
    [violin.percentiles.p50, 0.50],
    [violin.percentiles.p75, 0.75],
    [violin.percentiles.p95, 0.95],
  ];
  const threshold = violin.percentiles.p50;
  let p = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, c0] = pts[i];
    const [s1, c1] = pts[i + 1];
    if (threshold >= s0 && threshold <= s1) {
      const t = (threshold - s0) / (s1 - s0);
      p = 1 - (c0 + t * (c1 - c0));
      break;
    }
  }
  const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
  const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
  return Math.max(0, Math.min(1, f));
}
```

- [ ] **Step 2: Rebuild CSS and compile TypeScript**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Test in browser — use demo data flow**

1. Open `docs/index.html`, click "SIMULATE WITH DEMO DATA"
2. Wizard advances to Review step
3. Budget input shows `105`, "TEAMS IN BUDGET" count updates when you change budget
4. Table shows all 6 demo violins
5. Flagged row (violin 3) has red left border and EDIT/OK buttons
6. Click EDIT on flagged row — inline edit panel expands below
7. Change a value, click CONFIRM VALUES — panel closes, flag removed
8. With all flags resolved, APPROVE button becomes clickable → advances to step 3 (still stub)

- [ ] **Step 4: Commit**

```bash
git add src/ui/reviewStep.ts docs/style.css
git commit -m "feat: review step — budget card, flagged table, inline edit, approve gate"
```

---

## Task 6: Analysis Step (`src/ui/analysisStep.ts`)

**Files:**
- Modify: `src/ui/analysisStep.ts` (replace stub)

Data source: `getReviewedDataset()` from `../dataStore.js`. Calculation functions (`computeRankedList`, `calcKelly`, `estimateWinProb`) are re-exported from `../analysis.js` — but check: `analysis.ts` currently does NOT export `computeRankedList`. We'll extract those functions into a helper here to avoid modifying `analysis.ts`.

- [ ] **Step 1: Replace `src/ui/analysisStep.ts` with full implementation**

```typescript
import { getReviewedDataset } from '../dataStore.js';
import type { WizardState } from './wizardShell.js';
import type { ViolinCrop, Percentiles } from '../types.js';

const TEAM_COLORS: Record<string, string> = {
  MER: '#06d3bf', FER: '#dd1818', RBR: '#1e41ff',
  MCL: '#ff6700', AMR: '#006b3c', WIL: '#005aff',
  ALP: '#ff87bc', HAA: '#b6babd', KIC: '#52e252', SAU: '#9b0000',
  RED: '#1e41ff',
};

const SORT_LABELS: Record<string, string> = {
  kelly: 'KELLY SCORE',
  p50: 'P50 XPTS',
  p95: 'P95 CEILING',
  budget: 'BUDGET',
};

interface RankedEntry {
  violin: ViolinCrop;
  kelly: number;
  teamId: number;
  overBudget: boolean;
}

function estimateWinProb(percentiles: Percentiles, threshold: number): number {
  const pts: [number, number][] = [
    [percentiles.p05, 0.05], [percentiles.p25, 0.25], [percentiles.p50, 0.50],
    [percentiles.p75, 0.75], [percentiles.p95, 0.95],
  ];
  if (threshold <= pts[0][0]) return 1 - pts[0][1];
  if (threshold >= pts[4][0]) return 1 - pts[4][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, c0] = pts[i];
    const [s1, c1] = pts[i + 1];
    if (threshold >= s0 && threshold <= s1) {
      const t = (threshold - s0) / (s1 - s0);
      return 1 - (c0 + t * (c1 - c0));
    }
  }
  return 0;
}

function calcKelly(violin: ViolinCrop, threshold: number): number {
  const p = estimateWinProb(violin.percentiles, threshold);
  const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
  const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
  return Math.max(0, Math.min(1, f));
}

function computeRanked(violins: ViolinCrop[], budget: number, sortKey: string): RankedEntry[] {
  const p50s = violins.map(v => v.percentiles.p50).sort((a, b) => a - b);
  const threshold = p50s[Math.floor(p50s.length / 2)];

  const entries: RankedEntry[] = violins.map((v, i) => ({
    violin: v,
    kelly: calcKelly(v, threshold),
    teamId: i,
    overBudget: v.header.budget_required > budget,
  }));

  const sortFns: Record<string, (a: RankedEntry, b: RankedEntry) => number> = {
    kelly:  (a, b) => b.kelly - a.kelly,
    p50:    (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
    p95:    (a, b) => b.violin.percentiles.p95 - a.violin.percentiles.p95,
    budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required,
  };

  const fn = sortFns[sortKey] ?? sortFns['kelly'];
  return [...entries.filter(e => !e.overBudget).sort(fn), ...entries.filter(e => e.overBudget).sort(fn)];
}

function buildDistBar(pct: Percentiles, max: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative h-[10px] w-full my-2';

  const whisker = document.createElement('div');
  whisker.className = 'absolute h-[1px] bg-muted/40 top-[50%]';
  whisker.style.left = `${(pct.p05 / max) * 100}%`;
  whisker.style.width = `${((pct.p95 - pct.p05) / max) * 100}%`;

  const box = document.createElement('div');
  box.className = 'absolute h-[6px] bg-text top-[50%] -translate-y-1/2';
  box.style.left = `${(pct.p25 / max) * 100}%`;
  box.style.width = `${((pct.p75 - pct.p25) / max) * 100}%`;

  const tick = document.createElement('div');
  tick.className = 'absolute w-[2px] h-[10px] bg-white top-[50%] -translate-y-1/2';
  tick.style.left = `${(pct.p50 / max) * 100}%`;

  wrap.appendChild(whisker);
  wrap.appendChild(box);
  wrap.appendChild(tick);
  return wrap;
}

function buildLineup(violin: ViolinCrop): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2 font-mono text-[11px] text-text flex-wrap';
  for (const d of violin.drivers) {
    const span = document.createElement('span');
    span.textContent = d.multiplier ? `${d.name}(${d.multiplier})` : d.name;
    wrap.appendChild(span);
  }
  const sep = document.createElement('span');
  sep.className = 'text-muted';
  sep.textContent = '//';
  wrap.appendChild(sep);
  for (const cn of [violin.constructors.cn1, violin.constructors.cn2]) {
    const dot = document.createElement('span');
    dot.className = 'w-[8px] h-[8px] rounded-full inline-block';
    dot.style.background = TEAM_COLORS[cn.team] ?? '#888';
    dot.title = cn.team;
    wrap.appendChild(dot);
    const lbl = document.createElement('span');
    lbl.textContent = cn.team;
    wrap.appendChild(lbl);
  }
  return wrap;
}

function buildGuideRails(max: number): { rails: HTMLElement; header: HTMLElement } {
  const pctPoints = [0.05, 0.25, 0.50, 0.75, 0.95];
  const labels = ['P5', 'P25', 'P50', 'P75', 'P95'];

  const rails = document.createElement('div');
  rails.className = 'absolute inset-0 pointer-events-none z-0';
  pctPoints.forEach((pct, i) => {
    const line = document.createElement('div');
    line.className = `absolute top-0 bottom-0 border-l ${i === 2 ? 'border-white/20' : i === 1 || i === 3 ? 'border-white/10' : 'border-white/5'}`;
    line.style.left = `${pct * 100}%`;
    rails.appendChild(line);
  });

  const header = document.createElement('div');
  header.className = 'relative h-[20px] mb-1';
  pctPoints.forEach((pct, i) => {
    const lbl = document.createElement('span');
    lbl.className = 'absolute text-[8px] text-muted font-mono uppercase -translate-x-1/2';
    lbl.style.left = `${pct * 100}%`;
    lbl.textContent = labels[i];
    header.appendChild(lbl);
  });

  return { rails, header };
}

export function renderAnalysisStep(
  container: HTMLElement,
  state: WizardState,
  onPick: (teamId: number | null) => void,
  onBack: () => void
): void {
  const violins = getReviewedDataset();
  if (!violins || !violins.length) {
    const msg = document.createElement('p');
    msg.className = 'font-mono text-[11px] text-dim';
    msg.textContent = 'NO DATA. GO BACK AND APPROVE DATA IN THE REVIEW STEP.';
    container.appendChild(msg);
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.className = 'mt-4 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px]';
    backBtn.addEventListener('click', onBack);
    container.appendChild(backBtn);
    return;
  }

  let currentSortKey = state.sortKey;
  let pickedTeamId = state.pickedTeamId;

  const section = document.createElement('div');
  section.className = 'flex flex-col gap-4';
  container.appendChild(section);

  // Controls bar
  const controlsBar = document.createElement('div');
  controlsBar.className = 'bg-bg1 border border-border p-[16px] flex items-center justify-between';

  const modelGroup = document.createElement('div');
  modelGroup.className = 'flex gap-2 items-center';
  const modelLbl = document.createElement('span');
  modelLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono mr-2';
  modelLbl.textContent = 'MODEL';
  const kellyBtn = document.createElement('button');
  kellyBtn.textContent = 'KELLY';
  kellyBtn.className = 'bg-accent text-white font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]';
  modelGroup.appendChild(modelLbl);
  modelGroup.appendChild(kellyBtn);
  controlsBar.appendChild(modelGroup);

  const sortGroup = document.createElement('div');
  sortGroup.className = 'flex gap-4';

  const sortKeys = ['kelly', 'p50', 'p95', 'budget'];
  const sortBtns: Record<string, HTMLButtonElement> = {};
  sortKeys.forEach(key => {
    const btn = document.createElement('button');
    btn.textContent = (key === currentSortKey ? '▶ ' : '') + SORT_LABELS[key];
    btn.className = `font-mono text-[9px] uppercase tracking-[0.18em] ${key === currentSortKey ? 'text-text border-b border-accent pb-[2px]' : 'text-muted'}`;
    btn.addEventListener('click', () => {
      currentSortKey = key as WizardState['sortKey'];
      state.sortKey = currentSortKey;
      render();
    });
    sortBtns[key] = btn;
    sortGroup.appendChild(btn);
  });
  controlsBar.appendChild(sortGroup);
  section.appendChild(controlsBar);

  // List container (relative for guide rails)
  const listWrap = document.createElement('div');
  listWrap.className = 'relative';
  section.appendChild(listWrap);

  function render(): void {
    listWrap.innerHTML = '';
    const ranked = computeRanked(violins!, state.budget, currentSortKey);
    if (!ranked.length) return;

    const max = ranked[0].violin.percentiles.p95;
    const { rails, header: railHeader } = buildGuideRails(max);

    listWrap.appendChild(railHeader);

    const innerWrap = document.createElement('div');
    innerWrap.className = 'relative';
    innerWrap.appendChild(rails);

    const top = ranked[0];
    innerWrap.appendChild(buildTopPickCard(top, max, pickedTeamId, (id) => {
      pickedTeamId = pickedTeamId === id ? null : id;
      onPick(pickedTeamId);
    }));

    ranked.slice(1).forEach((entry, i) => {
      innerWrap.appendChild(buildRankedRow(entry, i + 2, max, pickedTeamId, (id) => {
        pickedTeamId = pickedTeamId === id ? null : id;
        onPick(pickedTeamId);
      }));
    });

    listWrap.appendChild(innerWrap);

    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.className = 'mt-6 border border-border text-dim font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:border-text hover:text-text transition-colors duration-100';
    backBtn.addEventListener('click', onBack);
    listWrap.appendChild(backBtn);
  }

  render();
}

function buildTopPickCard(
  entry: RankedEntry,
  max: number,
  pickedTeamId: number | null,
  onPick: (id: number) => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'relative z-10 bg-[rgba(232,64,28,0.12)] border-l-[3px] border-accent p-[28px] grid grid-cols-4 gap-6';

  const col1 = document.createElement('div');
  col1.className = 'flex flex-col gap-2';
  col1.appendChild(buildLineup(entry.violin));
  col1.appendChild(buildDistBar(entry.violin.percentiles, max));
  const pctLbls = document.createElement('div');
  pctLbls.className = 'flex justify-between font-mono text-[8px] text-dim';
  ['P5', 'P25', 'P50', 'P75', 'P95'].forEach((l, i) => {
    const s = document.createElement('span');
    s.textContent = l;
    if (i === 2) s.className = 'text-text';
    pctLbls.appendChild(s);
  });
  col1.appendChild(pctLbls);
  card.appendChild(col1);

  const col2 = document.createElement('div');
  col2.className = 'flex flex-col gap-1';
  const avgLbl = document.createElement('span');
  avgLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
  avgLbl.textContent = 'AVG EXPECTED PTS';
  const avgVal = document.createElement('span');
  avgVal.className = 'text-[12px] text-dim font-mono';
  avgVal.textContent = String(entry.violin.header.avg_xpts);
  col2.appendChild(avgLbl);
  col2.appendChild(avgVal);
  card.appendChild(col2);

  const col3 = document.createElement('div');
  col3.className = 'flex flex-col gap-1';
  const kellyLbl = document.createElement('span');
  kellyLbl.className = 'text-[8px] uppercase tracking-[0.18em] text-muted font-mono';
  kellyLbl.textContent = 'KELLY SCORE';
  const kellyVal = document.createElement('span');
  kellyVal.className = 'text-[36px] font-bold text-accent font-mono';
  kellyVal.textContent = (entry.kelly * 100).toFixed(0) + '%';
  col3.appendChild(kellyLbl);
  col3.appendChild(kellyVal);
  card.appendChild(col3);

  const col4 = document.createElement('div');
  col4.className = 'flex items-stretch';
  const pickBtn = document.createElement('button');
  const isPicked = pickedTeamId === entry.teamId;
  pickBtn.textContent = isPicked ? '✓ PICKED' : 'PICK THIS TEAM';
  pickBtn.className = isPicked
    ? 'w-full bg-bg3 text-text border border-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]'
    : 'w-full bg-accent text-white font-mono text-[10px] uppercase tracking-[0.18em] px-[20px]';
  pickBtn.addEventListener('click', () => onPick(entry.teamId));
  col4.appendChild(pickBtn);
  card.appendChild(col4);

  return card;
}

function buildRankedRow(
  entry: RankedEntry,
  rank: number,
  max: number,
  pickedTeamId: number | null,
  onPick: (id: number) => void
): HTMLElement {
  const isPicked = pickedTeamId === entry.teamId;
  const row = document.createElement('div');
  row.className = `relative z-10 grid border-b border-border transition-colors duration-100 ${isPicked ? 'border-l-2 border-accent bg-bg3' : 'bg-bg1 hover:bg-white/[0.02]'}`;
  row.style.gridTemplateColumns = 'auto 1fr auto auto auto';

  const rankEl = document.createElement('div');
  rankEl.className = 'px-[12px] py-[16px] font-mono text-[11px] text-dim w-[44px]';
  rankEl.textContent = `#${rank}`;
  row.appendChild(rankEl);

  const lineupCol = document.createElement('div');
  lineupCol.className = 'px-[8px] py-[12px] flex flex-col gap-1';
  lineupCol.appendChild(buildLineup(entry.violin));
  lineupCol.appendChild(buildDistBar(entry.violin.percentiles, max));
  row.appendChild(lineupCol);

  const avgEl = document.createElement('div');
  avgEl.className = 'px-[12px] py-[16px] font-mono text-[12px] text-dim self-center';
  avgEl.textContent = String(entry.violin.header.avg_xpts);
  row.appendChild(avgEl);

  const kellyEl = document.createElement('div');
  kellyEl.className = 'px-[12px] py-[16px] font-mono text-[18px] font-bold text-accent self-center';
  kellyEl.textContent = (entry.kelly * 100).toFixed(0) + '%';
  row.appendChild(kellyEl);

  const pickEl = document.createElement('div');
  pickEl.className = 'px-[12px] py-[16px] self-center';
  const pickBtn = document.createElement('button');
  pickBtn.textContent = isPicked ? '✓ PICKED' : 'PICK';
  pickBtn.className = isPicked
    ? 'border border-accent text-accent font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px]'
    : 'border border-border text-dim font-mono text-[9px] uppercase tracking-[0.18em] px-[12px] py-[5px] hover:border-text hover:text-text transition-colors duration-100';
  pickBtn.addEventListener('click', () => onPick(entry.teamId));
  pickEl.appendChild(pickBtn);
  row.appendChild(pickEl);

  return row;
}
```

- [ ] **Step 2: Rebuild CSS and compile TypeScript**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Test in browser — full flow**

1. Start from step 0, click "SIMULATE WITH DEMO DATA"
2. Confirm all flags in Review step, click "APPROVE DATA + CONTINUE →"
3. Analysis step renders: controls bar, guide rails header row, top pick card with Kelly score
4. Change sort key — list re-ranks instantly
5. Click "PICK THIS TEAM" on top card — button changes to "✓ PICKED"
6. Click a different row's PICK — previous pick deselects, new one activates
7. Reload page — picked team persists (teamId in localStorage via wizardShell)

- [ ] **Step 4: Commit**

```bash
git add src/ui/analysisStep.ts docs/style.css
git commit -m "feat: analysis step — distribution matrix, Kelly ranking, pick persistence"
```

---

## Task 7: Production Build and Final Verification

**Files:**
- Modify: `.gitignore` (add `docs/style.css` if not already ignored)

- [ ] **Step 1: Add `docs/style.css` to `.gitignore`**

Check if already there:
```bash
grep "style.css" .gitignore
```

If not present, add it:
```bash
echo "docs/style.css" >> .gitignore
```

- [ ] **Step 2: Run production Tailwind build**

```bash
./tailwindcss.exe -i src/input.css -o docs/style.css --minify
```

Expected: `docs/style.css` is significantly smaller than the dev build. Open DevTools → Network → check CSS file size. Should be under 50KB for a page using ~100 utility classes.

- [ ] **Step 3: Run full verification checklist**

Open `docs/index.html` in browser and verify each point:

1. Space Mono loads — DevTools → Fonts tab shows Space Mono, no Courier New in computed styles
2. Background is `#0a0a0a` — inspect `body` computed background-color
3. Upload step drop zone appears, dragging changes border color to white
4. No API key in localStorage: API key card appears above drop zone
5. Enter key, press Save: card collapses, drop zone appears
6. Click demo data: advances to Review step
7. Change budget value in Review: "TEAMS IN BUDGET" updates instantly
8. Flagged rows have red left border and EDIT/OK buttons
9. Confirm all flags: APPROVE button becomes clickable
10. Click APPROVE: advances to Analysis step
11. Analysis: guide rails visible through hover state (`bg-white/[0.02]` transparent)
12. Top pick card P95 tick aligns with rightmost guide rail position
13. Sort change re-ranks list instantly
14. Pick a team: `✓ PICKED` state, single-select enforced
15. Reload page: wizard restores to last step, budget value, picked team ID

- [ ] **Step 4: Commit final build**

```bash
git add .gitignore docs/style.css
git commit -m "build: production Tailwind build, gitignore style.css"
```

---

## Spec Coverage Check

| Spec Section | Covered in Task |
|---|---|
| Tailwind config + design tokens | Task 1 |
| `docs/index.html` Space Mono + CSP update | Task 2 |
| `wizardShell.ts` — nav, step indicator, footer, WizardState | Task 3 |
| Step transitions via events | Task 3 (`onPipelineComplete`, `onDataApproved`) |
| Upload: API key card collapse | Task 4 |
| Upload: drop zone idle/drag/loading states | Task 4 |
| Upload: progress bar phases + auto-advance | Task 4 |
| Upload: demo button | Task 4 |
| Upload: info grid (WHAT HAPPENS NEXT / TIME / LAST SESSION) | Task 4 |
| Review: budget card 3-column | Task 5 |
| Review: table 8 columns with grid template | Task 5 |
| Review: flagged row styling + EDIT/OK | Task 5 |
| Review: inline edit panel expand/confirm | Task 5 |
| Review: APPROVE gate (disabled until flags clear) | Task 5 |
| Analysis: controls bar (MODEL + SORT BY) | Task 6 |
| Analysis: global guide rails at P5/P25/P50/P75/P95 | Task 6 |
| Analysis: distribution bar (whisker/box/tick) | Task 6 |
| Analysis: top pick card with master scale | Task 6 |
| Analysis: ranked list rows 2–N | Task 6 |
| Analysis: single-select pick with localStorage | Task 6 |
| Constructor dots (`rounded-full` exception) | Task 6 |
| Production build + gitignore | Task 7 |
| Full verification checklist | Task 7 |
