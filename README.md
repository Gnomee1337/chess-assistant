# Chess Assistant

A free browser extension that provides real-time chess analysis powered by Stockfish directly on [chess.com](https://www.chess.com) and [lichess.org](https://lichess.org).

<img src="https://i.imgur.com/R8GnEoh.jpeg" width="700">

<img src="https://i.imgur.com/CYJSMjJ.jpeg" width="700">

---

## Features

- **Real-time analysis** — Stockfish engine runs locally in your browser; no data is sent to any server
- **Top 3 move suggestions** with evaluation scores and mate detection
- **Opening explorer** — automatically identifies the opening from ECO databases (A–E)
- **Repertoire builder** — save and manage your favorite lines
- **Depth control** — configurable analysis depth from 5 to 25 half-moves
- **Auto-analyze mode** — triggers analysis automatically after each move
- **Move highlighting** — hover over a suggestion to see it highlighted on the board with an arrow
- **Customizable colors** — choose your own highlight and arrow colors
- **Works on both Chess.com and Lichess.org**
- **Chrome (Manifest V3) and Firefox (Manifest V2) support**

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or later
- npm v7 or later

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/Gnomee1337/chess-assistant.git
   cd chess-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
---

## Building the Extension

### Build for Chrome

```bash
# Development build
npm run build:chrome

# Production build (minified, optimized)
npm run build:chrome:prod

# Package as a .zip ready for the Chrome Web Store
npm run package:chrome
```

### Build for Firefox

```bash
# Development build
npm run build:firefox

# Production build
npm run build:firefox:prod

# Package as a .xpi ready for Firefox Add-ons
npm run package:firefox
```

### Build for both browsers (default)

```bash
# Development build (defaults to Chrome)
npm run build

# Watch mode — rebuilds automatically on file changes
npm run watch

# Watch mode for Firefox
npm run watch:firefox

# Clean the dist/ directory
npm run clean
```

Built files are output to:
- `dist/chrome/` — Chrome extension
- `dist/firefox/` — Firefox add-on

---

## Loading the Extension in Your Browser

### Chrome

1. Open `chrome://extensions/` in your browser
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/chrome/` folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Navigate to `dist/firefox/` and select `manifest.json`

> **Note:** Temporary add-ons in Firefox are removed when the browser is closed. For a persistent installation, the extension must be signed or installed via `about:addons`.

---

## Usage

1. Navigate to a game on [chess.com](https://www.chess.com) or [lichess.org](https://lichess.org)
2. The **Chess Assistant** overlay will appear in the top-right corner of the page
3. Click **Analyze** to get the top 3 suggested moves for the current position
4. Enable **AUTO** mode to have analysis triggered automatically after every move
5. Hover over a suggested move to highlight it on the board
6. Use the **popup icon** in your browser toolbar to adjust analysis depth and colors

### Overlay Controls

| Button | Description |
|--------|-------------|
| **ON / OFF** | Enable or disable the assistant |
| **AUTO / MANUAL** | Toggle automatic analysis after each move |
| **Analyze** | Manually trigger analysis of the current position |
| **−** | Collapse the overlay |
| **✕** | Hide the overlay (restore with the floating launcher button) |

---

## Project Structure

```
chess-assistant/
├── public/                  # Static assets copied into the build
│   ├── manifest.json        # Chrome MV3 manifest
│   ├── manifest.firefox.json# Firefox MV2 manifest
│   ├── offscreen.html       # Chrome MV3 offscreen document
│   ├── browser-polyfill.js  # Chrome/Firefox API compatibility shim
│   ├── icons/               # Extension icons
│   └── stockfish/           # Stockfish engine files (add manually)
├── src/
│   ├── background/          # Service worker / background page
│   │   ├── background.js    # Main background script
│   │   ├── offscreen.js     # Chrome offscreen Stockfish host
│   │   └── stockfish-worker-ff.js  # Firefox Stockfish worker wrapper
│   ├── content/             # Content scripts injected into chess sites
│   │   ├── index.js         # Entry point
│   │   ├── chess/           # Board parsing, FEN validation, move highlighting
│   │   ├── services/        # Analysis service, opening explorer
│   │   └── ui/              # Overlay component
│   ├── popup/               # Browser action popup (settings UI)
│   ├── shared/              # Shared constants, logger, storage helpers
│   └── styles/              # Overlay CSS
└── scripts/
    └── build.js             # Build script
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run build` | Development build (Chrome) |
| `npm run build:prod` | Production build (Chrome) |
| `npm run build:chrome` | Development build for Chrome |
| `npm run build:chrome:prod` | Production build for Chrome |
| `npm run build:firefox` | Development build for Firefox |
| `npm run build:firefox:prod` | Production build for Firefox |
| `npm run watch` | Watch mode (Chrome) |
| `npm run watch:firefox` | Watch mode (Firefox) |
| `npm run clean` | Remove `dist/` directory |
| `npm run package:chrome` | Build + package Chrome `.zip` |
| `npm run package:firefox` | Build + package Firefox `.xpi` |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |

---

## Credits

This project makes use of the following libraries:

- **[@hayatbiralem/eco.json](https://www.npmjs.com/package/@hayatbiralem/eco.json)** — ECO chess opening database in JSON format, used to identify openings by FEN or move sequence.
- **[@nmrugg/stockfish.js v10.0.2](https://www.npmjs.com/package/@nmrugg/stockfish.js)** — Stockfish chess engine compiled to JavaScript/WebAssembly, used for local position analysis.

For more details, refer to the documentation of each library.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Contributing

Pull requests and issues are welcome! Please open an issue first to discuss any significant changes.

## Disclaimer

This project is provided for educational, research, and development purposes only.

The software may include functionality that can interact with external systems, automate tasks, or process user-provided data. Improper or unauthorized use of these features may violate the terms of service of third-party platforms, local laws, or organizational policies.

By using this project, you agree to:

- Use it only on systems, accounts, and data you own or have explicit permission to access.
- Comply with all applicable laws, regulations, and third-party terms of service.
- Take full responsibility for how the software is used.

The authors and contributors do not encourage, support, or accept responsibility for any illegal, unethical, or unauthorized use of this project.
