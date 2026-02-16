// Chess Assistant Content Script for chess.com
// Communicates with background script for analysis

(function () {
    'use strict';

    let backgroundPort = null;
    let isAnalyzing = false;
    let currentDepth = 15;
    let isEnabled = true;
    let overlay = null;
    let topMoves = [];

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

        // Chess.com uses format: square-XY where X is file (1-8), Y is rank (1-8)
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

            // Create highlight for source square
            const fromHighlight = document.createElement('div');
            fromHighlight.className = `highlight square-${squares.from} chess-assistant-highlight`;
            fromHighlight.style.backgroundColor = 'rgb(155, 199, 0)';
            fromHighlight.style.opacity = '0.6';
            fromHighlight.setAttribute('data-test-element', 'highlight');
            fromHighlight.setAttribute('data-test-type', 'highlight');

            // Create highlight for destination square
            const toHighlight = document.createElement('div');
            toHighlight.className = `highlight square-${squares.to} chess-assistant-highlight`;
            toHighlight.style.backgroundColor = 'rgb(155, 199, 0)';
            toHighlight.style.opacity = '0.6';
            toHighlight.setAttribute('data-test-element', 'highlight');
            toHighlight.setAttribute('data-test-type', 'highlight');

            // Add to board
            board.appendChild(fromHighlight);
            board.appendChild(toHighlight);

            // Draw arrow
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

            // Calculate coordinates (each square is 12.5% of board)
            const fromX = fromFile * 12.5 + 6.25;
            const fromY = (7 - fromRank) * 12.5 + 6.25;
            const toX = toFile * 12.5 + 6.25;
            const toY = (7 - toRank) * 12.5 + 6.25;

            // Create arrow
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
            arrow.className = 'chess-assistant-arrow';

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
        // Remove highlight divs
        const highlights = document.querySelectorAll('.chess-assistant-highlight');
        highlights.forEach(h => h.remove());

        // Remove arrows
        const arrows = document.querySelectorAll('.chess-assistant-arrow');
        arrows.forEach(a => a.remove());
    }

    // Get current position FEN from chess.com
    function getCurrentFEN() {
        try {
            // Method 1: Try window.chessboard
            if (typeof window.chessboard !== 'undefined' && window.chessboard) {
                try {
                    const board = window.chessboard;
                    if (board.getRelationship) {
                        const rel = board.getRelationship();
                        if (rel && rel.game && typeof rel.game.getFEN === 'function') {
                            const fen = rel.game.getFEN();
                            if (fen) return fen;
                        }
                    }
                    if (typeof board.getFEN === 'function') {
                        const fen = board.getFEN();
                        if (fen) return fen;
                    }
                } catch (e) { }
            }

            // Method 2: Parse from DOM
            const fen = parseBoardFromDOM();
            if (fen) return fen;

            // Method 3: Starting position
            return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        } catch (error) {
            console.error('Chess Assistant - Error getting FEN:', error);
            return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        }
    }

    // Parse board from DOM - FIXED 
    function parseBoardFromDOM() {
        try {
            const board = Array(8).fill(null).map(() => Array(8).fill(''));
            let foundPieces = false;

            // Find the chess board element
            const chessBoard = document.querySelector('wc-chess-board, chess-board, .board');
            if (!chessBoard) {
                console.log('Chess Assistant - Board element not found');
                return null;
            }

            // Find all piece elements
            const pieces = chessBoard.querySelectorAll('[class*="piece"]');
            console.log('Chess Assistant - Found', pieces.length, 'pieces');

            if (pieces.length === 0) return null;

            pieces.forEach(piece => {
                const classes = piece.className;

                // Determine piece type and color
                let pieceChar = '';

                // White pieces
                if (classes.includes('wp')) pieceChar = 'P';
                else if (classes.includes('wn')) pieceChar = 'N';
                else if (classes.includes('wb')) pieceChar = 'B';
                else if (classes.includes('wr')) pieceChar = 'R';
                else if (classes.includes('wq')) pieceChar = 'Q';
                else if (classes.includes('wk')) pieceChar = 'K';
                // Black pieces
                else if (classes.includes('bp')) pieceChar = 'p';
                else if (classes.includes('bn')) pieceChar = 'n';
                else if (classes.includes('bb')) pieceChar = 'b';
                else if (classes.includes('br')) pieceChar = 'r';
                else if (classes.includes('bq')) pieceChar = 'q';
                else if (classes.includes('bk')) pieceChar = 'k';

                if (!pieceChar) return;

                // Extract square position - format is "square-XY" where X=file(1-8), Y=rank(1-8)
                const squareMatch = classes.match(/square-(\d)(\d)/);
                if (squareMatch) {
                    const file = parseInt(squareMatch[1]) - 1; // 0-7
                    const rank = parseInt(squareMatch[2]) - 1; // 0-7

                    if (rank >= 0 && rank < 8 && file >= 0 && file < 8) {
                        // Chess.com uses rank 1 = index 0, so we need to invert
                        board[7 - rank][file] = pieceChar;
                        foundPieces = true;
                    }
                }
            });

            if (!foundPieces) {
                console.log('Chess Assistant - No pieces found in board array');
                return null;
            }

            // Convert board array to FEN notation
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

            // Determine whose turn it is by checking move list
            let toMove = 'w';
            try {
                const lastMove = document.querySelector('.move-list .node.selected');
                if (lastMove) {
                    if (lastMove.classList.contains('black-move')) {
                        toMove = 'w'; // Black just moved, white's turn
                    } else if (lastMove.classList.contains('white-move')) {
                        toMove = 'b'; // White just moved, black's turn
                    }
                }
            } catch (e) {
                console.log('Chess Assistant - Could not determine turn, defaulting to white');
            }

            // Add turn, castling rights, en passant, etc.
            // Simplified - assumes all castling rights available
            fen += ` ${toMove} KQkq - 0 1`;

            console.log('Chess Assistant - Parsed FEN:', fen);

            return fen.includes('/') ? fen : null;

        } catch (error) {
            console.error('Chess Assistant - Error parsing board:', error);
            return null;
        }
    }

    // Analyze current position
    function analyzePosition() {
        if (!isEnabled || isAnalyzing) return;

        if (!backgroundPort) {
            connectToBackground();
            setTimeout(analyzePosition, 500);
            return;
        }

        const fen = getCurrentFEN();
        if (!fen) {
            showError('Could not read board position');
            return;
        }

        console.log('Chess Assistant - Analyzing:', fen);
        isAnalyzing = true;
        topMoves = [];

        const movesContainer = document.getElementById('chess-assistant-moves');
        if (movesContainer) {
            movesContainer.innerHTML = '<div class="loading">Analyzing position...</div>';
        }

        // Send to background script
        backgroundPort.postMessage({
            type: 'analyze',
            fen: fen,
            depth: currentDepth
        });
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
        <button id="chess-assistant-analyze" class="analyze-btn">Analyze</button>
      </div>
      <div id="chess-assistant-moves" class="moves-container">
        <div class="loading">Click "Analyze" to get move suggestions</div>
      </div>
    `;

        document.body.appendChild(overlay);

        document.getElementById('chess-assistant-toggle').addEventListener('click', toggleAssistant);
        document.getElementById('chess-assistant-analyze').addEventListener('click', analyzePosition);
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
                ? '<div class="loading">Click "Analyze" to get move suggestions</div>'
                : '<div class="loading">Assistant disabled</div>';
        }
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

        // Add hover event listeners
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
        chrome.storage.sync.get(['depth', 'enabled'], function (result) {
            if (result && result.depth) {
                currentDepth = result.depth;
            }
            if (result && result.enabled !== undefined) {
                isEnabled = result.enabled;
            }
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
    });

    // Initialize
    function initialize() {
        console.log('Chess Assistant - Initializing...');
        loadSettings();

        setTimeout(() => {
            connectToBackground();
            createOverlay();
            console.log('Chess Assistant - Ready!');
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();