// Background script - Local Stockfish worker

let stockfish = null;
let currentAnalysisPort = null;
let stockfishReady = false;
let initAttempts = 0;

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

            if (currentAnalysisPort) {
                currentAnalysisPort.postMessage({
                    type: 'stockfish-message',
                    data: message
                });
            }
        };

        stockfish.onerror = function (error) {
            console.error('Background - Error:', error);
            stockfish = null;
            initAttempts = 0;
        };

        stockfish.postMessage('uci');

    } catch (error) {
        console.error('Background - Init failed:', error);
        stockfish = null;
    }
}

chrome.runtime.onConnect.addListener(function (port) {
    if (port.name === 'chess-assistant') {
        currentAnalysisPort = port;

        if (!stockfish) {
            initStockfish();
        }

        port.onMessage.addListener(function (msg) {
            if (msg.type === 'analyze') {
                console.log('Background - Analyze:', msg.fen);

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
            }
        });

        port.onDisconnect.addListener(function () {
            currentAnalysisPort = null;
        });
    }
});

function analyzePosition(msg) {
    if (!stockfish || !stockfishReady) return;

    console.log('Background - Sending commands...');
    stockfish.postMessage('stop');
    stockfish.postMessage('ucinewgame');
    stockfish.postMessage('position fen ' + msg.fen);
    stockfish.postMessage('setoption name MultiPV value 3');
    stockfish.postMessage('go depth ' + msg.depth);
    console.log('Background - ✅ Sent');
}

console.log('Background - Loaded');