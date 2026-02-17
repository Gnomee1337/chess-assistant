// Offscreen document script — Chess Assistant
//
// Runs in a normal browser extension page (not a service worker),
// so new Worker() is fully available here.
//
// Message protocol with the service worker:
//   SW → offscreen : { type: 'stockfish-command', command: '<UCI string>' }
//   offscreen → SW : { type: 'offscreen-output',  data:    '<Stockfish output>' }
//   offscreen → SW : { type: 'offscreen-error',   error:   '<message>' }

'use strict';

let stockfishWorker = null;
let engineReady = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initStockfish() {
    if (stockfishWorker) return;

    console.log('Offscreen - Starting Stockfish Worker...');

    try {
        stockfishWorker = new Worker(chrome.runtime.getURL('stockfish.js'));
    } catch (e) {
        console.error('Offscreen - Worker() failed:', e);
        notifyError('Failed to create Stockfish Worker: ' + e.message);
        return;
    }

    stockfishWorker.onmessage = function (event) {
        const msg = typeof event === 'string' ? event
            : (event.data !== undefined ? event.data : String(event));

        if (typeof msg === 'string' && msg.includes('uciok')) {
            engineReady = true;
            console.log('Offscreen - ✅ Stockfish READY');
        }

        // Forward every engine line to the service worker.
        chrome.runtime.sendMessage({ type: 'offscreen-output', data: msg })
            .catch(() => {
                // Service worker may have gone to sleep momentarily — safe to ignore.
            });
    };

    stockfishWorker.onerror = function (err) {
        console.error('Offscreen - Worker error:', err);
        engineReady = false;
        notifyError(err.message || 'Unknown Stockfish Worker error');

        // Try to restart once.
        stockfishWorker = null;
        setTimeout(initStockfish, 1000);
    };

    stockfishWorker.postMessage('uci');
}

function notifyError(message) {
    chrome.runtime.sendMessage({ type: 'offscreen-error', error: message })
        .catch(() => { });
}

// ─── Message handler (commands from service worker) ───────────────────────────

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'stockfish-command') {
        if (!stockfishWorker) initStockfish();

        if (stockfishWorker) {
            stockfishWorker.postMessage(msg.command);
        } else {
            notifyError('Worker not available — command dropped: ' + msg.command);
        }

        sendResponse({ ok: true });
        return false;
    }

    // Service worker checking whether the engine is already ready
    // (happens after a SW restart when the offscreen doc survived).
    if (msg.type === 'stockfish-status-request') {
        sendResponse({ ready: engineReady });
        return false;
    }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initStockfish();
console.log('Offscreen - Loaded');