// Chess Assistant Content Script for chess.com
// Communicates with background script for analysis

(function () {
    'use strict';

    let backgroundPort = null;
    let isAnalyzing = false;
    let currentDepth = 15;
    let isEnabled = true;
    let autoAnalyze = true;
    let overlay = null;
    let topMoves = [];
    let lastMoveCount = 0;
    let moveObserver = null;

    // Connect to background script
    function connectToBackground() {
        if (backgroundPort) return;

        try {
            backgroundPort = chrome.runtime.connect({ name: 'chess-assistant' });

            backgroundPort.onMessage.addListener(function (msg) {
                if (msg.type === 'stockfish-message') {
                    handleStockfishMessage(msg.data);
                } else if (msg.type === 'stockfish-error') {
                    showError(msg.error);
                    isAnalyzing = false;
                }
            });

            backgroundPort.onDisconnect.addListener(function () {
                backgroundPort = null;
            });

            console.log('Chess Assistant - Connected to background');
        } catch (error) {
            console.error('Chess Assistant - Failed to connect:', error);
        }
    }

    // Handle messages from Stockfish (via background)
    function handleStockfishMessage(message) {
        if (typeof message !== 'string') return;

        if (message.includes('info depth') && message.includes('multipv')) {
            const depthMatch = message.match(/depth (\d+)/);
            const multipvMatch = message.match(/multipv (\d+)/);
            const scoreMatch = message.match(/score cp (-?\d+)/);
            const mateMatch = message.match(/score mate (-?\d+)/);
            const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][a-z]?)/);

            if (depthMatch && multipvMatch && moveMatch) {
                const depth = parseInt(depthMatch[1]);
                const multipv = parseInt(multipvMatch[1]);
                const move = moveMatch[1];

                if (depth === currentDepth) {
                    let score;
                    if (mateMatch) {
                        const mateIn = parseInt(mateMatch[1]);
                        score = mateIn > 0 ? 1000 : -1000;
                    } else if (scoreMatch) {
                        score = parseInt(scoreMatch[1]) / 100.0;
                    } else {
                        return;
                    }

                    topMoves[multipv - 1] = {
                        move: move,
                        score: score,
                        multipv: multipv
                    };
                }
            }
        } else if (message.includes('bestmove')) {
            if (topMoves.length > 0) {
                const validMoves = topMoves.filter(m => m !== undefined);
                validMoves.sort((a, b) => b.score - a.score);
                displayTopMoves(validMoves.slice(0, 3));
            } else {
                showError('No moves found');
            }
            topMoves = [];
            isAnalyzing = false;
        }
    }

    // Convert UCI move (e.g., "e2e4") to chess.com square numbers
    function uciToSquareNumbers(uci) {
        const files = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };

        const fromFile = files[uci[0]];
        const fromRank = parseInt(uci[1]);
        const toFile = files[uci[2]];
        const toRank = parseInt(uci[3]);

        const fromSquare = fromFile * 10 + fromRank;
        const toSquare = toFile * 10 + toRank;

        return { from: fromSquare, to: toSquare };
    }

    // Highlight move on the board
    function highlightMove(uci) {
        clearHighlights();

        try {
            const squares = uciToSquareNumbers(uci);
            const board = document.querySelector('wc-chess-board');

            if (!board) return;

            const fromHighlight = document.createElement('div');
            fromHighlight.className = `highlight square-${squares.from} chess-assistant-highlight`;
            fromHighlight.style.backgroundColor = 'rgb(155, 199, 0)';
            fromHighlight.style.opacity = '0.6';
            fromHighlight.setAttribute('data-test-element', 'highlight');
            fromHighlight.setAttribute('data-test-type', 'highlight');

            const toHighlight = document.createElement('div');
            toHighlight.className = `highlight square-${squares.to} chess-assistant-highlight`;
            toHighlight.style.backgroundColor = 'rgb(155, 199, 0)';
            toHighlight.style.opacity = '0.6';
            toHighlight.setAttribute('data-test-element', 'highlight');
            toHighlight.setAttribute('data-test-type', 'highlight');

            board.appendChild(fromHighlight);
            board.appendChild(toHighlight);

            drawArrow(uci);

        } catch (error) {
            console.error('Chess Assistant - Error highlighting move:', error);
        }
    }

    // Draw arrow on the board
    function drawArrow(uci) {
        try {
            const board = document.querySelector('wc-chess-board');
            if (!board) return;

            const arrowsSvg = board.querySelector('svg.arrows');
            if (!arrowsSvg) return;

            const files = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
            const fromFile = files[uci[0]];
            const fromRank = parseInt(uci[1]) - 1;
            const toFile = files[uci[2]];
            const toRank = parseInt(uci[3]) - 1;

            const fromX = fromFile * 12.5 + 6.25;
            const fromY = (7 - fromRank) * 12.5 + 6.25;
            const toX = toFile * 12.5 + 6.25;
            const toY = (7 - toRank) * 12.5 + 6.25;

            // Create arrow (SVG line element)
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            arrow.setAttribute('x1', fromX);
            arrow.setAttribute('y1', fromY);
            arrow.setAttribute('x2', toX);
            arrow.setAttribute('y2', toY);
            arrow.setAttribute('stroke', 'rgb(155, 199, 0)');
            arrow.setAttribute('stroke-width', '1.5');
            arrow.setAttribute('stroke-linecap', 'round');
            arrow.setAttribute('marker-end', 'url(#arrowhead-green)');
            arrow.setAttribute('opacity', '0.8');
            arrow.setAttribute('class', 'chess-assistant-arrow');

            // Create arrowhead marker if it doesn't exist
            let defs = arrowsSvg.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                arrowsSvg.appendChild(defs);
            }

            if (!defs.querySelector('#arrowhead-green')) {
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.setAttribute('id', 'arrowhead-green');
                marker.setAttribute('markerWidth', '4');
                marker.setAttribute('markerHeight', '4');
                marker.setAttribute('refX', '2');
                marker.setAttribute('refY', '2');
                marker.setAttribute('orient', 'auto');

                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                polygon.setAttribute('points', '0 0, 4 2, 0 4');
                polygon.setAttribute('fill', 'rgb(155, 199, 0)');

                marker.appendChild(polygon);
                defs.appendChild(marker);
            }

            arrowsSvg.appendChild(arrow);

        } catch (error) {
            console.error('Chess Assistant - Error drawing arrow:', error);
        }
    }

    // Clear all highlights and arrows
    function clearHighlights() {
        const highlights = document.querySelectorAll('.chess-assistant-highlight');
        highlights.forEach(h => h.remove());

        const arrows = document.querySelectorAll('.chess-assistant-arrow');
        arrows.forEach(a => a.remove());
    }

    // Validate FEN string
    function validateFEN(fen) {
        if (!fen || typeof fen !== 'string') return false;

        const parts = fen.split(' ');
        if (parts.length < 2) return false;

        const position = parts[0];
        const ranks = position.split('/');

        // Should have 8 ranks
        if (ranks.length !== 8) return false;

        // Check each rank
        for (let rank of ranks) {
            let squares = 0;
            for (let char of rank) {
                if ('12345678'.includes(char)) {
                    squares += parseInt(char);
                } else if ('pnbrqkPNBRQK'.includes(char)) {
                    squares += 1;
                } else {
                    return false;
                }
            }
            if (squares !== 8) return false;
        }

        // Turn should be 'w' or 'b'
        if (parts[1] !== 'w' && parts[1] !== 'b') return false;

        return true;
    }

    // Get current position FEN from chess.com
    function getCurrentFEN() {
        try {
            // Try to get FEN from chess.com API
            if (typeof window.chessboard !== 'undefined' && window.chessboard) {
                try {
                    const board = window.chessboard;
                    if (board.getRelationship) {
                        const rel = board.getRelationship();
                        if (rel && rel.game && typeof rel.game.getFEN === 'function') {
                            const fen = rel.game.getFEN();
                            if (fen && validateFEN(fen)) {
                                console.log('Chess Assistant - Got FEN from API:', fen);
                                return fen;
                            }
                        }
                    }
                    if (typeof board.getFEN === 'function') {
                        const fen = board.getFEN();
                        if (fen && validateFEN(fen)) {
                            console.log('Chess Assistant - Got FEN from board API:', fen);
                            return fen;
                        }
                    }
                } catch (e) {
                    console.log('Chess Assistant - API method failed:', e);
                }
            }

            // Fallback: parse from DOM
            const fen = parseBoardFromDOM();
            if (fen && validateFEN(fen)) {
                console.log('Chess Assistant - Parsed FEN from DOM:', fen);
                return fen;
            }

            console.error('Chess Assistant - Could not get valid FEN');
            return null;

        } catch (error) {
            console.error('Chess Assistant - Error getting FEN:', error);
            return null;
        }
    }

    // Parse board from DOM
    function parseBoardFromDOM() {
        try {
            const board = Array(8).fill(null).map(() => Array(8).fill(''));
            let foundPieces = false;

            const chessBoard = document.querySelector('wc-chess-board, chess-board, .board');
            if (!chessBoard) {
                console.log('Chess Assistant - Board element not found');
                return null;
            }

            const pieces = chessBoard.querySelectorAll('[class*="piece"]');
            console.log('Chess Assistant - Found', pieces.length, 'pieces');

            if (pieces.length === 0) return null;

            pieces.forEach(piece => {
                const classes = piece.className;

                let pieceChar = '';

                if (classes.includes('wp')) pieceChar = 'P';
                else if (classes.includes('wn')) pieceChar = 'N';
                else if (classes.includes('wb')) pieceChar = 'B';
                else if (classes.includes('wr')) pieceChar = 'R';
                else if (classes.includes('wq')) pieceChar = 'Q';
                else if (classes.includes('wk')) pieceChar = 'K';
                else if (classes.includes('bp')) pieceChar = 'p';
                else if (classes.includes('bn')) pieceChar = 'n';
                else if (classes.includes('bb')) pieceChar = 'b';
                else if (classes.includes('br')) pieceChar = 'r';
                else if (classes.includes('bq')) pieceChar = 'q';
                else if (classes.includes('bk')) pieceChar = 'k';

                if (!pieceChar) return;

                const squareMatch = classes.match(/square-(\d)(\d)/);
                if (squareMatch) {
                    const file = parseInt(squareMatch[1]) - 1;
                    const rank = parseInt(squareMatch[2]) - 1;

                    if (rank >= 0 && rank < 8 && file >= 0 && file < 8) {
                        board[7 - rank][file] = pieceChar;
                        foundPieces = true;
                    }
                }
            });

            if (!foundPieces) {
                console.log('Chess Assistant - No pieces found in board array');
                return null;
            }

            // Build FEN string
            let fen = '';
            for (let rank = 0; rank < 8; rank++) {
                let empty = 0;
                for (let file = 0; file < 8; file++) {
                    if (board[rank][file]) {
                        if (empty > 0) {
                            fen += empty;
                            empty = 0;
                        }
                        fen += board[rank][file];
                    } else {
                        empty++;
                    }
                }
                if (empty > 0) fen += empty;
                if (rank < 7) fen += '/';
            }

            // Determine whose turn it is
            let toMove = 'w';
            try {
                const lastMove = document.querySelector('.move-list .node.selected');
                if (lastMove) {
                    if (lastMove.classList.contains('black-move')) {
                        toMove = 'w';
                    } else if (lastMove.classList.contains('white-move')) {
                        toMove = 'b';
                    }
                }
            } catch (e) {
                console.log('Chess Assistant - Could not determine turn, defaulting to white');
            }

            fen += ` ${toMove} KQkq - 0 1`;

            return fen.includes('/') && fen.split('/').length === 8 ? fen : null;

        } catch (error) {
            console.error('Chess Assistant - Error parsing board:', error);
            return null;
        }
    }

    // Analyze current position
    function analyzePosition() {
        if (!isEnabled || isAnalyzing) {
            console.log('Chess Assistant - Skipping analysis (enabled:', isEnabled, 'analyzing:', isAnalyzing, ')');
            return;
        }

        if (!backgroundPort) {
            connectToBackground();
            setTimeout(analyzePosition, 500);
            return;
        }

        const fen = getCurrentFEN();
        if (!fen) {
            showError('Could not read board position. Try refreshing the page.');
            return;
        }

        if (!validateFEN(fen)) {
            showError('Invalid board position detected');
            console.error('Chess Assistant - Invalid FEN:', fen);
            return;
        }

        console.log('Chess Assistant - Analyzing:', fen);
        isAnalyzing = true;
        topMoves = [];

        const movesContainer = document.getElementById('chess-assistant-moves');
        if (movesContainer) {
            movesContainer.innerHTML = '<div class="loading">Analyzing position...</div>';
        }

        backgroundPort.postMessage({
            type: 'analyze',
            fen: fen,
            depth: currentDepth
        });
    }

    // Setup move observer to auto-analyze
    function setupMoveObserver() {
        const moveList = document.querySelector('.move-list, wc-simple-move-list');
        if (!moveList) {
            console.log('Chess Assistant - Move list not found, retrying...');
            setTimeout(setupMoveObserver, 1000);
            return;
        }

        console.log('Chess Assistant - Setting up move observer');

        moveObserver = new MutationObserver(function (mutations) {
            if (!autoAnalyze || !isEnabled) return;

            // Check if a new move was added
            const currentMoveCount = document.querySelectorAll('.move-list .node').length;

            if (currentMoveCount > lastMoveCount) {
                lastMoveCount = currentMoveCount;
                console.log('Chess Assistant - New move detected, auto-analyzing...');

                // Wait for board to update
                setTimeout(() => {
                    if (!isAnalyzing) {
                        analyzePosition();
                    }
                }, 500);
            }
        });

        moveObserver.observe(moveList, {
            childList: true,
            subtree: true
        });

        // Set initial move count
        lastMoveCount = document.querySelectorAll('.move-list .node').length;
    }

    // Create overlay UI
    function createOverlay() {
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.id = 'chess-assistant-overlay';
        overlay.innerHTML = `
      <div class="chess-assistant-header">
        <span>♟️ Chess Assistant</span>
        <button id="chess-assistant-toggle" class="toggle-btn">ON</button>
        <button id="chess-assistant-auto" class="auto-btn" title="Auto-analyze after each move">AUTO</button>
        <button id="chess-assistant-analyze" class="analyze-btn">Analyze</button>
      </div>
      <div id="chess-assistant-moves" class="moves-container">
        <div class="loading">Auto-analysis enabled</div>
      </div>
    `;

        document.body.appendChild(overlay);

        document.getElementById('chess-assistant-toggle').addEventListener('click', toggleAssistant);
        document.getElementById('chess-assistant-auto').addEventListener('click', toggleAutoAnalyze);
        document.getElementById('chess-assistant-analyze').addEventListener('click', analyzePosition);

        updateAutoButton();
    }

    // Toggle auto-analyze
    function toggleAutoAnalyze() {
        autoAnalyze = !autoAnalyze;
        updateAutoButton();

        const movesContainer = document.getElementById('chess-assistant-moves');
        if (movesContainer && !isAnalyzing) {
            movesContainer.innerHTML = autoAnalyze
                ? '<div class="loading">Auto-analysis enabled</div>'
                : '<div class="loading">Click "Analyze" to get move suggestions</div>';
        }

        chrome.storage.sync.set({ autoAnalyze: autoAnalyze });
    }

    // Update auto button appearance
    function updateAutoButton() {
        const autoBtn = document.getElementById('chess-assistant-auto');
        if (autoBtn) {
            autoBtn.textContent = autoAnalyze ? 'AUTO' : 'MANUAL';
            autoBtn.classList.toggle('off', !autoAnalyze);
        }
    }

    // Toggle assistant
    function toggleAssistant() {
        isEnabled = !isEnabled;
        const toggleBtn = document.getElementById('chess-assistant-toggle');
        toggleBtn.textContent = isEnabled ? 'ON' : 'OFF';
        toggleBtn.classList.toggle('off', !isEnabled);

        const movesContainer = document.getElementById('chess-assistant-moves');
        if (movesContainer) {
            movesContainer.innerHTML = isEnabled
                ? (autoAnalyze ? '<div class="loading">Auto-analysis enabled</div>' : '<div class="loading">Click "Analyze" to get move suggestions</div>')
                : '<div class="loading">Assistant disabled</div>';
        }

        chrome.storage.sync.set({ enabled: isEnabled });
    }

    // Display top moves
    function displayTopMoves(moves) {
        const movesContainer = document.getElementById('chess-assistant-moves');
        if (!movesContainer) return;

        if (moves.length === 0) {
            movesContainer.innerHTML = '<div class="loading">No moves found</div>';
            return;
        }

        let html = '';
        moves.forEach((moveData, index) => {
            let scoreStr;
            if (Math.abs(moveData.score) > 100) {
                scoreStr = moveData.score > 0 ? 'Mate!' : '-Mate';
            } else {
                scoreStr = moveData.score > 0 ? '+' + moveData.score.toFixed(2) : moveData.score.toFixed(2);
            }

            const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : '🥉');

            html += `
        <div class="move-item" data-move="${moveData.move}">
          <span class="medal">${medal}</span>
          <span class="move">${moveData.move}</span>
          <span class="score">${scoreStr}</span>
        </div>
      `;
        });

        movesContainer.innerHTML = html;

        const moveItems = movesContainer.querySelectorAll('.move-item');
        moveItems.forEach(item => {
            item.addEventListener('mouseenter', function () {
                const move = this.getAttribute('data-move');
                highlightMove(move);
            });

            item.addEventListener('mouseleave', function () {
                clearHighlights();
            });
        });
    }

    // Show error
    function showError(message) {
        const movesContainer = document.getElementById('chess-assistant-moves');
        if (movesContainer) {
            movesContainer.innerHTML = `<div class="loading" style="color: #ff6b6b;">${message}</div>`;
        }
    }

    // Load settings
    function loadSettings() {
        chrome.storage.sync.get(['depth', 'enabled', 'autoAnalyze'], function (result) {
            if (result && result.depth) {
                currentDepth = result.depth;
            }
            if (result && result.enabled !== undefined) {
                isEnabled = result.enabled;
            }
            if (result && result.autoAnalyze !== undefined) {
                autoAnalyze = result.autoAnalyze;
            }
            updateAutoButton();
        });
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (changes.depth) {
            currentDepth = changes.depth.newValue;
        }
        if (changes.enabled !== undefined) {
            isEnabled = changes.enabled.newValue;
            const toggleBtn = document.getElementById('chess-assistant-toggle');
            if (toggleBtn) {
                toggleBtn.textContent = isEnabled ? 'ON' : 'OFF';
                toggleBtn.classList.toggle('off', !isEnabled);
            }
        }
        if (changes.autoAnalyze !== undefined) {
            autoAnalyze = changes.autoAnalyze.newValue;
            updateAutoButton();
        }
    });

    // Initialize
    function initialize() {
        console.log('Chess Assistant - Initializing...');
        loadSettings();

        setTimeout(() => {
            connectToBackground();
            createOverlay();
            setupMoveObserver();
            console.log('Chess Assistant - Ready!');
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();