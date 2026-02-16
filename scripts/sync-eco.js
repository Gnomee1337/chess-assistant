#!/usr/bin/env node

/**
 * Sync public/eco.json from @chess-openings/eco.json package.
 */

const fs = require('fs-extra');
const path = require('path');

async function resolveEcoPath() {
    const packageJsonPath = require.resolve('@chess-openings/eco.json/package.json');
    const packageDir = path.dirname(packageJsonPath);

    const candidates = [
        path.join(packageDir, 'eco.json'),
        path.join(packageDir, 'data', 'eco.json'),
        path.join(packageDir, 'dist', 'eco.json')
    ];

    for (const candidate of candidates) {
        if (await fs.pathExists(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Could not locate eco.json inside package. Checked: ${candidates.join(', ')}`);
}

async function run() {
    const root = path.join(__dirname, '..');
    const target = path.join(root, 'public', 'eco.json');

    const source = await resolveEcoPath();
    const content = await fs.readJson(source);

    if (!Array.isArray(content)) {
        throw new Error('Source eco.json is not an array');
    }

    await fs.writeJson(target, content, { spaces: 2 });
    console.log(`Synced ${content.length} ECO entries to public/eco.json`);
}

run().catch((error) => {
    console.error('Failed to sync ECO data:', error.message || error);
    process.exit(1);
});
