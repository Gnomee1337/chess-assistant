/**
 * Chess board position parser for Chess.com and Lichess
 */

import { SELECTORS } from '../../shared/constants.js';
import { FENValidator } from './fen-validator.js';
import { Logger } from '../../shared/logger.js';

const logger = new Logger('BoardParser');

export class BoardParser {
    /**
     * Get current FEN from supported board providers
     * @returns {string|null} FEN string or null if unavailable
     */
    static getCurrentFEN() {
        try {
            // Try API method first
            const fenFromAPI = this.getFENFromAPI();
            if (fenFromAPI && FENValidator.validate(fenFromAPI)) {
                logger.log('Got FEN from API:', fenFromAPI);
                return fenFromAPI;
            }

            // Fallback to DOM parsing
            let fenFromDOM = this.parseBoardFromDOM();
            if (fenFromDOM && FENValidator.validate(fenFromDOM)) {
                logger.log('Parsed FEN from DOM:', fenFromDOM);

                // IMPORTANT: Verify the turn is correct based on move list
                const correctTurn = this.determineTurn();
                if (correctTurn) {
                    const parts = fenFromDOM.split(' ');
                    const fenTurn = parts[1];

                    // If turn doesn't match move list, correct it
                    if (fenTurn !== correctTurn) {
                        logger.warn(
                            `FEN turn mismatch! FEN says '${fenTurn}' but move list says '${correctTurn}'. Correcting...`
                        );
                        parts[1] = correctTurn;
                        fenFromDOM = parts.join(' ');
                        logger.log('Corrected FEN:', fenFromDOM);
                    }
                }

                logger.log('Parsed FEN from DOM:', fenFromDOM);
                logger.log('Current turn:', fenFromDOM.split(' ')[1] === 'w' ? 'WHITE' : 'BLACK');

                return fenFromDOM;
            }

            logger.error('Could not get valid FEN');
            return null;
        } catch (error) {
            logger.error('Error getting FEN:', error);
            return null;
        }
    }

    /**
     * Try to get FEN from Chess.com API
     * @returns {string|null}
     */
    static getFENFromAPI() {
        if (typeof window.chessboard === 'undefined' || !window.chessboard) {
            return null;
        }

        try {
            const board = window.chessboard;

            // Try relationship API
            if (board.getRelationship) {
                const rel = board.getRelationship();
                if (rel && rel.game && typeof rel.game.getFEN === 'function') {
                    return rel.game.getFEN();
                }
            }

            // Try direct getFEN method
            if (typeof board.getFEN === 'function') {
                return board.getFEN();
            }
        } catch (error) {
            logger.warn('API method failed:', error);
        }

        return null;
    }

    /**
     * Parse board position from DOM
     * @returns {string|null}
     */
    static parseBoardFromDOM() {
        try {
            const board = Array(8).fill(null).map(() => Array(8).fill(''));
            let foundPieces = false;

            const chessBoard = document.querySelector(SELECTORS.BOARD);
            if (!chessBoard) {
                logger.warn('Board element not found');
                return null;
            }

            const pieces = this.getPieceElements(chessBoard);
            if (pieces.length === 0) {
                logger.warn('No pieces found');
                return null;
            }

            pieces.forEach(piece => {
                const pieceInfo = this.parsePieceElement(piece);
                if (pieceInfo) {
                    const { char, rank, file } = pieceInfo;
                    if (rank >= 0 && rank < 8 && file >= 0 && file < 8) {
                        board[7 - rank][file] = char;
                        foundPieces = true;
                    }
                }
            });

            if (!foundPieces) {
                logger.warn('No valid pieces found');
                return null;
            }

            return this.buildFENString(board);
        } catch (error) {
            logger.error('Error parsing board:', error);
            return null;
        }
    }

    static getPieceElements(chessBoard) {
        const tagName = chessBoard.tagName?.toLowerCase();

        if (tagName === 'cg-board') {
            // Lichess: only board piece nodes are direct children of cg-board.
            // Ignore helper/animation elements such as ghost pieces.
            try {
                return Array.from(chessBoard.querySelectorAll(':scope > piece'))
                    .filter(piece => !piece.classList.contains('ghost'));
            } catch (error) {
                return Array.from(chessBoard.children)
                    .filter(node => node.tagName?.toLowerCase() === 'piece' && !node.classList.contains('ghost'));
            }
        }

        return Array.from(chessBoard.querySelectorAll(SELECTORS.PIECES));
    }

    /**
     * Parse a piece element to get piece info
     * @param {Element} piece - Piece DOM element
     * @returns {Object|null} {char, rank, file}
     */
    static parsePieceElement(piece) {
        const classes = piece.className || '';
        const pieceChar = this.getPieceChar(classes);

        if (!pieceChar) return null;

        const squareMatch = classes.match(/square-(\d)(\d)/);
        if (squareMatch) {
            return {
                char: pieceChar,
                file: parseInt(squareMatch[1], 10) - 1,
                rank: parseInt(squareMatch[2], 10) - 1
            };
        }

        const attrSquare = this.parseLichessSquareFromAttributes(piece);
        if (attrSquare) {
            return {
                char: pieceChar,
                file: attrSquare.file,
                rank: attrSquare.rank
            };
        }

        return this.parseLichessPieceElement(piece, pieceChar);
    }

    static parseLichessSquareFromAttributes(element) {
        const square = element.getAttribute('cgKey')
            || element.getAttribute('cgkey')
            || element.getAttribute('data-key')
            || element.getAttribute('key')
            || '';

        if (!/^[a-h][1-8]$/.test(square)) return null;

        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1], 10) - 1;
        if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

        return { file, rank };
    }

    static parseLichessPieceElement(piece, pieceChar) {
        const boardElement = piece.closest('cg-board');
        if (!boardElement) return null;

        const boardRect = boardElement.getBoundingClientRect();
        if (!boardRect.width || !boardRect.height) return null;

        const transform = piece.style.transform || '';
        const translateMatch = transform.match(/translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/);
        if (!translateMatch) return null;

        const x = parseFloat(translateMatch[1]);
        const y = parseFloat(translateMatch[2] || '0');
        if (Number.isNaN(x) || Number.isNaN(y)) return null;

        const squareSize = boardRect.width / 8;
        if (!squareSize) return null;

        const col = Math.round(x / squareSize);
        const row = Math.round(y / squareSize);
        if (col < 0 || col > 7 || row < 0 || row > 7) return null;

        const wrapClassName = piece.closest('.cg-wrap')?.className || '';
        const isBlackOrientation = wrapClassName.includes('orientation-black');

        const file = isBlackOrientation ? 7 - col : col;
        const boardRow = isBlackOrientation ? 7 - row : row;

        return {
            char: pieceChar,
            file,
            rank: 7 - boardRow
        };
    }

    /**
     * Get piece character from class name
     * @param {string} classes - Element class names
     * @returns {string|null}
     */
    static getPieceChar(classes) {
        const classTokens = new Set(
            String(classes)
                .split(/\s+/)
                .map(token => token.trim())
                .filter(Boolean)
        );

        // Chess.com piece classes (single-token shorthand)
        const chessComPieceMap = {
            wp: 'P', wn: 'N', wb: 'B', wr: 'R', wq: 'Q', wk: 'K',
            bp: 'p', bn: 'n', bb: 'b', br: 'r', bq: 'q', bk: 'k'
        };

        for (const [token, char] of Object.entries(chessComPieceMap)) {
            if (classTokens.has(token)) {
                return char;
            }
        }

        // Lichess piece classes (two-token format: "white pawn", "black king", etc.)
        if (classTokens.has('white')) {
            if (classTokens.has('pawn')) return 'P';
            if (classTokens.has('knight')) return 'N';
            if (classTokens.has('bishop')) return 'B';
            if (classTokens.has('rook')) return 'R';
            if (classTokens.has('queen')) return 'Q';
            if (classTokens.has('king')) return 'K';
        }

        if (classTokens.has('black')) {
            if (classTokens.has('pawn')) return 'p';
            if (classTokens.has('knight')) return 'n';
            if (classTokens.has('bishop')) return 'b';
            if (classTokens.has('rook')) return 'r';
            if (classTokens.has('queen')) return 'q';
            if (classTokens.has('king')) return 'k';
        }

        return null;
    }

    /**
     * Build FEN string from board array
     * @param {Array} board - 8x8 board array
     * @returns {string}
     */
    static buildFENString(board) {
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

        // Determine whose turn
        const toMove = this.determineTurn();

        // Add FEN metadata
        fen += ` ${toMove} KQkq - 0 1`;

        return fen;
    }

    /**
     * Determine whose turn it is
     * @returns {string} 'w' or 'b'
     */
    static determineTurn() {
        // PRIORITY 1: Check move list (most reliable for Chess.com)
        const moveListTurn = this.determineTurnFromMoveList();
        if (moveListTurn) {
            logger.log('Turn determined from move list:', moveListTurn);
            return moveListTurn;
        }

        // PRIORITY 2: Check highlights (board position)
        const turnFromHighlights = this.determineTurnFromHighlights();
        if (turnFromHighlights) {
            logger.log('Turn determined from highlights:', turnFromHighlights);
            return turnFromHighlights;
        }

        // PRIORITY 3: Lichess clock
        const lichessTurn = this.determineTurnFromLichessClock();
        if (lichessTurn) {
            logger.log('Turn determined from Lichess clock:', lichessTurn);
            return lichessTurn;
        }

        // PRIORITY 4: Lichess move list parsing (can be stale)
        const lichessMoveListTurn = this.determineTurnFromLichessMoveList();
        if (lichessMoveListTurn) {
            logger.log('Turn determined from Lichess move list:', lichessMoveListTurn);
            return lichessMoveListTurn;
        }

        // Default fallback
        logger.warn('Could not determine turn, defaulting to white');
        return 'w';
    }


    static determineTurnFromLichessMoveList() {
        const moveList = document.querySelector('l4x');
        if (!moveList) return null;

        const moves = Array.from(moveList.querySelectorAll('kwdb'));
        if (!moves.length) return null;

        let lastMoveIndex = -1;
        for (let idx = moves.length - 1; idx >= 0; idx--) {
            const move = moves[idx];
            if (move.classList.contains('a1t') ||
                move.classList.contains('active') ||
                move.classList.contains('current')) {
                lastMoveIndex = idx;
                break;
            }
        }

        if (lastMoveIndex < 0) {
            lastMoveIndex = moves.length - 1;
        }

        return lastMoveIndex % 2 === 0 ? 'b' : 'w';
    }

    static determineTurnFromLichessClock() {
        const topClock = document.querySelector('.rclock-top');
        const bottomClock = document.querySelector('.rclock-bottom');

        if (topClock?.classList.contains('rclock-turn')) {
            return this.getColorForPlayerPosition('top');
        }

        if (bottomClock?.classList.contains('rclock-turn')) {
            return this.getColorForPlayerPosition('bottom');
        }

        return null;
    }

    static getColorForPlayerPosition(position) {
        const boardWrap = document.querySelector('.cg-wrap');
        if (!boardWrap) return null;

        const isWhiteOrientation = boardWrap.classList.contains('orientation-white');
        const isBottomPlayerWhite = isWhiteOrientation;

        if (position === 'bottom') {
            return isBottomPlayerWhite ? 'w' : 'b';
        }

        if (position === 'top') {
            return isBottomPlayerWhite ? 'b' : 'w';
        }

        return null;
    }

    /**
     * Determine whose turn it is from last-move highlight squares.
     * Chess.com marks source and destination of the previous move. The destination
     * square still contains the moved piece, so we can infer the mover color and
     * return the opposite side to move.
     * @returns {string|null} 'w', 'b', or null when unavailable
     */
    static determineTurnFromHighlights() {
        const boardElement = document.querySelector(SELECTORS.BOARD);
        if (!boardElement) return null;

        if (boardElement.tagName?.toLowerCase() === 'cg-board') {
            return this.determineLichessTurnFromHighlights(boardElement);
        }

        const highlights = boardElement.querySelectorAll('.highlight[class*="square-"]');
        if (!highlights.length) return null;

        // The LAST highlighted square (destination) contains the piece that just moved
        const lastHighlight = highlights[highlights.length - 1];
        const squareMatch = lastHighlight.className.match(/square-(\d)(\d)/);

        if (!squareMatch) return null;

        const [, file, rank] = squareMatch;
        const occupyingPiece = boardElement.querySelector(`.piece.square-${file}${rank}`);

        if (!occupyingPiece) return null;

        // Check what color piece just moved
        if (occupyingPiece.classList.contains('wp') ||
            occupyingPiece.classList.contains('wn') ||
            occupyingPiece.classList.contains('wb') ||
            occupyingPiece.classList.contains('wr') ||
            occupyingPiece.classList.contains('wq') ||
            occupyingPiece.classList.contains('wk')) {
            return 'b';  // White moved, so BLACK to move next
        }

        if (occupyingPiece.classList.contains('bp') ||
            occupyingPiece.classList.contains('bn') ||
            occupyingPiece.classList.contains('bb') ||
            occupyingPiece.classList.contains('br') ||
            occupyingPiece.classList.contains('bq') ||
            occupyingPiece.classList.contains('bk')) {
            return 'w';  // Black moved, so WHITE to move next
        }

        return null;
    }

    static determineLichessTurnFromHighlights(boardElement) {
        const highlights = boardElement.querySelectorAll(':scope > square.last-move');
        if (!highlights.length) return null;

        const highlightedSquares = Array.from(highlights)
            .map((highlight) => this.parseLichessSquarePosition(highlight))
            .filter(Boolean);

        if (!highlightedSquares.length) return null;

        const pieces = this.getPieceElements(boardElement)
            .map((piece) => this.parsePieceElement(piece))
            .filter(Boolean);

        for (const square of highlightedSquares) {
            const pieceOnSquare = pieces.find(piece => piece.file === square.file && piece.rank === square.rank);
            if (!pieceOnSquare) continue;

            return pieceOnSquare.char === pieceOnSquare.char.toUpperCase() ? 'b' : 'w';
        }

        return null;
    }

    static parseLichessSquarePosition(squareElement) {
        const attrSquare = this.parseLichessSquareFromAttributes(squareElement);
        if (attrSquare) return attrSquare;

        const boardElement = squareElement.closest('cg-board');
        if (!boardElement) return null;

        const boardRect = boardElement.getBoundingClientRect();
        if (!boardRect.width || !boardRect.height) return null;

        const transform = squareElement.style.transform || '';
        const translateMatch = transform.match(/translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/);
        if (!translateMatch) return null;

        const x = parseFloat(translateMatch[1]);
        const y = parseFloat(translateMatch[2] || '0');
        if (Number.isNaN(x) || Number.isNaN(y)) return null;

        const squareSize = boardRect.width / 8;
        if (!squareSize) return null;

        const col = Math.round(x / squareSize);
        const row = Math.round(y / squareSize);
        if (col < 0 || col > 7 || row < 0 || row > 7) return null;

        const wrapClassName = squareElement.closest('.cg-wrap')?.className || '';
        const isBlackOrientation = wrapClassName.includes('orientation-black');

        const file = isBlackOrientation ? 7 - col : col;
        const boardRow = isBlackOrientation ? 7 - row : row;

        return {
            file,
            rank: 7 - boardRow
        };
    }

    /**
    * Determine turn from the selected/highlighted move in move list
    * Chess.com shows the last move highlighted with a .selected class
    * Determine turn from the move list
    * Looks at the LAST move to determine whose turn it is next
    */
    static determineTurnFromMoveList() {
        try {
            // Chess.com: Find ALL moves
            const allMoves = document.querySelectorAll('.move-list .node.main-line-ply');
            if (allMoves.length === 0) return null;

            const lastMove = allMoves[allMoves.length - 1];

            logger.log('Last move in list:', lastMove.className);

            // Check the CLASS of the last move
            if (lastMove.classList.contains('white-move')) {
                // White just moved → BLACK to move next
                return 'b';
            } else if (lastMove.classList.contains('black-move')) {
                // Black just moved → WHITE to move next
                return 'w';
            }
        } catch (error) {
            logger.warn('Could not determine turn from move list:', error);
        }

        return null;
    }
}
