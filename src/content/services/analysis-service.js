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
const RETRY_AFTER_RECONNECT_MS = 50;
const ANALYSIS_TIMEOUT_MS = 30000;
const ENGINE_LOADING_TIMEOUT_MS = 180000;
const MAX_TIMEOUT_RECOVERY_ATTEMPTS = 1;

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
        this.onAnalyzeStartCallback = null;
        this.analysisTimeout = null;
        this.pendingRetryFen = null;
        this.waitingForEngine = false;
        this.timeoutRecoveryAttempts = 0;
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
                const hadInFlightAnalysis = this.isAnalyzing;
                this.port = null;
                this.resetAnalyzingState();

                if (hadInFlightAnalysis && this.lastFen) {
                    this.pendingRetryFen = this.lastFen;
                    if (this.onErrorCallback) {
                        this.onErrorCallback('Connection lost. Reconnecting and retrying analysis...');
                    }
                }

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
            this.retryPendingAnalysis();
        }, delay);
    }

    retryPendingAnalysis() {
        if (!this.port || !this.pendingRetryFen) return;

        const fen = this.pendingRetryFen;
        this.pendingRetryFen = null;
        this.waitingForEngine = false;

        setTimeout(() => {
            if (!this.port) {
                this.pendingRetryFen = fen;
                this.scheduleReconnect();
                return;
            }

            logger.log('Retrying analysis after reconnect');
            const sent = this.sendAnalyzeRequest(fen, false);
            if (!sent) {
                this.pendingRetryFen = fen;
                this.scheduleReconnect();
            }
        }, RETRY_AFTER_RECONNECT_MS);
    }

    async ensureConnected() {
        if (this.port) return true;
        this.connect();
        if (this.port) return true;
        await this.delay(100);
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
            this.waitingForEngine = true;
            this.startAnalysisTimeout();
            if (this.onLoadingCallback) {
                this.onLoadingCallback('Engine loading, please wait...');
            }
            return;
        }

        this.waitingForEngine = false;

        if (this.onMoveCallback) {
            this.onMoveCallback(message);
        }

        if (typeof message === 'string' && message.includes('bestmove')) {
            this.resetAnalyzingState();
        }
    }

    handleError(error) {
        this.resetAnalyzingState();
        this.pendingRetryFen = null;
        this.waitingForEngine = false;
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

        this.timeoutRecoveryAttempts = 0;
        logger.log('Analyzing position:', fen);
        const sent = this.sendAnalyzeRequest(fen);
        if (!sent) {
            this.pendingRetryFen = fen;
            if (this.onErrorCallback) {
                this.onErrorCallback('Lost connection to background. Retrying...');
            }
            this.scheduleReconnect();
        }
    }

    sendAnalyzeRequest(fen, triggerStartCallback = true) {
        this.lastFen = fen;
        this.isAnalyzing = true;
        this.waitingForEngine = false;
        this.startAnalysisTimeout();

        if (triggerStartCallback && this.onAnalyzeStartCallback) {
            this.onAnalyzeStartCallback(fen);
        }

        try {
            this.port.postMessage({
                type: MESSAGE_TYPES.ANALYZE,
                fen,
                depth: this.normalizeDepth(this.depth)
            });
            return true;
        } catch (e) {
            logger.error('postMessage failed:', e);
            this.resetAnalyzingState();
            this.port = null;
            return false;
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
    onAnalyzeStart(callback) { this.onAnalyzeStartCallback = callback; }

    setAnalyzing(state) {
        this.isAnalyzing = state;
        if (state) {
            this.startAnalysisTimeout();
            return;
        }
        this.clearAnalysisTimeout();
    }

    startAnalysisTimeout() {
        this.clearAnalysisTimeout();
        const timeoutMs = this.waitingForEngine ? ENGINE_LOADING_TIMEOUT_MS : ANALYSIS_TIMEOUT_MS;
        this.analysisTimeout = setTimeout(() => {
            if (!this.isAnalyzing) return;
            if (this.waitingForEngine) {
                logger.warn('Engine loading timed out');
                this.handleError('Engine is taking too long to load. Please try again.');
                return;
            }

            if (this.timeoutRecoveryAttempts < MAX_TIMEOUT_RECOVERY_ATTEMPTS && this.lastFen) {
                this.timeoutRecoveryAttempts++;
                logger.warn('Analysis timed out, attempting engine reset/retry');
                this.recoverFromTimeout();
                return;
            }

            logger.warn('Analysis timed out');
            this.handleError('Analysis timed out. Please try again.');
        }, timeoutMs);
    }


    recoverFromTimeout() {
        const fenToRetry = this.lastFen;
        this.resetAnalyzingState();
        this.pendingRetryFen = fenToRetry;

        if (this.onErrorCallback) {
            this.onErrorCallback('Analysis stalled. Resetting engine and retrying...');
        }

        if (this.port) {
            try {
                this.port.postMessage({ type: MESSAGE_TYPES.RESET_ENGINE });
            } catch (error) {
                logger.warn('Could not send reset-engine command:', error);
                this.port = null;
            }
        }

        this.scheduleReconnect();
        this.retryPendingAnalysis();
    }

    clearAnalysisTimeout() {
        if (!this.analysisTimeout) return;
        clearTimeout(this.analysisTimeout);
        this.analysisTimeout = null;
    }

    resetAnalyzingState() {
        this.isAnalyzing = false;
        this.waitingForEngine = false;
        this.clearAnalysisTimeout();
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}
