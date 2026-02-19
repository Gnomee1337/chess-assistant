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
import { BoardParser } from './chess/board-parser.js';
import { SELECTORS, STORAGE_KEYS } from '../shared/constants.js';

const logger = new Logger('Content');

class ChessAssistant {
    constructor() {
        this.analysisService = new AnalysisService();
        this.openingExplorer = new OpeningExplorer();
        this.overlay = new Overlay(this.analysisService);
        this.moveObserver = null;
        this.lastMoveCount = 0;
        this.analysisStartFEN = null;
        this.analysisStartTurn = null;
        this.topMoves = [];
        this.currentAnalysisDepth = 0;
        this.maxAnalysisDepth = 0;
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

        this.analysisService.onAnalyzeStart(() => {
            this.topMoves = [];
            this.currentAnalysisDepth = 0;
            this.maxAnalysisDepth = this.analysisService.depth;

            this.analysisStartFEN = this.analysisService.lastFen;
            this.analysisStartTurn = this.analysisStartFEN.split(' ')[1];

            logger.log('Analysis started for FEN:', this.analysisStartFEN);
            logger.log('Analysis started, turn was:', this.analysisStartTurn);

            MoveHighlighter.clearAll();
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
        // Show intermediate moves as they arrive (before bestmove)
        if (message.includes('info depth') && message.includes('multipv')) {
            // Extract and track depth
            const depthMatch = message.match(/depth (\d+)/);
            if (depthMatch) {
                const depth = parseInt(depthMatch[1], 10);
                if (depth > this.currentAnalysisDepth) {
                    this.currentAnalysisDepth = depth;
                }
            }

            this.parseMultiPVInfo(message);

            // Check if position has changed before displaying
            if (!this.isAnalysisStillValid()) {
                logger.warn('Position changed during analysis, stopping display');
                this.stopCurrentAnalysis();
                return;
            }

            // Update UI with partial results every few depths
            // Show partial results with depth indicator
            if (this.topMoves.length > 0) {
                const validMoves = this.topMoves
                    .filter(m => m !== undefined)
                    .slice(0, 3);
                if (validMoves.length > 0) {
                    this.overlay.displayMoves(
                        validMoves,
                        this.currentAnalysisDepth,
                        this.maxAnalysisDepth
                    );
                }
            }
        } else if (message.includes('bestmove')) {
            // Check one more time before displaying final results
            if (!this.isAnalysisStillValid()) {
                logger.warn('Position changed, discarding analysis results');
                this.stopCurrentAnalysis();
                return;
            }
            // Show final results without depth (or keep it)
            this.currentAnalysisDepth = 0;
            this.displayResults();
        }
    }

    /**
    * Parse MultiPV info and track moves
    * Only process if it's actually the human's turn
    */
    parseMultiPVInfo(message) {
        if (!this.analysisService.isAnalyzing) return;
        const depthMatch = message.match(/depth (\d+)/);
        const multipvMatch = message.match(/multipv (\d+)/);
        const scoreMatch = message.match(/score cp (-?\d+)/);
        const mateMatch = message.match(/score mate (-?\d+)/);
        const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][a-z]?)/);

        if (!depthMatch || !multipvMatch || !moveMatch) return;

        const depth = parseInt(depthMatch[1], 10);
        const multipv = parseInt(multipvMatch[1], 10);
        const move = moveMatch[1];

        // Verify FEN turn matches what we expect
        const fen = this.analysisService.lastFen;
        const fenTurn = fen.split(' ')[1];

        if (!fenTurn || (fenTurn !== 'w' && fenTurn !== 'b')) {
            logger.warn('Invalid FEN turn in lastFen:', fenTurn, 'Full FEN:', fen);
            return;
        }

        let score, mateIn;

        if (mateMatch) {
            mateIn = parseInt(mateMatch[1], 10);
            score = mateIn > 0 ? 1000 : -1000;
        } else if (scoreMatch) {
            score = parseInt(scoreMatch[1], 10) / 100.0;
        } else {
            return;
        }

        // Always keep the deepest result seen per multipv slot so that if the engine
        // finishes before the target depth (forced mate, early bestmove, etc.)
        // we still have something to display.
        const existing = this.topMoves[multipv - 1];
        if (!existing || depth >= (existing.depth || 0)) {
            this.topMoves[multipv - 1] = { move, score, multipv, mateIn, depth };
        }
    }

    displayResults() {
        if (this.topMoves.length > 0) {
            const validMoves = this.topMoves.filter(m => m !== undefined);
            validMoves.sort((a, b) => a.multipv - b.multipv);
            this.topMoves = validMoves.slice(0, 3);
            this.overlay.displayMoves(this.topMoves, 0, 0);
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
            this.moveListCache = null;
            if (!this.overlay.autoAnalyze || !this.overlay.isEnabled) return;

            const currentMoveCount = this.getMoveCount();
            if (currentMoveCount > this.lastMoveCount) {
                this.lastMoveCount = currentMoveCount;
                logger.log('New move detected, auto-analyzing...');

                // STOP any ongoing analysis for the old position
                this.stopCurrentAnalysis();

                // Now analyze the new position
                if (!this.analysisService.isAnalyzing) {
                    this.overlay.analyze();
                }
            }
        });

        this.moveObserver.observe(moveList, { childList: true, subtree: true });
        this.lastMoveCount = this.getMoveCount();
    }

    // Stop current analysis and reset UI
    stopCurrentAnalysis() {
        logger.log('Stopping previous analysis for old position');

        // Stop the analysis in the engine
        this.analysisService.stopAnalysis();

        // Reset overlay UI
        this.currentAnalysisDepth = 0;
        this.topMoves = [];
        this.analysisStartFEN = null;
        this.analysisStartTurn = null;
        MoveHighlighter.clearAll();

        // Clear the moves display
        this.overlay.updateMessage('Position changed, analyzing new position...');
    }

    /**
     * Check if the current board position matches when analysis started
     * If the position changed (opponent moved), analysis is no longer valid
     */
    isAnalysisStillValid() {
        const currentFEN = BoardParser.getCurrentFEN();
        if (!currentFEN || !this.analysisStartFEN) {
            logger.warn('Cannot validate analysis: missing FEN');
            return true; // Assume valid if we can't check
        }

        // Get current turn
        const currentTurn = currentFEN.split(' ')[1];
        const startTurn = this.analysisStartTurn;

        // If turn changed, position changed!
        if (currentTurn !== startTurn) {
            logger.warn(
                `Turn changed during analysis! Started: ${startTurn}, Now: ${currentTurn}`
            );
            return false;
        }

        // Also compare the full FEN position (not move counter)
        const currentPos = currentFEN.split(' ').slice(0, 4).join(' ');
        const startPos = this.analysisStartFEN.split(' ').slice(0, 4).join(' ');

        if (currentPos !== startPos) {
            logger.warn('Position changed during analysis');
            logger.warn('Started:', startPos);
            logger.warn('Now:', currentPos);
            return false;
        }

        return true;
    }

    getMoveCount() {
        // Cache the selector results to avoid repeated DOM traversals
        if (!this.moveListCache) {
            this.moveListCache = {
                chess_com: document.querySelectorAll('.move-list .node'),
                lichess: document.querySelectorAll('rm6 l4x kwdb')
            };
        }

        const chessComCount = this.moveListCache.chess_com.length;
        if (chessComCount > 0) return chessComCount;

        return this.moveListCache.lichess.length;
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