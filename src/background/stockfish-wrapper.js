/**
 * Stockfish Wrapper
 * Lightweight adapter that can fan out engine messages to multiple listeners.
 */

import { Logger } from '../shared/logger.js';

const logger = new Logger('StockfishWrapper');

export class StockfishWrapper {
    constructor(engine = null) {
        this.engine = engine;
        this.listeners = [];
        this.ready = false;
    }

    /**
     * Attach an engine instance and wire message forwarding
     * @param {Worker|Object} engine - Stockfish engine object with postMessage API
     */
    attachEngine(engine) {
        this.engine = engine;

        if (!this.engine) {
            this.ready = false;
            return;
        }

        this.ready = true;

        this.engine.onmessage = (event) => {
            const message = event && event.data !== undefined ? event.data : event;
            this.listeners.forEach((listener) => listener(message));
        };
    }

    /**
     * Send command to Stockfish
     * @param {string} command - UCI command
     */
    postMessage(command) {
        if (!this.ready || !this.engine) {
            logger.warn('Engine is not ready; command dropped:', command);
            return;
        }

        this.engine.postMessage(command);
    }

    /**
     * Register message listener
     * @param {Function} callback - callback for Stockfish output
     */
    onMessage(callback) {
        this.listeners.push(callback);
    }
}
