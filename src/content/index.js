/**
 * Main content script entry point
 * Coordinates all content script components
 */

import { Logger } from '../shared/logger.js';
import { StorageService } from '../shared/storage.js';
import { AnalysisService } from './services/analysis-service.js';
import { OpeningExplorer } from './services/opening-explorer.js';
import { Overlay } from './ui/overlay.js';
import { MoveHighlighter } from './chess/move-highlighter.js';
import { SELECTORS, STORAGE_KEYS } from '../shared/constants.js';

const logger = new Logger('Content');

class ChessAssistant {
    constructor() {
        this.analysisService = new AnalysisService();
        this.openingExplorer = new OpeningExplorer();
        this.overlay = new Overlay(this.analysisService);
        this.moveObserver = null;
        this.lastMoveCount = 0;
        this.topMoves = [];
        this.repertoireLines = [];
        this.highlightColor = null;
        this.arrowColor = null;
    }

    async initialize() {
        logger.log('Initializing Chess Assistant...');

        await this.loadSettings();
        await this.openingExplorer.initialize();
        await this.delay(2000);

        this.analysisService.connect();
        this.overlay.create();
        this.overlay.setRepertoireLines(this.repertoireLines);
        this.setupOverlayCallbacks();
        this.setupAnalysisCallbacks();
        this.setupMoveObserver();
        this.setupStorageListener();

        logger.log('Chess Assistant ready!');
    }

    async loadSettings() {
        const settings = await StorageService.getMultiple([
            STORAGE_KEYS.DEPTH,
            STORAGE_KEYS.ENABLED,
            STORAGE_KEYS.AUTO_ANALYZE,
            STORAGE_KEYS.REPERTOIRE_LINES,
            STORAGE_KEYS.HIGHLIGHT_COLOR,
            STORAGE_KEYS.ARROW_COLOR
        ]);

        this.analysisService.setDepth(settings.depth);
        this.overlay.isEnabled = settings.enabled;
        this.overlay.autoAnalyze = settings.autoAnalyze;
        this.repertoireLines = settings.repertoireLines || [];
        this.highlightColor = settings.highlightColor;
        this.arrowColor = settings.arrowColor;
        MoveHighlighter.setColors({
            highlightColor: this.highlightColor,
            arrowColor: this.arrowColor
        });
        this.overlay.refreshControls();
    }

    setupOverlayCallbacks() {
        this.overlay.onSaveRepertoire(() => this.saveCurrentLineToRepertoire());
        this.overlay.onRemoveRepertoire((index) => this.removeRepertoireLine(index));
    }

    saveCurrentLineToRepertoire() {
        if (!this.topMoves.length) {
            this.overlay.updateMessage('Run analysis first to save a line');
            return;
        }

        const bestLine = this.topMoves[0];
        const opening = this.openingExplorer.findOpening({
            fen: this.analysisService.lastFen,
            playedMoves: this.getPlayedMoves()
        });

        const entry = {
            eco: opening.eco,
            name: opening.name,
            line: bestLine.move,
            fen: this.analysisService.lastFen,
            playedMoves: opening.playedMoves,
            savedAt: Date.now()
        };

        const duplicate = this.repertoireLines.some(
            item => item.fen === entry.fen && item.line === entry.line
        );
        if (duplicate) {
            this.overlay.updateMessage('This line is already saved in repertoire');
            return;
        }

        this.repertoireLines = [entry, ...this.repertoireLines].slice(0, 50);
        StorageService.set(STORAGE_KEYS.REPERTOIRE_LINES, this.repertoireLines)
            .then(() => {
                this.overlay.setRepertoireLines(this.repertoireLines);
                this.overlay.updateMessage('Saved line to repertoire');
            })
            .catch(() => this.overlay.showError('Could not save repertoire line'));
    }

    removeRepertoireLine(index) {
        if (index < 0 || index >= this.repertoireLines.length) return;

        this.repertoireLines.splice(index, 1);
        StorageService.set(STORAGE_KEYS.REPERTOIRE_LINES, this.repertoireLines)
            .then(() => this.overlay.setRepertoireLines(this.repertoireLines))
            .catch(() => this.overlay.showError('Could not update repertoire'));
    }

    setupAnalysisCallbacks() {
        this.analysisService.onMove((message) => {
            this.handleStockfishMessage(message);
        });

        this.analysisService.onError((error) => {
            this.overlay.showError(error);
        });

        // Show a friendly status while the WASM engine is still loading.
        this.analysisService.onLoading((status) => {
            this.overlay.updateMessage('⏳ ' + status);
        });
    }

    handleStockfishMessage(message) {
        if (message.includes('info depth') && message.includes('multipv')) {
            this.parseMultiPVInfo(message);
        } else if (message.includes('bestmove')) {
            this.displayResults();
        }
    }

    parseMultiPVInfo(message) {
        const depthMatch = message.match(/depth (\d+)/);
        const multipvMatch = message.match(/multipv (\d+)/);
        const scoreMatch = message.match(/score cp (-?\d+)/);
        const mateMatch = message.match(/score mate (-?\d+)/);
        const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][a-z]?)/);

        if (!depthMatch || !multipvMatch || !moveMatch) return;

        const depth = parseInt(depthMatch[1], 10);
        const multipv = parseInt(multipvMatch[1], 10);
        const move = moveMatch[1];

        if (depth === this.analysisService.depth) {
            let score, mateIn;

            if (mateMatch) {
                mateIn = parseInt(mateMatch[1], 10);
                score = mateIn > 0 ? 1000 : -1000;
            } else if (scoreMatch) {
                score = parseInt(scoreMatch[1], 10) / 100.0;
            } else {
                return;
            }

            this.topMoves[multipv - 1] = { move, score, multipv, mateIn };
        }
    }

    displayResults() {
        if (this.topMoves.length > 0) {
            const validMoves = this.topMoves.filter(m => m !== undefined);
            validMoves.sort((a, b) => a.multipv - b.multipv);
            this.topMoves = validMoves.slice(0, 3);
            this.overlay.displayMoves(this.topMoves);
            this.updateOpeningExplorer();
        } else {
            this.overlay.showError('No moves found');
        }

        this.analysisService.setAnalyzing(false);
    }

    getPlayedMoves() {
        const nodes = document.querySelectorAll(
            '.move-list .node, wc-simple-move-list .node, rm6 l4x kwdb'
        );
        const moves = [];

        nodes.forEach((node) => {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || /^\d+\.?$/.test(text) || text === '...') return;
            moves.push(text);
        });

        return moves;
    }

    updateOpeningExplorer() {
        const opening = this.openingExplorer.findOpening({
            fen: this.analysisService.lastFen,
            playedMoves: this.getPlayedMoves()
        });

        const suggestedLines = [...(opening.lines || [])];
        if (this.topMoves[0]) {
            suggestedLines.unshift(`Engine best move here: ${this.topMoves[0].move}`);
        }

        this.overlay.setOpening({
            name: `${opening.eco} • ${opening.name}`,
            lines: suggestedLines.slice(0, 4),
            playedMoves: opening.playedMoves
        });
    }

    setupMoveObserver() {
        const moveList = document.querySelector(SELECTORS.MOVE_LIST);
        if (!moveList) {
            logger.warn('Move list not found, retrying...');
            setTimeout(() => this.setupMoveObserver(), 1000);
            return;
        }

        logger.log('Setting up move observer');

        this.moveObserver = new MutationObserver(() => {
            if (!this.overlay.autoAnalyze || !this.overlay.isEnabled) return;

            const currentMoveCount = this.getMoveCount();
            if (currentMoveCount > this.lastMoveCount) {
                this.lastMoveCount = currentMoveCount;
                logger.log('New move detected, auto-analyzing...');

                setTimeout(() => {
                    if (!this.analysisService.isAnalyzing) {
                        this.overlay.analyze();
                    }
                }, 500);
            }
        });

        this.moveObserver.observe(moveList, { childList: true, subtree: true });
        this.lastMoveCount = this.getMoveCount();
    }

    getMoveCount() {
        const chessComMoves = document.querySelectorAll('.move-list .node').length;
        if (chessComMoves > 0) return chessComMoves;
        return document.querySelectorAll('rm6 l4x kwdb').length;
    }

    setupStorageListener() {
        StorageService.onChange((changes) => {
            if (changes.depth) {
                this.analysisService.setDepth(changes.depth.newValue);
            }
            if (changes.enabled !== undefined) {
                this.overlay.isEnabled = changes.enabled.newValue;
                this.overlay.updateEnabledButton();
            }
            if (changes.autoAnalyze !== undefined) {
                this.overlay.autoAnalyze = changes.autoAnalyze.newValue;
                this.overlay.updateAutoButton();
            }
            if (changes.repertoireLines !== undefined) {
                this.repertoireLines = changes.repertoireLines.newValue || [];
                this.overlay.setRepertoireLines(this.repertoireLines);
            }
            if (changes.highlightColor !== undefined || changes.arrowColor !== undefined) {
                this.highlightColor = changes.highlightColor
                    ? changes.highlightColor.newValue : this.highlightColor;
                this.arrowColor = changes.arrowColor
                    ? changes.arrowColor.newValue : this.arrowColor;
                MoveHighlighter.setColors({
                    highlightColor: this.highlightColor,
                    arrowColor: this.arrowColor
                });
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const assistant = new ChessAssistant();
        assistant.initialize();
    });
} else {
    const assistant = new ChessAssistant();
    assistant.initialize();
}