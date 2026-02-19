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
        this.initPromise = null;
    }

    /**
     * Initialize Stockfish engine (singleton pattern)
     */
    async initialize() {
        // Return existing init promise if already in progress
        if (this.initPromise) {
            return this.initPromise;
        }

        // Skip if already initialized
        if (this.engine) {
            return;
        }

        if (this.initAttempts >= this.maxAttempts) {
            logger.error('Max init attempts reached');
            return;
        }

        this.initPromise = this._performInit();
        return this.initPromise;
    }

    async _performInit() {
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

            // Wait for uciok before resolving
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Stockfish initialization timeout'));
                }, 15000);

                const checkReady = setInterval(() => {
                    if (this.ready) {
                        clearInterval(checkReady);
                        clearTimeout(timeout);
                        resolve();
                    }
                }, 100);
            }).then(() => {
                this.initPromise = null;
                logger.log('✅ Engine ready!');
            }).catch((error) => {
                this.initPromise = null;
                logger.error('Initialization failed:', error);
                this.reset();
                throw error;
            });
        } catch (error) {
            this.initPromise = null;
            logger.error('Initialization failed:', error);
            this.reset();
        }
    }

    /**
     * Handle message from Stockfish
     * @param {string} message - Stockfish output
     */
    handleMessage(message) {
        if (message.includes('uciok')) {
            this.ready = true;
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

        setTimeout(() => {
            this.isAnalyzing = true;
            this.wrapper.postMessage('stop');
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
        this.initPromise = null;
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