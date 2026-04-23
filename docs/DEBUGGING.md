# Debugging the extraction wizard

This guide describes how to use **Debug Mode** and related tools when working on the RHTER F1 Fantasy browser app (Upload → Review → Analysis). The shipped UI lives under `docs/`; behavior is implemented in `src/ui/debugControls.ts` and `src/ui/uploadStep.ts`.

## Full run vs debug run

- **Full run (default):** Debug Mode is **off**. The pipeline processes every crop the grid produces (expected **72** crops for a standard RHTER screenshot). This is what you use for real data and for acceptance testing.
- **Debug run:** Debug Mode is **on**. You set a **maximum number of crops** to process. Fewer Gemini calls, faster iteration, and a **partial** extracted dataset (Review/Analysis only see what was extracted).

The Upload step shows a **run mode** line (for example `RUN MODE: FULL (72 CROPS)` or `RUN MODE: DEBUG (UP TO N CROPS)`). While extraction is running, the progress area repeats the same style of line using live pipeline state so you can always see whether you are in a full or debug run.

## Controls on the Upload step

Below the drop zone you will find a bordered **debug** panel.

### Debug Mode

- Turn **Debug Mode** on when you want to cap how many crops are sent through preprocess + Gemini.
- When Debug Mode is **off**, the **Debug crop limit** and **Save each preprocessed crop** rows are hidden. The limit is ignored and the full grid is processed.

### Debug crop limit

- Visible only when Debug Mode is on.
- Enter a positive integer (minimum 1). The pipeline stops after that many crops, even if more grid cells exist.
- If the field is empty or invalid, the UI treats the limit like a default of **6** for display purposes; you should still enter a clear number for predictable runs.

### Save each preprocessed crop (slow)

- Visible only when Debug Mode is on.
- When enabled, after each crop is preprocessed (before Gemini), the app triggers a **download** of a PNG named `crop_debug_r{row}_c{col}.png`.
- Use this only when you need to inspect preprocessing quality. It is **slow** and will download many files on a large run.

## After a run

The completion message includes the success count and whether the run was a **debug run**. If any crops failed, the UI lists **failed coordinates** (`[row,col]`) so you can cross-check the screenshot.

## URL query parameters (advanced)

You can seed debug settings **once** when the page loads. Values are written to the same **localStorage** keys as the checkboxes and number field, so they persist like normal UI changes.

| Parameter       | Values | Effect |
|----------------|--------|--------|
| `wizard_debug` | `1` or `true` (case-insensitive) | Turns Debug Mode on when the debug panel is created. |
| `wizard_limit` | Positive integer | Sets the debug crop limit field and persists it. |

Examples (append to the page URL):

- `?wizard_debug=1&wizard_limit=3` — debug on, limit 3 crops.

These parameters are read at load time only; changing the URL later without reloading does not update the panel.

`wizard_limit` alone still updates the stored limit field when the page loads; only **`wizard_debug`** turns Debug Mode on. If you pass `wizard_limit` without `wizard_debug`, enable Debug Mode manually before running if you want that limit to apply.

## localStorage keys (reference)

| Key | Meaning |
|-----|--------|
| `wizard_debug_mode` | `'1'` = Debug Mode on, `'0'` = off. |
| `wizard_debug_limit` | String form of the crop limit (default field value `6` if never set). |
| `wizard_preprocess_diag` | `'1'` = “Save each preprocessed crop” enabled. |

To return to a normal full run: open the Upload step, turn **Debug Mode** off, and run again. You can also clear site data for the origin in your browser if you want a completely clean slate (this also clears your API key and wizard state unless you export them first).

## Partial datasets in Review and Analysis

A debug run produces fewer than 72 crops. Review and Analysis operate on whatever is in the **extracted dataset** in storage. Do not expect full-grid rankings or completeness checks until you complete a **full** run with Debug Mode off.

## Developer commands

- Local dev with live rebuild: `npm run dev`
- Production bundle: `npm run build` (regenerates `docs/app.js` from `src/`)

For architecture and acceptance checks, see `CLAUDE.local.md` in the repository root.
