# Design Handoff: RHTER F1 Fantasy Analysis Tool — Frontend UI

## Overview
RHTER is a data analysis tool for F1 Fantasy. It ingests RHTER-generated `.webp` screenshot files (violin chart data), extracts team row data from them, lets the user review/correct that data, then surfaces a ranked analysis using the Kelly Criterion model to help pick the optimal fantasy team.

The goal is **maximum clarity and speed of decision-making** — a user should be able to go from raw image → confident team pick in under 2 minutes.

---

## About the Design Files
The files in this bundle (`RHTER App.html`, `wireframes.html`) are **design references built in HTML/React** — fully interactive prototypes showing intended look, layout, and behavior. They are **not production code to ship directly**. Your task is to **recreate these designs in your existing backend/frontend stack**, using your established patterns, framework, and libraries.

The HTML prototype uses React (via CDN Babel) and plain CSS for layout. Translate the visual and interaction patterns into whatever framework your project uses (e.g. Next.js, SvelteKit, plain React, etc.).

---

## Fidelity
**High-fidelity.** The prototype is pixel-accurate with final colors, typography, spacing, and interactions. Recreate it as closely as possible using your codebase's component patterns. Do not deviate from the visual language unless your existing design system forces it.

---

## User Flow (3-Step Wizard)

```
[01 UPLOAD] → [02 REVIEW] → [03 ANALYSIS]
```

State persists to `localStorage` (current step + budget) so a page refresh returns the user to where they left off.

---

## Screen 1 — UPLOAD

### Purpose
User drops or selects a `.webp` RHTER screenshot. The system extracts team data automatically and advances to Review.

### Layout
- Full-viewport centered column, max-width 840px, `margin: 0 auto`
- Drop zone: full-width bordered rectangle, min-height 360px, flex column centered, dashed border `#2a2a2a`
- Below drop zone: 3-column info grid (What Happens Next / Extraction Time / Last Session), gap 1px, borders `#222`

### Drop Zone States
| State | Border | Background | Contents |
|-------|--------|------------|----------|
| Idle | `1px dashed #2a2a2a` | `#111` | Upload icon + label + SELECT FILE button |
| Dragging | `1px solid #ffffff` | `#161616` | Same, icon/text brightens |
| Loading | `1px dashed #2a2a2a` | `#111` | Filename + animated progress bar |
| Complete | — | — | Auto-advance to Review |

### Progress Bar (during extraction)
- Track: `height: 2px`, `background: #222`
- Fill: `background: #e8401c` while loading, `background: #fff` at 100%
- Width animates from 0→100% via JS steps
- Label below: left = current phase (UPLOADING / PARSING ROWS / VALIDATING / FINALISING), right = percentage

### Typography
- Drop zone headline: `Space Mono`, 11px, `letter-spacing: 0.18em`, uppercase, `#e8e8e8`
- Sub-labels: 9px, `#666`
- Info grid labels: 9px, `letter-spacing: 0.18em`, `#444`
- Info grid values: `Space Mono`, 10px, `#666`, `line-height: 1.9`

### "Simulate with demo data" link
- Ghost button at bottom, triggers the same extraction simulation with mock filename
- Used for demo / dev testing

---

## Screen 2 — REVIEW

### Purpose
User sets their budget limit (number input), reviews all extracted rows, and resolves any flagged anomalies before advancing to Analysis.

### Layout
- Max-width 1100px, `margin: 0 auto`
- Budget card (full width) → Table toolbar → Column headers → Row list → Bottom action bar

### Budget Card
- Border: `1px solid rgba(232,64,28,0.4)`, background `rgba(232,64,28,0.12)`
- 3-column grid: Budget input / Teams in budget count / Extraction stats
- Budget input:
  - `<input type="number" step="0.1">`
  - Font: `Space Mono`, 32px bold, `color: #fff`
  - No box — only a bottom border: `1px solid #e8401c`
  - Background transparent
  - On blur or Enter: parse float, validate > 0, update budget state
  - Teams outside budget are silently excluded from Analysis — this is communicated in the sub-label

### Budget card columns
1. **Budget input** — label "SET YOUR BUDGET LIMIT", number input, sub-label "teams over this will be hidden in analysis"
2. **Teams count** — label "TEAMS IN BUDGET", `{eligible} / {total}` in 28px bold, sub "N teams above limit"
3. **Extraction stats** — `Teams parsed / Flagged / Confidence` as key-value pairs

### Table Column Headers
`ROW · BUDGET · DRIVERS + CONSTRUCTORS · P50 · P75 · P95 · KELLY · STATUS`
Grid: `44px 84px 1fr 76px 76px 76px 72px 100px`
Font: 8px, `letter-spacing: 0.18em`, color `#444`

### Normal Row
- Grid matches header columns
- Background: `#111`, hover: `#161616`
- Top border: `1px solid #222`
- Left border: `2px solid transparent` (reserved for flagged highlight)
- ROW number: 9px, padded to 3 digits, color `#444`
- BUDGET: 10px mono
- LINEUP: team color dots (8px circles, colors from team palette below) + driver names as `LEC(2X) · LAW · OCO · BEA · BOT`, 9px, `#666`
- P50/P75/P95/KELLY: 10px mono
- STATUS: "CONFIRMED" label, 8px, `#2a2a2a`

### Flagged Row
- Left border: `2px solid #e8401c`
- Background: `rgba(232,64,28,0.12)`
- Top border: `1px solid rgba(232,64,28,0.4)`
- P95 column shows value + `⚑` symbol in `#e8401c`
- STATUS column: `[EDIT]` button (danger variant) + `[OK]` button (outline)
- Clicking `[EDIT]` expands an inline edit panel below the row
- Clicking `[OK]` marks the row confirmed (removes flag)

### Flagged Row Edit Panel (expanded)
- Background: `#120a08`, left border `2px solid #e8401c`
- Shows flag reason text in `#e8401c`
- Number inputs for P50, P75, P95, KELLY — each 80px wide, `background: #161616`, border `1px solid #222`
- `[CONFIRM VALUES]` fill button closes panel and marks row confirmed

### Table Toolbar
- Background `#161616`, border `1px solid #222`
- Left: `[⚑ FLAGGED ONLY]` toggle button + `[ALL ROWS]` toggle
- Right: flag count label — red if flags exist, muted if clear

### Bottom Action Bar
- `[← BACK]` outline button left
- Right: flag count warning label (if unresolved) + `[APPROVE DATA + CONTINUE →]` fill button
- Fill button is `disabled` (opacity 0.35, not-allowed cursor) if any flags remain unresolved

---

## Screen 3 — ANALYSIS

### Purpose
User sees all eligible teams ranked by selected model/sort. They pick their team.

### Layout
- Max-width 1100px
- Controls bar (model + sort selector) → Top pick card → Ranked list

### Controls Bar
- Background `#161616`, border `1px solid #222`
- Left: MODEL selector (Kelly is active/fill, others ghost + 30% opacity) + divider + SORT BY tabs
- Right: "ELIGIBLE TEAMS" count + budget label

### Sort Tabs
- Plain `<button>` elements, no background/border
- Active: `color: #fff`, `border-bottom: 1px solid #e8401c`
- Inactive: `color: #444`, `border-bottom: 1px solid transparent`
- Active sort prefixed with `▶ `
- Options: KELLY SCORE · P50 XPTS · P95 CEILING · BUDGET

### Top Pick Card (#1)
- Border: `1px solid rgba(232,64,28,0.4)`, left border `3px solid #e8401c`
- Background: `rgba(232,64,28,0.12)`
- 4-column grid: `1fr 160px 120px 100px`
  1. **Lineup**: constructor dots + names + driver list + budget · Distribution bar (8px tall) + percentile labels
  2. **Avg Expected Pts**: label + 28px bold number
  3. **Kelly Score**: label + 36px bold number in `#e8401c`
  4. **Pick button**: `[PICK THIS TEAM]` fill, large. On click: changes to `✓ PICKED` state with danger border styling

### Distribution Bar
- Track: `height: Npx`, `background: #1c1c1c`, full width
- IQR box (P25→P75): `background: #222` (normal) or `#2a2a2a` (dim/muted for non-top rows)
- Whisker (P5→P95): `height: 20%` of track, vertically centered, `background: #444`
- Median line: `width: 2px`, height = track + 6px (overflows top/bottom), `background: #fff` (normal) or `#888` (dim)
- All positions calculated as `((value - 50) / (350 - 50)) * 100%`

### Percentile Labels (below bar, top pick only)
- 5 labels: P5 · P25 · P50 · P75 · P95
- P50 in white, others in `#888` / `#444`
- Font: 7-9px Space Mono

### Ranked List (rows 2–20+)
Column grid: `40px 1fr 120px 80px 80px`
- RANK (2-char padded, `#888`) · LINEUP (dots + names + distribution bar 4px tall, dim) · AVG XPTS (13px bold) · KELLY (15px bold, `#888`) · PICK button
- Row background: `#111`, hover `#161616`
- Picked row: left border `2px solid #e8401c`, background `#1c1c1c`, button changes to "✓ PICKED" danger variant

---

## Shared Chrome

### Top Navigation Bar
- `position: sticky; top: 0; z-index: 50`
- Background `#080808`, border-bottom `1px solid #222`, padding `14px 40px`
- Left: "RHTER" (13px, bold, `letter-spacing: 0.1em`) + race context label (8px, `#444`)
- Right: BUDGET / TEAMS / FLAGS key-value pairs — FLAGS turns `#e8401c` if > 0
- Values shown only from Step 2 onwards

### Step Indicator
- 3 items connected by 1px lines (`width: 48px`)
- Each item: 22×22px box + label
- Done (past): checkmark SVG, muted colors
- Active: white box background, black number inside, white label
- Pending: border `#222`, number in `#222`, label in `#222`

### Footer
- Background `#080808`, border-top `1px solid #222`, padding `12px 40px`
- Two 8px labels: "RHTER // F1 FANTASY ANALYSIS TOOL" and "MODEL: KELLY CRITERION // 2026 SEASON"

---

## Design Tokens

### Colors
```
bg:          #0a0a0a   (page background)
bg1:         #111111   (card/panel background)
bg2:         #161616   (hover states, toolbar backgrounds)
bg3:         #1c1c1c   (subtle fills)
border:      #222222   (default border)
border2:     #2a2a2a   (secondary borders, IQR fill)
muted:       #444444   (labels, row numbers)
sub:         #666666   (secondary text)
dim:         #888888   (tertiary text)
text:        #e8e8e8   (body text)
white:       #ffffff   (primary emphasis)
accent:      #e8401c   (flags, top pick, CTAs, Kelly score)
accentDim:   rgba(232,64,28,0.12)   (flagged/top pick background)
accentBorder:rgba(232,64,28,0.40)   (flagged/top pick border)
```

### Team Colors (constructor dots only — not used elsewhere)
```
MER: #06d3bf    FER: #dd1818    RBR: #1e41ff    MCL: #ff6700
AMR: #006b3c    WIL: #005aff    ALP: #ff87bc    HAA: #b6babd
KIC: #52e252    SAU: #9b0000
```

### Typography
```
Primary font:  Space Mono (monospace) — ALL text
Weights used:  400 (regular), 700 (bold)
Italic:        400 italic — not used in UI

Label (uppercase headers):  9px, letter-spacing 0.18em, uppercase
Body mono:                  10-12px, letter-spacing 0
Large numbers:              18-36px bold
Step/tag labels:            8-9px, letter-spacing 0.15-0.2em
```

### Spacing
```
Page padding:       40px horizontal
Section gap:        24-40px
Card padding:       16-28px
Row padding:        10-12px 16-20px
Element gap:        8-12px
Border width:       1px (default), 2-3px (accent highlights)
```

### Borders & Radius
- **Zero border radius throughout** — all elements are sharp rectangles
- Border style: `1px solid` (default), `1px dashed` (drop zones, secondary)

### Transitions
- Background color: `0.1s`
- Border color: `0.12-0.15s`
- Progress bar width: `0.25s ease`
- Step indicator: `0.2s`

---

## Interactions & Behavior

### Upload
- Drag-over: border becomes `1px solid #fff`, background lightens to `#161616`
- Drop / file select: triggers extraction simulation (or real backend call)
- Progress updates: backend should stream progress events; UI maps them to label phases
- On complete: auto-advance to Review after 600ms delay

### Review
- Budget input: `type="number"`, `step="0.1"` — commit on blur or Enter key
- Budget change: instantly recalculates "teams in budget" count
- Flag rows: sorted/surfaced, expand on EDIT click, dismiss on OK click or CONFIRM VALUES
- APPROVE button: disabled until `flagged.length === 0`
- Passing budget + approved teams array into Analysis state

### Analysis
- Sort change: re-ranks list instantly (no loading state)
- PICK button: toggles picked state, only one team picked at a time
- Picked state: row gets left accent border + button changes label

---

## State Shape (suggested)

```ts
type Driver = { name: string; multiplier: string | null }
type Constructor = { team: string; color: string }

type TeamRow = {
  id: number
  row: number
  budget: number
  drivers: Driver[]
  constructors: Constructor[]
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
  avg_xpts: number
  kelly: number
  flagged: boolean
  flagReason: string | null
  confirmed: boolean
}

type AppState = {
  step: 0 | 1 | 2         // persisted to localStorage
  budget: number           // persisted to localStorage
  teams: TeamRow[]
  pickedTeamId: number | null
  sortKey: 'kelly' | 'p50' | 'p95' | 'budget'
  model: 'kelly'           // expandable later
}
```

---

## Assets & Icons
- No external icon library — all icons drawn as inline SVG
- Upload arrow icon: simple up-arrow with horizontal base line
- Checkmark: `<polyline points="1.5,5 4,7.5 8.5,2.5">` in a 10×10 viewBox
- No images, logos, or raster assets — purely typographic/geometric

---

## Files in This Package
| File | Description |
|------|-------------|
| `RHTER App.html` | Full hi-fi interactive prototype — primary reference |
| `wireframes.html` | 3 wireframe explorations (A/B/C) — variation B was selected |
| `design_handoff/README.md` | This document |

---

## Notes for Implementation
1. **No rounded corners anywhere** — `border-radius: 0` globally
2. **Team colors are used only as dots** (8-10px circles) — never as fills, backgrounds, or text colors
3. **Monochrome first**: the only non-grey color is `#e8401c` for accent + team dots
4. **Space Mono for everything** — do not mix in a second font
5. **The distribution bar is the key data viz** — implement it accurately. P25-P75 box + P5-P95 whisker + P50 median line
6. **Budget gates Analysis** — any team with `budget > limit` must be excluded before rendering the Analysis screen
7. **Kelly Criterion sort is the default** — always land on it; other models (EV, Monte Carlo) are placeholder stubs for now
8. **localStorage persistence** — save `step` and `budget` on every change; restore on load
