# Spec: Browser-Only Migration

**Date:** 2026-04-25 (retroactively authored)
**Source plan:** `C:\Users\Dave\.cursor\plans\browser-only-migration_3bc1bd58.plan.md`
**Status:** Reconstructed from executed plan
**Phases:**
- Phase 1 — Minimal-code-cut migration (todos 1–5)
- Phase 2 — GitNexus removal + agent-doc consolidation (todo 6)

---

## Goal

Make the web app the sole **active** extraction/analysis path for RHTER F1 Fantasy data, deprecate the Python pipeline as legacy without deleting it, and tighten supporting structure (docs, constants, debug ergonomics, agent docs) so future work has one obvious entry point per concern.

The success bar for the migration is "a contributor can ship a real extraction run from a browser on GitHub Pages, follow one architecture document to understand the project, and never need GitNexus or `pipeline/` to do their job."

---

## Non-goals (explicit)

These are out of scope for this migration and **must not** be touched:

- Pipeline algorithmics — `cropScreenshot`, `preprocessCrop`, `extractCrop`, `extractConstructors`, `validateCrop`, color matching, gap detection logic.
- Wizard chrome and step navigation in `src/ui/wizardShell.ts` (apart from constants if they leak in).
- Review and Analysis behaviour beyond constants — `src/ui/reviewStep.ts` and `src/ui/analysisStep.ts` keep their existing logic.
- Existing extracted-dataset import/export schema, Kelly-style ranking, persistence keys for `importedViolins` / `reviewedViolins`.
- Python pipeline source files under `pipeline/*.py` — content is **frozen** as legacy maintenance only.
- `tailwind.config.js`, `src/input.css`, the Tailwind build, and design tokens.
- The wizard's two-pass extraction / disagreement flagging behaviour.
- Phase 2 §C "broader product and code cleanup" (split out as future work).

---

## Cross-cutting guardrails

1. **`src/**/*.ts` is the source of truth.** `docs/app.js` is generated; never hand-edit. After any TS change in this migration, regenerate via `npm run build`.
2. **Browser-first wording everywhere.** Replace "pipeline JSON" with "extracted dataset JSON" in user-facing copy and prose; keep "pipeline" in code identifiers.
3. **No destructive deletions in Phase 1.** Python files, tests, and Python configuration stay in the tree. Only docs/labels change in Phase 1.
4. **Debug behaviour must be opt-in.** No code path may silently cap, sample, or alter a default user run. Defaults always equal "real run on a real screenshot".
5. **No new GitNexus dependencies.** Phase 1 must not introduce new `gitnexus` references; Phase 2 removes existing ones.

---

## Todo 1 — `unblock-browser-full-run`

> Replace hardcoded 1-crop cap with a configurable debug mode and improve run success/failure reporting for testing.

### Problem

`src/pipelineOrchestrator.ts` ships with `TEST_CROP_LIMIT = 1`, so every browser run silently stops after the first crop. Users cannot get a real 72-crop dataset, and partial completions are reported as success.

### Acceptance criteria

1. **Default run processes the full grid.** Uploading a valid screenshot with no debug toggles enabled drives the pipeline through all 72 crops (or the actual grid size if smaller; no synthetic cap remains in production code paths).
2. **Debug Mode is an explicit, persisted UI control.** A checkbox on the Upload step toggles debug mode; its state is persisted in `localStorage` and restored on reload. Debug Mode is **off by default** for first-time users.
3. **Crop-limit field appears only when debug mode is on.** When Debug Mode is off, the field is hidden (or visually disabled) and ignored. When on, a positive integer caps the run.
4. **Run-mode is visible in UI.** A line of the form `RUN MODE: FULL (72 CROPS)` or `RUN MODE: DEBUG (UP TO N CROPS)` is shown on Upload before the run and stays visible during progress updates.
5. **Run summary reports successes and failures.** After the run, the UI shows succeeded count, total planned, and a list of failed `[row,col]` coordinates. No silent partial successes.
6. **Orchestrator return shape is structured.** `runPipeline()` resolves with both the produced crops and a typed summary (`totalPlanned`, `attempted`, `succeeded`, `failed`, `failedCrops`, `debugMode`, `runMode`). The summary is what the UI renders.
7. **API key is passed in by the host, not read by the orchestrator.** The orchestrator must not read `localStorage` or any global directly for the API key.
8. **URL overrides are advanced-only and one-shot.** Optional query params (e.g. `wizard_debug=1`, `wizard_limit=N`) seed the same `localStorage` keys once at load and then behave like normal UI state. They must not bypass the UI control or hide debug state from the user.

### Expected file changes

| File | Change |
|---|---|
| `src/pipelineOrchestrator.ts` | Remove `TEST_CROP_LIMIT`. Accept `PipelineRunOptions` with `apiKey`, `debugMode`, `cropLimit`, optional `debugHooks`, optional `incrementalPersistence`. Compute `total` from `available` capped only by `cropLimit` when `debugMode` is true. Return `{ crops, summary }`. Surface `runMode` on every `onProgress` callback. |
| `src/runMode.ts` | **New file.** Export `RunMode` type, `FULL_CROP_COUNT = 72`, and `formatRunModeSubtitle(runMode, plannedTotal)` helper. |
| `src/ui/debugControls.ts` | **New file.** Build the bordered debug panel: Debug Mode checkbox, Debug crop limit number input (visible only when debug is on), optional "Save each preprocessed crop" diagnostic toggle, run-mode line. Persist to `wizard_debug_mode` / `wizard_debug_limit` / `wizard_preprocess_diag`. Parse `wizard_debug` and `wizard_limit` URL overrides once. Expose `isDebugEnabled`, `getDebugLimit`, `getRunModeSubtitle`, `getDebugHooks`. |
| `src/ui/uploadStep.ts` | Mount `createUploadDebugControls()` in the upload area. Pass `apiKey`, `debugMode`, `cropLimit`, `debugHooks` to `runPipeline`. Render `RUN MODE` subtitle in the progress section. Render summary line `RUN COMPLETE: X/Y crops succeeded (DEBUG RUN)?` and a `FAILED: ...` line listing coordinates. |
| `src/apiKeyStore.ts` | Confirmed responsibility: read/write Gemini API key in `localStorage`. Used by upload step only; orchestrator never imports it. |

### Must NOT touch

- `cropScreenshot` / `preprocessCrop` / `extractCrop` / `extractConstructors` / `validateCrop` algorithms.
- The two-pass disagreement flag (`needsReview`, `'two-pass disagreement'`).
- `src/dataStore.ts` import/export shape — only the orchestrator's interactions with `resetPipelineIncremental` / `writePipelineIncremental` / `clearPipelineIncremental` are used; their semantics stay the same.
- `src/ui/wizardShell.ts` step navigation, footer, persisted wizard step state.
- Any other `window.__*` global. Replace `window.__debugPreprocess` with the typed `debugHooks` injection.

---

## Todo 2 — `normalize-team-constants`

> Unify constructor/team constants across config, upload demo data, and analysis display modules.

### Problem

Constructor codes, RGB colours, and Lab colours are referenced from multiple modules. Demo data in the upload step and constructor swatches in the analysis step need to share the canonical list with the colour matcher.

### Acceptance criteria

1. **Single source of truth.** `src/config.ts` exports `CONSTRUCTOR_COLORS` (hex), `CONSTRUCTOR_RGB`, and `CONSTRUCTOR_LAB`, plus `TEAMS` / `CONSTRUCTOR_CODES` derived from them.
2. **All consumers import from `src/config.ts`.** `src/ui/demoData.ts`, `src/ui/analysisStep.ts`, and the colour-extraction module use the exported constants — no hand-rolled hex strings or RGB tuples in those files.
3. **No duplicated lists.** A search for `MCL.*MER.*RED` (or similar inline tuples) outside `src/config.ts` returns no results in active code.
4. **Codes match the 11 F1 2026 constructors documented in the design spec:** MCL, MER, RED, FER, WIL, VRB, AST, HAA, AUD, ALP, CAD.

### Expected file changes

| File | Change |
|---|---|
| `src/config.ts` | Hold the canonical `CONSTRUCTOR_COLORS`, `CONSTRUCTOR_RGB`, `CONSTRUCTOR_LAB`, `TEAMS`, `CONSTRUCTOR_CODES`. |
| `src/ui/demoData.ts` | Import `CONSTRUCTOR_RGB` from `../config.js` and use it to build constructor pairs in demo data. |
| `src/ui/analysisStep.ts` | Import `CONSTRUCTOR_COLORS` from `../config.js`; use it for the swatch dot fill (`background = CONSTRUCTOR_COLORS[team] ?? '#888'`). |
| `src/colorExtractor.ts` | Read Lab references from `CONSTRUCTOR_LAB` only. |

### Must NOT touch

- `GRID_COLS = 24`, `GRID_ROWS = 3`, or any layout/calibration constants.
- The Delta-E or k-means logic.
- The driver list, abbreviations, or driver-set construction in demo data.
- Constructor names/labels presented to the user (codes only are normalised; this spec does not introduce a `LABELS` map).

---

## Todo 3 — `deprecate-python-path`

> Mark Python dependencies and tests as legacy; remove Python as the active user workflow.

### Problem

The Python pipeline still appears as the primary path in some docs and as live infrastructure (requirements, tests). It must continue to exist for archival use but must stop being an implicit default.

### Acceptance criteria

1. **`pipeline/requirements.txt` is annotated as legacy** at the top of the file (comment header making clear the active path is the browser app).
2. **`tests/README.md` is added** describing the suite as "Legacy Python Tests" kept for legacy maintenance only, with explicit instruction to run only when intentionally modifying legacy Python code.
3. **No Python file is deleted, renamed, or moved** in this todo. Test files, pipeline scripts, and `pipeline/__main__.py` remain functional for anyone who explicitly chooses to use them.
4. **No Python invocation is wired into `package.json` scripts, README, or CI** as part of the standard developer or user workflow.

### Expected file changes

| File | Change |
|---|---|
| `pipeline/requirements.txt` | Prepend two comment lines marking the file as legacy-only and pointing to the browser app as the active extraction path. Keep all listed dependencies. |
| `tests/README.md` | **New file.** 5–10 lines: title "Legacy Python Tests", state browser-only is primary, instruct readers to run the suite only when working on legacy Python code. |

### Must NOT touch

- Any `pipeline/*.py` source file.
- Any `tests/test_*.py` source file.
- `.venv/`, `Lib/`, `Scripts/`, `pyvenv.cfg`, `.pytest_cache/`.
- The `.gitignore` Python section (still gitignores `__pycache__`, `*.pyc`, `.venv/`).

---

## Todo 4 — `rewrite-core-docs`

> Update `CLAUDE.local.md` and user-facing wording to browser-only architecture and testing guidance.

### Problem

`CLAUDE.local.md` and surrounding docs still describe Python as the primary architecture and use the term "pipeline JSON". The architecture document needs to reflect the browser-first reality and serve as the single source of architectural truth.

### Acceptance criteria

1. **`CLAUDE.local.md` declares browser-first explicitly.** It states the canonical runtime is the web app shipped from `docs/` built from `src/`, and that Python is legacy maintenance-only.
2. **Architecture table lists browser as the active runtime** for upload, preprocess, extraction, constructor color mapping, validation, persistence, and analysis.
3. **Active source layout is enumerated**, including `runMode.ts`, `pipelineOrchestrator.ts`, `ui/debugControls.ts`, `ui/uploadStep.ts`, `ui/reviewStep.ts`, `ui/analysisStep.ts`, `dataStore.ts`, `config.ts`, `apiKeyStore.ts`.
4. **Wording convention is documented:** prefer "extracted dataset JSON" over "pipeline JSON".
5. **Testing gate is documented**: local dev loop (`npm run dev`), required acceptance checks (full 72-crop run, debug cap, run summary, persistence to Analysis), and GitHub Pages validation.
6. **Legacy boundary clause is present**: `pipeline/` and `tests/test_*.py` are legacy artifacts and are not relocated or deleted by this work.
7. **`docs/DEBUGGING.md` is created** describing Debug Mode, debug crop limit, save-each-preprocessed-crop diagnostic, URL query overrides (`wizard_debug`, `wizard_limit`), and the run-mode subtitle behaviour.

### Expected file changes

| File | Change |
|---|---|
| `CLAUDE.local.md` | Rewrite to browser-first architecture per acceptance criteria above. Reference `AGENTS.md` and `docs/DEBUGGING.md`. |
| `docs/DEBUGGING.md` | **New file.** End-user / developer reference for Debug Mode, the controls panel, URL overrides, and the run-mode line. |

### Must NOT touch

- `pipeline/*.py` and `tests/test_*.py` source.
- `docs/index.html` structure or assets.
- `tailwind.config.js`, `src/input.css`, or build configuration.
- Other historical specs under `docs/superpowers/specs/` (they remain as historical record).
- `AGENTS.md` and `CLAUDE.md` — those are reshaped in todo 6, not here.

---

## Todo 5 — `define-gh-pages-test-gate`

> Document and run Phase 1 acceptance checks on both local dev server and GitHub Pages.

### Problem

The plan's success bar requires that the same flow that works locally also works on GitHub Pages — there is no point shipping a browser-only path that only runs on `localhost`.

### Acceptance criteria

1. **Documented checks** in `CLAUDE.local.md`'s "Testing and deployment gate" section cover:
   - Local dev loop (`npm run dev`, upload screenshot, end-to-end Upload → Review → Analysis).
   - Full 72-crop run with Debug Mode off.
   - Debug Mode capping crop count for quick iteration.
   - Run summary reporting successes/failures and failed coordinates clearly.
   - Reviewed data persisting in `localStorage` and being available in Analysis.
2. **GitHub Pages validation steps are documented** as a separate sub-section: after `npm run build`, validate the same flow on the deployed site, confirming no localhost-only assumptions and that extracted dataset JSON import/export still works.
3. **No localhost-only API endpoints, file paths, or env reads** are introduced in `src/`. The pipeline only depends on the user-supplied API key and the static assets shipped in `docs/`.
4. **`docs/app.js` is regenerated** from the current `src/*.ts` (via `npm run build`) so the deployed bundle reflects the migration.

### Expected file changes

| File | Change |
|---|---|
| `CLAUDE.local.md` | Add or update the "Testing and deployment gate (Phase 1)" section per criteria 1–2. |
| `docs/app.js` | Regenerate via `npm run build`. Treat as build artifact, never hand-edited. |

### Must NOT touch

- Any GitHub Pages configuration outside of producing valid static assets in `docs/`.
- The API-key UX (still inline on Upload step; not introducing settings tabs or env reads).
- The legacy Python flow as a fallback path on GitHub Pages — it must not become a recommended option.
- `package.json` scripts beyond what's already there for `dev` / `build`.

---

## Todo 6 — `remove-gitnexus` (Phase 2)

> Remove GitNexus implementation and documentation; consolidate `AGENTS.md` + `CLAUDE.md` (duplicate today) into one neutral agent doc + keep or merge `CLAUDE.local.md` architecture; strip skills/index/MCP references.

### Problem

`AGENTS.md` and `CLAUDE.md` were byte-identical GitNexus rule blocks. `.claude/skills/gitnexus/`, `.gitnexus/`, `.gitnexusignore`, and `.mcp.json` add tooling weight that the project does not use after the browser-only migration. Three top-level agent files invite drift.

### Acceptance criteria

#### §A — GitNexus removal

1. **No GitNexus rule blocks** between `<!-- gitnexus:start -->` / `<!-- gitnexus:end -->` remain in any tracked file.
2. **No bundled GitNexus skills.** `.claude/skills/gitnexus/` (and any sibling `gitnexus-*` skill files) are removed from the repository.
3. **No GitNexus references in tracked source or docs.** A repo-wide search for `gitnexus`, `GitNexus`, and `gitnexus://` returns no hits in `src/`, `docs/`, top-level docs, or Cursor rules under `.cursor/rules/` (allowlist `node_modules` and lockfiles only).
4. **Local index stays out of version control.** `.gitnexus/` is either removed from the tree or confirmed gitignored. The CLI is not required to work in this repository afterwards.
5. **No CI, hook, or script invokes `gitnexus`.**

#### §B — Agent-doc consolidation

The plan recommends Option 1 (preferred, minimal-churn). Expected end state:

1. **`AGENTS.md`** is the primary, GitNexus-free agent rules file. Short: workflow commands (`npm run dev`, `npm run build`), browser-first guardrail, links to `CLAUDE.local.md` and `docs/DEBUGGING.md`. No GitNexus block.
2. **`CLAUDE.md`** is a thin pointer (3–8 lines) that says "see `AGENTS.md` for workflow / `CLAUDE.local.md` for architecture", so Claude Code users opening `CLAUDE.md` by convention are not stranded. It does not duplicate `AGENTS.md` content.
3. **`CLAUDE.local.md`** remains the architecture and testing source of truth (reshaped in todo 4).
4. **No two of the three files are duplicates** of each other after this todo.

### Expected file changes

| File | Change |
|---|---|
| `AGENTS.md` | Replace with a short, GitNexus-free workflow doc. |
| `CLAUDE.md` | Replace with a 3–8 line pointer to `AGENTS.md` and `CLAUDE.local.md`. |
| `CLAUDE.local.md` | Already reshaped by todo 4; here, ensure no GitNexus references remain. |
| `.claude/skills/gitnexus/` | Delete the directory and its skill files. |
| `.cursor/rules/*` | Remove any GitNexus-flavoured rule files (if present). |
| `.mcp.json` | Remove if it only configures GitNexus. |
| `.gitnexus/` | Remove from version control or confirm gitignored. |
| `.gitnexusignore` | Remove. |

### Must NOT touch

- `CLAUDE.local.md`'s architecture, module map, or acceptance checks (those are owned by todo 4).
- Any `src/**/*.ts` behaviour. This todo is documentation/tooling cleanup only.
- The Python `pipeline/` and `tests/` directories — Phase 2 §C ("broader product and code cleanup") is deferred and is **not** in scope for this todo.
- Each developer's global Cursor MCP server list — Phase 2 scope is the repository, not user-level Cursor settings.
- `package.json` and `tsconfig.json` (no GitNexus references expected there; do not casually rewrite them).

---

## Verification matrix

| Concern | How to verify |
|---|---|
| Full 72-crop run | Upload real screenshot with Debug Mode off; observe progress reaches 72/72 and summary reports it. |
| Debug cap | Debug Mode on, limit = 6, observe run stops at 6 and summary says `(DEBUG RUN)`. |
| Run summary failure list | Force a crop failure (e.g. invalid API key partway); confirm `FAILED: [r,c], …` line. |
| Persistence | Refresh between Review and Analysis; data still visible. |
| Constants single-source | Grep for inline RGB tuples / hex constructor colours outside `src/config.ts`. |
| Python deprecation labelling | `pipeline/requirements.txt` first line is a legacy comment; `tests/README.md` exists. |
| Doc rewrite | `CLAUDE.local.md` lists browser-first architecture; uses "extracted dataset JSON". |
| GitHub Pages | After `npm run build`, the deployed site executes a full run end-to-end. |
| GitNexus removal (Phase 2) | Repo-wide grep for `gitnexus` returns no tracked hits; `.claude/skills/gitnexus/` is gone. |
| Agent-doc consolidation | `AGENTS.md` and `CLAUDE.md` are not duplicates; `CLAUDE.md` is a thin pointer. |

---

## Out of scope (deferred to follow-up specs)

- Phase 2 §C: isolating the pipeline engine from UI side-effects, retiring legacy modules, optionally archiving/removing Python code/tests, and formalising a persistent Test/Debug mode beyond the current Upload-step controls.
- Renaming `docs/app.js` / restructuring the `docs/` build output.
- Any refactor of the two-pass extraction or constructor-colour matching beyond constant unification.
- Wizard navigation/UX changes outside the Upload step's debug panel and run summary.

---

## Migration retrospective (Phase 2 audit follow-up)

A post-migration audit identified three follow-up issues that this spec did not anticipate. They were resolved in the Phase 2 cleanup pass (see `docs/superpowers/plans/phase-2-cleanup.plan.md`); this section is the durable record.

### Over-scope deletion in commit `158ce42`

Commit `158ce42` ("Refactor and enhance documentation for agent workflows") deleted nine source files totalling ~1363 lines that this spec did not authorise. Eight were unreachable from `app.ts`; one (`src/settingsPanel.ts`) was authorised by Todo 1's API-key relocation. The full list:

| Deleted file | Lines | Status at baseline |
|---|---|---|
| `src/analysis.ts` | 178 | Dead |
| `src/review.ts` | 257 | Dead |
| `src/extractTab.ts` | 107 | Dead |
| `src/areaChart.ts` | 52 | Dead |
| `src/settingsPanel.ts` | 78 | Live — replaced by `src/apiKeyStore.ts` (Todo 1) |
| `docs/analysis.js` | 186 | Dead |
| `docs/review.js` | 296 | Dead |
| `docs/dataStore.js` | 148 | Dead |
| `docs/areaChart.js` | 59 | Dead |

The deletions did not break the active code path (`tsc --noEmit` and `npm run build` continued to pass), but the commit subject undersold the change. Future deletions of this size should land in their own commit with a subject naming the cull.

### History rewrite (Task 3, 2026-04-25)

Phase 2 Task 3 evaluated whether to scrub the 52 MB `.gitnexus/lbug` binary from history with `git filter-repo`. The decision was: **rewrote with `git filter-repo` on 2026-04-25; force-pushed `feat/browser-pipeline-typescript` to origin**.

Reasoning: the lbug blob was 54,513,664 bytes of GitNexus local index that should never have been committed; leaving it in history would have permanently inflated every clone of the repo. The branch is currently maintained by a single contributor (no shared in-flight branches to coordinate), so the force-push was safe. A mirror clone was made at `..\rhter-f1-mirror-backup.git` before rewriting.

Commands used (from the workspace root):

```powershell
git clone --mirror . ..\rhter-f1-mirror-backup.git
py -m git_filter_repo --path .gitnexus --invert-paths --force
py -m git_filter_repo --path .gitnexusignore --invert-paths --force
git remote add origin https://github.com/FisersDavis/RHTER-F1-Fantasy-Data-extractor.git
git push --force-with-lease=feat/browser-pipeline-typescript origin feat/browser-pipeline-typescript
```

Result: HEAD was rewritten from `b9e18fd191b16c754783169feb03235e624faad9` to `3684c408e75cf1813b152e1948c0d61e8f990720`. All 96 commits preserved (no commits dropped, only paths within them scrubbed). `git rev-list --objects --all | rg "\.gitnexus/lbug"` returns no matches post-rewrite.

### History rewrite, extension (Task 3b, 2026-04-25)

During Task 3, GitHub's pre-receive warning surfaced a second tracked artefact: an ~86 MB ONNX model at `undefined/.cache/huggingface/Snowflake/snowflake-arctic-embed-xs/onnx/model.onnx`, plus three small siblings (`config.json`, `tokenizer.json`, `tokenizer_config.json`). The path-traversal `undefined/` prefix indicates a buggy tool wrote its cache when its `cwd` resolved to literal `'undefined'`. The audit had not flagged this — it lacks `gitnexus` in the name — but the artefact was effectively the embedding model GitNexus tooling used.

Task 3b extended the scrub to remove `undefined/**` from history and added `undefined/` to `.gitignore`:

```powershell
py -m git_filter_repo --path undefined --invert-paths --force
git reflog expire --expire=now --all
git gc --prune=now --aggressive
# .gitignore updated to include undefined/
git push --force-with-lease=feat/browser-pipeline-typescript origin feat/browser-pipeline-typescript
```

Result: HEAD moved from `3684c408e75cf1813b152e1948c0d61e8f990720` to `e805145eafead9ce06393e352696c87bdd2c68c5` (97 commits: 96 from filter-repo + 1 fresh `.gitignore` commit). Pack size dropped from 83.66 MiB (post-Task-3) to **4.06 MiB** — a roughly 95% reduction relative to the pre-Phase-2 baseline of ~86 MiB.

### Follow-up not addressed

- The `..\rhter-f1-mirror-backup.git` mirror clone is still on disk; the user should keep it until they're satisfied no recovery is needed, then delete it manually.
- Anyone with a clone of the pre-rewrite branch (other developer machines, CI caches) must `git fetch && git reset --hard origin/feat/browser-pipeline-typescript` or re-clone. There is no automated way to detect or notify those clones.
