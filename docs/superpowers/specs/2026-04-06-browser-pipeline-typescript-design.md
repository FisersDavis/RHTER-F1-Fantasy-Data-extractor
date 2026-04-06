# Browser Pipeline + TypeScript Migration Design

**Date:** 2026-04-06
**Status:** Approved

## Context

The project currently requires users to run a local Python pipeline (Stages 0–4) before the web app is useful. The goal of this change is to eliminate that local Python dependency entirely — a user should be able to open a web page, upload a screenshot, and receive structured data ready for review and analysis, with no local tooling required.

The Python pipeline is being replaced by equivalent browser-side logic using the Canvas API and the Gemini Flash REST API (called directly from the browser using the user's own API key). The entire codebase is migrating from plain JavaScript to TypeScript to catch type errors at compile time.

LlamaCloud is dropped in this version. The 5–7 minute extraction time (72 crops at Gemini Flash's 15 req/min free tier) is an accepted trade-off for zero hosting cost and zero server complexity.

---

## Goals

- Upload screenshot → get structured JSON → review and analyse, all in the browser
- No server, no Python, no local tooling required by end users
- TypeScript throughout for compile-time type safety
- esbuild for fast compilation (watch mode in dev, single build for deploy)
- GitHub Pages compatible (static files only)
- API keys stored in user's localStorage only, never sent to any server
- Support 1–3 users, each with their own Gemini API key

---

## Non-Goals

- LlamaCloud integration (dropped — no browser SDK)
- Multi-user accounts or authentication
- Server-side processing of any kind
- Real-time collaboration
- Mobile support (desktop browser only)

---

## Architecture

### Pipeline stages in the browser

```
Screenshot upload (File input)
  ↓
[Stage 0] Canvas crop → 72 ImageBitmap objects
  ↓
[Stage 1] Canvas preprocess → invert, 3× upscale, contrast boost (per crop)
  ↓
[Stage 2] Gemini Flash extraction → rate-limited queue, 15 req/min
           └─ two-pass: run each crop once, rerun flagged (~10%) a second time
           └─ user's API key from localStorage, sent directly to Google
  ↓
[Stage 3] Canvas color extraction → Lab Delta-E matching against 11 constructor refs
  ↓
[Stage 4] Validation → range, monotonicity, driver, constructor checks
  ↓
Review tab (already built) → Analysis tab (already built)
```

### Build tooling

```
src/          ← TypeScript source (author here)
docs/         ← Compiled JS output + index.html + style.css (GitHub Pages serves this)
```

- **esbuild** compiles and bundles `src/` → `docs/app.js`
- `npm run dev` — watch mode, auto-rebuilds on save
- `npm run build` — single production build before `git push`
- `tsconfig.json` with strict mode enabled

---

## File Structure

All existing JS files migrate to TypeScript. New files added for pipeline stages.

### New source files

| File | Responsibility |
|---|---|
| `src/cropper.ts` | Image upload UI, Canvas API grid overlay, crop into 72 `Blob` objects |
| `src/preprocessor.ts` | Per-crop Canvas pipeline: invert pixels, 3× upscale via `drawImage`, contrast boost |
| `src/extractor.ts` | Gemini Flash API client, rate-limit queue (15 req/min), two-pass orchestration, response parser |
| `src/colorExtractor.ts` | Canvas `getImageData` pixel sampling, RGB→Lab conversion, Delta-E nearest-constructor match |
| `src/validator.ts` | Range checks, monotonicity, driver validation, constructor validation, flag reasons |
| `src/settingsPanel.ts` | Gemini API key input, stored to localStorage, never logged or transmitted elsewhere |
| `src/pipelineOrchestrator.ts` | Wires stages 0–4 together, drives progress bar, surfaces flagged crops to review tab |

### Migrated source files (JS → TS)

| File | Notes |
|---|---|
| `src/app.ts` | Navigation, state, localStorage persistence |
| `src/review.ts` | Inline editing, budget filter, card grid |
| `src/analysis.ts` | Kelly scoring, ranked list |
| `src/dataStore.ts` | Import/export, schema validation, dataset CRUD |
| `src/areaChart.ts` | SVG sparkline renderer |

### Shared types file

| File | Responsibility |
|---|---|
| `src/types.ts` | Central `ViolinCrop`, `Header`, `Percentiles`, `Driver`, `Constructors` interfaces matching the existing JSON contract |

---

## Data Flow and Contracts

The per-crop JSON schema is unchanged from the Python pipeline output. `src/types.ts` encodes it as TypeScript interfaces so every stage is type-checked against the same contract.

```ts
interface ViolinCrop {
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
```

The `importJSON()` function in `dataStore.ts` already validates this schema at import time — it continues to work unchanged for users who manually import Python-generated JSON.

---

## API Key Security

- User enters Gemini API key in `settingsPanel.ts` once
- Stored in `localStorage` under a namespaced key (e.g. `rhter_gemini_key`)
- Read at extraction time, included in the `Authorization` header of direct `fetch()` calls to `https://generativelanguage.googleapis.com`
- **Never sent to any server owned by this project**
- **Never logged, never interpolated into URLs, never stored in session history**
- Key is cleared from memory after the extraction queue completes
- Risk: `localStorage` is readable by any JS on the same origin — acceptable for a hobby tool with no third-party scripts on GitHub Pages

---

## Rate Limiting and Progress

- `extractor.ts` implements a token-bucket queue: max 15 requests/minute
- First pass: 72 crops ≈ 5 minutes
- Second pass (flagged crops only, ~10%): ≈ 1 additional minute
- Progress bar shown in the UI: "Extracting crop 14 of 72…"
- Each crop result is saved to localStorage incrementally — if the user closes the tab mid-run, progress is not lost
- Failed crops after two passes are surfaced in the Review tab with a `confidence: 'low'` badge for manual correction

---

## Color Extraction (Stage 3 — browser port)

The Python k-means approach is replaced with a simpler nearest-neighbor match:

1. Canvas `getImageData()` on the middle 40% height × 80% width of the (non-inverted) crop
2. Filter pixels: keep colored (saturation > 0.5 in HSL) and bright white (max channel > 200, saturation < 0.15)
3. Average the foreground pixel colors → one candidate RGB per crop half (left violin, right violin)
4. Convert candidate RGB → Lab via standard sRGB → Lab transform
5. Delta-E (CIE76) against 11 constructor reference colors from `config.ts`
6. Assign cn1 (left) and cn2 (right) to the nearest constructor

This removes the scikit-learn dependency and produces equivalent results for the 11-color lookup table.

---

## Git Strategy

This is a significant architectural shift. It is developed on a dedicated branch:

```
git checkout -b feat/browser-pipeline-typescript
```

The `main` branch retains the working Python + plain JS version until the browser pipeline is validated end-to-end. Merge to `main` only after at least one successful full run (72 crops extracted, reviewed, analysed) on the new branch.

---

## Build Setup (package.json)

```json
{
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

`tsconfig.json` targets ES2020, strict mode on, `noImplicitAny: true`, `strictNullChecks: true`.

---

## Verification

End-to-end test before merging to `main`:

1. `npm run build` completes with zero TypeScript errors
2. Open `docs/index.html` in browser (or via `npx serve docs`)
3. Enter a valid Gemini API key in Settings
4. Upload a real RHTER screenshot (2000×1124px)
5. Grid overlay aligns to violin columns — confirm visually
6. Click "Run Pipeline" — progress bar advances, no console errors
7. After completion: 72 crops visible in Review tab, ~10% flagged with `confidence: low`
8. Manually correct 2–3 flagged crops — changes persist on refresh
9. Open Analysis tab — Kelly scores render correctly
10. Export dataset JSON — schema matches existing `ViolinCrop[]` contract
11. Import that JSON into a fresh session — `importJSON()` accepts it without errors
