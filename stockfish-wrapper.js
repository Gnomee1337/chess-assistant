// Stockfish Wrapper - Inline worker for browser extensions

class StockfishWrapper {
    constructor() {
        this.listeners = [];
        this.ready = false;
        this.initStockfish();
    }

    initStockfish() {
        // We'll load Stockfish via a different method
        this.loadStockfishFromCDN();
    }

    loadStockfishFromCDN() {
        const script = document.createElement('script');
        // script.src = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
        script.src = 'https://cdn.jsdelivr.net/npm/stockfish@18.0.5/+esm';
        script.onload = () => {
            if (typeof STOCKFISH === 'function') {
                this.engine = STOCKFISH();
                this.engine.onmessage = (msg) => {
                    this.listeners.forEach(listener => listener(msg));
                };
                this.ready = true;
                console.log('Stockfish loaded from CDN');
            }
        };
        script.onerror = () => {
            console.error('Failed to load Stockfish from CDN');
        };
        document.head.appendChild(script);
    }

    postMessage(msg) {
        if (this.ready && this.engine) {
            this.engine.postMessage(msg);
        }
    }

    onmessage(callback) {
        this.listeners.push(callback);
    }
}