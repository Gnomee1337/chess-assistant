/**
 * Opening explorer powered by ECO JSON datasets.
 *
 * Compatible with data from `@chess-openings/eco.json`.
 */

import { Logger } from '../../shared/logger.js';

const logger = new Logger('OpeningExplorer');

export class OpeningExplorer {
    constructor() {
        this.entries = [];
        this.byFen = new Map();
        this.ready = false;
    }

    async initialize() {
        if (this.ready) return;

        this.entries = await this.loadBundledEcoFile();
        this.buildIndexes();
        this.ready = true;

        logger.log(`Opening database loaded (${this.entries.length} entries)`);
    }

    async loadBundledEcoFile() {
        try {
            const url = chrome.runtime.getURL('eco.json');
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Could not fetch eco.json (${response.status})`);
            }

            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('eco.json is not an array');
            }

            const valid = data.filter(item => item && (item.name || item.eco) && (item.moves || item.fen));
            logger.log(`Loaded ${valid.length} entries from eco.json`);
            return valid;
        } catch (error) {
            logger.warn('Failed to load eco.json:', error.message || error);
            return [];
        }
    }

    buildIndexes() {
        this.byFen.clear();

        this.entries.forEach((entry) => {
            const fen = this.normalizeFen(entry.fen || entry.epd || '');
            if (fen && !this.byFen.has(fen)) {
                this.byFen.set(fen, entry);
            }
        });
    }

    findOpening({ fen, playedMoves = [] }) {
        if (!this.ready || !this.entries.length) {
            return this.getUnknownOpening(playedMoves);
        }

        const fenMatch = this.findOpeningByFen(fen);
        if (fenMatch) {
            return fenMatch;
        }

        const moveMatch = this.findOpeningByMoves(playedMoves);
        if (moveMatch) {
            return moveMatch;
        }

        return this.getUnknownOpening(playedMoves);
    }

    findOpeningByFen(fen) {
        const key = this.normalizeFen(fen);
        if (!key) return null;

        const entry = this.byFen.get(key);
        if (!entry) return null;

        return {
            eco: entry.eco || 'N/A',
            name: entry.name || 'Unknown opening',
            lines: this.getSuggestedContinuationsByMoves(entry.moves, []),
            playedMoves: []
        };
    }

    findOpeningByMoves(playedMoves) {
        const played = this.normalizeMoves((playedMoves || []).join(' '));
        if (!played) {
            return null;
        }

        let best = null;

        this.entries.forEach((entry) => {
            const openingMoves = this.normalizeMoves(entry.moves || '');
            if (!openingMoves) return;

            const common = this.getCommonPrefixLength(played, openingMoves);
            if (common === 0) return;

            const isPrefixMatch =
                played === openingMoves
                || openingMoves.startsWith(`${played} `)
                || played.startsWith(`${openingMoves} `);

            if (!isPrefixMatch) return;

            if (!best || common > best.common || (common === best.common && openingMoves.length > best.moves.length)) {
                best = {
                    entry,
                    common,
                    moves: openingMoves
                };
            }
        });

        if (!best) return null;

        const lines = this.getSuggestedContinuationsByMoves(best.moves, playedMoves);

        return {
            eco: best.entry.eco || 'N/A',
            name: best.entry.name || 'Unknown opening',
            lines: lines.length ? lines : ['No further line available in current ECO entry'],
            playedMoves
        };
    }

    getSuggestedContinuationsByMoves(openingMovesText, playedMoves) {
        const played = this.normalizeMoves((playedMoves || []).join(' '));
        const openingMoves = this.normalizeMoves(openingMovesText || '');

        const playedTokens = played ? played.split(' ') : [];
        const openingTokens = openingMoves ? openingMoves.split(' ') : [];

        if (openingTokens.length <= playedTokens.length) {
            return [];
        }

        const next = openingTokens.slice(playedTokens.length, playedTokens.length + 6);
        const lines = [];
        for (let i = 0; i < next.length; i += 2) {
            lines.push(next.slice(i, i + 2).join(' '));
        }

        return lines.filter(Boolean);
    }

    getCommonPrefixLength(a, b) {
        const aTokens = a.split(' ');
        const bTokens = b.split(' ');
        const min = Math.min(aTokens.length, bTokens.length);

        let common = 0;
        for (let i = 0; i < min; i++) {
            if (aTokens[i] !== bTokens[i]) break;
            common++;
        }

        return common;
    }

    normalizeFen(fen) {
        if (!fen || typeof fen !== 'string') return '';

        return fen
            .trim()
            .split(/\s+/)
            .slice(0, 4)
            .join(' ');
    }

    normalizeMoves(movesText) {
        if (!movesText || typeof movesText !== 'string') return '';

        return movesText
            .replace(/\{[^}]*\}/g, ' ')
            .replace(/\d+\.\.\./g, ' ')
            .replace(/\d+\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    getUnknownOpening(playedMoves) {
        return {
            eco: 'N/A',
            name: 'Opening not recognized yet',
            lines: ['Install full ECO dataset to improve matching'],
            playedMoves
        };
    }
}
