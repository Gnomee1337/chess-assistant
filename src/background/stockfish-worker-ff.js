'use strict';

// ─── getURL helper (browser = Firefox native, chrome = Chrome/polyfill) ───────
var _getURL = (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL)
    ? function (p) { return browser.runtime.getURL(p); }
    : (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? function (p) { return chrome.runtime.getURL(p); }
        : function (p) { return self.location.href.replace(/[^/]*$/, '') + p; };

// ─── Step 1: Load WASM bytes synchronously via XHR ───────────────────────────
// Synchronous XHR is legal inside Workers. We do this first so the buffer
// is ready for all the interception points below.
var _wasmBuffer = null;
try {
    var _xhr = new XMLHttpRequest();
    _xhr.open('GET', _getURL('stockfish.wasm'), false /* sync */);
    _xhr.responseType = 'arraybuffer';
    _xhr.send(null);
    if (_xhr.status === 200 && _xhr.response) {
        _wasmBuffer = _xhr.response;
        console.log('[stockfish-worker-ff] WASM loaded via XHR, bytes:', _wasmBuffer.byteLength);
    } else {
        console.error('[stockfish-worker-ff] XHR status', _xhr.status);
    }
} catch (e) {
    console.error('[stockfish-worker-ff] XHR failed:', e);
}

// ─── Step 2: Give Emscripten the bytes via Module.wasmBinary ─────────────────
// Emscripten checks Module.wasmBinary first; if set it calls
// WebAssembly.instantiate(buffer, imports) directly and skips any fetch.
// Must be a Uint8Array.
self.Module = self.Module || {};
if (_wasmBuffer) {
    self.Module.wasmBinary = new Uint8Array(_wasmBuffer);
}
self.Module.locateFile = function (path) {
    return _getURL(path);
};

// ─── Step 3: Patch WebAssembly streaming APIs ─────────────────────────────────
// Intercept instantiateStreaming / compileStreaming and use our preloaded
// buffer instead, so no network request is made at all.
if (typeof WebAssembly !== 'undefined' && _wasmBuffer) {
    WebAssembly.instantiateStreaming = function (_source, imports) {
        console.log('[stockfish-worker-ff] instantiateStreaming: using preloaded buffer');
        return WebAssembly.instantiate(_wasmBuffer.slice(0), imports);
    };

    WebAssembly.compileStreaming = function (_source) {
        console.log('[stockfish-worker-ff] compileStreaming: using preloaded buffer');
        return WebAssembly.compile(_wasmBuffer.slice(0));
    };
}

// ─── Step 4: Patch self.fetch ─────────────────────────────────────────────────
// Belt-and-suspenders: if Emscripten somehow still calls fetch() with a
// relative .wasm URL, rewrite it to the absolute extension URL.
var _nativeFetch = self.fetch.bind(self);
self.fetch = function patchedFetch(resource, init) {
    var url = (typeof resource === 'string') ? resource
        : (resource && resource.url) ? resource.url : '';

    if (url && url.indexOf('://') === -1 && url.indexOf('.wasm') !== -1) {
        var filename = url.replace(/^.*\//, '');
        var absUrl = _getURL(filename);
        console.log('[stockfish-worker-ff] fetch rewrite:', url, '→', absUrl);
        return _nativeFetch(absUrl, init);
    }

    return _nativeFetch(resource, init);
};

// ─── NOTE: SharedArrayBuffer and WebAssembly.Memory are NOT patched ──────────
// Firefox extension workers have native SharedArrayBuffer support, so the
// WASM binary (compiled with --shared-memory) can create shared memories
// normally. Patching these breaks the shared memory requirement and causes:
// "LinkError: imported unshared memory but shared required"

// ─── Step 5: Load Stockfish ───────────────────────────────────────────────────
console.log('[stockfish-worker-ff] loading stockfish.js, wasmBinary set:', !!self.Module.wasmBinary);
importScripts(_getURL('stockfish.js'));