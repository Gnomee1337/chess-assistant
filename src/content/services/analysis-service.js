/**
 * Analysis service - coordinates between UI, board parser, and background script
 *
 * Handles automatic reconnection when the Chrome MV3 service worker is killed
 * and restarted by the browser (which happens after ~30 s of inactivity).
 */

import { MESSAGE_TYPES } from '../../shared/constants.js';
import { Logger } from '../../shared/logger.js';
import { BoardParser } from '../chess/board-parser.js';
import { FENValidator } from '../chess/fen-validator.js';

const logger = new Logger('AnalysisService');
const MIN_DEPTH = 5;
const MAX_DEPTH = 25;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;

export class AnalysisService {
    constructor() {
        this.port = null;
        this.isAnalyzing = false;
        this.depth = 15;
        this.lastFen = null;
        this.onMoveCallback = null;
        this.onErrorCallback = null;
        this.onLoadingCallback = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
    }

    // ── Connection ────────────────────────────────────────────────────────────

    connect() {
        if (this.port) return;

        try {
            this.port = chrome.runtime.connect({ name: 'chess-assistant' });

            this.port.onMessage.addListener((msg) => this.handleMessage(msg));

            this.port.onDisconnect.addListener(() => {
                const err = chrome.runtime.lastError; // must be read to suppress noise
                logger.warn('Disconnected from background:', err?.message || '(no reason)');
                this.port = null;
                this.isAnalyzing = false;
                this.scheduleReconnect();
            });

            this.reconnectAttempts = 0;
            logger.log('Connected to background script');
        } catch (error) {
            logger.error('Failed to connect:', error);
            this.port = null;
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            logger.error('Max reconnect attempts reached.');
            return;
        }

        const delay = RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        logger.log(`Reconnecting in ${delay} ms (attempt ${this.reconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    async ensureConnected() {
        if (this.port) return true;
        this.connect();
        if (this.port) return true;
        await this.delay(500);
        return this.port !== null;
    }

    // ── Message handling ──────────────────────────────────────────────────────

    handleMessage(msg) {
        if (msg.type === MESSAGE_TYPES.STOCKFISH_MESSAGE) {
            this.handleStockfishMessage(msg.data);
        } else if (msg.type === MESSAGE_TYPES.STOCKFISH_ERROR) {
            this.handleError(msg.error);
        }
    }

    handleStockfishMessage(message) {
        // The background sends this status string while the WASM is still loading.
        if (typeof message === 'string' && message.includes('Engine loading')) {
            if (this.onLoadingCallback) {
                this.onLoadingCallback('Engine loading, please wait...');
            }
            return;
        }

        if (this.onMoveCallback) {
            this.onMoveCallback(message);
        }
    }

    handleError(error) {
        this.isAnalyzing = false;
        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
        logger.error('Analysis error:', error);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async analyze() {
        if (this.isAnalyzing) {
            logger.warn('Already analyzing');
            return;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            this.handleError('Cannot connect to background script. Try reloading the page.');
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

        try {
            this.port.postMessage({
                type: MESSAGE_TYPES.ANALYZE,
                fen,
                depth: this.normalizeDepth(this.depth)
            });
        } catch (e) {
            logger.error('postMessage failed:', e);
            this.isAnalyzing = false;
            this.port = null;
            this.handleError('Lost connection to background. Retrying...');
            this.scheduleReconnect();
        }
    }

    setDepth(depth) {
        this.depth = this.normalizeDepth(depth);
    }

    normalizeDepth(depth) {
        const parsed = Number.parseInt(depth, 10);
        if (!Number.isFinite(parsed)) return MIN_DEPTH;
        return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, parsed));
    }

    onMove(callback) { this.onMoveCallback = callback; }
    onError(callback) { this.onErrorCallback = callback; }
    onLoading(callback) { this.onLoadingCallback = callback; }

    setAnalyzing(state) { this.isAnalyzing = state; }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}