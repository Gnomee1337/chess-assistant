/**
 * Browser API polyfill for Chrome/Firefox compatibility
 * Provides unified API regardless of browser
 */

(function () {
    'use strict';

    // Detect browser
    const isFirefox = typeof browser !== 'undefined' && browser.runtime;
    const isChrome = typeof chrome !== 'undefined' && chrome.runtime;

    if (!isFirefox && !isChrome) {
        console.error('Unsupported browser');
        return;
    }

    // If Firefox, browser API is already available
    if (isFirefox) {
        window.chrome = browser;
        console.log('Browser API: Using native Firefox API');
        return;
    }

    // If Chrome, chrome API is already available
    if (isChrome) {
        console.log('Browser API: Using native Chrome API');
        return;
    }
})();