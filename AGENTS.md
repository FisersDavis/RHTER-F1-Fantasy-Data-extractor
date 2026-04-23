# Agent instructions for RHTER F1 Fantasy Data Extractor

This repo is **browser-first**: the wizard in `docs/` (built from `src/`) is the canonical app; legacy Python under `pipeline/` is maintenance-only.

## Workflow

- Local dev: `npm run dev`
- Ship / GitHub Pages: `npm run build`
- Never hand-edit `docs/app.js`; it is generated from TypeScript.

## Where to read next

- **`CLAUDE.local.md`** — architecture, module map, legacy boundary, acceptance checks, and product wording (e.g. prefer **"extracted dataset JSON"**).

## Guardrails

- Treat `src/**/*.ts` as the source of truth for behavior and UI.
- Navigate the codebase with normal search and file reads (no special index required).
