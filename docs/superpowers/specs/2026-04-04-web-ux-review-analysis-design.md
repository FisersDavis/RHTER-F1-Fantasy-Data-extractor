# RHTER F1 Fantasy — Web UX: Review & Analysis Design

**Date:** 2026-04-04

## Goal

Build the web UX for ingesting pipeline JSON output, reviewing/correcting extracted data, and presenting Kelly criterion rankings to minimize decision fatigue when choosing an F1 fantasy team.

## Constraints

- Static GitHub Pages — no server, no bundlers, ES modules only
- No npm, external libs via CDN only (Chart.js deferred)
- All files under ~300 lines; split if approaching limit
- Architecture boundary: no image processing in the browser
- Target user: someone unfamiliar with the data schema — use plain English labels, color swatches, not raw field names

---

## User flow

```
Pipeline JSON (array of 72 objects)
        │
        ▼
[ Review Tab ] — import → inspect → correct → accept
        │
        ▼
[ dataStore ] — persists reviewed dataset
        │
        ▼
[ Analysis Tab ] — Kelly ranking → budget filter → pick team
```

---

## Data format

Pipeline outputs a single JSON array of up to 72 objects saved to `data/final/<stem>.json`. Each object:

```json
{
  "row": 0,
  "col": 0,
  "header": {
    "budget_required": 101.4,
    "avg_xpts": 183.1,
    "avg_xpts_dollar_impact": 195.7,
    "avg_budget_uplift": 0.44
  },
  "percentiles": { "p95": 287.0, "p75": 259.0, "p50": 176.0, "p25": 147.0, "p05": 91.0 },
  "drivers": [
    {"name": "LEC", "multiplier": "2X"},
    {"name": "LAW", "multiplier": null},
    {"name": "BEA", "multiplier": null},
    {"name": "COL", "multiplier": null},
    {"name": "BOT", "multiplier": null}
  ],
  "constructors": {
    "cn1": {"color_rgb": [255, 135, 0], "team": "MCL"},
    "cn2": {"color_rgb": [0, 210, 210], "team": "MER"}
  },
  "confidence": "high",
  "flagged": false
}
```

---

## Tab structure

Add `'review'` and `'analysis'` to `VIEWS` in `app.js`. Nav becomes: **Cropper | Review | Analysis**.

---

## Review tab (`review.js`)

### Import

- Paste box or file drag-drop at top of tab
- On load: parse array, validate basic structure, show summary: `"✓ 72 violins loaded, 3 flagged"`
- Store raw import in localStorage via `dataStore.importJSON(array)`

### Card grid

72 cards in a 24-column × 3-row grid, grouped by budget tier row with a subtle label ("Budget Tier 1 / 2 / 3"). Responsive — collapses gracefully on narrow screens.

Each card layout:
```
┌──────────────────────────────┐
│ 101.4m  183.1pts  +0.44m    │  ← Budget Required, Avg xPts, Avg Budget Uplift
│                              │
│  [area chart — SVG]          │  ← x=score (global scale), y=percentile rank
│                              │
│ LEC(2X) LAW BEA COL BOT     │  ← drivers, 2X multiplier shown inline
│ [MCL] [MER]                  │  ← constructor badges: team code + colored dot
└──────────────────────────────┘
```

**Flagged cards**: amber border. Pipeline set `flagged: true` or confidence is not "high".

**Inline correction**:
- Clicking a constructor badge opens a small dropdown to reassign team (11 options)
- Clicking a driver name allows editing the abbreviation (text input, 3 chars)
- Corrections saved immediately to localStorage

**Bulk actions** (above grid):
- "Accept all unflagged" — marks all non-flagged cards as reviewed
- "Clear all flags" — removes flag state from all cards
- "Proceed to Analysis" — disabled until at least 1 card accepted

---

## Area chart component (`areaChart.js`)

Pure function: takes percentile data + global bounds, returns an SVG element. No state, no side effects. Reused in both Review and Analysis tabs.

**Inputs:** `{ p05, p25, p50, p75, p95 }`, `globalMin`, `globalMax`, `width`, `height`

**Chart logic:**
- x-axis: score value, proportionally mapped to `globalMin`–`globalMax` across all 72 violins (global scale, so shapes are directly comparable)
- y-axis: percentile rank — fixed positions: p05=5, p25=25, p50=50, p75=75, p95=95 — mapped to SVG height
- 5 points connected with a smooth area fill (SVG `<path>` with fill + stroke)
- No axis labels on the card — the silhouette is the signal
- Monochrome fill (matches dark dashboard aesthetic); no colors used (constructor colors are on the badges, not the chart)

---

## Analysis tab (`analysis.js`)

### Controls (top bar)
- Budget input: `[105.0m] [Apply]` — filters out over-budget combos instantly
- Sort dropdown: Kelly Score (default), Avg xPts, p50, Budget Required

### Kelly criterion calculation

From the 5 percentile points, estimate a Kelly fraction per violin:

1. Compute `threshold` = median of all 72 p50 values across the dataset
2. Estimate win probability `p` for each violin: interpolate linearly across the 5 percentile points to find what fraction of the distribution sits above `threshold`. E.g. if threshold falls between p50 and p75, interpolate: `p = 0.50 + 0.25 * (threshold - p50) / (p75 - p50)`, then `p = 1 - p_below`
3. Estimate upside ratio `b` = (p95 − threshold) / threshold (reward relative to threshold)
4. Kelly fraction: `f = (b·p − (1−p)) / b`, clamped to [0, 1]
5. Rank all violins by `f`, highest first

### Ranked list

Each entry in the ranked list reuses the mini card from Review (same `areaChart.js`), plus:
- Rank number (#1, #2, …)
- Kelly score bar (filled bar, proportional to f)
- p50 score and range (p05–p95) shown as text

**Top 3** get a highlighted border/accent.

**Over-budget** entries are greyed out and pushed to the bottom regardless of Kelly score.

### Decision fatigue reduction

- Budget filter is the primary reducer — most of 72 options disappear immediately
- Top 3 are visually pre-selected — eye goes there first
- Greyed-out cards are still visible (not hidden) so user can see what they're missing

---

## dataStore.js additions

Two new exported functions:

```js
importJSON(array)         // validates + stores raw pipeline output, returns {count, flagged}
saveReviewedDataset(array) // persists post-correction array, overwrites previous
```

Existing `getUnifiedTable`, `getDatasets`, `deleteDataset` unchanged.

---

## File structure

```
docs/
├── app.js          — add 'review', 'analysis' to VIEWS; wire imports
├── dataStore.js    — add importJSON(), saveReviewedDataset()
├── review.js       — NEW: import UI, 72-card grid, inline corrections
├── areaChart.js    — NEW: pure SVG area chart component (~50 lines)
├── analysis.js     — NEW: Kelly calc, ranked list, budget filter
└── style.css       — extend: card styles, flagged/greyed/highlighted states
```

All files stay under 300 lines. `areaChart.js` is ~50 lines. If `review.js` approaches 300 lines, split card rendering into `reviewCard.js`.

---

## Out of scope for this build

- Chart.js visualizations
- Week-over-week dataset comparison
- Dual-pass extraction review
- Local model fallback
- Full Kelly criterion with bankroll sizing (v1 uses simplified ranking only)
