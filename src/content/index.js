/**
 * Main content script entry point
 * Coordinates all content script components
 */

import { Logger } from '../shared/logger.js';
import { StorageService } from '../shared/storage.js';
import { AnalysisService } from './services/analysis-service.js';
import { Overlay } from './ui/overlay.js';
import { SELECTORS, STORAGE_KEYS } from '../shared/constants.js';

const logger = new Logger('Content');

class ChessAssistant {
    constructor() {
        this.analysisService = new AnalysisService();
        this.overlay = new Overlay(this.analysisService);
        this.moveObserver = null;
        this.lastMoveCount = 0;
        this.topMoves = [];
    }

    /**
     * Initialize the assistant
     */
    async initialize() {
        logger.log('Initializing Chess Assistant...');

        await this.loadSettings();
        await this.delay(2000); // Wait for page to load

        this.analysisService.connect();
        this.overlay.create();
        this.setupAnalysisCallbacks();
        this.setupMoveObserver();
        this.setupStorageListener();

        logger.log('Chess Assistant ready!');
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
        const settings = await StorageService.getMultiple([
            STORAGE_KEYS.DEPTH,
            STORAGE_KEYS.ENABLED,
            STORAGE_KEYS.AUTO_ANALYZE
        ]);

        this.analysisService.setDepth(settings.depth);
        this.overlay.isEnabled = settings.enabled;
        this.overlay.autoAnalyze = settings.autoAnalyze;
        this.overlay.refreshControls();
    }

    /**
     * Setup analysis service callbacks
     */
    setupAnalysisCallbacks() {
        this.analysisService.onMove((message) => {
            this.handleStockfishMessage(message);
        });

        this.analysisService.onError((error) => {
            this.overlay.showError(error);
        });
    }

    /**
     * Handle Stockfish messages
     * @param {string} message - Stockfish output
     */
    handleStockfishMessage(message) {
        if (message.includes('info depth') && message.includes('multipv')) {
            this.parseMultiPVInfo(message);
        } else if (message.includes('bestmove')) {
            this.displayResults();
        }
    }

    /**
     * Parse MultiPV info from Stockfish
     * @param {string} message - Stockfish info line
     */
    parseMultiPVInfo(message) {
        const depthMatch = message.match(/depth (\d+)/);
        const multipvMatch = message.match(/multipv (\d+)/);
        const scoreMatch = message.match(/score cp (-?\d+)/);
        const mateMatch = message.match(/score mate (-?\d+)/);
        const moveMatch = message.match(/pv ([a-h][1-8][a-h][1-8][a-z]?)/);

        if (!depthMatch || !multipvMatch || !moveMatch) return;

        const depth = parseInt(depthMatch[1]);
        const multipv = parseInt(multipvMatch[1]);
        const move = moveMatch[1];

        if (depth === this.analysisService.depth) {
            let score;
            let mateIn = undefined;

            if (mateMatch) {
                mateIn = parseInt(mateMatch[1]);
                score = mateIn > 0 ? 1000 : -1000;
            } else if (scoreMatch) {
                score = parseInt(scoreMatch[1]) / 100.0;
            } else {
                return;
            }

            this.topMoves[multipv - 1] = { move, score, multipv, mateIn };
        }
    }

    /**
     * Display analysis results
     */
    displayResults() {
        if (this.topMoves.length > 0) {
            const validMoves = this.topMoves.filter(m => m !== undefined);
            validMoves.sort((a, b) => b.score - a.score);
            this.overlay.displayMoves(validMoves.slice(0, 3));
        } else {
            this.overlay.showError('No moves found');
        }

        this.topMoves = [];
        this.analysisService.setAnalyzing(false);
    }

    /**
     * Setup move observer for auto-analysis
     */
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

            const currentMoveCount = document.querySelectorAll('.move-list .node').length;

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

        this.moveObserver.observe(moveList, {
            childList: true,
            subtree: true
        });

        this.lastMoveCount = document.querySelectorAll('.move-list .node').length;
    }

    /**
     * Setup storage change listener
     */
    setupStorageListener() {
        StorageService.onChange((changes, namespace) => {
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
        });
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const assistant = new ChessAssistant();
        assistant.initialize();
    });
} else {
    const assistant = new ChessAssistant();
    assistant.initialize();
}
