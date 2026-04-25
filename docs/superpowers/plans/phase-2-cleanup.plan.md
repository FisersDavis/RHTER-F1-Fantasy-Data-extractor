# Phase 2 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps the post-migration audit identified — get the GitNexus index out of the tree (and optionally out of history), tidy the over-scope and cosmetic regressions, and produce committed evidence that the GitHub Pages site actually passes the Phase 1 acceptance checks end-to-end.

**Architecture:** This is a maintenance / cleanup pass — no behaviour change in `src/`. Two workstreams:
1. **Repo hygiene** (Tasks 1–5): untrack the GitNexus artefacts, decide/document `.mcp.json`, optionally scrub the 52 MB blob from history, fix the stray indent in `uploadStep.ts`, document the over-scope deletion in commit `158ce42`.
2. **GitHub Pages verification** (Tasks 6–11): run the documented Phase 1 acceptance checks against the deployed site and commit the evidence under `docs/superpowers/runs/` so the verification matrix is provably satisfied.

**Tech Stack:** Git (PowerShell on Windows), `git filter-repo` (optional), Node + npm (`npm run build`), browser dev tools, the deployed GitHub Pages app at the repo's `docs/` Pages URL.

**Branch:** `feat/browser-pipeline-typescript` (current). All commits land on this branch. The optional history rewrite in Task 3 is the only step that requires `git push --force-with-lease`; everything else is a normal push.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.gitignore` | Modify | Restore the `.gitnexus/` ignore entry that was removed in commit `926b040` |
| `.gitnexus/lbug` | Untrack (and optionally rewrite from history) | 52 MB GitNexus binary index — never belonged in version control |
| `.gitnexus/meta.json` | Untrack | GitNexus index metadata — never belonged in version control |
| `.gitnexusignore` | Untrack | Per spec §A: GitNexus tooling artefact, must be removed |
| `.mcp.json` | Decide (keep w/ doc, or remove) | Configures `forge_extension` (not GitNexus); audit flagged as undecided |
| `AGENTS.md` | Modify (only if `.mcp.json` is kept) | Add a single-line note documenting why `.mcp.json` is in the tree |
| `src/ui/uploadStep.ts:30` | Modify | Remove 4 stray leading spaces on the `saveBtn.addEventListener` line |
| `docs/app.js` | Regenerate | Build artifact — refreshed via `npm run build` after the indent fix |
| `docs/superpowers/specs/2026-04-25-browser-only-migration-design.md` | Modify (append) | Append a "Migration retrospective" section recording the over-scope deletion in commit `158ce42` |
| `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md` | Create | Committed evidence log for the five GH-Pages acceptance checks |
| `docs/superpowers/runs/screenshots/` | Create + populate | PNG evidence captured during the GH-Pages run (full, debug, failure, persistence, JSON round-trip) |

---

## Task 1: Untrack the GitNexus index and restore the gitignore entry

**Why:** Audit §A criterion 4 was violated — commit `926b040` removed `.gitnexus` from `.gitignore` and then committed `.gitnexus/meta.json` plus the 52 MB `.gitnexus/lbug` binary into the working tree. `.gitnexusignore` (10 lines) is also still tracked despite spec §A saying remove. This task gets the index out of the working tree and re-establishes the ignore so it does not return.

**Files:**
- Modify: `.gitignore`
- Untrack (delete from index, keep on disk): `.gitnexus/lbug`, `.gitnexus/meta.json`, `.gitnexusignore`

**Acceptance criteria:**

- `git ls-files .gitnexus .gitnexusignore` prints **nothing**.
- `git check-ignore -v .gitnexus/meta.json` returns a hit on the new `.gitnexus/` line in `.gitignore`.
- `git check-ignore -v .gitnexus/lbug` returns a hit on the same line.
- A fresh `npm run build` followed by `git status` does not reintroduce any `.gitnexus/*` or `.gitnexusignore` entry as "untracked".
- The new commit's diff touches **only** `.gitignore` and removes (from the index) the three GitNexus paths. No `src/`, `docs/`, or `pipeline/` files are modified by this commit.

- [ ] **Step 1: Verify the current tracked state matches the audit**

Run:

```powershell
git ls-files .gitnexus .gitnexusignore .mcp.json
git cat-file -s HEAD:.gitnexus/lbug
```

Expected output:

```
.gitnexus/lbug
.gitnexus/meta.json
.gitnexusignore
.mcp.json
54513664
```

If the output differs (for example `.gitnexus/lbug` is absent), stop and update this plan — the repo state has drifted from the audit baseline.

- [ ] **Step 2: Restore the `.gitnexus/` entry in `.gitignore`**

Replace the trailing two lines of `.gitignore`:

```
# Git worktrees
.worktrees/

# optional local tooling output dirs — add to your global gitignore if needed
```

with:

```
# Git worktrees
.worktrees/

# GitNexus local index — must never be committed (audit Phase 2)
.gitnexus/
.gitnexusignore

# optional local tooling output dirs — add to your global gitignore if needed
```

- [ ] **Step 3: Untrack the three paths without deleting them on disk**

Run:

```powershell
git rm --cached .gitnexus/lbug
git rm --cached .gitnexus/meta.json
git rm --cached .gitnexusignore
```

- [ ] **Step 4: Confirm the working tree is clean and ignore rules apply**

Run:

```powershell
git status
git check-ignore -v .gitnexus/lbug .gitnexus/meta.json .gitnexusignore
```

Expected: `git status` shows the three deletions staged plus the `.gitignore` modification, and `git check-ignore` confirms each path is matched by the new `.gitnexus/` (or `.gitnexusignore`) line.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore
git commit -m "chore: untrack GitNexus local index and re-add to gitignore

Audit Phase 2 §A: .gitnexus/lbug (~52 MB), .gitnexus/meta.json, and
.gitnexusignore were committed in 926b040 after the .gitnexus rule
was removed from .gitignore. Untrack all three and reinstate the
.gitnexus/ ignore so the local index can no longer be re-added."
```

- [ ] **Step 6: Push**

```powershell
git push
```

---

## Task 2: Decide and document `.mcp.json`

**Why:** `.mcp.json` configures the `forge_extension` MCP server (`http://localhost:13168/mcp`), not GitNexus, so it does not strictly violate the spec's "remove if it only configures GitNexus" carve-out. The audit explicitly flagged it as **undecided** ("the spec did not authorize keeping it either, and it should be reviewed"). This task forces an explicit decision and records it.

**Files:**
- Decide: `.mcp.json`
- Modify (only if option A is chosen): `AGENTS.md`

**Acceptance criteria:**

- The repository's stance on `.mcp.json` is recorded in a tracked file (`AGENTS.md` if kept, the commit message if removed). Future readers can answer "why is this here?" or "why did we remove this?" from `git log` alone.
- After this task, exactly one of the following is true:
  - **(A) Kept:** `.mcp.json` is still tracked **and** `AGENTS.md` contains a one-line note explaining its purpose (Forge MCP integration). `git ls-files .mcp.json` returns `.mcp.json`.
  - **(B) Removed:** `git ls-files .mcp.json` returns nothing, and the commit removing it has a message that names what it configured (`forge_extension`) and why it was dropped (no current workflow uses it).
- No `gitnexus` reference is introduced in `.mcp.json` or `AGENTS.md` as part of this task.

- [ ] **Step 1: Confirm what `.mcp.json` configures**

Read the file and the audit note. Expected content:

```json
{
  "mcpServers": {
    "forge_extension": {
      "url": "http://localhost:13168/mcp"
    }
  }
}
```

If any `gitnexus` server appears here, delete it as part of this task — the audit assumed only `forge_extension` was present.

- [ ] **Step 2: Decide — keep or remove**

Pick **one** option below and execute only that option's sub-steps. Do not do both.

**Option A — Keep `.mcp.json` (recommended if any contributor relies on Forge MCP locally):**

  1. Append to `AGENTS.md` under the existing `## Guardrails` section:

      ```markdown
      - `.mcp.json` configures the local Forge MCP server (`forge_extension`). Keep it if you use Forge in Cursor; it is unrelated to the removed GitNexus tooling.
      ```

  2. Stage and commit:

      ```powershell
      git add AGENTS.md
      git commit -m "docs: explain why .mcp.json is tracked (Forge MCP, not GitNexus)"
      ```

**Option B — Remove `.mcp.json`:**

  1. Untrack and delete:

      ```powershell
      git rm .mcp.json
      ```

  2. Commit:

      ```powershell
      git commit -m "chore: remove unused .mcp.json (configured forge_extension MCP only)

      Audit Phase 2: .mcp.json only declared the forge_extension MCP
      server (http://localhost:13168/mcp). No current workflow in this
      repo depends on it, and the spec did not authorise keeping it."
      ```

- [ ] **Step 3: Push**

```powershell
git push
```

---

## Task 3: Decide on history rewrite for the 52 MB GitNexus blob

**Why:** Even after Task 1, `.gitnexus/lbug` (54,513,664 bytes ≈ 52 MB) lives forever in the repo's pack files unless history is rewritten. The audit calls this "the single most consequential regression of the whole migration." This task forces an explicit choice between accepting the bloat and scrubbing history with `git filter-repo`.

**Files:** No working-tree files. This task changes git history (option B only) or only changes a doc (option A).

**Acceptance criteria:**

- The decision is recorded in a tracked file (`docs/superpowers/specs/2026-04-25-browser-only-migration-design.md` retrospective appendix added in Task 5 — cross-reference it from this task's commit message).
- Exactly one of the following is true after this task:
  - **(A) Accept bloat:** `git rev-list --objects --all | rg lbug` still finds the blob, and the migration retrospective in Task 5 explicitly states the decision was to keep history intact.
  - **(B) Scrub history:** `git rev-list --objects --all | rg lbug` returns **no** matches; `git cat-file -s 78472c7:.gitnexus/lbug` (or any earlier ref before `926b040`) errors out with "fatal: Not a valid object name" or returns 0 bytes; `git push --force-with-lease origin feat/browser-pipeline-typescript` succeeds; the pack size of the repo (`git count-objects -vH`) drops by roughly the size of the blob.
- No working-tree behaviour changes. The web app build (`npm run build`) still produces an identical `docs/app.js` after this task.

- [ ] **Step 1: Pick option A or option B and announce the choice**

Document the decision in the chat or commit message. Default recommendation: **option B** (scrub). The branch is shared (`origin/feat/browser-pipeline-typescript`), so confirm no other contributor has work-in-progress branches forked off the bloated commits before force-pushing.

- [ ] **Step 2A — if option A (accept bloat):**

  1. Skip to Task 5 and record the decision in the retrospective.
  2. No git operations needed.

- [ ] **Step 2B — if option B (scrub):**

  1. Install `git-filter-repo` (one-time):

      ```powershell
      pip install --user git-filter-repo
      ```

      Verify:

      ```powershell
      git filter-repo --version
      ```

  2. Make a safety mirror clone (in case anything goes sideways):

      ```powershell
      git clone --mirror . ../rhter-f1-mirror-backup.git
      ```

  3. From the working clone, run the scrub:

      ```powershell
      git filter-repo --path .gitnexus --invert-paths --force
      ```

      This removes any path under `.gitnexus/` from every commit on every branch and rewrites the commit graph. `--force` is required when the working clone was not a fresh `git clone`.

  4. Verify the blob is gone:

      ```powershell
      git rev-list --objects --all | rg "\.gitnexus/lbug"
      git rev-list --objects --all | rg "\.gitnexus/meta\.json"
      git count-objects -vH
      ```

      Expected: both `rg` calls return no matches; `count-objects` reports a size-pack noticeably smaller than before.

  5. Re-add the origin remote (filter-repo strips it for safety) and force-push the rewritten branch:

      ```powershell
      git remote add origin https://github.com/<owner>/<repo>.git
      git push --force-with-lease origin feat/browser-pipeline-typescript
      ```

      Replace `<owner>/<repo>` with the actual remote URL from the backup mirror's `config` file. If `main`/other branches were rewritten, force-push them as well; if only the feature branch was affected, only that one needs a force push.

  6. Notify any other contributor on this branch to re-clone or `git fetch && git reset --hard origin/feat/browser-pipeline-typescript`.

- [ ] **Step 3: Confirm `npm run build` still produces the same `docs/app.js`**

```powershell
npm run build
git status
```

Expected: `git status` shows no changes to `docs/app.js` (the rewrite did not touch the working tree). If `docs/app.js` differs, the rewrite damaged something — restore from the mirror backup and abort.

---

## Task 4: Fix the stray indentation in `src/ui/uploadStep.ts`

**Why:** The audit flagged that the migration left `    saveBtn.addEventListener('click', () => {` (4 extra leading spaces) at line 30 of `src/ui/uploadStep.ts`. TypeScript still compiles, but the file is now visually inconsistent. Fixing it is two seconds and lets later edits to that block diff cleanly.

**Files:**
- Modify: `src/ui/uploadStep.ts:30`
- Regenerate: `docs/app.js`

**Acceptance criteria:**

- `src/ui/uploadStep.ts` line 30 starts with exactly two leading spaces (matching the surrounding function body's 2-space indent), not six.
- `npm run build` exits 0 and `npx tsc --noEmit` exits 0 with no warnings.
- `docs/app.js` is regenerated and the only diff in this commit besides the source line is the build artefact.
- No other line in `uploadStep.ts` is changed by this task.

- [ ] **Step 1: Verify the bug**

Use `Read` to confirm `src/ui/uploadStep.ts` line 30 reads (note the leading whitespace):

```
    saveBtn.addEventListener('click', () => {
```

(four extra leading spaces before the two-space indent of the function body).

- [ ] **Step 2: Fix the indent**

Replace the four-extra-space line with a two-space-indented line. The block before/after the fix should look like:

```typescript
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'SAVE';
  saveBtn.className = 'border border-accent text-accent font-mono text-[10px] uppercase tracking-[0.18em] px-[16px] py-[6px] hover:bg-accent hover:text-white transition-colors duration-100';

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) return;
    setApiKey(key);
    onSaved();
  });
```

- [ ] **Step 3: Type-check and rebuild**

```powershell
npx tsc --noEmit
npm run build
```

Expected: both commands exit 0 with no diagnostics.

- [ ] **Step 4: Commit**

```powershell
git add src/ui/uploadStep.ts docs/app.js
git commit -m "style: fix stray indentation on saveBtn handler in uploadStep

Audit Phase 2: the migration left four extra leading spaces on the
saveBtn.addEventListener line. Compiles fine, but ruins diffs on
that block. Re-indent to match the function body and regenerate
docs/app.js."
```

- [ ] **Step 5: Push**

```powershell
git push
```

---

## Task 5: Document the over-scope deletion in commit `158ce42`

**Why:** Commit `158ce42` ("Refactor and enhance documentation for agent workflows") deleted nine source files (~1363 lines) — eight of them dead code, one (`src/settingsPanel.ts`) replaced in Task 1 of the migration. The audit's concern is not the deletions themselves (the code was unreachable), but that the commit subject undersells a 1363-line source-code deletion and the spec did not authorise the cull. This task records the deletion in the retrospective so future archaeologists can find it without `git log -p`-ing through the merge.

**Files:**
- Modify (append): `docs/superpowers/specs/2026-04-25-browser-only-migration-design.md`

**Acceptance criteria:**

- The spec file gains a new top-level section `## Migration retrospective (Phase 2 audit follow-up)` after the existing `## Out of scope` section.
- The new section names commit `158ce42` and lists every deleted file with line counts as recorded by the audit.
- The new section also records the Task 3 history-rewrite decision (option A or option B from this plan) and the reason.
- The diff of this task touches **only** the spec file. No source, no `docs/app.js`, no other doc.

- [ ] **Step 1: Append the retrospective section**

Append to the end of `docs/superpowers/specs/2026-04-25-browser-only-migration-design.md`:

```markdown
---

## Migration retrospective (Phase 2 audit follow-up)

A post-migration audit identified two follow-up issues that the spec did not anticipate. They were resolved in the Phase 2 cleanup pass; this section is the durable record.

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

### History rewrite decision

Phase 2 Task 3 evaluated whether to scrub the 52 MB `.gitnexus/lbug` binary from history with `git filter-repo`. The decision was: **<fill in: "accept history bloat" or "rewrote with git filter-repo on YYYY-MM-DD; force-pushed feat/browser-pipeline-typescript">**. Reasoning: **<fill in: shared-branch coordination cost, contributor count, repo size sensitivity>**.
```

Replace the two `<fill in: ...>` placeholders with the actual choice and reasoning from Task 3 before committing — these are not generic placeholders, they are decision records and must be filled in based on what Task 3 actually did.

- [ ] **Step 2: Commit**

```powershell
git add docs/superpowers/specs/2026-04-25-browser-only-migration-design.md
git commit -m "docs: record migration retrospective for over-scope deletion and history rewrite

Audit Phase 2: append a retrospective to the browser-only migration
spec listing the nine files deleted in 158ce42 and the decision
recorded in Phase 2 Task 3 about whether to scrub the 52 MB GitNexus
blob from history."
```

- [ ] **Step 3: Push**

```powershell
git push
```

---

## Task 6: GH-Pages verification — full 72-crop run

**Why:** The migration spec's verification matrix requires "After `npm run build`, the deployed site executes a full run end-to-end." The audit notes this was documented but not demonstrated. This task runs the check against the deployed GitHub Pages site and commits the evidence.

**Files:**
- Create: `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`
- Create: `docs/superpowers/runs/screenshots/2026-04-25-full-72.png`

**Acceptance criteria:**

- The deployed GitHub Pages site is the latest `docs/app.js` (verify by hashing or by visible UI elements introduced in the migration: the run-mode subtitle, debug panel toggle, save-each-preprocessed-crop checkbox).
- A real screenshot upload, with Debug Mode **off** and no URL overrides, drives the pipeline through 72 crops.
- The post-run summary line reads `RUN COMPLETE: 72/72 crops succeeded` (or `succeeded: N`, `failed: 72-N` if any individual crop failed; in either case the planned total is 72).
- The summary is **not** marked `(DEBUG RUN)`.
- A PNG screenshot of the completed run summary is saved to `docs/superpowers/runs/screenshots/2026-04-25-full-72.png` and committed.
- `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md` records: GH-Pages URL, build commit SHA, browser + version used, run start/end timestamps, and a "PASS"/"FAIL" verdict for this check.

- [ ] **Step 1: Confirm the deployed site matches the head of the branch**

After Tasks 1–4 are pushed, wait for the GitHub Pages action to finish, then open the deployed URL. Open DevTools → Sources, find `app.js`, and confirm it contains `formatRunModeSubtitle` (string-grep). If not, the cache is stale — hard-reload (`Ctrl+Shift+R`).

- [ ] **Step 2: Run the full pipeline**

  1. Open the deployed URL in a clean browser profile (or incognito) so localStorage is empty.
  2. Paste a valid Gemini API key, save it.
  3. Confirm Debug Mode is **off** in the debug controls panel.
  4. Upload a real F1 fantasy lineup screenshot (one known to slice into 72 crops).
  5. Wait for the run to complete.
  6. Confirm the final UI shows `RUN MODE: FULL (72 CROPS)` and `RUN COMPLETE: 72/72 crops succeeded` (or partial succeeded count out of 72 — failures are acceptable for the "full run" criterion as long as the planned total is 72).
  7. Take a screenshot of the summary section.

- [ ] **Step 3: Save and commit the evidence**

Save the screenshot as:

```
docs/superpowers/runs/screenshots/2026-04-25-full-72.png
```

Create `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md` with the following structure (this scaffold will be appended to in Tasks 7–10; create the full skeleton now):

```markdown
# Phase 2 — GitHub Pages verification log

**Deployed URL:** <fill in actual GH-Pages URL>
**Build commit:** <git rev-parse HEAD at time of run>
**Browser:** <e.g. Chrome 124 on Windows 10>
**Date:** 2026-04-25

This log records evidence for the five Phase 1 acceptance checks executed against the deployed site, satisfying the spec's verification-matrix item "GitHub Pages: After `npm run build`, the deployed site executes a full run end-to-end."

## Check 1 — Full 72-crop run (Debug Mode off)

- **Result:** PASS / FAIL
- **Run mode shown:** `RUN MODE: FULL (72 CROPS)`
- **Summary shown:** `RUN COMPLETE: <succeeded>/72 crops succeeded`
- **Screenshot:** [`screenshots/2026-04-25-full-72.png`](screenshots/2026-04-25-full-72.png)
- **Notes:** <e.g. "all 72 succeeded, run took 4m12s">

## Check 2 — Debug cap (Debug Mode on, limit = 6)

(filled in by Task 7)

## Check 3 — Failure path

(filled in by Task 8)

## Check 4 — Persistence between Review and Analysis

(filled in by Task 9)

## Check 5 — Extracted dataset JSON round-trip

(filled in by Task 10)
```

Fill in the placeholders for **Check 1** with the actual values observed.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md docs/superpowers/runs/screenshots/2026-04-25-full-72.png
git commit -m "docs: record GH-Pages verification check 1 (full 72-crop run)"
```

Do not push yet — the remaining four checks are appended to the same log; push once after Task 11.

---

## Task 7: GH-Pages verification — debug cap

**Why:** Verification-matrix item: "Debug Mode on, limit = 6, observe run stops at 6 and summary says `(DEBUG RUN)`."

**Files:**
- Modify (append a section): `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`
- Create: `docs/superpowers/runs/screenshots/2026-04-25-debug-6.png`

**Acceptance criteria:**

- A run on the deployed site with Debug Mode on and crop limit = 6 stops after exactly 6 crops.
- The post-run summary line includes `(DEBUG RUN)`.
- The run-mode subtitle reads `RUN MODE: DEBUG (UP TO 6 CROPS)` (or matches `formatRunModeSubtitle` output for `runMode='debug'`, `plannedTotal=6`).
- A screenshot of the summary is saved to `docs/superpowers/runs/screenshots/2026-04-25-debug-6.png` and committed.
- The Check 2 section of the verification log is filled in (PASS/FAIL, run mode line, summary line, screenshot link, notes).

- [ ] **Step 1: Run the debug-capped pipeline**

  1. On the deployed URL, toggle Debug Mode **on**.
  2. Set the crop limit field to `6`.
  3. Upload the same screenshot used in Task 6.
  4. Wait for the run to finish.
  5. Confirm the run mode shows `RUN MODE: DEBUG (UP TO 6 CROPS)` and the completion line reads `RUN COMPLETE: <succeeded>/6 crops succeeded (DEBUG RUN)`.
  6. Take a screenshot.

- [ ] **Step 2: Save the screenshot**

```
docs/superpowers/runs/screenshots/2026-04-25-debug-6.png
```

- [ ] **Step 3: Fill in Check 2 in the log**

Replace `(filled in by Task 7)` with:

```markdown
- **Result:** PASS / FAIL
- **Run mode shown:** `RUN MODE: DEBUG (UP TO 6 CROPS)`
- **Summary shown:** `RUN COMPLETE: <succeeded>/6 crops succeeded (DEBUG RUN)`
- **Screenshot:** [`screenshots/2026-04-25-debug-6.png`](screenshots/2026-04-25-debug-6.png)
- **Notes:** <e.g. "stopped at exactly 6 attempts as expected">
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md docs/superpowers/runs/screenshots/2026-04-25-debug-6.png
git commit -m "docs: record GH-Pages verification check 2 (debug cap)"
```

---

## Task 8: GH-Pages verification — failure path

**Why:** Verification-matrix item: "Force a crop failure (e.g. invalid API key partway); confirm `FAILED: [r,c], ...` line."

**Files:**
- Modify (append a section): `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`
- Create: `docs/superpowers/runs/screenshots/2026-04-25-failure.png`

**Acceptance criteria:**

- A run is induced to fail at least one crop on the deployed site (recommended technique: set the saved API key to a deliberately invalid value before uploading; alternative: use a valid key but disable network mid-run via DevTools throttling → "Offline" after the first crop completes).
- The post-run summary shows a non-zero failure count and a `FAILED: [r,c], [r,c], ...` line listing at least one coordinate pair.
- A screenshot is saved to `docs/superpowers/runs/screenshots/2026-04-25-failure.png` and committed.
- Check 3 in the verification log is filled in.

- [ ] **Step 1: Provoke failures**

Pick **one** of the following techniques and execute it:

  - **(a) Bad API key:** in the Upload step, save an obviously invalid Gemini API key (e.g. `INVALID_TEST_KEY`). Run with Debug Mode on, limit = 3, so the run is short and every crop fails.
  - **(b) Mid-run network drop:** start a real run with a valid key. After the first crop completes, open DevTools → Network → set throttling to "Offline". Let the remaining crops fail.

- [ ] **Step 2: Confirm the FAILED line**

The summary should include a line of the form:

```
FAILED: [0,0], [0,1], [0,2]
```

(coordinates depend on which crops failed — any non-empty coordinate list is acceptable).

- [ ] **Step 3: Save the screenshot and fill in the log**

Screenshot path:

```
docs/superpowers/runs/screenshots/2026-04-25-failure.png
```

Replace `(filled in by Task 8)` with:

```markdown
- **Result:** PASS / FAIL
- **Failure technique:** <bad API key | offline mid-run>
- **Summary shown:** `RUN COMPLETE: 0/3 crops succeeded (DEBUG RUN)` and `FAILED: [0,0], [0,1], [0,2]`
- **Screenshot:** [`screenshots/2026-04-25-failure.png`](screenshots/2026-04-25-failure.png)
- **Notes:** <e.g. "FAILED line listed three coordinates as expected, no silent success">
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md docs/superpowers/runs/screenshots/2026-04-25-failure.png
git commit -m "docs: record GH-Pages verification check 3 (failure path surfaces FAILED line)"
```

---

## Task 9: GH-Pages verification — persistence between Review and Analysis

**Why:** Verification-matrix item: "Refresh between Review and Analysis; data still visible." The acceptance check guards against a regression where reviewed data lives only in memory.

**Files:**
- Modify (append a section): `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`
- Create: `docs/superpowers/runs/screenshots/2026-04-25-persistence.png`

**Acceptance criteria:**

- After completing a run, navigating to Review, making at least one edit, and approving, a hard refresh (`Ctrl+Shift+R`) lands the user on the same wizard step (Analysis or Review) **with reviewed data intact**.
- localStorage keys `reviewedViolins` (and/or `importedViolins`) are present and non-empty after the refresh (verifiable in DevTools → Application → Local Storage).
- A screenshot of the Analysis step rendered after the refresh is saved to `docs/superpowers/runs/screenshots/2026-04-25-persistence.png` and committed.
- Check 4 in the verification log is filled in.

- [ ] **Step 1: Run the persistence scenario**

  1. Use the existing Task 6 run output (Debug Mode off) or run a fresh debug-capped run.
  2. Move to the Review step, edit at least one row inline, and click Approve.
  3. Move to the Analysis step.
  4. Open DevTools → Application → Local Storage → confirm `reviewedViolins` is populated.
  5. Hard-reload (`Ctrl+Shift+R`).
  6. Confirm the Analysis step renders with the reviewed data still visible.
  7. Screenshot the Analysis view post-refresh.

- [ ] **Step 2: Save the screenshot and fill in the log**

Screenshot path:

```
docs/superpowers/runs/screenshots/2026-04-25-persistence.png
```

Replace `(filled in by Task 9)` with:

```markdown
- **Result:** PASS / FAIL
- **localStorage keys observed post-refresh:** reviewedViolins, importedViolins, wizard_step
- **Screenshot (Analysis step after hard refresh):** [`screenshots/2026-04-25-persistence.png`](screenshots/2026-04-25-persistence.png)
- **Notes:** <e.g. "ranking matched pre-refresh state row-for-row">
```

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md docs/superpowers/runs/screenshots/2026-04-25-persistence.png
git commit -m "docs: record GH-Pages verification check 4 (refresh persists reviewed data)"
```

---

## Task 10: GH-Pages verification — extracted dataset JSON round-trip

**Why:** Spec acceptance criterion §5.2: "after `npm run build`, validate ... that extracted dataset JSON import/export still works." This is the only check that guarantees the spec's preferred wording ("extracted dataset JSON") corresponds to a working code path.

**Files:**
- Modify (append a section): `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`
- Create: `docs/superpowers/runs/screenshots/2026-04-25-json-roundtrip.png`

**Acceptance criteria:**

- The export action on the deployed site produces a JSON file that downloads successfully (browser download manager shows it).
- After clearing localStorage in the same browser profile and re-opening the deployed site, the import action accepts that JSON file and re-renders Analysis with the same ranked picks as before.
- A screenshot of Analysis post-import (showing the same top pick / ranked list as the export side) is saved to `docs/superpowers/runs/screenshots/2026-04-25-json-roundtrip.png` and committed.
- Check 5 in the verification log is filled in.

- [ ] **Step 1: Export**

  1. From the Analysis step (post-Task 9), trigger the JSON export.
  2. Save the file locally as `phase-2-export-sample.json` (do **not** commit; it likely contains live extracted data).
  3. Note the top pick and the first three ranked entries.

- [ ] **Step 2: Clear and re-import**

  1. DevTools → Application → Local Storage → clear all keys for the GH-Pages origin.
  2. Hard-reload.
  3. Confirm the wizard returns to the Upload step (empty state).
  4. Use the import affordance to load `phase-2-export-sample.json`.
  5. Navigate to Analysis.
  6. Confirm the top pick and the first three ranked entries match the values noted in Step 1.
  7. Take a screenshot of the post-import Analysis view.

- [ ] **Step 3: Save the screenshot and fill in the log**

Screenshot path:

```
docs/superpowers/runs/screenshots/2026-04-25-json-roundtrip.png
```

Replace `(filled in by Task 10)` with:

```markdown
- **Result:** PASS / FAIL
- **Pre-export top pick:** <e.g. "VER + HAM + LEC">
- **Post-import top pick:** <e.g. "VER + HAM + LEC">
- **Screenshot (Analysis step after import):** [`screenshots/2026-04-25-json-roundtrip.png`](screenshots/2026-04-25-json-roundtrip.png)
- **Notes:** <e.g. "first three ranked entries identical pre/post round-trip">
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md docs/superpowers/runs/screenshots/2026-04-25-json-roundtrip.png
git commit -m "docs: record GH-Pages verification check 5 (extracted dataset JSON round-trip)"
```

---

## Task 11: Finalise and push the verification log

**Why:** Tasks 6–10 land local commits that are not yet pushed. This task pushes them as a single coherent block, links the verification log from `CLAUDE.local.md` so future readers find the evidence, and confirms the verification-matrix item from the spec is provably satisfied.

**Files:**
- Modify: `CLAUDE.local.md` (one line — add a link to the verification log under the "GitHub Pages validation" section)

**Acceptance criteria:**

- `CLAUDE.local.md` "GitHub Pages validation" section links to `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`.
- All five checks in the verification log are filled in (no `(filled in by Task N)` placeholders remain) and at least four of them have **Result: PASS**. Any FAIL entries have a one-line explanation and a follow-up issue link or note.
- `git log --oneline -10` shows the Task 1–10 commits in order on `feat/browser-pipeline-typescript`, all pushed to `origin`.
- The spec's verification-matrix row "GitHub Pages: After `npm run build`, the deployed site executes a full run end-to-end" is now demonstrably satisfied — anyone clicking the link in `CLAUDE.local.md` lands on a log that names the build commit, the deployed URL, and shows screenshots of the five acceptance checks.

- [ ] **Step 1: Confirm no placeholders remain**

Open `docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md` and grep for the literal string `(filled in by Task`:

```powershell
rg "filled in by Task" docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md
```

Expected: no matches. If any remain, complete the corresponding Task 6–10 step before continuing.

- [ ] **Step 2: Link the log from `CLAUDE.local.md`**

In `CLAUDE.local.md`, locate the "GitHub Pages validation" subsection (under "Testing and deployment gate (Phase 1)"). Append:

```markdown
- See [`docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md`](docs/superpowers/runs/2026-04-25-phase-2-gh-pages-verification.md) for the most recent committed evidence of these checks running on the deployed site.
```

- [ ] **Step 3: Commit and push everything**

```powershell
git add CLAUDE.local.md
git commit -m "docs: link GH-Pages verification log from CLAUDE.local.md"
git push
```

- [ ] **Step 4: Final smoke check**

Run:

```powershell
git status
git log --oneline -12
git ls-files .gitnexus .gitnexusignore
rg -i "gitnexus" -g "!docs/superpowers/specs/2026-04-25-browser-only-migration-design.md" -g "!docs/superpowers/plans/phase-2-cleanup.plan.md" -g "!.gitignore"
```

Expected:

- `git status` clean.
- `git log` shows commits from Tasks 1, 2, (3 if option B), 4, 5, 6, 7, 8, 9, 10, 11 in order.
- `git ls-files .gitnexus .gitnexusignore` returns nothing.
- The `rg` repo-wide search for `gitnexus` returns at most matches in build artefacts unrelated to the spec/plan/.gitignore — no live `src/`, `docs/`, top-level `*.md`, or `.cursor/rules/` hits. (Hits in this plan and the migration spec are expected and excluded.)

---

## Verification matrix (Phase 2)

| Concern | How to verify |
|---|---|
| GitNexus index untracked | `git ls-files .gitnexus .gitnexusignore` returns nothing; `.gitignore` re-includes `.gitnexus/`. |
| `.mcp.json` decided | Either tracked + documented in `AGENTS.md`, or removed with a commit message naming `forge_extension`. |
| 52 MB blob handled | Either accepted (recorded in retrospective) or scrubbed via `git filter-repo` (verified by `git rev-list --objects --all \| rg lbug` returning empty). |
| Indent fix | `src/ui/uploadStep.ts:30` starts with two spaces; `npx tsc --noEmit` exits 0; `docs/app.js` regenerated. |
| Over-scope deletion documented | Migration spec contains the new "Migration retrospective" section listing the nine files from `158ce42`. |
| GH-Pages full run | Verification log Check 1 is filled in with PASS and a committed screenshot. |
| GH-Pages debug cap | Verification log Check 2 is filled in with PASS and a committed screenshot. |
| GH-Pages failure path | Verification log Check 3 is filled in with PASS and a committed screenshot showing `FAILED: [r,c], ...`. |
| GH-Pages persistence | Verification log Check 4 is filled in with PASS and a committed screenshot of Analysis after hard refresh. |
| GH-Pages JSON round-trip | Verification log Check 5 is filled in with PASS and a committed screenshot of Analysis after import. |
| Verification log linked | `CLAUDE.local.md` GitHub Pages section links to the verification log. |

---

## Out of scope (deferred to follow-up specs)

- Phase 2 §C from the migration spec: isolating the pipeline engine from UI side-effects, retiring legacy modules, optionally archiving/removing Python code/tests, and formalising a persistent Test/Debug mode beyond the current Upload-step controls.
- Adding automated coverage for `runMode.ts`, `debugControls.ts`, `pipelineOrchestrator.ts`'s `PipelineRunSummary` shape, or `demoData.ts` — flagged by the audit as a noticeable absence but not a spec violation.
- Reviewing `.claude/scheduled_tasks.lock` and `.claude/settings.local.json` (currently untracked) for inclusion in `.gitignore` — orthogonal to the GitNexus cleanup.
- Renaming `docs/app.js` or restructuring the `docs/` build output.
