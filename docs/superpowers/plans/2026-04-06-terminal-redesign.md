# Terminal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead Cropper tab, apply a Bloomberg terminal aesthetic globally, and redesign the Review tab to use a budget-filtered 3-column card grid with no approval ceremony.

**Architecture:** All changes are confined to the static web app files under `docs/`. The Python pipeline and data formats are untouched. The budget value is shared between Review and Analysis tabs via `localStorage` key `userBudget`. There are no new files — only modifications and one deletion.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, SVG (inline via JS), localStorage

---

## File Map

| File | Change |
|---|---|
| `docs/cropper.js` | **Deleted** |
| `docs/app.js` | Remove cropper import + switch case, update `VIEWS`, set default view to `'review'` |
| `docs/style.css` | Full overhaul — monospace, `#0a0a0a` bg, `#62eeb7` accent, zero border-radius |
| `docs/review.js` | New top bar (budget + inline JSON import), remove bulk actions, new card layout, budget filter sort |
| `docs/analysis.js` | Read/write `userBudget` from localStorage, aesthetic update |
| `docs/areaChart.js` | Replace filled area with stepped polyline, teal stroke, no fill |

---

## Task 1: Delete cropper.js and update app.js

**Files:**
- Delete: `docs/cropper.js`
- Modify: `docs/app.js`

- [ ] **Step 1: Delete `docs/cropper.js`**

```bash
rm docs/cropper.js
```

- [ ] **Step 2: Update `docs/app.js`**

Replace the entire file content with:

```js
import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';

const VIEWS = ['review', 'analysis', 'data'];

const state = {
    currentView: localStorage.getItem('currentView') || 'review',
};

// Guard against a stale 'cropper' value in localStorage
if (!VIEWS.includes(state.currentView)) state.currentView = 'review';

function saveState() {
    localStorage.setItem('currentView', state.currentView);
}

function navigateTo(view) {
    state.currentView = view;
    saveState();
    render();
}

function renderNav() {
    const nav = document.getElementById('main-nav');
    nav.innerHTML = '';
    const labels = { review: 'REVIEW', analysis: 'ANALYSIS', data: 'DATA' };
    for (const view of VIEWS) {
        const btn = document.createElement('button');
        btn.textContent = labels[view];
        if (view === state.currentView) btn.classList.add('active');
        btn.addEventListener('click', () => navigateTo(view));
        nav.appendChild(btn);
    }
}

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    renderNav();

    switch (state.currentView) {
        case 'review':
            initReview(app);
            break;
        case 'analysis':
            initAnalysis(app);
            break;
        case 'data':
            initDataStore(app);
            break;
    }
}

document.addEventListener('navigate', (e) => navigateTo(e.detail));

render();

export { state };
```

- [ ] **Step 3: Verify the app loads without errors**

Open `docs/index.html` in a local file server (e.g. `npx serve docs`). The nav must show `REVIEW | ANALYSIS | DATA` with no Cropper tab. Console must be error-free.

- [ ] **Step 4: Commit**

```bash
git add docs/app.js
git rm docs/cropper.js
git commit -m "feat: remove cropper tab and dead code"
```

---

## Task 2: Global aesthetic — `style.css`

**Files:**
- Modify: `docs/style.css`

This task replaces the entire stylesheet. The design tokens are:

| Token | Value |
|---|---|
| Font | `'Courier New', Courier, monospace` |
| Background | `#0a0a0a` |
| Surface | `#111111` |
| Border | `#2a2a2a` |
| Primary text | `#e0e0e0` |
| Muted | `#666666` |
| Accent | `#62eeb7` |
| Border radius | `0` everywhere |

- [ ] **Step 1: Replace `docs/style.css` in full**

```css
*, *::before, *::after {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: 'Courier New', Courier, monospace;
    background: #0a0a0a;
    color: #e0e0e0;
    min-height: 100vh;
}

header {
    background: #111111;
    padding: 0.75rem 2rem;
    border-bottom: 1px solid #2a2a2a;
}

header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #62eeb7;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

nav {
    display: flex;
    gap: 0;
}

nav button {
    background: transparent;
    border: none;
    border-right: 1px solid #2a2a2a;
    color: #666666;
    padding: 0.4rem 1.2rem;
    cursor: pointer;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

nav button.active {
    color: #62eeb7;
    border-bottom: 2px solid #62eeb7;
}

nav button:hover {
    color: #e0e0e0;
}

main {
    padding: 1.5rem 2rem;
    max-width: 1400px;
    margin: 0 auto;
}

/* ── Shared inputs / buttons ── */
.btn {
    background: #111111;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    padding: 0.4rem 1rem;
    cursor: pointer;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.btn:hover {
    border-color: #62eeb7;
    color: #62eeb7;
}

.btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

input[type="number"],
input[type="text"],
textarea,
select {
    background: #111111;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    padding: 0.3rem 0.5rem;
}

input[type="number"]:focus,
input[type="text"]:focus,
textarea:focus,
select:focus {
    outline: none;
    border-color: #62eeb7;
}

.status-msg {
    font-size: 10px;
    color: #666666;
    letter-spacing: 0.05em;
    margin: 0.4rem 0;
}

.error-msg {
    color: #62eeb7;
    font-size: 10px;
    margin-top: 0.2rem;
}

/* ── Review tab ── */

/* Top bar: budget + JSON import on one row */
.review-topbar {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #2a2a2a;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
}

.topbar-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.topbar-label {
    font-size: 10px;
    color: #666666;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.topbar-import {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 200px;
}

.topbar-import-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
}

.topbar-import-row textarea {
    flex: 1;
    height: 38px;
    resize: none;
}

.review-summary {
    font-size: 10px;
    color: #666666;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.4rem 0;
}

.import-error {
    font-size: 10px;
    color: #62eeb7;
    margin: 0.3rem 0;
}

/* Card grid: 3 columns */
.violin-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
}

.violin-card {
    background: #111111;
    border: 1px solid #2a2a2a;
    padding: 6px;
    font-size: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.violin-card.flagged {
    border-color: #62eeb7;
}

.violin-card.over-budget {
    opacity: 0.25;
}

.card-stat-row {
    color: #e0e0e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.04em;
}

.card-percentile-row {
    color: #666666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.02em;
}

.card-drivers {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
}

.driver-name {
    cursor: pointer;
    padding: 0 2px;
}

.driver-name:hover {
    color: #62eeb7;
}

.driver-name.multiplier {
    color: #62eeb7;
}

.card-constructors {
    display: flex;
    gap: 6px;
}

.constructor-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    padding: 1px 4px;
    font-size: 10px;
    cursor: pointer;
    position: relative;
}

.constructor-badge .color-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.constructor-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    background: #111111;
    border: 1px solid #2a2a2a;
    padding: 2px 0;
    min-width: 72px;
    display: none;
}

.constructor-dropdown.open {
    display: block;
}

.constructor-dropdown button {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    background: none;
    border: none;
    color: #e0e0e0;
    padding: 2px 6px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    cursor: pointer;
    text-align: left;
}

.constructor-dropdown button:hover {
    color: #62eeb7;
}

/* ── Analysis tab ── */
.analysis-controls {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #2a2a2a;
}

.analysis-controls label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: #666666;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.analysis-controls input,
.analysis-controls select {
    color: #e0e0e0;
    background: #111111;
    border: 1px solid #2a2a2a;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    padding: 0.3rem 0.5rem;
}

.ranked-list {
    display: flex;
    flex-direction: column;
}

.ranked-entry {
    background: #111111;
    border-bottom: 1px solid #2a2a2a;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: 2.5rem 120px 1fr auto;
    gap: 12px;
    align-items: center;
}

.ranked-entry.over-budget {
    opacity: 0.25;
}

.rank-number {
    font-size: 10px;
    color: #62eeb7;
    letter-spacing: 0.05em;
}

.kelly-bar-wrap {
    height: 4px;
    background: #2a2a2a;
    overflow: hidden;
}

.kelly-bar-fill {
    height: 100%;
    background: #62eeb7;
}

.ranked-entry .score-text {
    font-size: 10px;
    color: #666666;
    letter-spacing: 0.03em;
}

/* ── Data tab ── */
.data-card {
    background: #111111;
    border: 1px solid #2a2a2a;
    padding: 1rem;
    margin-bottom: 4px;
}

.data-table-container {
    margin-top: 1rem;
    overflow-x: auto;
}

.data-table-container table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
}

.data-table-container th {
    color: #666666;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid #2a2a2a;
    padding: 0.3rem 0.5rem;
    text-align: left;
}

.data-table-container td {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid #2a2a2a;
    color: #e0e0e0;
}
```

- [ ] **Step 2: Verify styling in browser**

Open `docs/index.html` via local server. Check:
- Body background is near-black, font is monospace
- Nav buttons are uppercase, muted, teal underline on active
- No rounded corners visible anywhere

- [ ] **Step 3: Commit**

```bash
git add docs/style.css
git commit -m "feat: apply Bloomberg terminal aesthetic to style.css"
```

---

## Task 3: Restyle `areaChart.js` — stepped polyline, no fill

**Files:**
- Modify: `docs/areaChart.js`

The existing chart draws a filled area path. The new design is a stepped polyline: teal stroke, no fill.

- [ ] **Step 1: Replace `docs/areaChart.js` in full**

```js
/**
 * createAreaChart — pure function, no state, no side effects.
 * Returns an SVG element showing a stepped percentile polyline.
 *
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} globalMin  lowest score across all violins
 * @param {number} globalMax  highest score across all violins
 * @param {number} width      SVG width in px
 * @param {number} height     SVG height in px
 * @returns {SVGSVGElement}
 */
function createAreaChart(percentiles, globalMin, globalMax, width, height) {
    const points = [
        [percentiles.p05, 5],
        [percentiles.p25, 25],
        [percentiles.p50, 50],
        [percentiles.p75, 75],
        [percentiles.p95, 95],
    ];

    const range = globalMax - globalMin || 1;

    function toX(score) {
        return ((score - globalMin) / range) * width;
    }
    function toY(rank) {
        return height - (rank / 100) * height;
    }

    // Stepped polyline: horizontal then vertical segments
    let d = '';
    for (let i = 0; i < points.length; i++) {
        const x = toX(points[i][0]).toFixed(1);
        const y = toY(points[i][1]).toFixed(1);
        if (i === 0) {
            d += `M ${x},${y}`;
        } else {
            // Step: go horizontal to new x at previous y, then vertical to new y
            const prevY = toY(points[i - 1][1]).toFixed(1);
            d += ` H ${x} V ${y}`;
        }
    }

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#62eeb7');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);

    return svg;
}

export { createAreaChart };
```

- [ ] **Step 2: Verify chart renders**

Load the Review tab with existing JSON data. Each card's sparkline must be a teal stepped line with no fill.

- [ ] **Step 3: Commit**

```bash
git add docs/areaChart.js
git commit -m "feat: restyle sparkline as teal stepped polyline"
```

---

## Task 4: Redesign `review.js` — budget filter, new top bar, new card layout

**Files:**
- Modify: `docs/review.js`

Key behaviour changes:
- Budget value read/written from `localStorage` key `userBudget` (shared with Analysis tab)
- No bulk action bar
- No `_accepted` flag or `updateProceedBtn`
- Card grid is flat (no tier labels), 3 columns, affordable first (full opacity), over-budget at bottom (0.25 opacity)
- Card content shows: stat row, percentile row, drivers, constructors, sparkline
- `renderGrid` accepts a budget and partitions cards accordingly

- [ ] **Step 1: Replace `docs/review.js` in full**

```js
import { createAreaChart } from './areaChart.js';
import { importJSON, saveReviewedDataset, getImportedViolins } from './dataStore.js';

const TEAM_COLORS = {
    MCL: '#FF8700', MER: '#00D2BE', RED: '#001B5E', FER: '#DC0000',
    WIL: '#0057FF', VRB: '#6AB4E4', AST: '#006F49', HAA: '#FFFFFF',
    AUD: '#7A0028', ALP: '#FF87BC', CAD: '#C0C0C0',
};
const TEAMS = Object.keys(TEAM_COLORS);

let violins = [];

function computeGlobalBounds(data) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        if (v.percentiles.p05 < min) min = v.percentiles.p05;
        if (v.percentiles.p95 > max) max = v.percentiles.p95;
    }
    return { globalMin: min, globalMax: max };
}

function makeConstructorBadge(violin, which) {
    const wrapper = document.createElement('div');
    wrapper.className = 'constructor-badge';

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    const team = violin.constructors[which].team;
    dot.style.background = TEAM_COLORS[team] || '#888';

    const label = document.createElement('span');
    label.textContent = team;

    const dropdown = document.createElement('div');
    dropdown.className = 'constructor-dropdown';

    for (const t of TEAMS) {
        const opt = document.createElement('button');
        const optDot = document.createElement('span');
        optDot.className = 'color-dot';
        optDot.style.background = TEAM_COLORS[t];
        opt.appendChild(optDot);
        opt.appendChild(document.createTextNode(t));
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            violin.constructors[which].team = t;
            dot.style.background = TEAM_COLORS[t];
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

function makeCard(violin, globalMin, globalMax, overBudget) {
    const card = document.createElement('div');
    card.className = 'violin-card';
    if (violin.flagged || violin.confidence !== 'high') card.classList.add('flagged');
    if (overBudget) card.classList.add('over-budget');

    // Stat row: budget, avg_xpts, budget_uplift, $/pt
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

    // Percentile row
    const pctRow = document.createElement('div');
    pctRow.className = 'card-percentile-row';
    const p = violin.percentiles;
    pctRow.textContent = `P05:${p.p05}  P25:${p.p25}  P50:${p.p50}  P75:${p.p75}  P95:${p.p95}`;
    card.appendChild(pctRow);

    // Drivers
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

    // Constructors
    const cnRow = document.createElement('div');
    cnRow.className = 'card-constructors';
    cnRow.appendChild(makeConstructorBadge(violin, 'cn1'));
    cnRow.appendChild(makeConstructorBadge(violin, 'cn2'));
    card.appendChild(cnRow);

    // Sparkline
    const chartWrap = document.createElement('div');
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 100, 30));
    card.appendChild(chartWrap);

    return card;
}

function renderGrid(container, data, budget) {
    container.innerHTML = '';
    const { globalMin, globalMax } = computeGlobalBounds(data);

    // Sort by original order (row then col), partition by budget
    const sorted = [...data].sort((a, b) => a.row - b.row || a.col - b.col);
    const affordable = sorted.filter(v => v.header.budget_required <= budget);
    const overBudget = sorted.filter(v => v.header.budget_required > budget);

    const grid = document.createElement('div');
    grid.className = 'violin-grid';

    for (const v of affordable) {
        grid.appendChild(makeCard(v, globalMin, globalMax, false));
    }
    for (const v of overBudget) {
        grid.appendChild(makeCard(v, globalMin, globalMax, true));
    }

    container.appendChild(grid);
}

function initReview(container) {
    const section = document.createElement('section');

    // ── Top bar ──
    const topbar = document.createElement('div');
    topbar.className = 'review-topbar';

    // Budget field
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
    budgetInput.value = localStorage.getItem('userBudget') || '105';

    budgetField.appendChild(budgetLabel);
    budgetField.appendChild(budgetInput);
    topbar.appendChild(budgetField);

    // JSON import field
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

    // Summary line
    const summaryEl = document.createElement('div');
    summaryEl.className = 'review-summary';
    section.appendChild(summaryEl);

    // Error line
    const errorEl = document.createElement('div');
    section.appendChild(errorEl);

    // Grid container
    const gridContainer = document.createElement('div');
    section.appendChild(gridContainer);

    // Drag-and-drop onto textarea
    pasteArea.addEventListener('dragover', (e) => e.preventDefault());
    pasteArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pasteArea.value = reader.result; };
        reader.readAsText(file);
    });

    // Close dropdowns on outside click (registered once per init)
    document.addEventListener('click', () => {
        document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    function getBudget() {
        return parseFloat(budgetInput.value) || Infinity;
    }

    function updateSummary() {
        if (!violins.length) { summaryEl.textContent = ''; return; }
        const budget = getBudget();
        const affordable = violins.filter(v => v.header.budget_required <= budget).length;
        const over = violins.length - affordable;
        summaryEl.textContent = `${violins.length} VIOLINS — ${affordable} AFFORDABLE — ${over} OVER BUDGET`;
    }

    function loadData(data) {
        violins = data;
        errorEl.textContent = '';
        errorEl.className = '';
        updateSummary();
        renderGrid(gridContainer, violins, getBudget());
        saveReviewedDataset(violins);
    }

    // Budget change: persist to localStorage and re-render
    budgetInput.addEventListener('input', () => {
        localStorage.setItem('userBudget', budgetInput.value);
        updateSummary();
        if (violins.length) renderGrid(gridContainer, violins, getBudget());
    });

    // Import button
    importBtn.addEventListener('click', () => {
        errorEl.textContent = '';
        errorEl.className = '';
        try {
            const parsed = JSON.parse(pasteArea.value.trim());
            importJSON(parsed);
            loadData(parsed);
        } catch (err) {
            errorEl.className = 'import-error';
            errorEl.textContent = `ERROR: ${err.message}`;
        }
    });

    // Auto-load persisted import on init
    const persisted = getImportedViolins();
    if (persisted) loadData(persisted);

    container.appendChild(section);
}

export { initReview, TEAM_COLORS, TEAMS };
```

- [ ] **Step 2: Verify in browser**

Load the Review tab. With sample JSON (or existing persisted data):
- Top bar shows BUDGET (M) input and textarea + LOAD JSON button on one row
- Summary line shows correct counts
- Cards are in 3 columns, affordable first, over-budget at 0.25 opacity at bottom
- Each card shows stat row, percentile row, drivers (2X highlighted teal), constructors with color dot, sparkline
- Changing budget re-partitions cards immediately
- Budget value persists on page reload

- [ ] **Step 3: Commit**

```bash
git add docs/review.js
git commit -m "feat: redesign Review tab — budget filter, 3-col grid, terminal aesthetic"
```

---

## Task 5: Update `analysis.js` — shared budget, aesthetic update

**Files:**
- Modify: `docs/analysis.js`

Changes:
- `budgetInput` initial value from `localStorage.getItem('userBudget') || '105'`
- `budgetInput` changes persist to `localStorage.setItem('userBudget', ...)`
- Labels are uppercase, letter-spacing applied via CSS (already handled in Task 2)
- `rank-number` colour is already teal via CSS (already handled in Task 2)
- `over-budget` opacity already 0.25 via CSS (already handled in Task 2)
- Remove the `h2` heading (redundant in terminal aesthetic)

- [ ] **Step 1: Replace `docs/analysis.js` in full**

```js
import { createAreaChart } from './areaChart.js';
import { getReviewedDataset } from './dataStore.js';
import { TEAM_COLORS } from './review.js';

function estimateWinProb(percentiles, threshold) {
    const pts = [
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
            const cdf = c0 + t * (c1 - c0);
            return 1 - cdf;
        }
    }
    return 0;
}

function calcKelly(violin, threshold) {
    const p = estimateWinProb(violin.percentiles, threshold);
    const b = (violin.percentiles.p95 - threshold) / Math.max(threshold, 1);
    const f = (b * p - (1 - p)) / Math.max(b, 0.0001);
    return Math.max(0, Math.min(1, f));
}

function computeRankedList(violins, budgetLimit, sortKey) {
    const p50s = violins.map(v => v.percentiles.p50).sort((a, b) => a - b);
    const threshold = p50s[Math.floor(p50s.length / 2)];

    const entries = violins.map(v => ({
        violin: v,
        kelly: calcKelly(v, threshold),
        overBudget: v.header.budget_required > budgetLimit,
    }));

    const sortFns = {
        kelly: (a, b) => b.kelly - a.kelly,
        avg_xpts: (a, b) => b.violin.header.avg_xpts - a.violin.header.avg_xpts,
        p50: (a, b) => b.violin.percentiles.p50 - a.violin.percentiles.p50,
        budget: (a, b) => a.violin.header.budget_required - b.violin.header.budget_required,
    };

    const eligible = entries.filter(e => !e.overBudget).sort(sortFns[sortKey] || sortFns.kelly);
    const overBudget = entries.filter(e => e.overBudget).sort(sortFns[sortKey] || sortFns.kelly);
    return [...eligible, ...overBudget];
}

function makeRankedEntry(entry, rank, globalMin, globalMax) {
    const { violin, kelly, overBudget } = entry;
    const el = document.createElement('div');
    el.className = 'ranked-entry' + (overBudget ? ' over-budget' : '');

    // Rank number
    const rankEl = document.createElement('div');
    rankEl.className = 'rank-number';
    rankEl.textContent = `#${rank}`;
    el.appendChild(rankEl);

    // Mini chart
    const chartWrap = document.createElement('div');
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 120, 40));
    el.appendChild(chartWrap);

    // Kelly bar + score text
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
    const cn1 = violin.constructors.cn1.team;
    const cn2 = violin.constructors.cn2.team;

    const pickText = document.createElement('div');
    pickText.className = 'score-text';
    pickText.textContent = `${drivers}  [${cn1}][${cn2}]`;
    infoCol.appendChild(pickText);

    el.appendChild(infoCol);

    // Budget
    const budgetEl = document.createElement('div');
    budgetEl.className = 'score-text';
    budgetEl.textContent = `${violin.header.budget_required}M`;
    el.appendChild(budgetEl);

    return el;
}

function initAnalysis(container) {
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

    // Controls
    const controls = document.createElement('div');
    controls.className = 'analysis-controls';

    const budgetLabel = document.createElement('label');
    budgetLabel.textContent = 'BUDGET (M)';
    const budgetInput = document.createElement('input');
    budgetInput.type = 'number';
    budgetInput.value = localStorage.getItem('userBudget') || '105';
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

    function render() {
        listContainer.innerHTML = '';
        const budget = parseFloat(budgetInput.value) || Infinity;
        const sortKey = sortSelect.value;
        const ranked = computeRankedList(violins, budget, sortKey);

        const allScores = violins.flatMap(v => [v.percentiles.p05, v.percentiles.p95]);
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

export { initAnalysis };
```

- [ ] **Step 2: Verify budget sync**

1. Set budget to 98 in Review tab → summary updates
2. Switch to Analysis tab → budget field shows 98
3. Change to 110 in Analysis → switch to Review → reload page → Review shows 110

- [ ] **Step 3: Commit**

```bash
git add docs/analysis.js
git commit -m "feat: sync budget via localStorage, apply terminal aesthetic to Analysis tab"
```

---

## Task 6: Update `dataStore.js` — aesthetic update only

**Files:**
- Modify: `docs/dataStore.js`

The Data tab uses `config-section` class for its cards and inline styles for the table. Those need to be updated to use the new `data-card` class and the new table CSS (both defined in Task 2's stylesheet). No logic changes.

- [ ] **Step 1: Update card class name and remove inline table styles in `initDataStore` and `showTable`**

In `initDataStore`, change:
```js
card.className = 'config-section';
```
to:
```js
card.className = 'data-card';
```

In `showTable`, remove the inline style assignments from the `table` element and its `th`/`td` elements — the CSS classes from Task 2 handle them. Replace:

```js
function showTable(section, key) {
    const existing = section.querySelector('.data-table-container');
    if (existing) existing.remove();

    const rows = getUnifiedTable(key);
    if (!rows.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-container';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '1rem';
    table.style.fontSize = '0.8rem';

    const headers = Object.keys(rows[0]);
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.borderBottom = '1px solid #0f3460';
        th.style.padding = '0.3rem';
        th.style.textAlign = 'left';
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
            td.textContent = Array.isArray(val) ? val.join(', ') : (val ?? '');
            td.style.padding = '0.3rem';
            td.style.borderBottom = '1px solid #1a1a2e';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    section.appendChild(wrapper);
}
```

with:

```js
function showTable(section, key) {
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
            td.textContent = Array.isArray(val) ? val.join(', ') : (val ?? '');
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    section.appendChild(wrapper);
}
```

- [ ] **Step 2: Verify Data tab**

Navigate to Data tab. If any datasets exist, card shows with terminal styling and table headers are uppercase.

- [ ] **Step 3: Commit**

```bash
git add docs/dataStore.js
git commit -m "feat: apply terminal aesthetic to Data tab"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Full verification checklist**

Open `docs/index.html` via a local file server and confirm each item:

1. Nav shows `REVIEW | ANALYSIS | DATA` — no Cropper tab
2. Default view on first load is Review tab
3. Paste or drop pipeline JSON → click `LOAD JSON` → 3-column card grid renders
4. Each card shows: stat row, percentile row, drivers (2X in teal), constructor dots, stepped teal sparkline
5. Set budget to 100 → over-budget cards move to bottom at 0.25 opacity, summary line updates
6. Switch to Analysis → budget field is pre-populated with 100
7. Change budget to 110 in Analysis → switch back to Review → budget is 110
8. Reload page → budget persists, JSON data auto-reloads
9. All text is monospace (Courier New)
10. No rounded corners anywhere
11. Accent color is `#62eeb7` teal throughout (nav active, flagged card border, rank numbers, kelly bar, multiplier driver, sparkline)
12. Data tab shows datasets with uppercase headers (if any exist)

- [ ] **Step 2: Confirm no console errors**

Open DevTools → Console. Navigate through all three tabs. Must be zero errors.
