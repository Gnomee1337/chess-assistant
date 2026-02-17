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
        this.useLocalEngine = true;
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
                this.isAnalyzing = false;
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
        if (this.useLocalEngine) {
            return;
        }

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
                    logger.error('Local fallback initialization failed:', fallbackError);
                });
        }

        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
        logger.error('Analysis error:', error);
    }

    shouldUseLocalEngineFallback(error) {
        const text = typeof error === 'string' ? error : '';
        return text.includes('Stockfish files could not be loaded') || text.includes('engine is restarting');
    }

    async ensureLocalEngineReady() {
        if (this.localEngineReady && this.localEngine) {
            return;
        }

        if (this.localEngineInitPromise) {
            return this.localEngineInitPromise;
        }

        const candidates = [
            { script: 'stockfish.js', wasm: 'stockfish.wasm' },
            { script: 'stockfish/stockfish.js', wasm: 'stockfish/stockfish.wasm' },
            { script: 'stockfish.js', wasm: 'stockfish/stockfish.wasm' },
            { script: 'stockfish/stockfish.js', wasm: 'stockfish.wasm' }
        ];

        this.localEngineInitPromise = new Promise((resolve, reject) => {
            const startupErrors = [];

            const tryCandidate = (index) => {
                if (index >= candidates.length) {
                    reject(new Error(`Local Stockfish worker startup failed. Tried: ${startupErrors.join(' | ')}`));
                    return;
                }

                const candidate = candidates[index];
                const scriptUrl = chrome.runtime.getURL(candidate.script);
                const wasmUrl = chrome.runtime.getURL(candidate.wasm);

                const workerSource = `
                    self.onmessage = undefined;
                    importScripts(${JSON.stringify(scriptUrl)});
                    if (typeof self.STOCKFISH !== 'function') {
                        throw new Error('STOCKFISH factory missing after import');
                    }
                    const engine = self.STOCKFISH(${JSON.stringify(wasmUrl)});
                    self.onmessage = (event) => engine.postMessage(event.data, true);
                    engine.onmessage = (line) => self.postMessage(line);
                    engine.onerror = (error) => self.postMessage('info string worker-error ' + (error && error.message ? error.message : error));
                `;

                const blob = new Blob([workerSource], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);
                const worker = new Worker(workerUrl);
                URL.revokeObjectURL(workerUrl);

                let ready = false;
                let finished = false;

                const cleanup = () => {
                    if (finished) return;
                    finished = true;
                    clearInterval(pingTimer);
                    clearTimeout(timeoutTimer);
                };

                worker.onmessage = (event) => {
                    const message = event && event.data !== undefined ? event.data : event;

                    if (typeof message === 'string' && (message.includes('uciok') || message.includes('readyok'))) {
                        if (!ready) {
                            ready = true;
                            cleanup();
                            this.localEngine = worker;
                            this.localEngineReady = true;
                            resolve();
                        }
                    }

                    if (worker === this.localEngine) {
                        this.handleStockfishMessage(message);
                        if (typeof message === 'string' && message.includes('bestmove')) {
                            this.isAnalyzing = false;
                        }
                    }
                };

                worker.onerror = (engineError) => {
                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${candidate.script} + ${candidate.wasm}: ${engineError?.message || engineError}`);
                    tryCandidate(index + 1);
                };

                const pingTimer = setInterval(() => {
                    try {
                        worker.postMessage('uci');
                        worker.postMessage('isready');
                    } catch (error) {
                        cleanup();
                        worker.terminate();
                        startupErrors.push(`${candidate.script} + ${candidate.wasm}: ${error?.message || error}`);
                        tryCandidate(index + 1);
                    }
                }, 400);

                const timeoutTimer = setTimeout(() => {
                    if (ready) {
                        return;
                    }

                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${candidate.script} + ${candidate.wasm}: startup timeout`);
                    tryCandidate(index + 1);
                }, 9000);

                try {
                    worker.postMessage('uci');
                    worker.postMessage('isready');
                } catch (error) {
                    cleanup();
                    worker.terminate();
                    startupErrors.push(`${candidate.script} + ${candidate.wasm}: ${error?.message || error}`);
                    tryCandidate(index + 1);
                }
            };

            tryCandidate(0);
        }).finally(() => {
            this.localEngineInitPromise = null;
        });

        return this.localEngineInitPromise;
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
            this.handleError('Unable to connect to extension background process. Reload extension and page.');
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
