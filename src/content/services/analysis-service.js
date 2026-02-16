/**
 * Analysis service - coordinates between UI, board parser, and background script
 */

import { MESSAGE_TYPES } from '../../shared/constants.js';
import { Logger } from '../../shared/logger.js';
import { BoardParser } from '../chess/board-parser.js';
import { FENValidator } from '../chess/fen-validator.js';

const logger = new Logger('AnalysisService');

export class AnalysisService {
    constructor() {
        this.port = null;
        this.isAnalyzing = false;
        this.depth = 15;
        this.lastFen = null;
        this.onMoveCallback = null;
        this.onErrorCallback = null;
    }

    /**
     * Connect to background script
     */
    connect() {
        if (this.port) return;

        try {
            this.port = chrome.runtime.connect({ name: 'chess-assistant' });

            this.port.onMessage.addListener((msg) => {
                this.handleMessage(msg);
            });

            this.port.onDisconnect.addListener(() => {
                this.port = null;
                logger.warn('Disconnected from background');
            });

            logger.log('Connected to background script');
        } catch (error) {
            logger.error('Failed to connect:', error);
        }
    }

    /**
     * Handle message from background
     * @param {Object} msg - Message object
     */
    handleMessage(msg) {
        if (msg.type === MESSAGE_TYPES.STOCKFISH_MESSAGE) {
            this.handleStockfishMessage(msg.data);
        } else if (msg.type === MESSAGE_TYPES.STOCKFISH_ERROR) {
            this.handleError(msg.error);
        }
    }

    /**
     * Handle Stockfish engine message
     * @param {string} message - Stockfish output
     */
    handleStockfishMessage(message) {
        // Parsing logic would go here - for now, pass to callback
        if (this.onMoveCallback) {
            this.onMoveCallback(message);
        }
    }

    /**
     * Handle error
     * @param {string} error - Error message
     */
    handleError(error) {
        this.isAnalyzing = false;
        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
        logger.error('Analysis error:', error);
    }

    /**
     * Analyze current position
     * @returns {Promise<void>}
     */
    async analyze() {
        if (!this.port) {
            this.connect();
            await this.delay(500);
        }

        if (this.isAnalyzing) {
            logger.warn('Already analyzing');
            return;
        }

        const fen = BoardParser.getCurrentFEN();
        if (!fen) {
            this.handleError('Could not read board position');
            return;
        }

        if (!FENValidator.validate(fen)) {
            this.handleError('Invalid board position');
            return;
        }

        logger.log('Analyzing position:', fen);
        this.lastFen = fen;
        this.isAnalyzing = true;

        this.port.postMessage({
            type: MESSAGE_TYPES.ANALYZE,
            fen: fen,
            depth: this.depth
        });
    }

    /**
     * Set analysis depth
     * @param {number} depth - Analysis depth (5-25)
     */
    setDepth(depth) {
        this.depth = depth;
    }

    /**
     * Set move callback
     * @param {Function} callback - Callback for move updates
     */
    onMove(callback) {
        this.onMoveCallback = callback;
    }

    /**
     * Set error callback
     * @param {Function} callback - Callback for errors
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }

    /**
     * Set analyzing state
     * @param {boolean} state - Analysis state
     */
    setAnalyzing(state) {
        this.isAnalyzing = state;
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
