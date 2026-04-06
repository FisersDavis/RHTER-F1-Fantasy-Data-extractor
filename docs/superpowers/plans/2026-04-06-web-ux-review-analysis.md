# Web UX: Review & Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Review and Analysis tabs so a user can import pipeline JSON, inspect/correct 72 violin cards, then see Kelly-ranked team recommendations filtered by budget.

**Architecture:** `dataStore.js` gains two new functions for import/save. A pure `areaChart.js` renders SVG area charts from percentile data. `review.js` and `analysis.js` implement the two tabs. `app.js` wires the new views into the nav.

**Tech Stack:** Vanilla ES modules, browser Canvas API, SVG (no external libs), localStorage for persistence.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `docs/dataStore.js` | Modify | Add `importJSON()`, `saveReviewedDataset()` |
| `docs/areaChart.js` | Create | Pure function → SVG `<svg>` element from percentile data |
| `docs/review.js` | Create | Import UI, 72-card grid, inline correction, bulk actions |
| `docs/analysis.js` | Create | Kelly calc, ranked list, budget filter |
| `docs/app.js` | Modify | Add `'review'`, `'analysis'` to `VIEWS`; import + wire new modules |
| `docs/style.css` | Modify | Card grid, flagged/greyed/highlighted states, constructor badges |
| `docs/index.html` | No change | Already structured correctly |

`areaChart.js` target ~50 lines. If `review.js` approaches 300 lines, split card rendering into `reviewCard.js` (not pre-emptively — only when needed).

---

## Shared constants used across tasks

Constructor color map (used in badges and dropdowns — defined once in `review.js`, imported by `analysis.js` if needed):

```js
const TEAM_COLORS = {
    MCL: '#FF8700', MER: '#00D2BE', RED: '#001B5E', FER: '#DC0000',
    WIL: '#0057FF', VRB: '#6AB4E4', AST: '#006F49', HAA: '#FFFFFF',
    AUD: '#7A0028', ALP: '#FF87BC', CAD: '#C0C0C0',
};
const TEAM_NAMES = Object.keys(TEAM_COLORS); // ['MCL','MER','RED',...]
```

---

## Task 1: dataStore — importJSON and saveReviewedDataset

**Files:**
- Modify: `docs/dataStore.js:1-132`

### What these functions do

`importJSON(array)` validates that the input is an array of objects each with `row`, `col`, `header`, `percentiles`, `drivers`, `constructors` fields. It stores the raw array under localStorage key `'importedViolins'` and returns `{ count, flagged }` where `flagged` is the count where `item.flagged === true || item.confidence !== 'high'`.

`saveReviewedDataset(array)` stores the corrected array under `'reviewedViolins'` (overwrites).

- [ ] **Step 1: Add `importJSON` to `dataStore.js`**

Add before the `export` line at the bottom of `docs/dataStore.js`:

```js
function importJSON(array) {
    if (!Array.isArray(array)) throw new Error('Expected an array');
    for (const item of array) {
        if (item.row == null || item.col == null || !item.header || !item.percentiles || !item.drivers || !item.constructors) {
            throw new Error(`Invalid violin object at row=${item.row} col=${item.col}`);
        }
    }
    localStorage.setItem('importedViolins', JSON.stringify(array));
    const flagged = array.filter(v => v.flagged || v.confidence !== 'high').length;
    return { count: array.length, flagged };
}

function saveReviewedDataset(array) {
    localStorage.setItem('reviewedViolins', JSON.stringify(array));
}

function getReviewedDataset() {
    const raw = localStorage.getItem('reviewedViolins');
    return raw ? JSON.parse(raw) : null;
}

function getImportedViolins() {
    const raw = localStorage.getItem('importedViolins');
    return raw ? JSON.parse(raw) : null;
}
```

- [ ] **Step 2: Update the export line**

Change the existing export at the bottom of `docs/dataStore.js`:

```js
export { initDataStore, getDatasets, getDataset, getUnifiedTable, deleteDataset, importJSON, saveReviewedDataset, getReviewedDataset, getImportedViolins };
```

- [ ] **Step 3: Manual smoke test in browser console**

Open `docs/index.html` in a browser. In the console:
```js
import { importJSON } from './dataStore.js';
const r = importJSON([{row:0,col:0,header:{budget_required:100,avg_xpts:180,avg_xpts_dollar_impact:190,avg_budget_uplift:0.4},percentiles:{p05:90,p25:140,p50:170,p75:250,p95:280},drivers:[{name:'LEC',multiplier:'2X'},{name:'LAW',multiplier:null},{name:'BEA',multiplier:null},{name:'COL',multiplier:null},{name:'BOT',multiplier:null}],constructors:{cn1:{color_rgb:[255,135,0],team:'MCL'},cn2:{color_rgb:[0,210,210],team:'MER'}},confidence:'high',flagged:false}]);
console.log(r); // { count: 1, flagged: 0 }
```

- [ ] **Step 4: Commit**

```bash
git add docs/dataStore.js
git commit -m "feat: add importJSON, saveReviewedDataset, getReviewedDataset, getImportedViolins to dataStore"
```

---

## Task 2: areaChart.js — pure SVG area chart

**Files:**
- Create: `docs/areaChart.js`

The function `createAreaChart(percentiles, globalMin, globalMax, width, height)` returns an SVG element. No imports needed.

- `percentiles`: `{ p05, p25, p50, p75, p95 }`
- `globalMin`, `globalMax`: score range across all 72 violins — used to place x positions consistently
- `width`, `height`: SVG dimensions in px
- Returns: `<svg>` DOM element with a filled area path + stroke

The 5 data points are `(score, rank)` pairs:
```
(p05, 5), (p25, 25), (p50, 50), (p75, 75), (p95, 95)
```

Map x: `(score - globalMin) / (globalMax - globalMin) * width`
Map y: `height - (rank / 100) * height`  (rank 0=bottom, 100=top; SVG y is inverted)

Build a closed SVG path: go left-to-right through the 5 points, then close back along the bottom.

- [ ] **Step 1: Create `docs/areaChart.js`**

```js
/**
 * createAreaChart — pure function, no state, no side effects.
 * Returns an SVG element showing a percentile area shape.
 *
 * @param {{ p05, p25, p50, p75, p95 }} percentiles
 * @param {number} globalMin  lowest score across all 72 violins
 * @param {number} globalMax  highest score across all 72 violins
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

    // Area path: forward along curve, then back along the baseline
    const top = points.map(([score, rank]) => `${toX(score).toFixed(1)},${toY(rank).toFixed(1)}`);
    const bottomLeft = `${toX(percentiles.p05).toFixed(1)},${height}`;
    const bottomRight = `${toX(percentiles.p95).toFixed(1)},${height}`;
    const d = `M ${top[0]} L ${top.slice(1).join(' L ')} L ${bottomRight} L ${bottomLeft} Z`;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', d);
    area.setAttribute('fill', 'rgba(233,69,96,0.25)');
    area.setAttribute('stroke', '#e94560');
    area.setAttribute('stroke-width', '1.5');
    svg.appendChild(area);

    return svg;
}

export { createAreaChart };
```

- [ ] **Step 2: Manual smoke test in browser console**

```js
import { createAreaChart } from './areaChart.js';
const svg = createAreaChart({p05:90,p25:140,p50:170,p75:250,p95:280}, 80, 300, 120, 50);
document.body.appendChild(svg);
// Should see a pink area shape in the top-left of the page
```

- [ ] **Step 3: Commit**

```bash
git add docs/areaChart.js
git commit -m "feat: add pure SVG area chart component"
```

---

## Task 3: style.css — Review and Analysis card styles

**Files:**
- Modify: `docs/style.css`

- [ ] **Step 1: Append card and state styles to `docs/style.css`**

Add at the end of the file:

```css
/* ── Review tab ── */
.tier-label {
    font-size: 0.75rem;
    color: #a0a0b0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 1.5rem 0 0.5rem;
}

.violin-grid {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 4px;
    margin-bottom: 1rem;
}

@media (max-width: 1400px) { .violin-grid { grid-template-columns: repeat(12, 1fr); } }
@media (max-width: 900px)  { .violin-grid { grid-template-columns: repeat(6, 1fr); } }
@media (max-width: 500px)  { .violin-grid { grid-template-columns: repeat(3, 1fr); } }

.violin-card {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 6px;
    font-size: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.violin-card.flagged {
    border-color: #f59e0b;
}

.violin-card.accepted {
    border-color: #10b981;
}

.violin-card.over-budget {
    opacity: 0.4;
}

.violin-card .card-header {
    color: #a0a0b0;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.violin-card .card-chart {
    /* chart SVG fills this naturally */
}

.violin-card .card-drivers {
    color: #e0e0e0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
}

.violin-card .driver-name {
    cursor: pointer;
    padding: 1px 3px;
    border-radius: 2px;
}

.violin-card .driver-name:hover {
    background: #0f3460;
}

.violin-card .driver-name.multiplier {
    color: #f59e0b;
}

.violin-card .card-constructors {
    display: flex;
    gap: 4px;
}

.constructor-badge {
    display: flex;
    align-items: center;
    gap: 3px;
    background: #0f3460;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.65rem;
    cursor: pointer;
    position: relative;
}

.constructor-badge .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.constructor-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 4px;
    padding: 4px 0;
    min-width: 80px;
    display: none;
}

.constructor-dropdown.open {
    display: block;
}

.constructor-dropdown button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    color: #e0e0e0;
    padding: 3px 8px;
    font-size: 0.7rem;
    cursor: pointer;
    text-align: left;
}

.constructor-dropdown button:hover {
    background: #0f3460;
}

/* ── Bulk actions bar ── */
.bulk-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
}

.import-summary {
    font-size: 0.85rem;
    color: #10b981;
    margin: 0.5rem 0 1rem;
}

.import-error {
    font-size: 0.85rem;
    color: #e94560;
    margin: 0.5rem 0;
}

/* ── Analysis tab ── */
.analysis-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
}

.analysis-controls label {
    font-size: 0.85rem;
    color: #a0a0b0;
}

.analysis-controls input,
.analysis-controls select {
    background: #16213e;
    border: 1px solid #0f3460;
    color: #e0e0e0;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    font-size: 0.85rem;
}

.ranked-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ranked-entry {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 2rem 120px 1fr auto;
    gap: 12px;
    align-items: center;
}

.ranked-entry.top-pick {
    border-color: #e94560;
}

.ranked-entry.over-budget {
    opacity: 0.4;
    order: 999;
}

.rank-number {
    font-size: 1.1rem;
    font-weight: bold;
    color: #e94560;
}

.kelly-bar-wrap {
    height: 6px;
    background: #0f3460;
    border-radius: 3px;
    overflow: hidden;
}

.kelly-bar-fill {
    height: 100%;
    background: #e94560;
    border-radius: 3px;
}

.ranked-entry .score-text {
    font-size: 0.75rem;
    color: #a0a0b0;
}
```

- [ ] **Step 2: Verify page still loads without errors**

Open `docs/index.html` in browser. No console errors. Cropper tab still works.

- [ ] **Step 3: Commit**

```bash
git add docs/style.css
git commit -m "feat: add review and analysis card styles to CSS"
```

---

## Task 4: review.js — import UI and card grid

**Files:**
- Create: `docs/review.js`

This file builds the entire Review tab. It imports `createAreaChart` from `areaChart.js` and the dataStore functions.

The constructor color map is defined here. The team dropdown list is the 11 known teams.

- [ ] **Step 1: Create `docs/review.js`**

```js
import { createAreaChart } from './areaChart.js';
import { importJSON, saveReviewedDataset, getImportedViolins } from './dataStore.js';

const TEAM_COLORS = {
    MCL: '#FF8700', MER: '#00D2BE', RED: '#001B5E', FER: '#DC0000',
    WIL: '#0057FF', VRB: '#6AB4E4', AST: '#006F49', HAA: '#FFFFFF',
    AUD: '#7A0028', ALP: '#FF87BC', CAD: '#C0C0C0',
};
const TEAMS = Object.keys(TEAM_COLORS);

// Module-level working copy of violins (post-correction)
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
    // which: 'cn1' | 'cn2'
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
        // Close all other open dropdowns
        document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) dropdown.classList.add('open');
    });

    return wrapper;
}

function makeCard(violin, globalMin, globalMax) {
    const card = document.createElement('div');
    card.className = 'violin-card';
    if (violin.flagged || violin.confidence !== 'high') card.classList.add('flagged');
    if (violin._accepted) card.classList.add('accepted');

    // Header row
    const header = document.createElement('div');
    header.className = 'card-header';
    header.textContent = `${violin.header.budget_required}m  ${violin.header.avg_xpts}pts  +${violin.header.avg_budget_uplift}m`;
    card.appendChild(header);

    // Chart
    const chartWrap = document.createElement('div');
    chartWrap.className = 'card-chart';
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 100, 40));
    card.appendChild(chartWrap);

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
            input.style.cssText = 'width:3ch;background:#1a1a2e;color:#e0e0e0;border:1px solid #e94560;border-radius:2px;font-size:0.7rem;padding:0;text-align:center;';
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
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') input.replaceWith(span); });
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

    return card;
}

function renderGrid(container, data) {
    const { globalMin, globalMax } = computeGlobalBounds(data);

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.constructor-dropdown.open').forEach(d => d.classList.remove('open'));
    }, { once: false });

    const ROWS = [
        { label: 'Budget Tier 1', items: data.filter(v => v.row === 0).sort((a, b) => a.col - b.col) },
        { label: 'Budget Tier 2', items: data.filter(v => v.row === 1).sort((a, b) => a.col - b.col) },
        { label: 'Budget Tier 3', items: data.filter(v => v.row === 2).sort((a, b) => a.col - b.col) },
    ];

    for (const tier of ROWS) {
        const tierLabel = document.createElement('div');
        tierLabel.className = 'tier-label';
        tierLabel.textContent = tier.label;
        container.appendChild(tierLabel);

        const grid = document.createElement('div');
        grid.className = 'violin-grid';
        for (const v of tier.items) {
            grid.appendChild(makeCard(v, globalMin, globalMax));
        }
        container.appendChild(grid);
    }
}

function initReview(container) {
    const section = document.createElement('section');

    // Import area
    const importHeading = document.createElement('h2');
    importHeading.textContent = 'Import Pipeline JSON';
    section.appendChild(importHeading);

    const pasteArea = document.createElement('textarea');
    pasteArea.placeholder = 'Paste pipeline JSON array here, or drag and drop a .json file…';
    pasteArea.style.cssText = 'width:100%;height:120px;background:#16213e;color:#e0e0e0;border:1px solid #0f3460;border-radius:4px;padding:0.5rem;font-family:monospace;font-size:0.8rem;resize:vertical;';
    section.appendChild(pasteArea);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn';
    importBtn.textContent = 'Load JSON';
    importBtn.style.marginTop = '0.5rem';
    section.appendChild(importBtn);

    const summaryEl = document.createElement('div');
    section.appendChild(summaryEl);

    // File drop
    pasteArea.addEventListener('dragover', (e) => e.preventDefault());
    pasteArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pasteArea.value = reader.result; };
        reader.readAsText(file);
    });

    // Bulk actions
    const bulkBar = document.createElement('div');
    bulkBar.className = 'bulk-actions';
    bulkBar.style.display = 'none';

    const acceptAllBtn = document.createElement('button');
    acceptAllBtn.className = 'btn';
    acceptAllBtn.textContent = 'Accept all unflagged';

    const clearFlagsBtn = document.createElement('button');
    clearFlagsBtn.className = 'btn';
    clearFlagsBtn.textContent = 'Clear all flags';

    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'btn';
    proceedBtn.textContent = 'Proceed to Analysis';
    proceedBtn.disabled = true;

    bulkBar.appendChild(acceptAllBtn);
    bulkBar.appendChild(clearFlagsBtn);
    bulkBar.appendChild(proceedBtn);
    section.appendChild(bulkBar);

    // Grid container
    const gridContainer = document.createElement('div');
    section.appendChild(gridContainer);

    function loadData(data) {
        violins = data.map(v => ({ ...v, _accepted: false }));
        summaryEl.className = 'import-summary';
        const flaggedCount = data.filter(v => v.flagged || v.confidence !== 'high').length;
        summaryEl.textContent = `✓ ${data.length} violins loaded, ${flaggedCount} flagged`;
        bulkBar.style.display = 'flex';
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        updateProceedBtn();
        saveReviewedDataset(violins);
    }

    function updateProceedBtn() {
        proceedBtn.disabled = !violins.some(v => v._accepted);
    }

    // Try loading persisted import on init
    const persisted = getImportedViolins();
    if (persisted) loadData(persisted);

    importBtn.addEventListener('click', () => {
        summaryEl.textContent = '';
        summaryEl.className = '';
        try {
            const parsed = JSON.parse(pasteArea.value.trim());
            const result = importJSON(parsed);
            loadData(parsed);
        } catch (err) {
            summaryEl.className = 'import-error';
            summaryEl.textContent = `Error: ${err.message}`;
        }
    });

    acceptAllBtn.addEventListener('click', () => {
        for (const v of violins) {
            if (!v.flagged && v.confidence === 'high') v._accepted = true;
        }
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        updateProceedBtn();
        saveReviewedDataset(violins);
    });

    clearFlagsBtn.addEventListener('click', () => {
        for (const v of violins) {
            v.flagged = false;
        }
        gridContainer.innerHTML = '';
        renderGrid(gridContainer, violins);
        saveReviewedDataset(violins);
    });

    proceedBtn.addEventListener('click', () => {
        // Navigation is handled by app.js — dispatch a custom event
        document.dispatchEvent(new CustomEvent('navigate', { detail: 'analysis' }));
    });

    container.appendChild(section);
}

export { initReview, TEAM_COLORS, TEAMS };
```

- [ ] **Step 2: Verify file is under 300 lines**

```bash
wc -l docs/review.js
# Should be under 300. If over, split makeCard + makeConstructorBadge into reviewCard.js
```

- [ ] **Step 3: Commit**

```bash
git add docs/review.js
git commit -m "feat: add Review tab with import UI, 72-card grid, and inline corrections"
```

---

## Task 5: analysis.js — Kelly ranking and ranked list

**Files:**
- Create: `docs/analysis.js`

Kelly calculation operates on the full `violins` array (all 72 items, not just accepted ones — so user can see the full field ranked).

- [ ] **Step 1: Create `docs/analysis.js`**

```js
import { createAreaChart } from './areaChart.js';
import { getReviewedDataset } from './dataStore.js';
import { TEAM_COLORS } from './review.js';

/**
 * Estimate win probability p for one violin given a threshold score.
 * Linearly interpolates between the 5 percentile points.
 * Returns the fraction of the distribution ABOVE threshold.
 */
function estimateWinProb(percentiles, threshold) {
    const pts = [
        [percentiles.p05, 0.05],
        [percentiles.p25, 0.25],
        [percentiles.p50, 0.50],
        [percentiles.p75, 0.75],
        [percentiles.p95, 0.95],
    ];

    // Find the two bracket points around threshold
    if (threshold <= pts[0][0]) return 1 - pts[0][1]; // below lowest → almost all above
    if (threshold >= pts[4][0]) return 1 - pts[4][1]; // above highest → almost none above

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
    // threshold = median of all p50 values
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
    el.className = 'ranked-entry' + (rank <= 3 && !overBudget ? ' top-pick' : '') + (overBudget ? ' over-budget' : '');

    // Rank number
    const rankEl = document.createElement('div');
    rankEl.className = 'rank-number';
    rankEl.textContent = `#${rank}`;
    el.appendChild(rankEl);

    // Mini chart
    const chartWrap = document.createElement('div');
    chartWrap.appendChild(createAreaChart(violin.percentiles, globalMin, globalMax, 120, 50));
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
    scoreText.textContent = `p50: ${violin.percentiles.p50}  range: ${violin.percentiles.p05}–${violin.percentiles.p95}`;
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
    budgetEl.textContent = `${violin.header.budget_required}m`;
    el.appendChild(budgetEl);

    return el;
}

function initAnalysis(container) {
    const section = document.createElement('section');

    const heading = document.createElement('h2');
    heading.textContent = 'Kelly Rankings';
    section.appendChild(heading);

    const violins = getReviewedDataset();
    if (!violins || !violins.length) {
        const msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'No data yet. Import pipeline JSON in the Review tab first.';
        section.appendChild(msg);
        container.appendChild(section);
        return;
    }

    // Controls
    const controls = document.createElement('div');
    controls.className = 'analysis-controls';

    const budgetLabel = document.createElement('label');
    budgetLabel.textContent = 'Budget max (m): ';
    const budgetInput = document.createElement('input');
    budgetInput.type = 'number';
    budgetInput.value = '105';
    budgetInput.step = '0.1';
    budgetInput.min = '0';
    budgetInput.style.width = '80px';
    budgetLabel.appendChild(budgetInput);
    controls.appendChild(budgetLabel);

    const sortLabel = document.createElement('label');
    sortLabel.textContent = 'Sort by: ';
    const sortSelect = document.createElement('select');
    [
        { value: 'kelly', text: 'Kelly Score' },
        { value: 'avg_xpts', text: 'Avg xPts' },
        { value: 'p50', text: 'p50 Score' },
        { value: 'budget', text: 'Budget Required' },
    ].forEach(({ value, text }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        sortSelect.appendChild(opt);
    });
    sortLabel.appendChild(sortSelect);
    controls.appendChild(sortLabel);

    section.appendChild(controls);

    // Ranked list container
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

    budgetInput.addEventListener('input', render);
    sortSelect.addEventListener('change', render);
    render();

    container.appendChild(section);
}

export { initAnalysis };
```

- [ ] **Step 2: Commit**

```bash
git add docs/analysis.js
git commit -m "feat: add Analysis tab with Kelly ranking, budget filter, and ranked list"
```

---

## Task 6: app.js — wire Review and Analysis into nav

**Files:**
- Modify: `docs/app.js:1-47`

- [ ] **Step 1: Update `docs/app.js`**

Replace the entire file with:

```js
import { initCropper } from './cropper.js';
import { initDataStore } from './dataStore.js';
import { initReview } from './review.js';
import { initAnalysis } from './analysis.js';

const VIEWS = ['cropper', 'review', 'analysis', 'data'];

const state = {
    currentView: localStorage.getItem('currentView') || 'cropper',
};

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
    const labels = { cropper: 'Cropper', review: 'Review', analysis: 'Analysis', data: 'Data' };
    for (const view of VIEWS) {
        const btn = document.createElement('button');
        btn.textContent = labels[view] || view;
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
        case 'cropper':
            initCropper(app);
            break;
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

// Allow other modules to trigger navigation (e.g. "Proceed to Analysis" button)
document.addEventListener('navigate', (e) => navigateTo(e.detail));

render();

export { state };
```

- [ ] **Step 2: Verify all four nav tabs render without errors**

Open `docs/index.html` in a browser. Click through Cropper, Review, Analysis, Data. No console errors on any tab.

- [ ] **Step 3: End-to-end smoke test**

1. Copy the sample JSON from the spec (the single-object array) and paste 72 copies of it (or a real pipeline output) into the Review tab paste area.
2. Click "Load JSON". Confirm summary shows count and flagged number.
3. Confirm cards render in 3 tier rows of 24.
4. Click a constructor badge — confirm dropdown opens with all 11 teams.
5. Select a different team — confirm badge color and label update.
6. Click a driver name — confirm text input appears; type 3 chars + Enter — confirm name updates.
7. Click "Accept all unflagged" — confirm "Proceed to Analysis" button enables.
8. Click "Proceed to Analysis" — confirm navigation switches to Analysis tab.
9. On Analysis tab: confirm ranked list renders with Kelly bars.
10. Change budget limit — confirm over-budget cards go grey.
11. Change sort dropdown — confirm list reorders.

- [ ] **Step 4: Commit**

```bash
git add docs/app.js
git commit -m "feat: wire Review and Analysis tabs into app nav, add navigate event handler"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Covered by task |
|---|---|
| Paste box / file drag-drop import | Task 4 — `pasteArea` + drop handler |
| Parse array, validate structure, show summary | Task 1 `importJSON` + Task 4 `loadData` |
| Store raw import in localStorage | Task 1 `importJSON` |
| 72 cards, 24-col × 3-row grid, tier labels | Task 4 `renderGrid` |
| Responsive grid collapse | Task 3 CSS media queries |
| Card: budget, avg xPts, avg budget uplift header | Task 4 `makeCard` header row |
| Card: area chart SVG | Task 2 `createAreaChart` |
| Card: drivers with 2X inline | Task 4 driver row |
| Card: constructor badges with color dot | Task 4 `makeConstructorBadge` |
| Flagged cards: amber border | Task 3 `.violin-card.flagged` |
| Inline correction: constructor badge dropdown | Task 4 `makeConstructorBadge` dropdown |
| Inline correction: driver name edit | Task 4 driver `click` handler |
| Corrections saved to localStorage | Tasks 1 + 4 `saveReviewedDataset` calls |
| Bulk: Accept all unflagged | Task 4 `acceptAllBtn` |
| Bulk: Clear all flags | Task 4 `clearFlagsBtn` |
| Bulk: Proceed to Analysis (disabled until accepted) | Task 4 `proceedBtn` |
| areaChart: global scale, proportional x | Task 2 `toX` using globalMin/globalMax |
| areaChart: y = percentile rank, 5 points | Task 2 5-point path |
| areaChart: monochrome, no axis labels | Task 2 single `<path>`, no text |
| Analysis: budget filter | Task 5 `budgetInput`, `computeRankedList` |
| Analysis: sort dropdown (4 options) | Task 5 `sortSelect` |
| Kelly calc: threshold = median p50 | Task 5 `computeRankedList` |
| Kelly calc: interpolate win prob | Task 5 `estimateWinProb` |
| Kelly calc: upside ratio b, clamp to [0,1] | Task 5 `calcKelly` |
| Ranked list: rank number, Kelly bar, p50, range | Task 5 `makeRankedEntry` |
| Ranked list: reuses mini area chart | Task 5 calls `createAreaChart` |
| Top 3 highlighted border | Task 5 `.top-pick` class + Task 3 CSS |
| Over-budget greyed, pushed to bottom | Task 5 sort order + `.over-budget` class |
| `importJSON`, `saveReviewedDataset` exported | Task 1 |
| Add `'review'`, `'analysis'` to VIEWS | Task 6 |
| Static GitHub Pages, no bundler | No build step introduced |
| Files under 300 lines | All new files designed under that limit |

### Placeholder scan

No TBD, TODO, or "implement later" items found. All code blocks are complete.

### Type consistency

- `importJSON` → returns `{ count, flagged }` — used only for summary display in Task 4, consistent.
- `saveReviewedDataset(violins)` called in Task 4 after mutations — matches Task 1 signature.
- `getReviewedDataset()` called in Task 5 — matches Task 1 definition.
- `getImportedViolins()` called in Task 4 on init — matches Task 1 definition.
- `createAreaChart(percentiles, globalMin, globalMax, width, height)` — called in Tasks 4 and 5 with same signature.
- `TEAM_COLORS`, `TEAMS` exported from `review.js`, imported in `analysis.js`.
- `initReview(container)`, `initAnalysis(container)` — called from `app.js` with `app` element, consistent with `initCropper(app)` pattern.
