# Chess Assistant

Free chess analysis assistant for Chess.com and Lichess using Stockfish.

## Opening Explorer data source

Opening Explorer uses ECO files from the `@chess-openings/eco.json` dataset.

## Setup ECO files

1. Download these files from the eco dataset and place them in `public/`:
   - `ecoA.json`
   - `ecoB.json`
   - `ecoC.json`
   - `ecoD.json`
   - `ecoE.json`
2. Build extension:
   - `npm run build`

The build copies these files into `dist/`, and the extension loads them at runtime via `chrome.runtime.getURL(...)`.

## Runtime behavior

- Opening matching first tries current position FEN, then falls back to move-sequence matching.
- Overlay shows ECO code, opening name, detected recent moves, and continuation hints.
