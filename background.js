// Background script - Local Stockfish worker with improved error handling

let stockfish = null;
let currentAnalysisPort = null;
let stockfishReady = false;
let initAttempts = 0;
let isAnalyzing = false;

function initStockfish() {
    if (stockfish || initAttempts > 3) return;

    initAttempts++;
    console.log('Background - Init attempt:', initAttempts);

    try {
        const stockfishUrl = chrome.runtime.getURL('stockfish.js');
        console.log('Background - Loading:', stockfishUrl);

        stockfish = new Worker(stockfishUrl);

        stockfish.onmessage = function (event) {
            const message = event.data;
            console.log('Stockfish:', message);

            if (message.includes('uciok')) {
                stockfishReady = true;
                console.log('Background - ✅ READY!');
            }

            if (message.includes('bestmove')) {
                isAnalyzing = false;
            }

            if (currentAnalysisPort) {
                currentAnalysisPort.postMessage({
                    type: 'stockfish-message',
                    data: message
                });
            }
        };

        stockfish.onerror = function (error) {
            console.error('Background - Stockfish Error:', error);

            // Send error to content script
            if (currentAnalysisPort) {
                currentAnalysisPort.postMessage({
                    type: 'stockfish-error',
                    error: 'Stockfish engine crashed. Restarting...'
                });
            }

            // Reset and try to reinitialize
            stockfish = null;
            stockfishReady = false;
            isAnalyzing = false;

            // Try to reinitialize after a delay
            setTimeout(() => {
                if (initAttempts < 3) {
                    console.log('Background - Attempting to restart Stockfish...');
                    initStockfish();
                }
            }, 1000);
        };

        stockfish.postMessage('uci');

    } catch (error) {
        console.error('Background - Init failed:', error);
        stockfish = null;
        initAttempts = 0;
    }
}

// Validate FEN string format
function isValidFEN(fen) {
    if (!fen || typeof fen !== 'string') return false;

    const parts = fen.split(' ');
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
        currentAnalysisPort = port;

        if (!stockfish) {
            initStockfish();
        }

        port.onMessage.addListener(function (msg) {
            if (msg.type === 'analyze') {
                console.log('Background - Analyze request:', msg.fen);

                // Validate FEN before sending to Stockfish
                if (!isValidFEN(msg.fen)) {
                    console.error('Background - Invalid FEN:', msg.fen);
                    currentAnalysisPort.postMessage({
                        type: 'stockfish-error',
                        error: 'Invalid board position detected. Please try again.'
                    });
                    return;
                }

                if (!stockfishReady) {
                    console.log('Background - Not ready, waiting...');
                    setTimeout(() => {
                        if (stockfishReady && stockfish) {
                            analyzePosition(msg);
                        } else {
                            console.error('Background - Timeout');
                            currentAnalysisPort.postMessage({
                                type: 'stockfish-error',
                                error: 'Stockfish not loaded. Make sure stockfish.js is in the extension folder.'
                            });
                        }
                    }, 2000);
                    return;
                }

                analyzePosition(msg);
            } else if (msg.type === 'reset-engine') {
                // Allow manual engine reset
                console.log('Background - Manual engine reset requested');
                if (stockfish) {
                    stockfish.terminate();
                }
                stockfish = null;
                stockfishReady = false;
                isAnalyzing = false;
                initAttempts = 0;
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
            currentAnalysisPort.postMessage({
                type: 'stockfish-error',
                error: 'Error communicating with engine. Try reloading the page.'
            });
        }
    }
}

console.log('Background - Loaded');