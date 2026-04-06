# Browser Pipeline + TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local Python pipeline with an entirely browser-side pipeline (Canvas + Gemini Flash REST API) and migrate all JS source to TypeScript, compiled by esbuild to `docs/app.js`.

**Architecture:** TypeScript source lives in `src/`, esbuild bundles it to `docs/app.js`. The 5 existing JS modules are migrated to `.ts` one-at-a-time, then 7 new pipeline modules are added (types, config, settingsPanel, cropper, preprocessor, colorExtractor, extractor, validator, pipelineOrchestrator). The data contract (`ViolinCrop` JSON schema) is unchanged — existing `importJSON()` continues to work.

**Tech Stack:** TypeScript 5.4 strict, esbuild 0.20, Canvas API, Gemini Flash REST (`generativelanguage.googleapis.com`), localStorage, GitHub Pages (static files only)

---

## File Map

### New files (created in this plan)
| Path | Responsibility |
|---|---|
| `package.json` | npm scripts: `dev` (esbuild watch), `build` (esbuild bundle + minify) |
| `tsconfig.json` | TypeScript strict config targeting ES2020 |
| `src/types.ts` | Shared interfaces: `ViolinCrop`, `Header`, `Percentiles`, `Driver`, `Constructors`, `ConstructorEntry` |
| `src/config.ts` | `CONSTRUCTOR_COLORS` lookup (11 teams), `CONSTRUCTOR_REFS` Lab reference colors, grid coordinates constant |
| `src/app.ts` | Migrated from `docs/app.js` — adds `extract` and `settings` views |
| `src/dataStore.ts` | Migrated from `docs/dataStore.js` — typed with `ViolinCrop` |
| `src/review.ts` | Migrated from `docs/review.js` — typed |
| `src/analysis.ts` | Migrated from `docs/analysis.js` — typed |
| `src/areaChart.ts` | Migrated from `docs/areaChart.js` — typed |
| `src/settingsPanel.ts` | Gemini API key input + localStorage storage |
| `src/cropper.ts` | Image upload, 72-cell grid overlay, Canvas crop → `Blob[]` |
| `src/preprocessor.ts` | Per-crop Canvas pipeline: invert, 3× upscale, contrast boost |
| `src/colorExtractor.ts` | `getImageData` pixel sampling, RGB→Lab, Delta-E constructor match |
| `src/extractor.ts` | Gemini Flash REST client, token-bucket rate limiter (15/min), two-pass orchestration |
| `src/validator.ts` | Range, monotonicity, driver, constructor validation; returns `flag_reasons[]` |
| `src/pipelineOrchestrator.ts` | Wires stages 0–4, drives progress bar, saves crops incrementally to localStorage |

### Modified files
| Path | Change |
|---|---|
| `docs/index.html` | Update CSP header to allow `connect-src https://generativelanguage.googleapis.com`; add `extract` and `settings` nav items |
| `docs/app.js` | Replaced by esbuild output — do not hand-edit after Task 2 |

---

## Task 1: Build tooling scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rhter-f1-extractor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "esbuild src/app.ts --bundle --outfile=docs/app.js --watch",
    "build": "esbuild src/app.ts --bundle --minify --outfile=docs/app.js"
  },
  "devDependencies": {
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "lib": ["ES2020", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "docs"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 4: Verify esbuild is available**

```bash
npx esbuild --version
```

Expected: prints a version string like `0.20.x`

- [ ] **Step 5: Create `src/` directory and empty entry point**

```bash
mkdir src
```

Create `src/app.ts` with content:

```typescript
export {};
```

- [ ] **Step 6: Verify build runs**

```bash
npm run build
```

Expected: `docs/app.js` is written (may be nearly empty — that's fine). Zero errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/app.ts
git commit -m "build: add esbuild + TypeScript scaffold"
```

---

## Task 2: Shared types and config

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface Header {
  budget_required: number;
  avg_xpts: number;
  avg_xpts_dollar_impact: number;
  avg_budget_uplift: number | null;
}

export interface Percentiles {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface Driver {
  name: string;
  multiplier: string | null;
}

export interface ConstructorEntry {
  color_rgb: [number, number, number] | null;
  team: string;
}

export interface Constructors {
  cn1: ConstructorEntry;
  cn2: ConstructorEntry;
}

export interface ViolinCrop {
  row: number;
  col: number;
  header: Header;
  percentiles: Percentiles;
  drivers: Driver[];
  constructors: Constructors;
  confidence: 'high' | 'low';
  flagged: boolean;
  flag_reasons: string[];
  raw_response: string;
}

export interface DatasetMeta {
  key: string;
  date: string;
  count: number;
  errors: number;
}
```

- [ ] **Step 2: Create `src/config.ts`**

```typescript
// RGB hex colors for display
export const CONSTRUCTOR_COLORS: Record<string, string> = {
  MCL: '#FF8700',
  MER: '#00D2BE',
  RED: '#001B5E',
  FER: '#DC0000',
  WIL: '#0057FF',
  VRB: '#6AB4E4',
  AST: '#006F49',
  HAA: '#FFFFFF',
  AUD: '#7A0028',
  ALP: '#FF87BC',
  CAD: '#C0C0C0',
};

export const TEAMS = Object.keys(CONSTRUCTOR_COLORS);

// Lab reference colors for Delta-E matching (L, a, b)
// Derived from the hex values above via standard sRGB→Lab transform
export const CONSTRUCTOR_LAB: Record<string, [number, number, number]> = {
  MCL: [60.73,  28.28,  62.55],
  MER: [78.82, -32.07,  -4.34],
  RED: [ 5.27,   7.74, -22.87],
  FER: [37.21,  57.00,  45.71],
  WIL: [29.57,  32.33, -75.64],
  VRB: [70.30,  -8.15, -27.73],
  AST: [25.90, -26.39,  10.69],
  HAA: [100.0,   0.00,   0.00],
  AUD: [18.24,  26.95,  -2.35],
  ALP: [72.68,  30.66,  -9.47],
  CAD: [76.61,   0.00,   0.00],
};

// Grid layout for 2000×1124px reference screenshot
// Populated in Task 7 after calibration
export const GRID_COLS = 24;
export const GRID_ROWS = 3;
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add shared TypeScript types and constructor config"
```

---

## Task 3: Migrate existing JS modules to TypeScript

**Files:**
- Create: `src/areaChart.ts`
- Create: `src/dataStore.ts`
- Create: `src/review.ts`
- Create: `src/analysis.ts`

This task migrates the four modules that do not depend on pipeline stages. The goal is to get a clean TypeScript build before adding any new pipeline code.

- [ ] **Step 1: Create `src/areaChart.ts`**

```typescript
import type { Percentiles } from './types.js';

export function createAreaChart(
  percentiles: Percentiles,
  globalMin: number,
  globalMax: number,
  width: number,
  height: number,
): SVGSVGElement {
  const points: [number, number][] = [
    [percentiles.p05, 5],
    [percentiles.p25, 25],
    [percentiles.p50, 50],
    [percentiles.p75, 75],
    [percentiles.p95, 95],
  ];

  const range = globalMax - globalMin || 1;

  function toX(score: number): number {
    return ((score - globalMin) / range) * width;
  }
  function toY(rank: number): number {
    return height - (rank / 100) * height;
  }

  let d = '';
  for (let i = 0; i < points.length; i++) {
    const x = toX(points[i][0]).toFixed(1);
    const y = toY(points[i][1]).toFixed(1);
    if (i === 0) {
      d += `M ${x},${y}`;
    } else {
      d += ` H ${x} V ${y}`;
    }
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#62eeb7');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);

  return svg;
}
```

- [ ] **Step 2: Create `src/dataStore.ts`**

```typescript
import type { ViolinCrop, DatasetMeta } from './types.js';

export function getDatasets(): DatasetMeta[] {
  return JSON.parse(localStorage.getItem('datasetIndex') || '[]') as DatasetMeta[];
}

export function getDataset(key: string): { results: Array<{ row: number; col: number; parsed: Partial<ViolinCrop> }> } | null {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export function deleteDataset(key: string): void {
  localStorage.removeItem(key);
  const index = getDatasets().filter(d => d.key !== key);
  localStorage.setItem('datasetIndex', JSON.stringify(index));
}

export function getUnifiedTable(key: string): Array<Record<string, unknown>> {
  const dataset = getDataset(key);
  if (!dataset) return [];
  return dataset.results.map(r => ({
    row: r.row,
    col: r.col,
    ...r.parsed,
  }));
}

export function importJSON(array: unknown): { count: number; flagged: number } {
  if (!Array.isArray(array)) throw new Error('Expected an array');
  for (const item of array as ViolinCrop[]) {
    if (item.row == null || item.col == null || !item.header || !item.percentiles || !item.drivers || !item.constructors) {
      throw new Error(`Invalid violin object at row=${item.row} col=${item.col}`);
    }
  }
  localStorage.setItem('importedViolins', JSON.stringify(array));
  const flagged = (array as ViolinCrop[]).filter(v => v.flagged || v.confidence !== 'high').length;
  return { count: (array as ViolinCrop[]).length, flagged };
}

export function saveReviewedDataset(array: ViolinCrop[]): void {
  localStorage.setItem('reviewedViolins', JSON.stringify(array));
}

export function getReviewedDataset(): ViolinCrop[] | null {
  const raw = localStorage.getItem('reviewedViolins');
  return raw ? JSON.parse(raw) as ViolinCrop[] : null;
}

export function getImportedViolins(): ViolinCrop[] | null {
  const raw = localStorage.getItem('importedViolins');
  return raw ? JSON.parse(raw) as ViolinCrop[] : null;
}

export function initDataStore(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Extracted Datasets';
  section.appendChild(heading);

  const datasets = getDatasets();

  if (!datasets.length) {
    const msg = document.createElement('p');
    msg.className = 'status-msg';
    msg.textContent = 'No datasets yet. Extract data from the Extractor tab.';
    section.appendChild(msg);
    container.appendChild(section);
    return;
  }

  for (const ds of datasets) {
    const card = document.createElement('div');
    card.className = 'data-card';

    const title = document.createElement('strong');
    title.textContent = new Date(ds.date).toLocaleString();
    card.appendChild(title);

    const info = document.createElement('p');
    info.className = 'status-msg';
    info.textContent = `${ds.count} results, ${ds.errors} errors`;
    card.appendChild(info);

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'View Table';
    viewBtn.addEventListener('click', () => { showTable(section, ds.key); });
    card.appendChild(viewBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.textContent = 'Delete';
    delBtn.style.marginLeft = '0.5rem';
    delBtn.addEventListener('click', () => {
      deleteDataset(ds.key);
      container.innerHTML = '';
      initDataStore(container);
    });
    card.appendChild(delBtn);

    section.appendChild(card);
  }

  container.appendChild(section);
}

function showTable(section: HTMLElement, key: string): void {
  const existing = section.querySelector('.data-table-container');
  if (existing) existing.remove();

  const rows = getUnifiedTable(key);
  if (!rows.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-container';

  const table = document.createElement('table');
  const headers = Object.keys(rows[0]);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h.toUpperCase();
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const h of headers) {
      const td = document.createElement('td');
      const val = row[h];
      td.textContent = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrapper.appendChild(table);
  section.appendChild(wrapper);
}
```

- [ ] **Step 3: Create `src/review.ts`**

```typescript
import { createAreaChart } from './areaChart.js';
import { importJSON, saveReviewedDataset, getImportedViolins } from './dataStore.js';
import { CONSTRUCTOR_COLORS, TEAMS } from './config.js';
import type { ViolinCrop } from './types.js';

let violins: ViolinCrop[] = [];

document.addEventListener('click', () => {
  document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
});

function computeGlobalBounds(data: ViolinCrop[]): { globalMin: number; globalMax: number } {
  let min = Infinity, max = -Infinity;
  for (const v of data) {
    if (v.percentiles.p05 < min) min = v.percentiles.p05;
    if (v.percentiles.p95 > max) max = v.percentiles.p95;
  }
  return { globalMin: min, globalMax: max };
}

function makeConstructorBadge(violin: ViolinCrop, which: 'cn1' | 'cn2'): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'constructor-badge';

  const dot = document.createElement('span');
  dot.className = 'color-dot';
  const team = violin.constructors[which].team;
  dot.style.background = CONSTRUCTOR_COLORS[team] ?? '#888';

  const label = document.createElement('span');
  label.textContent = team;

  const dropdown = document.createElement('div');
  dropdown.className = 'constructor-dropdown';

  for (const t of TEAMS) {
    const opt = document.createElement('button');
    const optDot = document.createElement('span');
    optDot.className = 'color-dot';
    optDot.style.background = CONSTRUCTOR_COLORS[t] ?? '#888';
    opt.appendChild(optDot);
    opt.appendChild(document.createTextNode(t));
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      violin.constructors[which].team = t;
      dot.style.background = CONSTRUCTOR_COLORS[t] ?? '#888';
      label.textContent = t;
      dropdown.classList.remove('open');
      saveReviewedDataset(violins);
    });
    dropdown.appendChild(opt);
  }

  wrapper.appendChild(dot);
  wrapper.appendChild(label);
  wrapper.appendChild(dropdown);

  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) dropdown.classList.add('open');
  });

  return wrapper;
}

function makeCard(violin: ViolinCrop, globalMin: number, globalMax: number, overBudget: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'violin-card';
  if (violin.flagged || violin.confidence !== 'high') card.classList.add('flagged');
  if (overBudget) card.classList.add('over-budget');

  const ptsPerM = violin.header.budget_required > 0
    ? (violin.header.avg_xpts / violin.header.budget_required).toFixed(1)
    : '—';
  const statRow = document.createElement('div');
  statRow.className = 'card-stat-row';
  const uplift = violin.header.avg_budget_uplift != null
    ? `+${violin.header.avg_budget_uplift}M`
    : '';
  statRow.textContent = `${violin.header.budget_required}M  ${violin.header.avg_xpts}PTS  ${uplift}  ${ptsPerM}$/PT`;
  card.appendChild(statRow);

  const pctRow = document.createElement('div');
  pctRow.className = 'card-percentile-row';
  const p = violin.percentiles;
  pctRow.textContent = `P05:${p.p05}  P25:${p.p25}  P50:${p.p50}  P75:${p.p75}  P95:${p.p95}`;
  card.appendChild(pctRow);

  const driverRow = document.createElement('div');
  driverRow.className = 'card-drivers';
  for (const driver of violin.drivers) {
    const span = document.createElement('span');
    span.className = 'driver-name' + (driver.multiplier ? ' multiplier' : '');
    span.textContent = driver.multiplier ? `${driver.name}(${driver.multiplier})` : driver.name;
    span.title = 'Click to edit';
    span.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = driver.name;
      input.maxLength = 3;
      input.style.cssText = 'width:3ch;background:#0a0a0a;color:#e0e0e0;border:1px solid #62eeb7;font-family:monospace;font-size:10px;padding:0;text-align:center;';
      span.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const val = input.value.trim().toUpperCase().slice(0, 3) || driver.name;
        driver.name = val;
        span.textContent = driver.multiplier ? `${val}(${driver.multiplier})` : val;
        input.replaceWith(span);
        saveReviewedDataset(violins);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') input.replaceWith(span);
      });
    });
    driverRow.appendChild(span);
  }
  card.appendChild(driverRow);

  const cnRow = document.createElement('div');
  cnRow.className = 'card-constructors';
  cnRow.appendChild(makeConstructorBadge(violin, 'cn1'));
  cnRow.appendChild(makeConstructorBadge(violin, 'cn2'));
  card.appendChild(cnRow);

  const chartWrap = document.createElement('div');
  chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 100, 30));
  card.appendChild(chartWrap);

  return card;
}

function renderGrid(container: HTMLElement, data: ViolinCrop[], budget: number): void {
  container.innerHTML = '';
  const { globalMin, globalMax } = computeGlobalBounds(data);

  const sorted = [...data].sort((a, b) => a.row - b.row || a.col - b.col);
  const affordable = sorted.filter(v => v.header.budget_required <= budget);
  const overBudget = sorted.filter(v => v.header.budget_required > budget);

  const grid = document.createElement('div');
  grid.className = 'violin-grid';

  for (const v of affordable) grid.appendChild(makeCard(v, globalMin, globalMax, false));
  for (const v of overBudget) grid.appendChild(makeCard(v, globalMin, globalMax, true));

  container.appendChild(grid);
}

export function initReview(container: HTMLElement): void {
  violins = [];
  const section = document.createElement('section');

  const topbar = document.createElement('div');
  topbar.className = 'review-topbar';

  const budgetField = document.createElement('div');
  budgetField.className = 'topbar-field';
  const budgetLabel = document.createElement('span');
  budgetLabel.className = 'topbar-label';
  budgetLabel.textContent = 'BUDGET (M)';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.step = '0.1';
  budgetInput.min = '0';
  budgetInput.style.width = '80px';
  budgetInput.value = localStorage.getItem('userBudget') ?? '105';
  budgetField.appendChild(budgetLabel);
  budgetField.appendChild(budgetInput);
  topbar.appendChild(budgetField);

  const importField = document.createElement('div');
  importField.className = 'topbar-import';
  const importFieldLabel = document.createElement('span');
  importFieldLabel.className = 'topbar-label';
  importFieldLabel.textContent = 'LOAD JSON';
  const importRow = document.createElement('div');
  importRow.className = 'topbar-import-row';
  const pasteArea = document.createElement('textarea');
  pasteArea.placeholder = 'Paste or drop pipeline JSON…';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'LOAD JSON';
  importRow.appendChild(pasteArea);
  importRow.appendChild(importBtn);
  importField.appendChild(importFieldLabel);
  importField.appendChild(importRow);
  topbar.appendChild(importField);
  section.appendChild(topbar);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'review-summary';
  section.appendChild(summaryEl);

  const errorEl = document.createElement('div');
  section.appendChild(errorEl);

  const gridContainer = document.createElement('div');
  section.appendChild(gridContainer);

  pasteArea.addEventListener('dragover', (e) => e.preventDefault());
  pasteArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { pasteArea.value = reader.result as string; };
    reader.readAsText(file);
  });

  function getBudget(): number { return parseFloat(budgetInput.value) || Infinity; }

  function updateSummary(): void {
    if (!violins.length) { summaryEl.textContent = ''; return; }
    const budget = getBudget();
    const affordable = violins.filter(v => v.header.budget_required <= budget).length;
    const over = violins.length - affordable;
    summaryEl.textContent = `${violins.length} VIOLINS — ${affordable} AFFORDABLE — ${over} OVER BUDGET`;
  }

  function loadData(data: ViolinCrop[]): void {
    violins = data;
    errorEl.textContent = '';
    errorEl.className = '';
    updateSummary();
    renderGrid(gridContainer, violins, getBudget());
    saveReviewedDataset(violins);
  }

  budgetInput.addEventListener('input', () => {
    localStorage.setItem('userBudget', budgetInput.value);
    updateSummary();
    if (violins.length) renderGrid(gridContainer, violins, getBudget());
  });

  importBtn.addEventListener('click', () => {
    errorEl.textContent = '';
    errorEl.className = '';
    try {
      const parsed = JSON.parse(pasteArea.value.trim()) as unknown;
      importJSON(parsed);
      loadData(parsed as ViolinCrop[]);
    } catch (err) {
      errorEl.className = 'import-error';
      errorEl.textContent = `ERROR: ${(err as Error).message}`;
    }
  });

  const persisted = getImportedViolins();
  if (persisted) loadData(persisted);

  container.appendChild(section);
}
```

- [ ] **Step 4: Create `src/analysis.ts`**

```typescript
import { createAreaChart } from './areaChart.js';
import { getReviewedDataset } from './dataStore.js';
import { CONSTRUCTOR_COLORS } from './config.js';
import type { ViolinCrop, Percentiles } from './types.js';

// CONSTRUCTOR_COLORS imported to maintain the same dependency graph as the JS version
void CONSTRUCTOR_COLORS;

interface RankedEntry {
  violin: ViolinCrop;
  kelly: number;
  overBudget: boolean;
}

function estimateWinProb(percentiles: Percentiles, threshold: number): number {
  const pts: [number, number][] = [
    [percentiles.p05, 0.05],
    [percentiles.p25, 0.25],
    [percentiles.p50, 0.50],
    [percentiles.p75, 0.75],
    [percentiles.p95, 0.95],
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

function computeRankedList(violins: ViolinCrop[], budgetLimit: number, sortKey: string): RankedEntry[] {
  const p50s = violins.map(v => v.percentiles.p50).sort((a, b) => a - b);
  const threshold = p50s[Math.floor(p50s.length / 2)];

  const entries: RankedEntry[] = violins.map(v => ({
    violin: v,
    kelly: calcKelly(v, threshold),
    overBudget: v.header.budget_required > budgetLimit,
  }));

  type SortFn = (a: RankedEntry, b: RankedEntry) => number;
  const sortFns: Record<string, SortFn> = {
    kelly: (a, b) => b.kelly - a.kelly,
    avg_xpts: (a, b) => b.violin.header.avg_xpts - a.violin.header.avg_xpts,
    p50: (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
    budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required,
  };

  const fn = sortFns[sortKey] ?? sortFns['kelly'];
  const eligible = entries.filter(e => !e.overBudget).sort(fn);
  const overBudget = entries.filter(e => e.overBudget).sort(fn);
  return [...eligible, ...overBudget];
}

function makeRankedEntry(entry: RankedEntry, rank: number, globalMin: number, globalMax: number): HTMLElement {
  const { violin, kelly, overBudget } = entry;
  const el = document.createElement('div');
  el.className = 'ranked-entry' + (overBudget ? ' over-budget' : '');

  const rankEl = document.createElement('div');
  rankEl.className = 'rank-number';
  rankEl.textContent = `#${rank}`;
  el.appendChild(rankEl);

  const chartWrap = document.createElement('div');
  chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 120, 40));
  el.appendChild(chartWrap);

  const infoCol = document.createElement('div');
  const barWrap = document.createElement('div');
  barWrap.className = 'kelly-bar-wrap';
  const barFill = document.createElement('div');
  barFill.className = 'kelly-bar-fill';
  barFill.style.width = `${(kelly * 100).toFixed(1)}%`;
  barWrap.appendChild(barFill);
  infoCol.appendChild(barWrap);

  const scoreText = document.createElement('div');
  scoreText.className = 'score-text';
  scoreText.textContent = `P50:${violin.percentiles.p50}  RANGE:${violin.percentiles.p05}–${violin.percentiles.p95}`;
  infoCol.appendChild(scoreText);

  const drivers = violin.drivers.map(d => d.multiplier ? `${d.name}(${d.multiplier})` : d.name).join(' ');
  const pickText = document.createElement('div');
  pickText.className = 'score-text';
  pickText.textContent = `${drivers}  [${violin.constructors.cn1.team}][${violin.constructors.cn2.team}]`;
  infoCol.appendChild(pickText);
  el.appendChild(infoCol);

  const budgetEl = document.createElement('div');
  budgetEl.className = 'score-text';
  budgetEl.textContent = `${violin.header.budget_required}M`;
  el.appendChild(budgetEl);

  return el;
}

export function initAnalysis(container: HTMLElement): void {
  const section = document.createElement('section');

  const violins = getReviewedDataset();
  if (!violins || !violins.length) {
    const msg = document.createElement('p');
    msg.className = 'status-msg';
    msg.textContent = 'NO DATA. IMPORT PIPELINE JSON IN THE REVIEW TAB FIRST.';
    section.appendChild(msg);
    container.appendChild(section);
    return;
  }

  const controls = document.createElement('div');
  controls.className = 'analysis-controls';

  const budgetLabel = document.createElement('label');
  budgetLabel.textContent = 'BUDGET (M)';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.value = localStorage.getItem('userBudget') ?? '105';
  budgetInput.step = '0.1';
  budgetInput.min = '0';
  budgetInput.style.width = '80px';
  budgetLabel.appendChild(budgetInput);
  controls.appendChild(budgetLabel);

  const sortLabel = document.createElement('label');
  sortLabel.textContent = 'SORT BY';
  const sortSelect = document.createElement('select');
  [
    { value: 'kelly', text: 'KELLY SCORE' },
    { value: 'avg_xpts', text: 'AVG XPTS' },
    { value: 'p50', text: 'P50 SCORE' },
    { value: 'budget', text: 'BUDGET' },
  ].forEach(({ value, text }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    sortSelect.appendChild(opt);
  });
  sortLabel.appendChild(sortSelect);
  controls.appendChild(sortLabel);
  section.appendChild(controls);

  const listContainer = document.createElement('div');
  listContainer.className = 'ranked-list';
  section.appendChild(listContainer);

  function render(): void {
    listContainer.innerHTML = '';
    const budget = parseFloat(budgetInput.value) || Infinity;
    const ranked = computeRankedList(violins!, budget, sortSelect.value);
    const allScores = violins!.flatMap(v => [v.percentiles.p05, v.percentiles.p95]);
    const globalMin = Math.min(...allScores);
    const globalMax = Math.max(...allScores);
    ranked.forEach((entry, i) => {
      listContainer.appendChild(makeRankedEntry(entry, i + 1, globalMin, globalMax));
    });
  }

  budgetInput.addEventListener('input', () => {
    localStorage.setItem('userBudget', budgetInput.value);
    render();
  });
  sortSelect.addEventListener('change', render);
  render();

  container.appendChild(section);
}
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/areaChart.ts src/dataStore.ts src/review.ts src/analysis.ts
git commit -m "feat: migrate areaChart, dataStore, review, analysis to TypeScript"
```

---

## Task 4: Migrate app.ts and add settings/extract nav stubs

**Files:**
- Modify: `src/app.ts`
- Create: `src/settingsPanel.ts`

- [ ] **Step 1: Create `src/settingsPanel.ts`**

```typescript
const STORAGE_KEY = 'rhter_gemini_key';

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function initSettingsPanel(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Settings';
  section.appendChild(heading);

  const label = document.createElement('label');
  label.className = 'topbar-label';
  label.textContent = 'GEMINI API KEY';
  section.appendChild(label);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '0.5rem';
  row.style.marginTop = '0.5rem';

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'AIza…';
  input.style.flex = '1';
  input.style.fontFamily = 'monospace';
  const stored = getApiKey();
  if (stored) input.value = stored;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = 'SAVE';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn';
  clearBtn.textContent = 'CLEAR';

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(clearBtn);
  section.appendChild(row);

  const statusEl = document.createElement('div');
  statusEl.className = 'status-msg';
  statusEl.style.marginTop = '0.5rem';
  section.appendChild(statusEl);

  saveBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) { statusEl.textContent = 'ERROR: key is empty'; return; }
    setApiKey(val);
    statusEl.textContent = 'Key saved to localStorage.';
  });

  clearBtn.addEventListener('click', () => {
    clearApiKey();
    input.value = '';
    statusEl.textContent = 'Key cleared.';
  });

  const note = document.createElement('p');
  note.className = 'status-msg';
  note.style.marginTop = '1rem';
  note.textContent = 'Your key is stored in this browser only. It is never sent to any server run by this project.';
  section.appendChild(note);

  container.appendChild(section);
}
```

- [ ] **Step 2: Replace `src/app.ts` with full migrated version**

```typescript
import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';
import { initSettingsPanel } from './settingsPanel.js';

const VIEWS = ['review', 'analysis', 'data', 'settings'] as const;
type View = typeof VIEWS[number];

const LABELS: Record<View, string> = {
  review: 'REVIEW',
  analysis: 'ANALYSIS',
  data: 'DATA',
  settings: 'SETTINGS',
};

const storedView = localStorage.getItem('currentView') as View | null;
const state = {
  currentView: (storedView && (VIEWS as readonly string[]).includes(storedView) ? storedView : 'review') as View,
};

function saveState(): void {
  localStorage.setItem('currentView', state.currentView);
}

function navigateTo(view: View): void {
  state.currentView = view;
  saveState();
  render();
}

function renderNav(): void {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (const view of VIEWS) {
    const btn = document.createElement('button');
    btn.textContent = LABELS[view];
    if (view === state.currentView) btn.classList.add('active');
    btn.addEventListener('click', () => navigateTo(view));
    nav.appendChild(btn);
  }
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  renderNav();

  switch (state.currentView) {
    case 'review':    initReview(app);         break;
    case 'analysis':  initAnalysis(app);        break;
    case 'data':      initDataStore(app);       break;
    case 'settings':  initSettingsPanel(app);   break;
  }
}

document.addEventListener('navigate', (e) => navigateTo((e as CustomEvent<View>).detail));

render();

export { state };
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: `docs/app.js` written, zero TypeScript errors. Open `docs/index.html` in browser — Review, Analysis, Data, Settings tabs should all render.

- [ ] **Step 4: Update `docs/index.html` CSP to allow Gemini API calls**

Find the existing CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline';">
```

Replace with:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com; worker-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline';">
```

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/settingsPanel.ts docs/index.html
git commit -m "feat: migrate app.ts to TypeScript, add Settings tab and Gemini API key panel"
```

---

## Task 5: Preprocessor (Stage 1 — Canvas invert/upscale/contrast)

**Files:**
- Create: `src/preprocessor.ts`

- [ ] **Step 1: Create `src/preprocessor.ts`**

```typescript
/**
 * Preprocesses a raw violin crop Blob:
 *   1. Invert pixels (dark background → light)
 *   2. Upscale 3× with LANCZOS-equivalent (createImageBitmap + drawImage)
 *   3. Boost contrast via CSS filter
 *
 * Returns a canvas element ready to be toBlob'd or passed to colorExtractor.
 */
export async function preprocessCrop(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;

  // Step 1: draw to an offscreen canvas and invert pixels
  const invertCanvas = document.createElement('canvas');
  invertCanvas.width = w;
  invertCanvas.height = h;
  const invertCtx = invertCanvas.getContext('2d');
  if (!invertCtx) throw new Error('Could not get 2D context for invert canvas');

  invertCtx.drawImage(bitmap, 0, 0);
  const imageData = invertCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i];     // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // alpha unchanged
  }
  invertCtx.putImageData(imageData, 0, 0);

  // Step 2: upscale 3× using drawImage (browser uses bilinear interpolation)
  const scale = 3;
  const upCanvas = document.createElement('canvas');
  upCanvas.width  = w * scale;
  upCanvas.height = h * scale;
  const upCtx = upCanvas.getContext('2d');
  if (!upCtx) throw new Error('Could not get 2D context for upscale canvas');
  upCtx.imageSmoothingEnabled = true;
  upCtx.imageSmoothingQuality = 'high';
  upCtx.drawImage(invertCanvas, 0, 0, w * scale, h * scale);

  // Step 3: contrast boost — draw through a filter onto a final canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width  = w * scale;
  finalCanvas.height = h * scale;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) throw new Error('Could not get 2D context for final canvas');
  finalCtx.filter = 'contrast(1.4)';
  finalCtx.drawImage(upCanvas, 0, 0);

  bitmap.close();
  return finalCanvas;
}

/**
 * Converts a canvas to a PNG Blob.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/preprocessor.ts
git commit -m "feat: add preprocessor — Canvas invert, 3x upscale, contrast boost"
```

---

## Task 6: Color extractor (Stage 3 — Canvas Delta-E constructor match)

**Files:**
- Create: `src/colorExtractor.ts`

- [ ] **Step 1: Create `src/colorExtractor.ts`**

```typescript
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

    // Keep colored pixels (saturation > 0.5) or bright white (all channels > 200)
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

  return {
    cn1: nearestTeam(leftSums,  leftCount),
    cn2: nearestTeam(rightSums, rightCount),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/colorExtractor.ts
git commit -m "feat: add colorExtractor — pixel sampling, RGB→Lab, Delta-E constructor match"
```

---

## Task 7: Validator (Stage 4)

**Files:**
- Create: `src/validator.ts`

- [ ] **Step 1: Create `src/validator.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/validator.ts
git commit -m "feat: add validator — range, monotonicity, driver, constructor checks"
```

---

## Task 8: Gemini Flash extractor (Stage 2)

**Files:**
- Create: `src/extractor.ts`

- [ ] **Step 1: Create `src/extractor.ts`**

```typescript
import type { Header, Percentiles, Driver } from './types.js';

export interface RawExtraction {
  header: Header;
  percentiles: Percentiles;
  drivers: Driver[];
  raw_response: string;
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const PROMPT_PASS1 = `You are extracting structured data from an F1 fantasy violin plot image.
The image shows one violin plot with:
- A header row at the top containing: budget required (M), avg_xpts, avg_xpts_dollar_impact, avg_budget_uplift
- A y-axis with percentile scores
- Five driver abbreviations at the bottom (3 uppercase letters each)
- Exactly one driver has a multiplier (2X or 3X)

Extract and return ONLY a JSON object with these exact fields (no markdown, no prose):
{
  "p05": number,
  "p25": number,
  "p50": number,
  "p75": number,
  "p95": number,
  "avg_xpts": number,
  "avg_xpts_dollar_impact": number,
  "budget_required": number,
  "avg_budget_uplift": number or null,
  "driver_1": "XXX",
  "driver_2": "XXX",
  "driver_3": "XXX",
  "driver_4": "XXX",
  "driver_5": "XXX",
  "driver_1_2x": boolean,
  "driver_2_2x": boolean,
  "driver_3_2x": boolean,
  "driver_4_2x": boolean,
  "driver_5_2x": boolean
}
Read labels top-to-bottom, left-to-right. Do not guess — only report what you can clearly see.`;

const PROMPT_PASS2 = `You are verifying an extraction from an F1 fantasy violin plot image.
Re-read the image carefully. Return ONLY a JSON object with the same fields as before:
{
  "p05": number, "p25": number, "p50": number, "p75": number, "p95": number,
  "avg_xpts": number, "avg_xpts_dollar_impact": number, "budget_required": number,
  "avg_budget_uplift": number or null,
  "driver_1": "XXX", "driver_2": "XXX", "driver_3": "XXX", "driver_4": "XXX", "driver_5": "XXX",
  "driver_1_2x": boolean, "driver_2_2x": boolean, "driver_3_2x": boolean,
  "driver_4_2x": boolean, "driver_5_2x": boolean
}`;

function parseGeminiResponse(raw: string): RawExtraction {
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  const obj = JSON.parse(cleaned);

  const drivers: Driver[] = [];
  for (let i = 1; i <= 5; i++) {
    drivers.push({
      name: String(obj[`driver_${i}`] ?? '???').toUpperCase().slice(0, 3),
      multiplier: obj[`driver_${i}_2x`] ? '2X' : null,
    });
  }

  return {
    header: {
      budget_required: Number(obj.budget_required),
      avg_xpts: Number(obj.avg_xpts),
      avg_xpts_dollar_impact: Number(obj.avg_xpts_dollar_impact),
      avg_budget_uplift: obj.avg_budget_uplift != null ? Number(obj.avg_budget_uplift) : null,
    },
    percentiles: {
      p05: Number(obj.p05),
      p25: Number(obj.p25),
      p50: Number(obj.p50),
      p75: Number(obj.p75),
      p95: Number(obj.p95),
    },
    drivers,
    raw_response: raw,
  };
}

async function callGemini(blob: Blob, apiKey: string, prompt: string): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/png', data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 },
  };

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const json = await response.json() as GeminiResponse;
  return json.candidates[0].content.parts[0].text;
}

function extractionsAgree(a: RawExtraction, b: RawExtraction): boolean {
  const pa = a.percentiles, pb = b.percentiles;
  if (pa.p50 !== pb.p50) return false;
  if (pa.p05 !== pb.p05 || pa.p95 !== pb.p95) return false;
  const da = a.drivers.map(d => d.name).join('');
  const db = b.drivers.map(d => d.name).join('');
  return da === db;
}

export interface ExtractionResult {
  extraction: RawExtraction;
  needsReview: boolean;
}

/**
 * Token-bucket rate limiter: max `limit` requests per 60 seconds.
 */
class RateLimiter {
  private tokens: number;
  private readonly limit: number;
  private lastRefill: number;

  constructor(limit: number) {
    this.limit = limit;
    this.tokens = limit;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed >= 60_000) {
        this.tokens = this.limit;
        this.lastRefill = now;
      }
      if (this.tokens > 0) {
        this.tokens--;
        return;
      }
      const wait = 60_000 - (Date.now() - this.lastRefill) + 100;
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

export const rateLimiter = new RateLimiter(15);

/**
 * Extracts structured data from a single preprocessed crop PNG Blob.
 * Runs pass 1; if it disagrees with pass 2, marks the result needsReview.
 */
export async function extractCrop(blob: Blob, apiKey: string): Promise<ExtractionResult> {
  await rateLimiter.acquire();
  const raw1 = await callGemini(blob, apiKey, PROMPT_PASS1);
  const ext1 = parseGeminiResponse(raw1);

  await rateLimiter.acquire();
  const raw2 = await callGemini(blob, apiKey, PROMPT_PASS2);
  const ext2 = parseGeminiResponse(raw2);

  return {
    extraction: ext1,
    needsReview: !extractionsAgree(ext1, ext2),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/extractor.ts
git commit -m "feat: add Gemini Flash extractor with rate limiter and two-pass agreement check"
```

---

## Task 9: Cropper (Stage 0 — image upload + Canvas grid crop)

**Files:**
- Create: `src/cropper.ts`

The grid coordinates below are **placeholder values** based on the 2000×1124 reference layout documented in `CLAUDE.local.md`. They will need visual calibration against a real screenshot before the pipeline is usable end-to-end (see Task 11).

- [ ] **Step 1: Create `src/cropper.ts`**

```typescript
import { GRID_COLS, GRID_ROWS } from './config.js';

export interface CropBlobs {
  raw: Blob[][];   // [row][col]
}

// Placeholder grid boundaries for 2000×1124 reference screenshot.
// Calibrate these against a real RHTER screenshot in Task 11.
const ROW_Y: [number, number][] = [
  [50,  373],   // row 0: y_start, y_end
  [373, 707],   // row 1
  [707, 1042],  // row 2
];

const COL_X: [number, number][] = (() => {
  // 24 equally-spaced columns across x=10..1990
  const cols: [number, number][] = [];
  const xStart = 10, xEnd = 1990;
  const colW = (xEnd - xStart) / GRID_COLS;
  for (let c = 0; c < GRID_COLS; c++) {
    cols.push([Math.round(xStart + c * colW), Math.round(xStart + (c + 1) * colW)]);
  }
  return cols;
})();

async function cropCell(
  source: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

/**
 * Loads an image File into an HTMLCanvasElement.
 */
async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width  = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/**
 * Crops a RHTER screenshot into a GRID_ROWS × GRID_COLS grid of Blob objects.
 */
export async function cropScreenshot(file: File): Promise<CropBlobs> {
  const source = await fileToCanvas(file);

  const blobs: Blob[][] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const rowBlobs: Blob[] = [];
    const [yStart, yEnd] = ROW_Y[row];
    for (let col = 0; col < GRID_COLS; col++) {
      const [xStart, xEnd] = COL_X[col];
      const blob = await cropCell(source, xStart, yStart, xEnd - xStart, yEnd - yStart);
      rowBlobs.push(blob);
    }
    blobs.push(rowBlobs);
  }

  return { raw: blobs };
}

/**
 * Draws a grid overlay on the preview canvas for visual confirmation.
 * Returns the canvas element (append it to the DOM where needed).
 */
export function drawGridOverlay(
  file: File,
  onReady: (canvas: HTMLCanvasElement) => void,
): void {
  createImageBitmap(file).then(bitmap => {
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.maxWidth = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Draw row lines
    ctx.strokeStyle = 'rgba(98,238,183,0.8)';
    ctx.lineWidth = 1;
    for (const [, yEnd] of ROW_Y) {
      ctx.beginPath();
      ctx.moveTo(0, yEnd);
      ctx.lineTo(canvas.width, yEnd);
      ctx.stroke();
    }
    // Draw column lines
    for (const [, xEnd] of COL_X) {
      ctx.beginPath();
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, canvas.height);
      ctx.stroke();
    }

    onReady(canvas);
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/cropper.ts
git commit -m "feat: add cropper — Canvas screenshot slicing into 72 crop Blobs"
```

---

## Task 10: Pipeline orchestrator (Stage 0–4 wiring + progress bar)

**Files:**
- Create: `src/pipelineOrchestrator.ts`

- [ ] **Step 1: Create `src/pipelineOrchestrator.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pipelineOrchestrator.ts
git commit -m "feat: add pipelineOrchestrator — wires stages 0-4, progress bar, incremental save"
```

---

## Task 11: Extract UI tab (wires orchestrator to DOM)

**Files:**
- Create: `src/extractTab.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Create `src/extractTab.ts`**

```typescript
import { runPipeline, getIncrementalResults } from './pipelineOrchestrator.js';
import type { PipelineProgress } from './pipelineOrchestrator.js';

export function initExtractTab(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Extract';
  section.appendChild(heading);

  // File input
  const fileRow = document.createElement('div');
  fileRow.style.display = 'flex';
  fileRow.style.gap = '0.5rem';
  fileRow.style.alignItems = 'center';
  fileRow.style.marginBottom = '1rem';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg';

  const runBtn = document.createElement('button');
  runBtn.className = 'btn';
  runBtn.textContent = 'RUN PIPELINE';
  runBtn.disabled = true;

  fileRow.appendChild(fileInput);
  fileRow.appendChild(runBtn);
  section.appendChild(fileRow);

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.style.cssText = 'width:100%;background:#1a1a1a;height:16px;margin-bottom:0.5rem;display:none;';
  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'height:100%;background:#62eeb7;width:0%;transition:width 0.3s;';
  progressWrap.appendChild(progressBar);
  section.appendChild(progressWrap);

  const progressLabel = document.createElement('div');
  progressLabel.className = 'status-msg';
  section.appendChild(progressLabel);

  const errorEl = document.createElement('div');
  section.appendChild(errorEl);

  // Crash-recovery notice
  const partial = getIncrementalResults();
  if (partial && partial.length > 0) {
    const notice = document.createElement('p');
    notice.className = 'status-msg';
    notice.textContent = `Partial run found: ${partial.length} crops recovered. Upload the same screenshot and run again, or import the partial data in the Review tab.`;
    section.appendChild(notice);
  }

  fileInput.addEventListener('change', () => {
    runBtn.disabled = !fileInput.files?.length;
  });

  runBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    runBtn.disabled = true;
    errorEl.textContent = '';
    errorEl.className = '';
    progressWrap.style.display = 'block';

    const onProgress = (p: PipelineProgress) => {
      const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
      progressBar.style.width = `${pct}%`;
      progressLabel.textContent = p.currentLabel;
    };

    try {
      await runPipeline(file, onProgress);
      progressLabel.textContent = 'Done! Go to the Review tab to inspect results.';
      progressBar.style.width = '100%';
    } catch (err) {
      errorEl.className = 'import-error';
      errorEl.textContent = `ERROR: ${(err as Error).message}`;
    } finally {
      runBtn.disabled = false;
    }
  });

  container.appendChild(section);
}
```

- [ ] **Step 2: Add `extract` view to `src/app.ts`**

Add the import at the top of `src/app.ts`:
```typescript
import { initExtractTab } from './extractTab.js';
```

Update the `VIEWS` constant:
```typescript
const VIEWS = ['review', 'analysis', 'data', 'extract', 'settings'] as const;
```

Update `LABELS`:
```typescript
const LABELS: Record<View, string> = {
  review: 'REVIEW',
  analysis: 'ANALYSIS',
  data: 'DATA',
  extract: 'EXTRACT',
  settings: 'SETTINGS',
};
```

Add the case in `render()`:
```typescript
case 'extract':   initExtractTab(app);       break;
```

- [ ] **Step 3: Build and check**

```bash
npm run build
```

Expected: zero TypeScript errors. Open `docs/index.html` — five tabs visible including EXTRACT.

- [ ] **Step 4: Commit**

```bash
git add src/extractTab.ts src/app.ts
git commit -m "feat: add Extract tab wiring pipeline orchestrator to DOM with progress bar"
```

---

## Task 12: Grid calibration

**Files:**
- Modify: `src/cropper.ts`

This task requires a real RHTER screenshot to calibrate the grid coordinates.

- [ ] **Step 1: Upload a real screenshot using the Extract tab's file input**

Open `docs/index.html` in the browser. Navigate to Extract. Upload the screenshot (expected: 2000×1124px).

- [ ] **Step 2: Check the grid overlay**

In `src/cropper.ts`, the `drawGridOverlay()` function is exported. Add a temporary call to it in `src/extractTab.ts` to render the overlay preview:

After `fileInput.addEventListener('change', ...)`, add:
```typescript
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  // Remove any previous preview
  const prev = section.querySelector('.grid-preview');
  if (prev) prev.remove();
  drawGridOverlay(file, (canvas) => {
    canvas.className = 'grid-preview';
    section.insertBefore(canvas, progressWrap);
  });
});
```

Add the import to `src/extractTab.ts`:
```typescript
import { drawGridOverlay } from './cropper.js';
```

Rebuild: `npm run build`

- [ ] **Step 3: Visually confirm or adjust ROW_Y and COL_X in `src/cropper.ts`**

Open `docs/index.html`, upload the screenshot, observe the grid lines. If lines don't align with violin plot boundaries, update `ROW_Y` and `COL_X` in `src/cropper.ts` to match actual pixel coordinates. Re-run `npm run build` after each adjustment.

- [ ] **Step 4: Commit calibrated coordinates**

```bash
git add src/cropper.ts src/extractTab.ts
git commit -m "feat: calibrate grid coordinates against real RHTER screenshot"
```

---

## Task 13: End-to-end verification

This task verifies the full pipeline against the spec's acceptance criteria before merging.

- [ ] **Step 1: Build with zero errors**

```bash
npm run build
```

Expected: exits with code 0, zero TypeScript errors.

- [ ] **Step 2: Enter API key**

Open `docs/index.html` in browser. Navigate to Settings. Enter a valid Gemini API key. Click SAVE.

- [ ] **Step 3: Upload screenshot and run pipeline**

Navigate to Extract. Upload the 2000×1124 RHTER screenshot. Click RUN PIPELINE.
Expected: progress bar advances, label shows "Extracting crop N of 72…", no console errors.

- [ ] **Step 4: Review output**

After pipeline completes, navigate to Review.
Expected: 72 violin cards visible, approximately 10% flagged with confidence:low badge.

- [ ] **Step 5: Correct flagged crops**

Manually edit 2–3 flagged driver names or constructor badges in the Review tab.
Refresh the page.
Expected: corrections persist.

- [ ] **Step 6: Check Analysis tab**

Navigate to Analysis. Expected: Kelly scores render, ranked list shows entries.

- [ ] **Step 7: Export and re-import dataset**

In the Data tab, export the dataset as JSON.
In a new browser tab, open `docs/index.html` and navigate to Review. Paste the exported JSON and click LOAD JSON.
Expected: `importJSON()` accepts it without errors, all 72 violins appear.

- [ ] **Step 8: Commit**

```bash
git add -p  # stage any small fixes from verification
git commit -m "fix: end-to-end verification fixes"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| Upload screenshot → get structured JSON → review/analyse in browser | Tasks 9, 10, 11 |
| No server, no Python, no local tooling | Architecture: all tasks in `src/` |
| TypeScript throughout, strict mode | Task 1 (tsconfig), Tasks 3–11 |
| esbuild watch + build scripts | Task 1 |
| GitHub Pages compatible (static files) | All tasks — no server deps |
| API key in localStorage, never sent to project server | Task 4 (settingsPanel), Task 8 (extractor) |
| CSP allows generativelanguage.googleapis.com | Task 4 |
| Stage 0: Canvas crop → 72 Blobs | Task 9 |
| Stage 1: invert, 3× upscale, contrast | Task 5 |
| Stage 2: Gemini Flash, rate-limited, two-pass | Task 8 |
| Stage 3: Canvas pixel sample, Lab Delta-E | Task 6 |
| Stage 4: range, monotonicity, driver, constructor validation | Task 7 |
| Progress bar "Extracting crop N of 72" | Task 10, 11 |
| Incremental localStorage save (crash recovery) | Task 10 |
| Failed crops in Review with confidence:low | Task 10 |
| importJSON() continues to accept Python-generated JSON | Task 3 (dataStore.ts unchanged logic) |
| Grid calibration / visual confirmation | Task 12 |
| End-to-end verification checklist | Task 13 |
