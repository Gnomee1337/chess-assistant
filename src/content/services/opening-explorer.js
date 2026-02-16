/**
 * Opening explorer and repertoire helpers
 */

import { Logger } from '../../shared/logger.js';

const logger = new Logger('OpeningExplorer');

const OPENING_BOOK = [
    {
        name: 'Sicilian Defense',
        fenKey: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w',
        lines: ['Nf3', 'd4 cxd4 Nxd4', 'c3 (Alapin)']
    },
    {
        name: 'French Defense',
        fenKey: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w',
        lines: ['d4', 'Nc3', 'Nf3']
    },
    {
        name: 'Caro-Kann Defense',
        fenKey: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w',
        lines: ['d4', 'Nc3', 'Nf3']
    },
    {
        name: 'Queen\'s Gambit Declined',
        fenKey: 'rnbqkbnr/pp2pppp/8/2pp4/3PP3/8/PPP2PPP/RNBQKBNR w',
        lines: ['Nc3', 'Nf3', 'cxd5']
    },
    {
        name: 'Ruy Lopez',
        fenKey: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b',
        lines: ['a6', 'Nf6', 'd6']
    },
    {
        name: 'Italian Game',
        fenKey: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b',
        lines: ['Bc5', 'Nf6', 'd6']
    }
];

export class OpeningExplorer {
    static getOpening(fen) {
        if (!fen || typeof fen !== 'string') {
            return this.getUnknownOpening();
        }

        const fenKey = this.toFenKey(fen);
        const opening = OPENING_BOOK.find(item => item.fenKey === fenKey);

        if (opening) {
            logger.log('Detected opening:', opening.name);
            return {
                name: opening.name,
                lines: opening.lines
            };
        }

        return this.getUnknownOpening();
    }

    static toFenKey(fen) {
        const [placement, activeColor] = fen.split(' ');
        return `${placement || ''} ${activeColor || ''}`.trim();
    }

    static getUnknownOpening() {
        return {
            name: 'Opening not recognized yet',
            lines: ['Analyze a few more moves for better matching']
        };
    }
}
