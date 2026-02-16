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
            const squares = this.uciToSquareNumbers(uci);
            this.highlightSquares(squares);
            this.drawArrow(uci);
        } catch (error) {
            logger.error('Error highlighting move:', error);
        }
    }

    /**
     * Clear all highlights and arrows
     */
    static clearAll() {
        const highlights = document.querySelectorAll('.chess-assistant-highlight');
        highlights.forEach(h => h.remove());

        const arrows = document.querySelectorAll('.chess-assistant-arrow');
        arrows.forEach(a => a.remove());
    }

    /**
     * Convert UCI notation to Chess.com square numbers
     * @param {string} uci - UCI move (e.g., "e2e4")
     * @returns {Object} {from, to} square numbers
     */
    static uciToSquareNumbers(uci) {
        const fileMap = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };

        const fromFile = fileMap[uci[0]];
        const fromRank = parseInt(uci[1]);
        const toFile = fileMap[uci[2]];
        const toRank = parseInt(uci[3]);

        return {
            from: fromFile * 10 + fromRank,
            to: toFile * 10 + toRank
        };
    }

    /**
     * Highlight squares on the board
     * @param {Object} squares - {from, to} square numbers
     */
    static highlightSquares(squares) {
        const board = document.querySelector(SELECTORS.BOARD);
        if (!board) return;

        [squares.from, squares.to].forEach(square => {
            const highlight = document.createElement('div');
            highlight.className = `highlight square-${square} chess-assistant-highlight`;
            highlight.style.backgroundColor = this.colors.highlight;
            highlight.style.opacity = '0.6';
            highlight.setAttribute('data-test-element', 'highlight');
            highlight.setAttribute('data-test-type', 'highlight');
            board.appendChild(highlight);
        });
    }

    /**
     * Draw arrow on the board
     * @param {string} uci - UCI move notation
     */
    static drawArrow(uci) {
        const board = document.querySelector(SELECTORS.BOARD);
        if (!board) return;

        const arrowsSvg = board.querySelector(SELECTORS.ARROWS_SVG);
        if (!arrowsSvg) return;

        const fromFile = FILES[uci[0]];
        const fromRank = parseInt(uci[1], 10) - 1;
        const toFile = FILES[uci[2]];
        const toRank = parseInt(uci[3], 10) - 1;

        const fromX = fromFile * 12.5 + 6.25;
        const fromY = (7 - fromRank) * 12.5 + 6.25;
        const toX = toFile * 12.5 + 6.25;
        const toY = (7 - toRank) * 12.5 + 6.25;

        this.createArrow(arrowsSvg, fromX, fromY, toX, toY);
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
