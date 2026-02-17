// Background script - Local Stockfish worker with improved error handling

let stockfish = null;
let currentAnalysisPort = null;
let stockfishReady = false;
let initAttempts = 0;
let isAnalyzing = false;
let stockfishInitPromise = null;
let lastInitError = null;
let nextRetryDelayMs = 1000;
let readinessPingTimer = null;

// Analysis limits to prevent abuse and ensure responsiveness
const ANALYSIS_LIMITS = {
    MIN_DEPTH: 5,
    MAX_DEPTH: 25,
    MAX_FEN_LENGTH: 128
};

function safePostToPort(port, payload) {
    if (!port) return;

    try {
        port.postMessage(payload);
    } catch (error) {
        console.error('Background - Failed to post message to port:', error);
    }
}

function isTrustedPort(port) {
    const senderUrl = port?.sender?.url;
    if (typeof senderUrl !== 'string') {
        return false;
    }

    try {
        const url = new URL(senderUrl);
        if (url.protocol !== 'https:') {
            return false;
        }

        const trustedHosts = new Set([
            'www.chess.com',
            'chess.com',
            'lichess.org',
            'www.lichess.org'
        ]);

        return trustedHosts.has(url.hostname);
    } catch (error) {
        console.warn('Background - Could not parse sender URL:', senderUrl, error);
        return false;
    }
}

function normalizeDepth(depth) {
    const parsed = Number.parseInt(depth, 10);
    if (!Number.isFinite(parsed)) {
        return ANALYSIS_LIMITS.MIN_DEPTH;
    }

    return Math.min(ANALYSIS_LIMITS.MAX_DEPTH, Math.max(ANALYSIS_LIMITS.MIN_DEPTH, parsed));
}

function isValidAnalyzeMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type !== 'analyze') return false;
    if (typeof msg.fen !== 'string' || msg.fen.length > ANALYSIS_LIMITS.MAX_FEN_LENGTH) return false;
    return true;
}

function getStockfishScriptCandidates() {
    return [
        'stockfish.js',
        'stockfish/stockfish.js',
        'public/stockfish/stockfish.js'
    ];
}

function importStockfishFactory(paths) {
    if (typeof globalThis.importScripts !== 'function') {
        throw new Error('importScripts is unavailable in this service worker context');
    }

    const errors = [];

    for (const path of paths) {
        const url = chrome.runtime.getURL(path);
        try {
            globalThis.importScripts(url);
        } catch (error) {
            errors.push(`${path}: ${error?.message || error}`);
            continue;
        }

        if (typeof globalThis.STOCKFISH === 'function') {
            return path;
        }

        errors.push(`${path}: STOCKFISH factory unavailable after import`);
    }

    throw new Error(`Failed to import Stockfish script. Tried: ${errors.join(' | ')}`);
}

function createStockfishFactoryEngine(paths) {
    const scriptPath = importStockfishFactory(paths);
    const scriptDir = scriptPath.includes('/') ? scriptPath.split('/').slice(0, -1).join('/') : '';
    const wasmCandidates = [
        scriptDir ? `${scriptDir}/stockfish.wasm` : 'stockfish.wasm',
        'stockfish.wasm',
        'stockfish/stockfish.wasm',
        'public/stockfish/stockfish.wasm'
    ];

    const errors = [];

    for (const wasmPath of wasmCandidates) {
        try {
            const engine = globalThis.STOCKFISH(chrome.runtime.getURL(wasmPath));
            console.log('Background - Using Stockfish factory assets:', scriptPath, wasmPath);
            return { engine, scriptPath, wasmPath };
        } catch (error) {
            errors.push(`${wasmPath}: ${error?.message || error}`);
        }
    }

    throw new Error(`Failed to initialize STOCKFISH factory. Script: ${scriptPath}. Wasm tries: ${errors.join(' | ')}`);
}

function createStockfishWorker(paths) {
    if (typeof Worker !== 'function') {
        throw new Error('Worker constructor is unavailable in this service worker context');
    }

    const errors = [];

    for (const path of paths) {
        try {
            const workerUrl = chrome.runtime.getURL(path);
            const engine = new Worker(workerUrl);
            console.log('Background - Using Stockfish worker script:', path);
            return { engine, path };
        } catch (error) {
            errors.push(`${path}: ${error?.message || error}`);
        }
    }

    throw new Error(`Failed to construct Stockfish worker. Tried: ${errors.join(' | ')}`);
}

function createLocalStockfishEngine() {
    const scriptPaths = getStockfishScriptCandidates();

    try {
        const { engine, path } = createStockfishWorker(scriptPaths);
        console.log('Background - Stockfish worker bootstrap selected:', path);
        return engine;
    } catch (workerError) {
        console.warn('Background - Worker bootstrap failed, trying importScripts factory fallback:', workerError?.message || workerError);
    }

    const { engine } = createStockfishFactoryEngine(scriptPaths);
    return engine;
}

function clearReadinessPingTimer() {
    if (readinessPingTimer) {
        clearInterval(readinessPingTimer);
        readinessPingTimer = null;
    }
}

function startReadinessPing() {
    clearReadinessPingTimer();

    let uciRetries = 0;

    readinessPingTimer = setInterval(() => {
        if (!stockfish || stockfishReady) {
            clearReadinessPingTimer();
            return;
        }

        try {
            stockfish.postMessage('isready');
            if (uciRetries < 5) {
                stockfish.postMessage('uci');
                uciRetries += 1;
            }
        } catch (error) {
            console.warn('Background - Failed readiness ping:', error);
        }
    }, 1000);
}

function initStockfish() {
    if (stockfish || stockfishInitPromise) return;

    stockfishInitPromise = (async () => {
        initAttempts++;
        console.log('Background - Init attempt:', initAttempts);

        try {
            console.log('Background - Loading local Stockfish bundle');
            stockfish = createLocalStockfishEngine();

            stockfish.onmessage = function (event) {
                const message = event && event.data !== undefined ? event.data : event;
                console.log('Stockfish:', message);

                if (typeof message === 'string' && (message.includes('uciok') || message.includes('readyok'))) {
                    stockfishReady = true;
                    initAttempts = 0;
                    lastInitError = null;
                    nextRetryDelayMs = 1000;
                    clearReadinessPingTimer();
                    console.log('Background - ✅ READY!');
                }

                if (typeof message === 'string' && message.includes('bestmove')) {
                    isAnalyzing = false;
                }

                if (currentAnalysisPort) {
                    currentAnalysisPort.postMessage({
                        type: 'stockfish-message',
                        data: message
                    });
                }
            };

            if ('onerror' in stockfish) {
                stockfish.onerror = function (error) {
                    console.error('Background - Stockfish Error:', error);

                    if (currentAnalysisPort) {
                        currentAnalysisPort.postMessage({
                            type: 'stockfish-error',
                            error: 'Stockfish engine crashed. Restarting...'
                        });
                    }

                    stockfish = null;
                    stockfishReady = false;
                    clearReadinessPingTimer();
                    isAnalyzing = false;
                    stockfishInitPromise = null;
                    lastInitError = error || new Error('stockfish-runtime-error');

                    const retryDelay = nextRetryDelayMs;
                    nextRetryDelayMs = Math.min(nextRetryDelayMs * 2, 15000);

                    setTimeout(() => {
                        console.log('Background - Attempting to restart Stockfish...');
                        initStockfish();
                    }, retryDelay);
                };
            }

            stockfish.postMessage('uci');
            stockfish.postMessage('isready');
            startReadinessPing();

        } catch (error) {
            console.error('Background - Init failed:', error);
            stockfish = null;
            stockfishReady = false;
            clearReadinessPingTimer();
            stockfishInitPromise = null;
            lastInitError = error;

            const retryDelay = nextRetryDelayMs;
            nextRetryDelayMs = Math.min(nextRetryDelayMs * 2, 15000);

            setTimeout(() => {
                console.log('Background - Retrying Stockfish init after failure...');
                initStockfish();
            }, retryDelay);
        } finally {
            if (stockfish) {
                stockfishInitPromise = null;
            }
        }
    })();
}

function waitForStockfishReady(timeoutMs = 45000, pollIntervalMs = 100) {
    if (stockfishReady && stockfish) {
        return Promise.resolve();
    }

    if (!stockfish && !stockfishInitPromise) {
        initStockfish();
    }

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timer = setInterval(() => {
            if (stockfishReady && stockfish) {
                clearInterval(timer);
                resolve();
                return;
            }

            if (lastInitError && !stockfishInitPromise && !stockfish) {
                clearInterval(timer);
                reject(lastInitError);
                return;
            }

            if (Date.now() - startTime >= timeoutMs) {
                clearInterval(timer);
                reject(new Error('stockfish-ready-timeout'));
            }
        }, pollIntervalMs);
    });
}

// Validate FEN string format
function isValidFEN(fen) {
    if (!fen || typeof fen !== 'string') return false;

    if (fen.length > ANALYSIS_LIMITS.MAX_FEN_LENGTH) {
        return false;
    }

    // Limit characters to legal FEN alphabet and separators.
    if (!/^[pnbrqkPNBRQKwW1-8/\s\-a-hA-H0-9]+$/.test(fen)) {
        return false;
    }

    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return false;

    const position = parts[0];
    const ranks = position.split('/');

    // Should have 8 ranks
    if (ranks.length !== 8) return false;

    // Check each rank
    for (let rank of ranks) {
        let squares = 0;
        for (let char of rank) {
            if ('12345678'.includes(char)) {
                squares += parseInt(char);
            } else if ('pnbrqkPNBRQK'.includes(char)) {
                squares += 1;
            } else {
                return false;
            }
        }
        // Each rank should have exactly 8 squares
        if (squares !== 8) return false;
    }

    // Turn should be 'w' or 'b'
    if (parts[1] !== 'w' && parts[1] !== 'b') return false;

    return true;
}

chrome.runtime.onConnect.addListener(function (port) {
    if (port.name === 'chess-assistant') {
        if (!isTrustedPort(port)) {
            console.warn('Background - Rejected untrusted connection:', port?.sender?.url);
            port.disconnect();
            return;
        }

        currentAnalysisPort = port;

        if (!stockfish) {
            initStockfish();
        }

        port.onMessage.addListener(function (msg) {
            if (msg && msg.type === 'analyze') {
                if (!isValidAnalyzeMessage(msg)) {
                    safePostToPort(currentAnalysisPort, {
                        type: 'stockfish-error',
                        error: 'Invalid analysis request.'
                    });
                    return;
                }

                const safeFen = msg.fen.trim();
                const safeDepth = normalizeDepth(msg.depth);
                console.log('Background - Analyze request:', msg.fen);

                // Validate FEN before sending to Stockfish
                if (!isValidFEN(safeFen)) {
                    console.error('Background - Invalid FEN:', safeFen);
                    safePostToPort(currentAnalysisPort, {
                        type: 'stockfish-error',
                        error: 'Invalid board position detected. Please try again.'
                    });
                    return;
                }

                if (!stockfishReady) {
                    console.log('Background - Not ready, waiting for Stockfish to finish initialization...');
                }

                waitForStockfishReady()
                    .then(() => {
                        analyzePosition({
                            fen: safeFen,
                            depth: safeDepth
                        });
                    })
                    .catch((error) => {
                        const errorMessage = error && error.message ? error.message : String(error);
                        console.error('Background - Failed waiting for Stockfish readiness:', errorMessage);

                        const isAssetError =
                            typeof errorMessage === 'string' &&
                            (errorMessage.includes('Asset not found') || errorMessage.includes('Failed to import Stockfish script') || errorMessage.includes('Failed to create Stockfish worker') || errorMessage.includes('Failed to initialize STOCKFISH factory') || errorMessage.includes('Cannot call unknown function init') || errorMessage.includes('Cannot call unknown function uci_command'));

                        safePostToPort(currentAnalysisPort, {
                            type: 'stockfish-error',
                            error: isAssetError
                                ? 'Stockfish files are missing or incompatible. Rebuild and load dist/, and ensure stockfish.js + stockfish.wasm are a matching pair.'
                                : 'Stockfish engine is restarting. Please try again in a few seconds.'
                        });
                    });
            } else if (msg && msg.type === 'reset-engine') {
                // Allow manual engine reset
                console.log('Background - Manual engine reset requested');
                if (stockfish && typeof stockfish.terminate === 'function') {
                    stockfish.terminate();
                }
                stockfish = null;
                stockfishReady = false;
                isAnalyzing = false;
                initAttempts = 0;
                stockfishInitPromise = null;
                lastInitError = null;
                clearReadinessPingTimer();
                nextRetryDelayMs = 1000;
                initStockfish();
            }
        });

        port.onDisconnect.addListener(function () {
            currentAnalysisPort = null;
        });
    }
});

function analyzePosition(msg) {
    if (!stockfish || !stockfishReady) {
        console.error('Background - Cannot analyze: engine not ready');
        return;
    }

    if (isAnalyzing) {
        console.log('Background - Already analyzing, stopping previous analysis');
        stockfish.postMessage('stop');
    }

    console.log('Background - Sending commands...');

    try {
        isAnalyzing = true;
        stockfish.postMessage('stop');

        // Small delay between commands
        setTimeout(() => {
            stockfish.postMessage('ucinewgame');
            stockfish.postMessage('position fen ' + msg.fen);
            stockfish.postMessage('setoption name MultiPV value 3');
            stockfish.postMessage('go depth ' + msg.depth);
            console.log('Background - ✅ Commands sent');
        }, 50);

    } catch (error) {
        console.error('Background - Error sending commands:', error);
        isAnalyzing = false;

        if (currentAnalysisPort) {
            safePostToPort(currentAnalysisPort, {
                type: 'stockfish-error',
                error: 'Error communicating with engine. Try reloading the page.'
            });
        }
    }
}

console.log('Background - Loaded');
