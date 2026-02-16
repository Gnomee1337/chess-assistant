/**
 * Logging utility with configurable levels
 */

export class Logger {
    constructor(context = 'App') {
        this.context = context;
        this.enabled = true;
    }

    log(...args) {
        if (this.enabled) {
            console.log(`[${this.context}]`, ...args);
        }
    }

    error(...args) {
        console.error(`[${this.context}]`, ...args);
    }

    warn(...args) {
        console.warn(`[${this.context}]`, ...args);
    }

    info(...args) {
        if (this.enabled) {
            console.info(`[${this.context}]`, ...args);
        }
    }

    debug(...args) {
        const isDevelopment = typeof process !== 'undefined'
            && process.env
            && process.env.NODE_ENV === 'development';

        if (this.enabled && isDevelopment) {
            console.debug(`[${this.context}]`, ...args);
        }
    }
}
