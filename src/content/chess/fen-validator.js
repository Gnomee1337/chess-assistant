/**
 * FEN (Forsyth-Edwards Notation) validation utility
 */

import { Logger } from '../../shared/logger.js';

const logger = new Logger('FENValidator');

export class FENValidator {
    /**
     * Validate a FEN string
     * @param {string} fen - FEN string to validate
     * @returns {boolean} True if valid
     */
    static validate(fen) {
        if (!fen || typeof fen !== 'string') {
            logger.warn('FEN is not a string:', fen);
            return false;
        }

        const parts = fen.split(' ');
        if (parts.length < 2) {
            logger.warn('FEN has insufficient parts:', parts.length);
            return false;
        }

        // Validate board position
        if (!this.validatePosition(parts[0])) {
            return false;
        }

        // Validate active color
        if (!this.validateActiveColor(parts[1])) {
            return false;
        }

        return true;
    }

    /**
     * Validate board position part of FEN
     * @param {string} position - Board position string
     * @returns {boolean}
     */
    static validatePosition(position) {
        const ranks = position.split('/');

        if (ranks.length !== 8) {
            logger.warn('Position has incorrect number of ranks:', ranks.length);
            return false;
        }

        for (const rank of ranks) {
            if (!this.validateRank(rank)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate a single rank
     * @param {string} rank - Rank string
     * @returns {boolean}
     */
    static validateRank(rank) {
        let squares = 0;

        for (const char of rank) {
            if ('12345678'.includes(char)) {
                squares += parseInt(char);
            } else if ('pnbrqkPNBRQK'.includes(char)) {
                squares += 1;
            } else {
                logger.warn('Invalid character in rank:', char);
                return false;
            }
        }

        if (squares !== 8) {
            logger.warn('Rank has incorrect number of squares:', squares);
            return false;
        }

        return true;
    }

    /**
     * Validate active color
     * @param {string} color - Color character ('w' or 'b')
     * @returns {boolean}
     */
    static validateActiveColor(color) {
        if (color !== 'w' && color !== 'b') {
            logger.warn('Invalid active color:', color);
            return false;
        }
        return true;
    }
}