# Project: RHTER F1 Fantasy Data Extractor

## What this is
A static web app that extracts structured data from RHTER F1 Fantasy Tools violin plot screenshots. Uses a predefined pixel grid to slice individual violins, then extracts data via an AI-based approach (TBD). Joins results into a unified dataset for analysis and visualization. Hosted on GitHub Pages.

## Architecture
- Separate files: index.html, style.css, and JS split by responsibility
- app.js — main UI, navigation, state management, localStorage persistence
- cropper.js — image upload, predefined grid overlay with visual confirmation step, Canvas API slicing into individual violin crops
- extractor.js — UI shell for extraction tab, placeholder for future AI-based extraction approach
- dataStore.js — joins individual extraction results into unified tables, manages datasets across sessions
- analysis.js — statistical calculations (Kelly scores, portfolio comparisons, value detection)
- charts.js — visualization rendering (split out from analysis.js only when it exceeds ~300 lines)
- If any file exceeds ~300 lines, suggest splitting before adding more code
- Use ES modules (import/export) to connect files

## Verified RHTER image grid (all images 2000x1124px)
The violin positions are fixed and pixel-identical across images. The cropper uses these predefined coordinates with a visual confirmation step (user sees the grid overlaid, confirms or adjusts if needed).

### 24 violin columns (left to right)
Column centers (x): 105, 174, 242, 311, 380, 449, 517, 586, 655, 724, 792, 861, 930, 998, 1067, 1136, 1205, 1273, 1342, 1411, 1480, 1548, 1617, 1686
- Column half-width: 34px (crop from center-34 to center+34 = 68px wide)
- Column 25 at x=1892 is the reference/legend — skip it

### 3 budget tier rows
- Row 1: 340px tall
- Row 2  340px tall
- Row 3: 340px tall

Each crop includes: header stats (budget, avg xPts, avg xPts + $ impact, avg budget uplift), violin plot with percentile labels (5th/25th/50th/75th/95th), two colored violin shapes (CN1 + CN2 constructors), "capped to" label, and 5 driver labels (one with 2X multiplier).

### Cropper workflow
1. User uploads RHTER screenshot
2. App overlays the predefined grid on the image (24 columns × 3 rows = 72 crops)
3. User visually confirms the grid looks aligned (two-eye principle)
4. If grid is off (RHTER changed layout), user can drag grid lines to adjust
5. "Slice" button crops all 72 violins via Canvas API
6. Crops are held in memory for extraction step

## Core pipeline (in order)
1. Upload image → show with grid overlay → user confirms → slice into 72 individual crops
2. Extraction: TBD — new AI-based approach to replace former OCR pipeline
3. Individual results joined into unified table
4. Table stored in localStorage, available for analysis/visualization

## Code patterns
- Build UI with document.createElement, not innerHTML string templates
- Show all validation errors at once with inline field highlighting, not one-at-a-time toasts
- Persist all app state to localStorage — config, extracted datasets, grid adjustments if any. User should lose nothing on refresh
- All user-supplied values must be escaped or set via textContent/properties, never injected as raw HTML
- Pipeline steps should be independently testable: cropper works without extractor, extractor works with manually provided images, analysis works with manually provided data

## Extraction approach
- TBD — previous OCR approach (Tesseract.js) has been removed
- New AI-based extraction approach to be implemented
- Constructor identification via color matching against 11 known team colors is still relevant domain knowledge (see F1 Fantasy domain rules)
- Handle errors per crop — if one violin fails extraction, don't lose the rest

## Hosting constraints
- Must work as static files on GitHub Pages
- No npm, no bundlers, no server-side code
- External libraries loaded via CDN only (Chart.js for visualization)
- ES modules work natively in modern browsers, no transpilation needed

## F1 Fantasy domain rules
- Constructor picks (CN1, CN2) and driver picks are independent selections
- Each RHTER violin plot shows a score distribution for one team combination
- Two colored violin shapes per plot represent CN1 and CN2 — identified by color, not text
- The (2X) multiplier is on a driver, not a constructor
- All 5 bottom labels are driver abbreviations (3 uppercase letters)
- 11 constructor colors: MCL=orange, MER=cyan, RED=navy, FER=red, WIL=blue, VRB=light blue, AST=dark green, HAA=white, AUD=maroon, ALP=pink, CAD=grey

## When making changes
- One feature at a time, verify it works before moving on
- Build the pipeline in order: cropper first, then extractor, then data joining, then analysis, then charts
- Before adding to a file, check its length and suggest a split if approaching 300 lines
- Don't rewrite unrelated code when editing an existing function
- When touching one pipeline stage, don't change other stages
