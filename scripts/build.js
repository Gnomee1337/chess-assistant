#!/usr/bin/env node

/**
 * Build script for Chess Assistant extension
 * Handles development builds, production builds, and packaging
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const args = process.argv.slice(2);
const isProduction = process.env.NODE_ENV === 'production' || args.includes('--prod');
const isPackage = args.includes('--package');
const isClean = args.includes('--clean');
const isWatch = args.includes('--watch');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..', 'src');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Clean dist directory
async function clean() {
    console.log('🧹 Cleaning dist directory...');
    await fs.remove(DIST_DIR);
    await fs.ensureDir(DIST_DIR);
}

// Copy public files
async function copyPublicFiles() {
    console.log('📁 Copying public files...');
    await fs.copy(PUBLIC_DIR, DIST_DIR);
}

// Build process
async function build() {
    try {
        await clean();
        await copyPublicFiles();

        // Copy source files (in a real project, you'd bundle/minify here)
        console.log('🔨 Building source files...');
        await fs.copy(SRC_DIR, path.join(DIST_DIR, 'src'));

        if (isProduction) {
            console.log('🚀 Production build complete!');
        } else {
            console.log('✅ Development build complete!');
        }

    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

// Package extension as ZIP
async function package() {
    console.log('📦 Creating release package...');

    const output = fs.createWriteStream(path.join(__dirname, '..', 'chess-assistant.zip'));
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
        console.log(`✅ Package created: ${archive.pointer()} bytes`);
    });

    archive.on('error', (err) => {
        throw err;
    });

    archive.pipe(output);
    archive.directory(DIST_DIR, false);
    await archive.finalize();
}

// Main execution
(async () => {
    if (isClean) {
        await clean();
        return;
    }

    await build();

    if (isPackage) {
        await package();
    }

    if (isWatch) {
        console.log('👀 Watching for changes...');
        const chokidar = require('chokidar');
        const watcher = chokidar.watch([SRC_DIR, PUBLIC_DIR], {
            ignored: /(^|[\/\\])\../,
            persistent: true
        });

        watcher.on('change', async (filePath) => {
            console.log(`\n🔄 File changed: ${filePath}`);
            await build();
        });
    }
})();