/**
 * Chrome storage abstraction layer
 */

import { DEFAULT_SETTINGS } from './constants.js';
import { Logger } from './logger.js';

const logger = new Logger('Storage');

export class StorageService {
    /**
     * Get a single value from storage
     * @param {string} key - Storage key
     * @returns {Promise<any>}
     */
    static async get(key) {
        return new Promise((resolve) => {
            chrome.storage.sync.get([key], (result) => {
                if (chrome.runtime.lastError) {
                    logger.error(`Error getting ${key}:`, chrome.runtime.lastError);
                    resolve(DEFAULT_SETTINGS[key]);
                } else {
                    resolve(result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key]);
                }
            });
        });
    }

    /**
     * Get multiple values from storage
     * @param {string[]} keys - Storage keys
     * @returns {Promise<Object>}
     */
    static async getMultiple(keys) {
        return new Promise((resolve) => {
            chrome.storage.sync.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    logger.error('Error getting multiple values:', chrome.runtime.lastError);
                    resolve(DEFAULT_SETTINGS);
                } else {
                    // Merge with defaults
                    const merged = { ...DEFAULT_SETTINGS };
                    keys.forEach(key => {
                        if (result[key] !== undefined) {
                            merged[key] = result[key];
                        }
                    });
                    resolve(merged);
                }
            });
        });
    }

    /**
     * Set a value in storage
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     * @returns {Promise<void>}
     */
    static async set(key, value) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    logger.error(`Error setting ${key}:`, chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    logger.log(`Saved ${key}:`, value);
                    resolve();
                }
            });
        });
    }

    /**
     * Set multiple values in storage
     * @param {Object} items - Key-value pairs to store
     * @returns {Promise<void>}
     */
    static async setMultiple(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
                if (chrome.runtime.lastError) {
                    logger.error('Error setting multiple values:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    logger.log('Saved multiple values:', items);
                    resolve();
                }
            });
        });
    }

    /**
     * Listen for storage changes
     * @param {Function} callback - Callback function(changes, namespace)
     */
    static onChange(callback) {
        chrome.storage.onChanged.addListener(callback);
    }
}