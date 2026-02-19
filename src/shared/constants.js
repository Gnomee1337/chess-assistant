/**
 * Application-wide constants
 */

export const APP_NAME = 'Chess Assistant';
export const APP_VERSION = '1.0.0';

export const DEFAULT_SETTINGS = {
    depth: 15,
    enabled: true,
    autoAnalyze: true,
    repertoireLines: [],
    highlightColor: '#9bc700',
    arrowColor: '#9bc700'
};

export const ANALYSIS_DEPTH = {
    MIN: 5,
    MAX: 25,
    DEFAULT: 15,
    FAST_MAX: 10,
    BALANCED_MAX: 18
};

export const PIECE_CHARS = {
    WHITE: { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' },
    BLACK: { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k' }
};

export const FILES = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

export const COLORS = {
    HIGHLIGHT: '#9bc700',
    ARROW: '#9bc700',
    ERROR: '#ff6b6b'
};

export const SELECTORS = {
    BOARD: 'wc-chess-board, chess-board, .board, cg-board',
    MOVE_LIST: '.move-list, wc-simple-move-list, rm6 l4x',
    PIECES: '[class*="piece"], piece',
    ARROWS_SVG: 'svg.arrows'
};

export const MESSAGE_TYPES = {
    ANALYZE: 'analyze',
    STOCKFISH_MESSAGE: 'stockfish-message',
    STOCKFISH_ERROR: 'stockfish-error',
    RESET_ENGINE: 'reset-engine',
    STOP_ENGINE: 'stop-engine',
    KEEP_ALIVE: 'keep-alive'
};

export const STORAGE_KEYS = {
    DEPTH: 'depth',
    ENABLED: 'enabled',
    AUTO_ANALYZE: 'autoAnalyze',
    REPERTOIRE_LINES: 'repertoireLines',
    HIGHLIGHT_COLOR: 'highlightColor',
    ARROW_COLOR: 'arrowColor'
};
