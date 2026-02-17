/**
 * Move highlighting and arrow drawing utility
 */

import { COLORS, SELECTORS, FILES } from '../../shared/constants.js';
import { Logger } from '../../shared/logger.js';

const logger = new Logger('MoveHighlighter');

export class MoveHighlighter {
    static colors = {
        highlight: COLORS.HIGHLIGHT,
        arrow: COLORS.ARROW
    };

    static overlayHostId = 'chess-assistant-board-overlay-host';

    /**
     * Set highlight and arrow colors
     * @param {Object} colors
     * @param {string} colors.highlightColor
     * @param {string} colors.arrowColor
     */
    static setColors({ highlightColor, arrowColor }) {
        if (highlightColor) {
            this.colors.highlight = highlightColor;
        }

        if (arrowColor) {
            this.colors.arrow = arrowColor;
        }
    }

    /**
     * Highlight a move on the board
     * @param {string} uci - UCI move notation (e.g., "e2e4")
     */
    static highlight(uci) {
        this.clearAll();

        try {
            const board = this.getBoard();
            if (!board) return;

            const squares = this.uciToSquareNumbers(uci);
            const boardState = this.getBoardState(board);

            this.highlightSquares(squares, boardState);
            this.drawArrow(uci, boardState);
        } catch (error) {
            logger.error('Error highlighting move:', error);
        }
    }

    /**
     * Clear all highlights and arrows
     */
    static clearAll() {
        const host = document.getElementById(this.overlayHostId);
        if (host) {
            host.remove();
        }
    }

    static getBoard() {
        return document.querySelector(SELECTORS.BOARD);
    }

    static getBoardState(board) {
        const rect = board.getBoundingClientRect();
        return {
            board,
            rect,
            isFlipped: this.isBoardFlipped(board)
        };
    }

    static isBoardFlipped(board) {
        const classNames = `${board.className || ''} ${board.parentElement?.className || ''}`.toLowerCase();
        const orientation = (board.getAttribute('orientation') || '').toLowerCase();

        return classNames.includes('flipped') || classNames.includes('black') || orientation === 'black';
    }

    static getOverlayRoot(boardState) {
        let host = document.getElementById(this.overlayHostId);

        if (!host) {
            host = document.createElement('div');
            host.id = this.overlayHostId;
            host.style.position = 'fixed';
            host.style.pointerEvents = 'none';
            host.style.zIndex = '2147483646';
            document.body.appendChild(host);
        }

        const { rect } = boardState;
        host.style.left = `${rect.left}px`;
        host.style.top = `${rect.top}px`;
        host.style.width = `${rect.width}px`;
        host.style.height = `${rect.height}px`;

        if (!host.shadowRoot) {
            const shadowRoot = host.attachShadow({ mode: 'open' });
            shadowRoot.innerHTML = `
                <style>
                    .layer {
                        position: relative;
                        width: 100%;
                        height: 100%;
                    }

                    .highlight {
                        position: absolute;
                        width: 12.5%;
                        height: 12.5%;
                        opacity: 0.6;
                    }

                    svg {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        height: 100%;
                        overflow: visible;
                    }
                </style>
                <div class="layer" id="layer"></div>
            `;
        }

        return host.shadowRoot.getElementById('layer');
    }

    /**
     * Convert UCI notation to Chess.com square numbers
     * @param {string} uci - UCI move (e.g., "e2e4")
     * @returns {Object} {from, to} square numbers
     */
    static uciToSquareNumbers(uci) {
        const fileMap = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };

        const fromFile = fileMap[uci[0]];
        const fromRank = parseInt(uci[1], 10);
        const toFile = fileMap[uci[2]];
        const toRank = parseInt(uci[3], 10);

        return {
            from: fromFile * 10 + fromRank,
            to: toFile * 10 + toRank
        };
    }

    static squareToPosition(square, isFlipped) {
        const file = Math.floor(square / 10);
        const rank = square % 10;

        const x = isFlipped ? (8 - file) * 12.5 : (file - 1) * 12.5;
        const y = isFlipped ? (rank - 1) * 12.5 : (8 - rank) * 12.5;

        return { x, y };
    }

    /**
     * Highlight squares on the board
     * @param {Object} squares - {from, to} square numbers
     */
    static highlightSquares(squares, boardState) {
        const layer = this.getOverlayRoot(boardState);
        if (!layer) return;

        [squares.from, squares.to].forEach(square => {
            const { x, y } = this.squareToPosition(square, boardState.isFlipped);
            const highlight = document.createElement('div');
            highlight.className = 'highlight chess-assistant-highlight';
            highlight.style.left = `${x}%`;
            highlight.style.top = `${y}%`;
            highlight.style.backgroundColor = this.colors.highlight;
            highlight.setAttribute('data-test-element', 'highlight');
            highlight.setAttribute('data-test-type', 'highlight');
            layer.appendChild(highlight);
        });
    }

    /**
     * Draw arrow on the board
     * @param {string} uci - UCI move notation
     */
    static drawArrow(uci, boardState) {
        const layer = this.getOverlayRoot(boardState);
        if (!layer) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'chess-assistant-arrow-layer');

        const fromFile = FILES[uci[0]];
        const fromRank = parseInt(uci[1], 10) - 1;
        const toFile = FILES[uci[2]];
        const toRank = parseInt(uci[3], 10) - 1;

        const fromX = boardState.isFlipped ? (7 - fromFile) * 12.5 + 6.25 : fromFile * 12.5 + 6.25;
        const fromY = boardState.isFlipped ? fromRank * 12.5 + 6.25 : (7 - fromRank) * 12.5 + 6.25;
        const toX = boardState.isFlipped ? (7 - toFile) * 12.5 + 6.25 : toFile * 12.5 + 6.25;
        const toY = boardState.isFlipped ? toRank * 12.5 + 6.25 : (7 - toRank) * 12.5 + 6.25;

        this.createArrow(svg, fromX, fromY, toX, toY);
        layer.appendChild(svg);
    }

    /**
     * Create SVG arrow element
     * @param {SVGElement} svg - SVG container
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     */
    static createArrow(svg, x1, y1, x2, y2) {
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        arrow.setAttribute('x1', x1);
        arrow.setAttribute('y1', y1);
        arrow.setAttribute('x2', x2);
        arrow.setAttribute('y2', y2);
        arrow.setAttribute('stroke', this.colors.arrow);
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('marker-end', 'url(#arrowhead-chess-assistant)');
        arrow.setAttribute('opacity', '0.8');
        arrow.setAttribute('class', 'chess-assistant-arrow');

        this.ensureArrowMarker(svg);
        svg.appendChild(arrow);
    }

    /**
     * Ensure arrow marker exists in SVG
     * @param {SVGElement} svg - SVG container
     */
    static ensureArrowMarker(svg) {
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }

        let marker = defs.querySelector('#arrowhead-chess-assistant');
        if (!marker) {
            marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrowhead-chess-assistant');
            marker.setAttribute('markerWidth', '4');
            marker.setAttribute('markerHeight', '4');
            marker.setAttribute('refX', '2');
            marker.setAttribute('refY', '2');
            marker.setAttribute('orient', 'auto');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 4 2, 0 4');
            marker.appendChild(polygon);
            defs.appendChild(marker);
        }

        const polygon = marker.querySelector('polygon');
        if (polygon) {
            polygon.setAttribute('fill', this.colors.arrow);
        }
    }
}
