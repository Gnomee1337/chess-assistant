/**
 * Stockfish engine manager
 * Handles engine lifecycle, initialization, and communication
 */

import { Logger } from '../shared/logger.js';
import { StockfishWrapper } from './stockfish-wrapper.js';

const logger = new Logger('StockfishManager');

export class StockfishManager {
    constructor() {
        this.engine = null;
        this.wrapper = new StockfishWrapper();
        this.ready = false;
        this.initAttempts = 0;
        this.maxAttempts = 3;
        this.isAnalyzing = false;
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
            this.wrapper.attachEngine(this.engine);

            this.engine.onerror = (error) => {
                this.handleError(error);
            };

            this.wrapper.onMessage((message) => this.handleMessage(message));
            this.wrapper.postMessage('uci');
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
            this.wrapper.postMessage('stop');
        }

        logger.log(`Analyzing position at depth ${depth}`);

        this.isAnalyzing = true;
        this.wrapper.postMessage('stop');

        setTimeout(() => {
            this.wrapper.postMessage('ucinewgame');
            this.wrapper.postMessage(`position fen ${fen}`);
            this.wrapper.postMessage('setoption name MultiPV value 3');
            this.wrapper.postMessage(`go depth ${depth}`);
            logger.log('✅ Analysis started');
        }, 50);
    }

    /**
     * Set message callback
     * @param {Function} callback - Callback for engine messages
     */
    onMessage(callback) {
        this.wrapper.onMessage(callback);
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
        this.wrapper = new StockfishWrapper();
    }

    /**
     * Check if engine is ready
     * @returns {boolean}
     */
    isReady() {
        return this.ready && this.engine !== null;
    }
}
