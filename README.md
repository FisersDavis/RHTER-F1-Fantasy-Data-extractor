# RHTER F1 Fantasy Data Extractor

A static web app that extracts structured data from [RHTER F1 Fantasy Tools](https://rhter.com/) violin plot screenshots. It uses a predefined pixel grid to slice individual violins from the screenshot, sends each to the Google Gemini vision API for data extraction, and joins the results into a unified dataset for analysis.

## How it works

1. **Upload** — Drop in an RHTER violin plot screenshot (2000×1124px)
2. **Confirm grid** — A predefined 24×3 grid overlays the image; visually confirm alignment (or drag to adjust)
3. **Slice** — The app crops all 72 individual violin plots via Canvas API
4. **Extract** — Each crop is sent to Gemini's vision API, which returns structured JSON (entity name, score distribution, percentiles, budget, team composition)
5. **Analyse** — Extracted data is joined into a unified table stored in localStorage for analysis and comparison across sessions

## Setup

1. Clone or download this repo
2. Serve the files with any static server, or open `index.html` directly in a modern browser
3. Enter your [Google Gemini API key](https://aistudio.google.com/app/apikey) in the app — it's stored in localStorage only and never sent anywhere except Google's API

No build tools, bundlers, or server-side code required. Works on GitHub Pages.

## Project structure

| File | Responsibility |
|------|---------------|
| `index.html` | Shell markup |
| `style.css` | All styling |
| `app.js` | Navigation, state management, localStorage persistence |
| `cropper.js` | Image upload, grid overlay, Canvas API slicing |
| `extractor.js` | Gemini vision API calls, structured JSON parsing, per-crop error handling |
| `dataStore.js` | Dataset storage, unified table joining |
| `analysis.js` | Statistical analysis (Kelly scores, portfolio comparisons) |

All JS files use native ES modules — no transpilation needed.

## License

MIT
