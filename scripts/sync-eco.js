#!/usr/bin/env node

/**
 * Sync public/eco.json from @chess-openings/eco.json package.
 *
 * Uses the package API (`openingBook`) instead of reading internal files,
 * so it works even when package `exports` blocks direct access to package.json.
 */

const fs = require('fs-extra');
const path = require('path');

async function loadFromPackageApi() {
    const pkg = await import('@chess-openings/eco.json');

    if (!pkg || typeof pkg.openingBook !== 'function') {
        throw new Error('Package does not expose openingBook()');
    }

    const content = await pkg.openingBook();

    if (!Array.isArray(content)) {
        throw new Error('openingBook() did not return an array');
    }

    return content;
}

async function run() {
    const root = path.join(__dirname, '..');
    const target = path.join(root, 'public', 'eco.json');

    const content = await loadFromPackageApi();
    await fs.writeJson(target, content, { spaces: 2 });

    console.log(`Synced ${content.length} ECO entries to public/eco.json`);
}

run().catch((error) => {
    console.error('Failed to sync ECO data:', error.message || error);
    process.exit(1);
});
