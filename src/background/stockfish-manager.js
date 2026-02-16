/**
 * Stockfish engine manager
 * Handles engine lifecycle, initialization, and communication
 */

import { Logger } from '../shared/logger.js';

const logger = new Logger('StockfishManager');

export class StockfishManager {
    constructor() {
        this.engine = null;
        this.ready = false;
        this.initAttempts = 0;
        this.maxAttempts = 3;
        this.isAnalyzing = false;
        this.messageCallback = null;
    }

    /**
     * Initialize Stockfish engine
     */
    async initialize() {
        if (this.engine || this.initAttempts >= this.maxAttempts) {
            return;
        }

        this.initAttempts++;
        logger.log(`Initialization attempt ${this.initAttempts}/${this.maxAttempts}`);

        try {
            const stockfishUrl = chrome.runtime.getURL('stockfish.js');
            logger.log('Loading Stockfish from:', stockfishUrl);

            this.engine = new Worker(stockfishUrl);

            this.engine.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.engine.onerror = (error) => {
                this.handleError(error);
            };

            this.engine.postMessage('uci');

        } catch (error) {
            logger.error('Initialization failed:', error);
            this.reset();
        }
    }

    /**
     * Handle message from Stockfish
     * @param {string} message - Stockfish output
     */
    handleMessage(message) {
        logger.log('Stockfish:', message);

        if (message.includes('uciok')) {
            this.ready = true;
            logger.log('✅ Engine ready!');
        }

        if (message.includes('bestmove')) {
            this.isAnalyzing = false;
        }

        if (this.messageCallback) {
            this.messageCallback(message);
        }
    }

    /**
     * Handle engine error
     * @param {Error} error - Error object
     */
    handleError(error) {
        logger.error('Engine error:', error);
        this.reset();

        if (this.initAttempts < this.maxAttempts) {
            logger.log('Attempting to restart engine...');
            setTimeout(() => this.initialize(), 1000);
        }
    }

    /**
     * Analyze a position
     * @param {string} fen - FEN position string
     * @param {number} depth - Analysis depth
     */
    analyze(fen, depth) {
        if (!this.ready || !this.engine) {
            logger.error('Engine not ready');
            return;
        }

        if (this.isAnalyzing) {
            logger.log('Stopping previous analysis');
            this.engine.postMessage('stop');
        }

        logger.log(`Analyzing position at depth ${depth}`);

        this.isAnalyzing = true;
        this.engine.postMessage('stop');

        setTimeout(() => {
            this.engine.postMessage('ucinewgame');
            this.engine.postMessage(`position fen ${fen}`);
            this.engine.postMessage('setoption name MultiPV value 3');
            this.engine.postMessage(`go depth ${depth}`);
            logger.log('✅ Analysis started');
        }, 50);
    }

    /**
     * Set message callback
     * @param {Function} callback - Callback for engine messages
     */
    onMessage(callback) {
        this.messageCallback = callback;
    }

    /**
     * Reset engine state
     */
    reset() {
        if (this.engine) {
            this.engine.terminate();
        }
        this.engine = null;
        this.ready = false;
        this.isAnalyzing = false;
    }

    /**
     * Check if engine is ready
     * @returns {boolean}
     */
    isReady() {
        return this.ready && this.engine !== null;
    }
}