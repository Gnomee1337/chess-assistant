/**
 * Chess board position parser for Chess.com
 */

import { PIECE_CHARS, SELECTORS } from '../../shared/constants.js';
import { FENValidator } from './fen-validator.js';
import { Logger } from '../../shared/logger.js';

const logger = new Logger('BoardParser');

export class BoardParser {
    /**
     * Get current FEN from chess.com board
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
            const fenFromDOM = this.parseBoardFromDOM();
            if (fenFromDOM && FENValidator.validate(fenFromDOM)) {
                logger.log('Parsed FEN from DOM:', fenFromDOM);
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

            const pieces = chessBoard.querySelectorAll(SELECTORS.PIECES);
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

    /**
     * Parse a piece element to get piece info
     * @param {Element} piece - Piece DOM element
     * @returns {Object|null} {char, rank, file}
     */
    static parsePieceElement(piece) {
        const classes = piece.className;
        const pieceChar = this.getPieceChar(classes);

        if (!pieceChar) return null;

        const squareMatch = classes.match(/square-(\d)(\d)/);
        if (!squareMatch) return null;

        return {
            char: pieceChar,
            file: parseInt(squareMatch[1]) - 1,
            rank: parseInt(squareMatch[2]) - 1
        };
    }

    /**
     * Get piece character from class name
     * @param {string} classes - Element class names
     * @returns {string|null}
     */
    static getPieceChar(classes) {
        const pieceMap = {
            'wp': 'P', 'wn': 'N', 'wb': 'B', 'wr': 'R', 'wq': 'Q', 'wk': 'K',
            'bp': 'p', 'bn': 'n', 'bb': 'b', 'br': 'r', 'bq': 'q', 'bk': 'k'
        };

        for (const [key, value] of Object.entries(pieceMap)) {
            if (classes.includes(key)) {
                return value;
            }
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
        const turnFromHighlights = this.determineTurnFromHighlights();
        if (turnFromHighlights) {
            return turnFromHighlights;
        }

        try {
            const lastMove = document.querySelector('.move-list .node.selected');
            if (lastMove) {
                if (lastMove.classList.contains('black-move')) {
                    return 'w';
                } else if (lastMove.classList.contains('white-move')) {
                    return 'b';
                }
            }
        } catch (error) {
            logger.warn('Could not determine turn:', error);
        }

        return 'w'; // Default to white
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

        const highlights = boardElement.querySelectorAll('.highlight[class*="square-"]');
        if (!highlights.length) return null;

        for (const highlight of highlights) {
            const squareMatch = highlight.className.match(/square-(\d)(\d)/);
            if (!squareMatch) continue;

            const [, file, rank] = squareMatch;
            const occupyingPiece = boardElement.querySelector(`.piece.square-${file}${rank}`);
            if (!occupyingPiece) continue;

            if (occupyingPiece.classList.contains('wp') ||
                occupyingPiece.classList.contains('wn') ||
                occupyingPiece.classList.contains('wb') ||
                occupyingPiece.classList.contains('wr') ||
                occupyingPiece.classList.contains('wq') ||
                occupyingPiece.classList.contains('wk')) {
                return 'b';
            }

            if (occupyingPiece.classList.contains('bp') ||
                occupyingPiece.classList.contains('bn') ||
                occupyingPiece.classList.contains('bb') ||
                occupyingPiece.classList.contains('br') ||
                occupyingPiece.classList.contains('bq') ||
                occupyingPiece.classList.contains('bk')) {
                return 'w';
            }
        }

        return null;
    }
}
