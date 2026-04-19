# RHTER F1 Fantasy — Wizard UI Implementation Design
**Date:** 2026-04-19  
**Branch:** feat/browser-pipeline-typescript  
**Status:** Approved for implementation

---

## Context

The project has a fully working TypeScript data pipeline (crop → extract → validate → store) but the current UI is a 5-tab navigation shell with wrong visual identity (green accent, Courier New font). A high-fidelity design handoff exists at `design_handoff/` (README.md spec + RHTER App.html prototype + wireframes.html). This spec defines the full replacement of the UI layer to match that design — a 3-step wizard with correct visual identity, built in TypeScript + Tailwind CSS standalone CLI.

**Objective:** Raw RHTER screenshot → confident team pick in under 2 minutes, with a UI that matches the design handoff pixel-for-pixel.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Navigation model | Full 3-step wizard (Upload → Review → Analysis) | Matches design handoff; no tab debt |
| API key entry | Inline on Upload step | Appears only when key not set; collapses once saved |
| Framework | Vanilla TypeScript (no React) | Existing codebase; no bundler needed |
| Styling | Tailwind CSS standalone CLI | Custom tokens, zero npm, GitHub Pages compatible |
| Approach | Big-bang UI rewrite | Pipeline logic already decoupled; clean separation |

---

## Architecture

### New files
```
src/ui/
  wizardShell.ts       — chrome (nav, step indicator, footer), step state, localStorage
  uploadStep.ts        — Upload screen
  reviewStep.ts        — Review screen (DOM only; logic stays in review.ts)
  analysisStep.ts      — Analysis screen (DOM only; logic stays in analysis.ts)

tailwind.config.js     — all custom design tokens
src/input.css          — @tailwind base/components/utilities only
docs/style.css         — Tailwind compiled output (gitignored build artifact)
```

### Replaced
```
src/app.ts             → replaced by wizardShell.ts as entry point
docs/index.html        → updated: Space Mono CDN link, loads app.js + style.css
```

### Unchanged (pipeline/data logic)
```
src/cropper.ts, extractor.ts, pipelineOrchestrator.ts,
src/preprocessor.ts, validator.ts, colorExtractor.ts,
src/dataStore.ts, review.ts (logic only), analysis.ts (logic only),
src/types.ts, config.ts
```

**Key principle:** `review.ts` and `analysis.ts` keep all data/calculation logic. Their DOM-building code is stripped and moved into `reviewStep.ts` / `analysisStep.ts`.

---

## Tailwind Config & Design Tokens

**File:** `tailwind.config.js`

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

**Google Fonts:** `<link>` to Space Mono 400/700 in `docs/index.html`. No npm.

---

## Wizard Shell (`wizardShell.ts`)

### State (persisted to localStorage on every change)
```typescript
type WizardState = {
  step: 0 | 1 | 2        // Upload | Review | Analysis
  budget: number
  pickedTeamId: number | null
  sortKey: 'kelly' | 'p50' | 'p95' | 'budget'
}
```

### Top navigation bar (sticky, `bg-bg border-b border-border px-[40px] py-[14px]`)
- **Left:** `RHTER` (`font-mono font-bold text-[13px] tracking-[0.1em]`) + race context (`text-[8px] text-muted`)
- **Right:** BUDGET / TEAMS / FLAGS key-value pairs
  - FLAGS: `text-accent` if count > 0, hidden entirely on step 0
  - No gear icon (API key handled inline on Upload)

### Step indicator (below nav, centered, 3 items + connecting lines)
- **Done:** checkmark SVG, `border-muted text-muted`
- **Active:** `bg-white text-bg` number box, `text-text` label
- **Pending:** `border-border text-border`
- Connecting lines: `bg-border` → `bg-muted` when left step is done

### Content area
`wizardShell.ts` renders chrome, then calls `uploadStep.render()`, `reviewStep.render()`, or `analysisStep.render()` into `<main>` based on current step.

Step transitions via events:
- `PIPELINE_COMPLETE` → advance step 0 → 1
- `DATA_APPROVED` → advance step 1 → 2

### Footer (sticky bottom, `bg-bg border-t border-border px-[40px] py-[14px]`)
- Left: `RHTER // F1 FANTASY ANALYSIS TOOL`
- Right: `MODEL: KELLY CRITERION // 2026 SEASON`
- Both: `text-[8px] text-muted uppercase tracking-[0.18em] font-mono`

---

## Upload Step (`uploadStep.ts`)

### API key card (shown when no key in localStorage)
- Inline card above drop zone
- `<input type="text">` — bottom-border only (`border-b border-border`), `font-mono text-[12px]`, placeholder `GEMINI API KEY`
- Save button: ghost (`border border-accent text-accent`)
- Collapses on save; drop zone appears

### Drop zone
- Min-height 360px, `border border-dashed border-border bg-bg1`
- Center column: upload icon + `DROP SCREENSHOT HERE` (label) + `or click to browse` (`text-dim`)
- **States:**
  - Idle: `border-border`
  - Dragging: `border-white bg-bg2 transition-colors duration-150`
  - Loading: drop zone replaced by progress bar section

### Progress bar
- Full-width track `bg-bg2`, fill `bg-accent`, `transition-[width] duration-[250ms] ease-linear`
- Phase label above: `UPLOADING → PARSING ROWS → VALIDATING → FINALISING`
  - `text-[9px] uppercase tracking-[0.18em] text-dim font-mono`
- Fill turns `bg-white` at 100%, then auto-advances to step 1

### Demo button
- Below drop zone: `SIMULATE WITH DEMO DATA`
- Ghost: `border border-border text-dim hover:border-text hover:text-text`

### Info grid (3 columns, `gap-8`, below demo button)
- `WHAT HAPPENS NEXT` — pipeline stage list
- `EXTRACTION TIME` — `~90 seconds for 72 crops`
- `LAST SESSION` — date + teams count from localStorage, or `NO PREVIOUS SESSION`

---

## Review Step (`reviewStep.ts`)

Data/calculation logic stays in `review.ts`. This file owns DOM only.

### Budget card (full-width, 3-column grid, `bg-bg1 border border-border p-[28px]`)
- **Col 1 — Budget input:** label `BUDGET` + `<input type="number" step="0.1">`, bottom-border only, `text-[32px] font-mono font-bold`, `text-accent` underline. Commits on blur or Enter → triggers table re-filter.
- **Col 2 — Teams in budget:** label `TEAMS IN BUDGET` + large count, updates dynamically
- **Col 3 — Extraction stats:** `TEAMS PARSED · FLAGGED · CONFIDENCE` label/value pairs

### Table toolbar
- Left: flag count label — `text-accent` if > 0, `text-dim` if 0
- Right: `[⚑ FLAGGED ONLY]` / `[ALL ROWS]` toggles — active `text-text`, inactive `text-muted`

### Table (8 columns)
`grid-template-columns: 44px 84px 1fr 72px 72px 72px 76px 100px`  
Columns: `ROW · BUDGET · DRIVERS+CONSTRUCTORS · P50 · P75 · P95 · KELLY · STATUS`

- **Header:** `text-[9px] uppercase tracking-[0.18em] text-muted border-b border-border`
- **Normal row:** `bg-bg1 border-b border-border hover:bg-bg2`
- **Flagged row:** `border-l-2 border-accent bg-accent-dim`
  - P95 cell: value + `⚑ text-accent`
  - STATUS: `[EDIT]` (`border-accent text-accent`) + `[OK]` (`border-border text-dim`)
- **Inline edit panel** (expands below flagged row):
  - `bg-[#120a08] border-l-2 border-accent p-[16px]`
  - Number inputs for P50 / P75 / P95 / KELLY, bottom-border only
  - `[CONFIRM VALUES]` — closes panel, marks confirmed, removes flag

### Bottom action bar (sticky, `bg-bg border-t border-border`)
- Left: `[← BACK]` ghost button
- Right: flag warning (if unresolved) + `[APPROVE DATA + CONTINUE →]`
  - Disabled (`opacity-30 cursor-not-allowed`) until all flags confirmed

---

## Analysis Step (`analysisStep.ts`)

Data/ranking logic stays in `analysis.ts`. This file owns DOM only.

### Controls bar (`bg-bg1 border border-border p-[16px]`)
- **Left:** MODEL selector — `KELLY` filled (`bg-accent text-white`), others ghost 30% opacity
- **Right:** SORT BY tabs — `KELLY SCORE · P50 XPTS · P95 CEILING · BUDGET`
  - Active: `text-text border-b border-accent` + `▶ ` prefix
  - Inactive: `text-muted`
  - Sort change re-ranks instantly

### Comparative Distribution Matrix

The entire ranked list (including top pick card) operates in a shared coordinate system. The **top pick card defines the master scale**: its P95 value = 100% width. All other rows normalize against this same maximum.

**Global guide rails** (absolute positioned behind all rows, `absolute inset-0 pointer-events-none`):
- P5 & P95: `border-l border-white/5`
- P25 & P75: `border-l border-white/10`
- P50: `border-l border-white/20`

**Guide rail header row** (above list, labels P5 · P25 · P50 · P75 · P95):
- `text-[8px] text-muted font-mono uppercase`
- Positioned to align with guide rail x-positions

**Row z-index:** guide rails at `z-0`, row backgrounds at `z-10` using `bg-transparent` for hover to preserve guide rail visibility. Hover state: `bg-white/[0.02]` (transparent enough to show guides through).

### Distribution bar (inside each row's LINEUP column)

Within a `relative` container that maps to 0–100% of the grid width:

- **Whisker** (P5→P95): `absolute h-[1px] bg-muted/40` — left% = P5/max, width% = (P95-P5)/max
- **Box** (P25→P75): `absolute h-[6px] bg-text` — positioned over whisker center — left% = P25/max, width% = (P75-P25)/max
- **Median tick** (P50): `absolute w-[2px] h-[10px] bg-white` — left% = P50/max, vertically centered over box

### Top Pick Card (`#1`, `bg-accent-dim border-l-[3px] border-accent p-[28px]`)

4-column grid, uses same distribution bar as ranked rows (same master scale):
- **Col 1:** Lineup (driver abbreviations + constructor dots `w-[8px] h-[8px]`) + distribution bar + percentile labels (`P5 · P25 · P50 · P75 · P95` — P50 `text-text`, others `text-dim text-[8px]`)
- **Col 2:** `AVG EXPECTED PTS` label + value (`text-[12px] text-dim font-mono` — supporting context)
- **Col 3:** `KELLY SCORE` label + value (`text-[36px] font-bold text-accent` — hero number)
- **Col 4:** `[PICK THIS TEAM]` — full height `bg-accent text-white`; picked state: `bg-bg3 text-text border border-accent` + `✓ PICKED`

### Ranked list (rows 2–N, 5-column grid)
`RANK · LINEUP · AVG XPTS · KELLY · PICK`

- **AVG XPTS:** `text-[12px] text-dim` (secondary)
- **KELLY:** `text-[18px] font-bold text-accent` (primary)
- **Row:** `bg-bg1 border-b border-border hover:bg-white/[0.02] transition-colors duration-100`
- **Picked row:** `border-l-2 border-accent bg-bg3`
- **PICK button:** ghost `border-border text-dim` → `border-accent text-accent ✓ PICKED`
- Only one team picked at a time; picking new deselects previous
- `pickedTeamId` persisted to localStorage via `wizardShell.ts`

---

## Constructor Dots

Team color dots: `w-[8px] h-[8px] rounded-full inline-block` — color from `team.*` tokens.  
Used in lineup display only. Never used as text color or fill anywhere else.  
`rounded-full` is the only intentional exception to the global `border-radius: 0` rule — dots must be circles.

---

## Build Setup

**Tailwind standalone CLI:**
```bash
# Download once
curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe
mv tailwindcss-windows-x64.exe tailwindcss.exe

# Dev watch
./tailwindcss.exe -i src/input.css -o docs/style.css --watch

# Production build
./tailwindcss.exe -i src/input.css -o docs/style.css --minify
```

**`src/input.css`:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**`docs/index.html` additions:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script type="module" src="app.js"></script>
```

---

## Verification

1. Open `docs/index.html` in browser — confirms Space Mono loads, dark bg renders, no Courier New
2. Upload a real RHTER screenshot — confirms progress bar phases, auto-advance to Review
3. Upload with no API key set — confirms inline key card appears, collapses on save
4. In Review: change budget — confirms TEAMS IN BUDGET updates live
5. In Review: confirm all flags — confirms APPROVE button enables, advances to Analysis
6. In Analysis: verify guide rails visible through row hover states
7. In Analysis: verify top pick card P95 = rightmost guide rail position; all rows scale correctly
8. Pick a team — confirm single-select, `✓ PICKED` state, persists on page reload
9. Reload page mid-session — confirms step and budget restored from localStorage
10. Run Tailwind production build — confirms `docs/style.css` has no dev bloat
