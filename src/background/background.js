// Background service worker — Chess Assistant
//
// WHY OFFSCREEN DOCUMENT:
//   Chrome MV3 service workers lack new Worker() AND forbid importScripts()
//   inside async code. The only way to host a Web Worker is via an Offscreen
//   Document (chrome.offscreen API), which runs in a normal browser context.
//
// Architecture:
//   content script ──port──▶ service worker ──sendMessage──▶ offscreen doc
//                  ◀─────────               ◀──────────────  (Stockfish Worker)

'use strict';

let currentAnalysisPort = null;
let stockfishReady = false;
let isAnalyzing = false;
let pendingAnalysis = null;   // queued while engine is loading
let offscreenReady = false;

const ANALYSIS_LIMITS = {
    MIN_DEPTH: 5,
    MAX_DEPTH: 25,
    MAX_FEN_LENGTH: 128
};

// ─── Offscreen document management ───────────────────────────────────────────

async function ensureOffscreenDocument() {
    try {
        if (await chrome.offscreen.hasDocument()) {
            offscreenReady = true;
            return true;
        }

        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('offscreen.html'),
            reasons: ['WORKERS'],
            justification: 'Run Stockfish chess engine in a Web Worker'
        });

        offscreenReady = true;
        console.log('Background - Offscreen document created');
        return true;
    } catch (e) {
        console.error('Background - Could not create offscreen document:', e);
        offscreenReady = false;
        return false;
    }
}

function sendToStockfish(command) {
    chrome.runtime.sendMessage({ type: 'stockfish-command', command })
        .catch(e => console.warn('Background - sendToStockfish failed:', e.message));
}

// ─── Engine init ──────────────────────────────────────────────────────────────

async function initStockfish() {
    console.log('Background - Initialising Stockfish via offscreen document...');

    const ok = await ensureOffscreenDocument();
    if (!ok) {
        safePostToPort(currentAnalysisPort, {
            type: 'stockfish-error',
            error: 'Could not create offscreen document. Check that the "offscreen" permission is in manifest.json.'
        });
        return;
    }

    // If the SW was killed and restarted while the offscreen doc survived,
    // the engine may already be ready — ask for its current state.
    try {
        const status = await chrome.runtime.sendMessage({ type: 'stockfish-status-request' });
        if (status && status.ready) {
            console.log('Background - Offscreen engine already ready (SW restart recovery)');
            stockfishReady = true;

            if (pendingAnalysis) {
                const queued = pendingAnalysis;
                pendingAnalysis = null;
                runAnalysis(queued);
            }
            return;
        }
    } catch {
        // Offscreen doc not yet listening — that's fine, we'll get uciok when it's ready.
    }

    // Send 'uci' to start the handshake. The offscreen doc will forward it to the
    // Worker which will respond with 'uciok' → caught below in onMessage.
    sendToStockfish('uci');
}

// ─── Messages FROM offscreen document ────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (msg, sender) {
    // Only accept messages from our own extension pages.
    if (sender.id !== chrome.runtime.id) return;
    // Ignore messages from content scripts (they use the port instead).
    if (sender.tab) return;
    // Fallback for browsers/scenarios where the port isn't used
    handleOffscreenMsg(msg);
});

// ─── Port connection from content script ─────────────────────────────────────

chrome.runtime.onConnect.addListener(function (port) {
    // ── Offscreen document output port ──────────────────────────────────────
    if (port.name === 'offscreen') {
        port.onMessage.addListener(function (msg) {
            handleOffscreenMsg(msg);
        });
        port.onDisconnect.addListener(function () {
            console.warn('Background - Offscreen output port disconnected');
        });
        return;
    }

    // ── Content script port ─────────────────────────────────────────────────
    if (port.name !== 'chess-assistant') return;

    if (!isTrustedPort(port)) {
        console.warn('Background - Rejected untrusted connection:', port?.sender?.url);
        port.disconnect();
        return;
    }

    currentAnalysisPort = port;

    // (Re-)init whenever a content script connects so a restarted SW recovers cleanly.
    initStockfish();

    port.onMessage.addListener(function (msg) {
        if (msg && msg.type === 'analyze') {
            handleAnalyzeRequest(msg);
        } else if (msg && msg.type === 'reset-engine') {
            handleReset();
        }
    });

    port.onDisconnect.addListener(function () {
        currentAnalysisPort = null;
    });
});

// ─── Analysis request handling ────────────────────────────────────────────────

function handleAnalyzeRequest(msg) {
    if (!isValidAnalyzeMessage(msg)) {
        safePostToPort(currentAnalysisPort, { type: 'stockfish-error', error: 'Invalid analysis request.' });
        return;
    }

    const safeFen = msg.fen.trim();
    const safeDepth = normalizeDepth(msg.depth);

    if (!isValidFEN(safeFen)) {
        safePostToPort(currentAnalysisPort, { type: 'stockfish-error', error: 'Invalid board position.' });
        return;
    }

    if (!stockfishReady) {
        // Engine still loading (large WASM) — queue and notify UI.
        console.log('Background - Engine loading, queuing analysis...');
        pendingAnalysis = { fen: safeFen, depth: safeDepth };
        safePostToPort(currentAnalysisPort, {
            type: 'stockfish-message',
            data: 'info string Engine loading, please wait...'
        });
        return;
    }

    runAnalysis({ fen: safeFen, depth: safeDepth });
}

function handleReset() {
    console.log('Background - Manual engine reset');
    stockfishReady = false;
    isAnalyzing = false;
    offscreenReady = false;
    pendingAnalysis = null;

    // Destroy the offscreen document so a fresh one is created on next init.
    chrome.offscreen.closeDocument().catch(() => { });

    setTimeout(() => initStockfish(), 300);
}

function runAnalysis(msg) {
    if (!stockfishReady) {
        console.error('Background - Cannot analyze: engine not ready');
        return;
    }

    if (isAnalyzing) sendToStockfish('stop');

    try {
        isAnalyzing = true;
        sendToStockfish('stop');

        setTimeout(() => {
            sendToStockfish('ucinewgame');
            sendToStockfish('position fen ' + msg.fen);
            sendToStockfish('setoption name MultiPV value 3');
            sendToStockfish('go depth ' + msg.depth);
            console.log('Background - ✅ Analysis commands sent');
        }, 50);

    } catch (e) {
        console.error('Background - Error sending analysis commands:', e);
        isAnalyzing = false;
        safePostToPort(currentAnalysisPort, {
            type: 'stockfish-error',
            error: 'Error communicating with engine. Try reloading the page.'
        });
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safePostToPort(port, payload) {
    if (!port) return;
    try { port.postMessage(payload); }
    catch (e) { console.error('Background - port.postMessage failed:', e); }
}

function isTrustedPort(port) {
    const senderUrl = port?.sender?.url;
    if (typeof senderUrl !== 'string') return false;
    try {
        const url = new URL(senderUrl);
        if (url.protocol !== 'https:') return false;
        return new Set(['www.chess.com', 'chess.com', 'lichess.org', 'www.lichess.org'])
            .has(url.hostname);
    } catch { return false; }
}

function normalizeDepth(depth) {
    const n = Number.parseInt(depth, 10);
    if (!Number.isFinite(n)) return ANALYSIS_LIMITS.MIN_DEPTH;
    return Math.min(ANALYSIS_LIMITS.MAX_DEPTH, Math.max(ANALYSIS_LIMITS.MIN_DEPTH, n));
}

function handleOffscreenMsg(msg) {
    if (msg.type === 'offscreen-output') {
        const message = msg.data;
        console.log('Stockfish:', message);

        if (typeof message === 'string' && message.includes('uciok')) {
            stockfishReady = true;
            console.log('Background - ✅ Stockfish READY');
            if (pendingAnalysis) {
                const queued = pendingAnalysis;
                pendingAnalysis = null;
                runAnalysis(queued);
            }
        }

        if (typeof message === 'string' && message.includes('bestmove')) {
            isAnalyzing = false;
        }

        safePostToPort(currentAnalysisPort, { type: 'stockfish-message', data: message });

    } else if (msg.type === 'offscreen-error') {
        console.error('Background - Offscreen Stockfish error:', msg.error);
        stockfishReady = false;
        isAnalyzing = false;
        safePostToPort(currentAnalysisPort, { type: 'stockfish-error', error: msg.error });
    }
}

function isValidAnalyzeMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type !== 'analyze') return false;
    if (typeof msg.fen !== 'string' || msg.fen.length > ANALYSIS_LIMITS.MAX_FEN_LENGTH) return false;
    return true;
}

function isValidFEN(fen) {
    if (!fen || typeof fen !== 'string') return false;
    if (fen.length > ANALYSIS_LIMITS.MAX_FEN_LENGTH) return false;
    if (!/^[pnbrqkPNBRQKwW1-8/\s\-a-hA-H0-9]+$/.test(fen)) return false;

    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return false;
    if (parts[1] !== 'w' && parts[1] !== 'b') return false;

    const ranks = parts[0].split('/');
    if (ranks.length !== 8) return false;

    for (const rank of ranks) {
        let squares = 0;
        for (const char of rank) {
            if ('12345678'.includes(char)) squares += parseInt(char);
            else if ('pnbrqkPNBRQK'.includes(char)) squares += 1;
            else return false;
        }
        if (squares !== 8) return false;
    }

    return true;
}

console.log('Background - Loaded');