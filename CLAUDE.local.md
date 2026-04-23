# Project: RHTER F1 Fantasy Data Extractor

## Agent entry files

- **`AGENTS.md`** — primary agent rules: browser-first workflow, `npm run dev` / `npm run build`, do not hand-edit `docs/app.js`.
- **`CLAUDE.md`** — thin pointer for Claude Code users to `AGENTS.md` and this file.
- **`CLAUDE.local.md`** (this file) — architecture, module map, legacy boundary, acceptance checks, and product wording.

## What this is

This project is now **browser-first and browser-primary**:

1. **Web app (active path, GitHub Pages)** — upload screenshot, slice crops, preprocess in browser, extract via Gemini, review corrections, and rank lineups.
2. **Python pipeline (legacy path)** — retained only for maintenance and historical reference; not part of the standard user workflow.

The canonical runtime is the web app shipped from `docs/` and built from `src/`.

## Browser-only architecture

All active extraction stages run in-browser:

| Concern | Active runtime | Tools |
|---|---|---|
| Upload + crop slicing | Browser | Canvas API |
| Preprocess (invert/upscale/contrast) | Browser | Canvas |
| Number extraction | Browser | Gemini API |
| Constructor color mapping | Browser | TS modules |
| Validation + review | Browser | TS UI |
| Data persistence | Browser | localStorage |
| Analysis + ranking | Browser | TS UI |

### Legacy boundary

- `pipeline/` and `tests/test_*.py` are **legacy maintenance artifacts**.
- Do not treat Python as the default pipeline in docs, UX copy, or implementation plans.
- **Phase 2 §C policy:** Python and pytest files stay **in the repository** as legacy maintenance-only material (no relocation or deletion in this pass); browser work does not depend on them.

## Active source layout

- `src/app.ts` — app entry point
- `src/apiKeyStore.ts` — Gemini API key read/write in localStorage (used by the wizard upload step)
- `src/runMode.ts` — full vs debug run labels (`RunMode`, `FULL_CROP_COUNT`)
- `src/pipelineOrchestrator.ts` — browser pipeline execution (callers pass `apiKey`; optional `debugHooks` / incremental overrides)
- `src/ui/debugControls.ts` — Debug Mode, crop limit, URL overrides, optional “save each preprocessed crop” diagnostics (typed hooks; not `window.__debugPreprocess`)
- `src/ui/uploadStep.ts` — upload + run controls
- `src/ui/reviewStep.ts` — review and correction
- `src/ui/analysisStep.ts` — ranking and comparison view
- `src/dataStore.ts` — dataset import/export + persistence + pipeline incremental snapshot helpers (`pipeline_incremental` in localStorage)
- `src/config.ts` — canonical team/constructor constants

Build output:

- `docs/app.js` (generated via `npm run build`)
- `docs/style.css`
- `docs/index.html`
- **`docs/DEBUGGING.md`** — how to use Debug Mode, URL overrides, and preprocessed crop diagnostics (user and developer reference)

## Product wording conventions

- Prefer **"extracted dataset JSON"** over "pipeline JSON".
- Describe the default flow as browser-only unless explicitly discussing legacy fallback.

## Testing and deployment gate (Phase 1)

### Local developer loop

1. `npm run dev`
2. Upload a valid screenshot in the wizard.
3. Verify end-to-end flow: Upload -> Review -> Analysis.

Optional URL query overrides for the upload step (advanced): `wizard_debug=1` or `wizard_debug=true` forces Debug Mode on when the debug panel is created; `wizard_limit=<positive integer>` seeds the debug crop limit field (both are applied once at load and still persist via the same localStorage keys as the UI). Optional per-crop preprocessed PNG downloads are controlled only from the Upload debug panel (“save each preprocessed crop”) when Debug Mode is on, not via globals.

### Required acceptance checks

- Full run can process all 72 crops when Debug Mode is off.
- Debug Mode can intentionally cap crop count for quick iteration.
- Run summary reports successes/failures and failed coordinates clearly.
- Reviewed data persists in localStorage and is available in Analysis.

### GitHub Pages validation

After `npm run build`, validate the same flow on the deployed Pages site:

- Upload, extract, review, and analyze without localhost-only assumptions.
- Confirm extracted dataset JSON import/export still works.

## Change guardrails

- Keep browser modules (`src/**/*.ts`) as source of truth.
- Never edit `docs/app.js` manually; always regenerate from `src/`.
- If touching legacy Python files, label the change as legacy maintenance in notes and commits.
- Do not commit optional local index or cache directories created by old tooling under the repo root; keep them out of version control (for example via your global gitignore).
