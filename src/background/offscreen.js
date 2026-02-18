'use strict';

let stockfishWorker = null;
let engineReady = false;
let bgPort = null;

// ─── Port to background (more reliable than sendMessage for streaming) ────────

function getPort() {
    if (bgPort) return bgPort;
    try {
        bgPort = chrome.runtime.connect({ name: 'offscreen' });
        bgPort.onDisconnect.addListener(() => {
            console.warn('Offscreen - Port to background disconnected');
            bgPort = null;
        });
    } catch (e) {
        console.error('Offscreen - Could not connect port to background:', e);
        bgPort = null;
    }
    return bgPort;
}

function sendToBackground(payload) {
    const port = getPort();
    if (port) {
        try {
            port.postMessage(payload);
            return;
        } catch (e) {
            console.warn('Offscreen - Port postMessage failed, falling back to sendMessage:', e);
            bgPort = null;
        }
    }
    // Fallback
    chrome.runtime.sendMessage(payload).catch(() => { });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initStockfish() {
    if (stockfishWorker) return;

    console.log('Offscreen - Starting Stockfish Worker...');

    try {
        stockfishWorker = new Worker(chrome.runtime.getURL('stockfish.js'));
    } catch (e) {
        console.error('Offscreen - Worker() failed:', e);
        sendToBackground({ type: 'offscreen-error', error: 'Failed to create Stockfish Worker: ' + e.message });
        return;
    }

    stockfishWorker.onmessage = function (event) {
        const msg = typeof event === 'string' ? event
            : (event.data !== undefined ? event.data : String(event));

        if (typeof msg === 'string' && msg.includes('uciok')) {
            engineReady = true;
            console.log('Offscreen - ✅ Stockfish READY');
        }

        sendToBackground({ type: 'offscreen-output', data: msg });
    };

    stockfishWorker.onerror = function (err) {
        console.error('Offscreen - Worker error:', err);
        engineReady = false;
        sendToBackground({ type: 'offscreen-error', error: err.message || 'Unknown Stockfish Worker error' });

        stockfishWorker = null;
        setTimeout(initStockfish, 1000);
    };

    stockfishWorker.postMessage('uci');
}

// ─── Message handler (commands from service worker) ───────────────────────────

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'stockfish-command') {
        if (!stockfishWorker) initStockfish();

        if (stockfishWorker) {
            stockfishWorker.postMessage(msg.command);
        } else {
            sendToBackground({ type: 'offscreen-error', error: 'Worker not available — command dropped: ' + msg.command });
        }

        sendResponse({ ok: true });
        return false;
    }

    if (msg.type === 'stockfish-status-request') {
        // Reconnect the output port to the freshly-restarted SW while we're here.
        bgPort = null;
        getPort();
        sendResponse({ ready: engineReady });
        return false;
    }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initStockfish();
console.log('Offscreen - Loaded');