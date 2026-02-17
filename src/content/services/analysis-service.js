/**
 * Analysis service - coordinates between UI, board parser, and background script
 */

import { MESSAGE_TYPES } from '../../shared/constants.js';
import { Logger } from '../../shared/logger.js';
import { BoardParser } from '../chess/board-parser.js';
import { FENValidator } from '../chess/fen-validator.js';

const logger = new Logger('AnalysisService');
const MIN_DEPTH = 5;
const MAX_DEPTH = 25;

export class AnalysisService {
    constructor() {
        this.port = null;
        this.localEngine = null;
        this.localEngineReady = false;
        this.localEngineInitPromise = null;
        this.useLocalEngine = false;
        this.isAnalyzing = false;
        this.depth = 15;
        this.lastFen = null;
        this.onMoveCallback = null;
        this.onErrorCallback = null;
        this.analysisTimeoutId = null;
        this.localEngineUnavailableReason = null;
    }

    /**
     * Connect to background script
     */
    connect() {
        if (this.useLocalEngine) {
            logger.log('Using local Stockfish worker mode; skipping background connection');
            return;
        }

        if (this.port) return;

        try {
            this.port = chrome.runtime.connect({ name: 'chess-assistant' });

            this.port.onMessage.addListener((msg) => {
                this.handleMessage(msg);
            });

            this.port.onDisconnect.addListener(() => {
                this.port = null;
                this.clearAnalysisTimeout();
                this.isAnalyzing = false;
                logger.warn('Disconnected from background');

                if (!this.useLocalEngine) {
                    this.handleError('Background disconnected while analyzing. Switching to local fallback.');
                }
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
        if (this.useLocalEngine) {
            return;
        }

        if (msg.type === MESSAGE_TYPES.STOCKFISH_MESSAGE) {
            if (typeof msg.data === 'string' && msg.data.includes('bestmove')) {
                this.clearAnalysisTimeout();
                this.isAnalyzing = false;
            }
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
        this.clearAnalysisTimeout();
        this.isAnalyzing = false;

        if (this.shouldUseLocalEngineFallback(error) && !this.useLocalEngine) {
            this.useLocalEngine = true;
            logger.warn('Switching to local content-script Stockfish fallback');

            this.ensureLocalEngineReady()
                .then(() => {
                    if (this.lastFen) {
                        this.sendAnalyzeCommand(this.lastFen, this.normalizeDepth(this.depth));
                    }
                })
                .catch((fallbackError) => {
                    const fallbackMessage = fallbackError && fallbackError.message ? fallbackError.message : String(fallbackError);

                    if (fallbackMessage.includes('cannot be accessed from origin')) {
                        this.localEngineUnavailableReason = 'Local Stockfish fallback is blocked by the page origin/CSP in this browser context.';
                        this.useLocalEngine = false;
                    }

                    logger.error('Local fallback initialization failed:', fallbackError);
                });
        }

        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
        logger.error('Analysis error:', error);
    }

    shouldUseLocalEngineFallback(error) {
        if (this.localEngineUnavailableReason) {
            return false;
        }

        const text = typeof error === 'string' ? error : '';

        return (
            text.includes('Failed to import Stockfish script') ||
            text.includes('Worker constructor is unavailable') ||
            text.includes('Stockfish files could not be loaded') ||
            text.includes('engine is restarting') ||
            text.includes('Background disconnected while analyzing') ||
            text.includes('Background analysis timed out')
        );
    }

    async ensureLocalEngineReady() {
        if (this.localEngineReady && this.localEngine) {
            return;
        }

        if (this.localEngineInitPromise) {
            return this.localEngineInitPromise;
        }

        const workerPaths = [
            ['stockfish.js', 'stockfish.wasm'],
            ['stockfish/stockfish.js', 'stockfish/stockfish.wasm'],
            ['stockfish/stockfish.js', 'stockfish.wasm'],
            ['stockfish.js', 'stockfish/stockfish.wasm']
        ];

        this.localEngineInitPromise = new Promise((resolve, reject) => {
            const startupErrors = [];

            const tryPath = (index) => {
                if (index >= workerPaths.length) {
                    const startupSummary = startupErrors.join(' | ');
                    const accessBlocked = startupErrors.length > 0 && startupErrors.every((entry) => entry.includes('cannot be accessed from origin'));

                    if (accessBlocked) {
                        this.localEngineUnavailableReason = 'Local Stockfish fallback is blocked by page origin/CSP restrictions.';
                    }

                    reject(new Error(`Local Stockfish worker startup failed. Tried: ${startupSummary}`));
                    return;
                }

                const [scriptPath, wasmPath] = workerPaths[index];
                let worker;

                try {
                    const workerUrl = `${chrome.runtime.getURL(scriptPath)}#${encodeURIComponent(chrome.runtime.getURL(wasmPath))}`;
                    worker = new Worker(workerUrl);
                } catch (error) {
                    startupErrors.push(`${scriptPath} + ${wasmPath}: ${error?.message || error}`);
                    tryPath(index + 1);
                    return;
                }

                let resolved = false;
                let closed = false;

                const cleanup = () => {
                    if (closed) return;
                    closed = true;
                    clearInterval(pingTimer);
                    clearTimeout(timeoutTimer);
                };

                worker.onmessage = (event) => {
                    const message = event && event.data !== undefined ? event.data : event;

                    if (typeof message === 'string' && (message.includes('uciok') || message.includes('readyok'))) {
                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            this.localEngine = worker;
                            this.localEngineReady = true;
                            console.log('AnalysisService - Local Stockfish worker ready from', scriptPath);
                            resolve();
                        }
                    }

                    if (worker === this.localEngine) {
                        this.handleStockfishMessage(message);
                        if (typeof message === 'string' && message.includes('bestmove')) {
                            this.clearAnalysisTimeout();
                            this.isAnalyzing = false;
                        }
                    }
                };

                worker.onerror = (error) => {
                    if (resolved) {
                        this.localEngineReady = false;
                        this.localEngine = null;
                        this.handleError('Local Stockfish engine crashed. Please re-analyze.');
                        return;
                    }

                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${scriptPath} + ${wasmPath}: ${error?.message || error}`);
                    tryPath(index + 1);
                };

                const pingTimer = setInterval(() => {
                    try {
                        worker.postMessage('isready');
                        worker.postMessage('uci');
                    } catch (error) {
                        if (!resolved) {
                            cleanup();
                            worker.terminate();
                            startupErrors.push(`${scriptPath} + ${wasmPath}: ${error?.message || error}`);
                            tryPath(index + 1);
                        }
                    }
                }, 700);

                const timeoutTimer = setTimeout(() => {
                    if (resolved) return;
                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${scriptPath} + ${wasmPath}: startup timeout`);
                    tryPath(index + 1);
                }, 30000);

                try {
                    worker.postMessage('uci');
                    worker.postMessage('isready');
                } catch (error) {
                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${scriptPath} + ${wasmPath}: ${error?.message || error}`);
                    tryPath(index + 1);
                }
            };

            tryPath(0);
        }).finally(() => {
            this.localEngineInitPromise = null;
        });

        return this.localEngineInitPromise;
    }

    clearAnalysisTimeout() {
        if (this.analysisTimeoutId) {
            clearTimeout(this.analysisTimeoutId);
            this.analysisTimeoutId = null;
        this.localEngineUnavailableReason = null;
        }
    }

    startAnalysisTimeout() {
        this.clearAnalysisTimeout();

        this.analysisTimeoutId = setTimeout(() => {
            if (!this.isAnalyzing) {
                return;
            }

            this.isAnalyzing = false;
            this.handleError('Background analysis timed out. Switching to local fallback.');
        }, 12000);
    }

    sendAnalyzeCommand(fen, depth) {
        if (this.useLocalEngine) {
            if (!this.localEngine || !this.localEngineReady) {
                this.handleError('Local Stockfish engine is not ready yet. Please try again.');
                return;
            }

            this.localEngine.postMessage('stop');
            this.localEngine.postMessage('ucinewgame');
            this.localEngine.postMessage(`position fen ${fen}`);
            this.localEngine.postMessage('setoption name MultiPV value 3');
            this.localEngine.postMessage(`go depth ${depth}`);
            return;
        }

        if (!this.port) {
            const reason = this.localEngineUnavailableReason
                ? ` ${this.localEngineUnavailableReason}`
                : '';
            this.handleError(`Unable to connect to extension background process. Reload extension and page.${reason}`);
            return;
        }

        this.port.postMessage({
            type: MESSAGE_TYPES.ANALYZE,
            fen,
            depth
        });
    }

    /**
     * Analyze current position
     * @returns {Promise<void>}
     */
    async analyze() {
        if (!this.port && !this.useLocalEngine) {
            this.connect();
            await this.delay(500);
        }

        if (this.isAnalyzing) {
            logger.warn('Already analyzing');
            return;
        }

        if (!this.port && !this.useLocalEngine) {
            this.handleError('Unable to connect to extension background process. Reload extension and page.');
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
            if (this.useLocalEngine) {
                await this.ensureLocalEngineReady();
            }

            this.sendAnalyzeCommand(fen, this.normalizeDepth(this.depth));
            if (!this.useLocalEngine) {
                this.startAnalysisTimeout();
            }
        } catch (error) {
            this.handleError('Failed to start analysis. Reload extension and page.');
            logger.error('Failed to send analyze message:', error);
        }
    }

    /**
     * Set analysis depth
     * @param {number} depth - Analysis depth (5-25)
     */
    setDepth(depth) {
        this.depth = this.normalizeDepth(depth);
    }

    normalizeDepth(depth) {
        const parsed = Number.parseInt(depth, 10);
        if (!Number.isFinite(parsed)) {
            return MIN_DEPTH;
        }

        return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, parsed));
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
