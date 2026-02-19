'use strict';

// Patch 1: SharedArrayBuffer → ArrayBuffer alias
if (typeof SharedArrayBuffer === 'undefined') {
    self.SharedArrayBuffer = ArrayBuffer;
}

// Patch 2: Atomics stub
if (typeof Atomics === 'undefined') {
    self.Atomics = {
        wait: function () { return 'ok'; },
        notify: function () { return 0; },
        load: function (b, i) { return new Int32Array(b)[i]; },
        store: function (b, i, v) { new Int32Array(b)[i] = v; return v; },
        add: function (b, i, v) { var a = new Int32Array(b), o = a[i]; a[i] += v; return o; },
        compareExchange: function (b, i, e, r) { var a = new Int32Array(b); if (a[i] === e) a[i] = r; return e; }
    };
}

// Patch 3: WebAssembly.Memory in-place — strip { shared:true } so Firefox
// doesn't throw, then after construction buffer instanceof ArrayBuffer
// satisfies the instanceof SharedArrayBuffer check (via Patch 1 alias).
(function patchMemory() {
    var Native = WebAssembly.Memory;
    function Patched(d) {
        if (d && d.shared) d = { initial: d.initial, maximum: d.maximum };
        return new Native(d);
    }
    Patched.prototype = Native.prototype;
    try {
        Object.defineProperty(WebAssembly, 'Memory', { value: Patched, writable: true, configurable: true });
    } catch (e) { WebAssembly.Memory = Patched; }
}());

importScripts('stockfish.js');