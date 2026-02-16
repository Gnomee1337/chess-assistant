# Chess Assistant

Free chess analysis assistant for Chess.com using Stockfish.

## Opening Explorer data source

Opening Explorer is designed to use the official ECO npm package:

- `@chess-openings/eco.json`
- Source: https://github.com/hayatbiralem/eco.json

## Setup ECO data

1. Install dependencies:
   - `npm install`
2. Sync ECO data from the package into extension assets:
   - `npm run eco:sync`
3. Build extension:
   - `npm run build`

`npm run eco:sync` calls the package API (`openingBook`) and writes the dataset to `public/eco.json`; build then copies it to `dist/eco.json`.

## Runtime behavior

- The extension loads `eco.json` at runtime via `chrome.runtime.getURL('eco.json')`.
- Opening matching first tries current position FEN, then falls back to move-sequence matching.
- Overlay shows ECO code, opening name, detected recent moves, and continuation hints.
