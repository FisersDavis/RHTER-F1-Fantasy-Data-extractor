# RHTER F1 Fantasy — Terminal Redesign

**Date:** 2026-04-06

## Context

The web app was originally built with a Cropper tab for slicing RHTER screenshots into 72 violin crops before the Python pipeline existed. The pipeline now handles all image processing offline. The Cropper tab and cropper.js are dead code and will be removed.

The Review tab UI was designed around a manual review → approve → analysis workflow that added ceremony without value when the pipeline already produces clean JSON. The redesign collapses that ceremony: budget input filters cards directly, no explicit "accept" step required.

The visual style needs to shift from generic dark UI to a Bloomberg terminal / brutalist data dashboard aesthetic: monospace throughout, hard edges, teal accent on near-black, data density over whitespace.

## Goals

1. Remove cropper tab and dead code
2. Apply Bloomberg terminal aesthetic globally
3. Review tab: budget-filtered 3-column card grid, all data visible, no UI ceremony
4. Analysis tab: Kelly-ranked list sharing the same budget value, same aesthetic
5. Data tab: aesthetic update only

---

## Design

### Navigation

- **Delete** `docs/cropper.js`
- **Remove** `import { initCropper } from './cropper.js'` from `docs/app.js`
- `VIEWS` array: `['review', 'analysis', 'data']`
- Default view: `'review'` (was `'cropper'`)
- Nav labels uppercase: `REVIEW | ANALYSIS | DATA`

### Global Aesthetic (`docs/style.css`)

| Property | Value |
|---|---|
| Font | `'Courier New', Courier, monospace` — everywhere, no sans-serif |
| Background | `#0a0a0a` |
| Surface (cards, header) | `#111111` |
| Border color | `#2a2a2a` |
| Primary text | `#e0e0e0` |
| Muted text | `#666666` |
| Accent | `#62eeb7` (teal) |
| Border radius | `0` everywhere — hard edges |
| Label style | `uppercase`, `letter-spacing: 0.1em`, `font-size: 10px`, muted color |
| Shadows | None |
| Gradients | None |

All existing `border-radius`, `box-shadow`, and `font-family` overrides replaced. The `#e94560` red is replaced by `#62eeb7` teal as the single accent color throughout (nav active state, flagged borders, rank numbers, multiplier highlights, etc).

### Review Tab (`docs/review.js`)

**Top bar (single row, not stacked):**
- Budget input: `number` field, label `BUDGET (M)`, persists to `localStorage` key `userBudget`
- JSON import: compact textarea (2 rows tall) + `LOAD JSON` button inline
- Summary line below: `72 VIOLINS — 45 AFFORDABLE — 27 OVER BUDGET` in muted monospace

**Bulk action bar removed entirely** — no Accept all unflagged, Clear all flags, Proceed to Analysis buttons.

**Card grid:**
- 3 columns, `display: grid; grid-template-columns: repeat(3, 1fr)`
- Sorted by original input order (row/col from JSON)
- Affordable cards first, full opacity
- Over-budget cards at bottom, `opacity: 0.25`
- Vertically scrollable

**Card content** (all fields, no visual hierarchy):
```
102.5M  176.4PTS  +0.68M  193.4$/PT
P05:91  P25:147  P50:176  P75:259  P95:287
LEC(2X)  LAW  OCO  BEA  BOT
● MER  ● MCL
[sparkline]
```
- All text `font-size: 10px`, uppercase labels, monospace
- Card border: `1px solid #2a2a2a`
- Flagged card border: `1px solid #62eeb7`
- `(2X)` driver highlighted in accent color `#62eeb7`
- Constructor color dot + 3-letter code (dropdown correction stays)
- Sparkline: stepped polyline, no fill, accent color, same `areaChart.js` but styled as raw line

**Drag-and-drop JSON onto textarea stays.** Persisted import auto-loads on init (existing behavior).

### Analysis Tab (`docs/analysis.js`)

- Budget input reads initial value from `localStorage` key `userBudget` (same key as Review tab)
- Budget input updates persist back to `userBudget` so both tabs stay in sync
- Sort controls: monospace select, uppercase label
- Ranked list: hard-edge rows (`border-bottom: 1px solid #2a2a2a`), no rounded corners
- Rank number in accent color `#62eeb7`
- Over-budget entries: `opacity: 0.25`, sorted to bottom (existing logic unchanged)
- All text monospace

### Data Tab (`docs/dataStore.js`)

- Aesthetic update only: monospace font, hard edges, teal accent on delete/view buttons
- No logic changes

---

## Files Changed

| File | Change |
|---|---|
| `docs/cropper.js` | **Deleted** |
| `docs/app.js` | Remove cropper import + case, update VIEWS, default view |
| `docs/style.css` | Full aesthetic overhaul |
| `docs/review.js` | Top bar layout, remove bulk actions, card redesign, budget filter |
| `docs/analysis.js` | Budget sync from localStorage, aesthetic update |
| `docs/dataStore.js` | Aesthetic update only |
| `docs/areaChart.js` | Style sparkline as raw stepped line (no fill) |

---

## Verification

1. Open `docs/index.html` via GitHub Pages (or local file server)
2. Nav shows `REVIEW | ANALYSIS | DATA` — no Cropper tab
3. Default view is Review tab
4. Paste/drop pipeline JSON → `LOAD JSON` → cards render in 3-column grid
5. Set budget (e.g. 100m) → over-budget cards go to bottom at 0.25 opacity, affordable cards stay full
6. Switch to Analysis tab → budget field pre-populated with same value
7. Change budget in Analysis → persists back (Review tab reflects it on next load)
8. All text is monospace, no rounded corners anywhere, accent color is teal `#62eeb7`
9. Data tab shows existing datasets with terminal styling
