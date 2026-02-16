/**
 * Opening explorer powered by ECO JSON datasets.
 *
 * Compatible with data from `@chess-openings/eco.json`.
 */

import { Logger } from '../../shared/logger.js';

const logger = new Logger('OpeningExplorer');
const LOCAL_ECO_FILES = [
    'ecoA.json',
    'ecoB.json',
    'ecoC.json',
    'ecoD.json',
    'ecoE.json'
];

export class OpeningExplorer {
    constructor() {
        this.entries = [];
        this.byFen = new Map();
        this.ready = false;
    }

    async initialize() {
        if (this.ready) return;

        this.entries = await this.loadEcoData();
        this.buildIndexes();
        this.ready = true;

        logger.log(`Opening database loaded (${this.entries.length} entries)`);
    }

    async loadEcoData() {
        try {
            const chunks = await Promise.all(
                LOCAL_ECO_FILES.map((file) => this.fetchLocalEcoChunk(file))
            );

            const entries = chunks.flat();
            const valid = entries.filter(item => item && (item.name || item.eco) && (item.moves || item.fen));
            logger.log(`Loaded ${valid.length} entries from local ECO files`);
            return valid;
        } catch (error) {
            logger.warn('Failed to load local ECO data:', error.message || error);
            return [];
        }
    }

    async fetchLocalEcoChunk(fileName) {
        const url = chrome.runtime.getURL(fileName);
        const response = await fetch(url);

        if (!response.ok) {
            logger.warn(`Could not fetch ${fileName} (${response.status}); skipping file`);
            return [];
        }

        const data = await response.json();
        return this.mapRawChunkToEntries(data);
    }

    mapRawChunkToEntries(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (!data || typeof data !== 'object') {
            return [];
        }

        return Object.entries(data).map(([fen, opening]) => ({
            fen,
            ...opening
        }));
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
            lines: ['Add ecoA.json - ecoE.json to improve matching'],
            playedMoves
        };
    }
}
