# Chess Assistant

Free chess analysis assistant for Chess.com using Stockfish.

## What else would be good to add in this extension?

Here are high-impact features to consider next:

1. **Engine controls beyond depth**
   - Add time-per-move, MultiPV (top N lines), and skill level controls in popup settings.
   - Useful for balancing speed vs quality on low-end devices.

2. **Blunder / mistake alerts after move**
   - Compare eval before and after each move and classify as inaccuracy/mistake/blunder.
   - Show quick badges in the overlay instead of only raw best-move suggestions.

3. **Opening explorer + repertoire mode**
   - Detect opening names from position/FEN and suggest repertoire lines.
   - Let users save preferred lines and review them later.

4. **Post-game summary panel**
   - Generate a short report: critical moments, biggest missed tactics, and best alternative lines.
   - Export summary as PGN comments or copyable text.

5. **Practice mode from current position**
   - “Play the best move” drills from real game positions.
   - Track streak/accuracy locally and repeat missed motifs.

6. **Hotkeys and quick actions**
   - Add keyboard shortcuts for analyze toggle, next/prev suggestion, and show top line.
   - Improves usability during fast games.

7. **Performance and battery profile options**
   - Add CPU usage presets (Low/Balanced/Max), pause analysis on hidden tab, and mobile-friendly defaults.
   - Important because Stockfish can be expensive in browser contexts.

8. **Privacy-first telemetry (optional)**
   - If analytics are needed, provide clear opt-in and only collect anonymous usage events.
   - Display exactly what is collected in settings.

## Suggested implementation order

1. MultiPV + time controls
2. Move-quality classification (blunder/mistake/inaccuracy)
3. Post-game summary
4. Opening explorer
5. Practice mode

This order delivers immediate user value while building toward deeper training workflows.
