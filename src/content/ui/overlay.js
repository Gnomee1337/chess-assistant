/**
 * Overlay UI component
 */

import { Logger } from '../../shared/logger.js';
import { SELECTORS } from '../../shared/constants.js';
import { MoveHighlighter } from '../chess/move-highlighter.js';

const logger = new Logger('Overlay');

export class Overlay {
    constructor(analysisService) {
        this.analysisService = analysisService;
        this.element = null;
        this.launcher = null;
        this.isEnabled = true;
        this.autoAnalyze = true;
        this.isCollapsed = false;
        this.isHidden = false;
        this.topMoves = [];
        this.currentOpening = {
            name: 'Opening not recognized yet',
            lines: ['Run analysis to detect opening context'],
            playedMoves: []
        };
        this.repertoireLines = [];
        this.onSaveRepertoireCallback = null;
        this.onRemoveRepertoireCallback = null;
        this.dragState = {
            isDragging: false,
            offsetX: 0,
            offsetY: 0
        };
    }

    /**
     * Create and inject overlay into page
     */
    create() {
        if (this.element) return;

        this.element = document.createElement('div');
        this.element.id = 'chess-assistant-overlay';
        this.element.innerHTML = this.getTemplate();

        this.launcher = document.createElement('button');
        this.launcher.id = 'chess-assistant-launcher';
        this.launcher.textContent = '♟️ Assistant';

        document.body.appendChild(this.element);
        document.body.appendChild(this.launcher);

        this.setInitialPosition();
        this.attachEventListeners();
        this.refreshControls();
        this.renderOpeningExplorer();
        logger.log('Overlay created');
    }

    refreshControls() {
        this.updateEnabledButton();
        this.updateAutoButton();
    }

    getTemplate() {
        return `
            <div class="chess-assistant-header">
                <span>♟️ Chess Assistant</span>
                <button id="chess-assistant-toggle" class="toggle-btn">ON</button>
                <button id="chess-assistant-auto" class="auto-btn" title="Auto-analyze after each move">AUTO</button>
                <button id="chess-assistant-analyze" class="analyze-btn">Analyze</button>
                <button id="chess-assistant-collapse" class="icon-btn" title="Collapse overlay">−</button>
                <button id="chess-assistant-hide" class="icon-btn" title="Hide overlay">✕</button>
            </div>
            <div id="chess-assistant-moves" class="moves-container">
                <div class="loading">Auto-analysis enabled</div>
            </div>
            <div id="chess-assistant-opening" class="opening-container"></div>
        `;
    }

    attachEventListeners() {
        document.getElementById('chess-assistant-toggle').addEventListener('click', () => this.toggleEnabled());
        document.getElementById('chess-assistant-auto').addEventListener('click', () => this.toggleAutoAnalyze());
        document.getElementById('chess-assistant-analyze').addEventListener('click', () => this.analyze());
        document.getElementById('chess-assistant-collapse').addEventListener('click', () => this.toggleCollapse());
        document.getElementById('chess-assistant-hide').addEventListener('click', () => this.hideOverlay());
        this.launcher.addEventListener('click', () => this.showOverlay());

        const header = this.element.querySelector('.chess-assistant-header');
        if (header) {
            header.addEventListener('mousedown', (event) => this.startDrag(event));
        }

        this.element.addEventListener('click', (event) => {
            const saveBtn = event.target.closest('#chess-assistant-save-line');
            if (saveBtn && this.onSaveRepertoireCallback) {
                this.onSaveRepertoireCallback();
            }

            const removeBtn = event.target.closest('[data-repertoire-index]');
            if (removeBtn && this.onRemoveRepertoireCallback) {
                const index = parseInt(removeBtn.getAttribute('data-repertoire-index'), 10);
                if (!Number.isNaN(index)) {
                    this.onRemoveRepertoireCallback(index);
                }
            }
        });

        document.addEventListener('mousemove', (event) => this.onDrag(event));
        document.addEventListener('mouseup', () => this.stopDrag());
        window.addEventListener('resize', () => this.handleResize());
    }

    onSaveRepertoire(callback) {
        this.onSaveRepertoireCallback = callback;
    }

    onRemoveRepertoire(callback) {
        this.onRemoveRepertoireCallback = callback;
    }

    setOpening(opening) {
        this.currentOpening = opening;
        this.renderOpeningExplorer();
    }

    setRepertoireLines(lines) {
        this.repertoireLines = lines;
        this.renderOpeningExplorer();
    }

    renderOpeningExplorer() {
        const container = document.getElementById('chess-assistant-opening');
        if (!container) return;

        const lines = (this.currentOpening.lines || [])
            .map(line => `<li>${line}</li>`)
            .join('');

        const playedMoves = (this.currentOpening.playedMoves || []).slice(-10).join(' ');
        const repertoireItems = this.repertoireLines.length
            ? this.repertoireLines
                .slice(0, 5)
                .map((item, index) => `
                    <li>
                        <span>${item.name}: ${item.line}</span>
                        <button class="repertoire-remove" data-repertoire-index="${index}" title="Remove line">×</button>
                    </li>
                `)
                .join('')
            : '<li class="repertoire-empty">No saved repertoire lines yet</li>';

        container.innerHTML = `
            <div class="opening-block">
                <div class="opening-title">📚 Opening Explorer</div>
                <div class="opening-name">${this.currentOpening.name}</div>
                <div class="opening-played" title="Detected player moves">${playedMoves || 'No moves detected yet'}</div>
                <ul class="opening-lines">${lines}</ul>
                <button id="chess-assistant-save-line" class="save-line-btn">Save best line</button>
            </div>
            <div class="repertoire-block">
                <div class="opening-title">⭐ Repertoire</div>
                <ul class="repertoire-list">${repertoireItems}</ul>
            </div>
        `;
    }

    setInitialPosition() {
        if (!this.element) return;

        const margin = 20;
        const width = this.element.offsetWidth || 280;
        this.setPosition(window.innerWidth - width - margin, margin);
    }

    setPosition(left, top) {
        if (!this.element) return;

        const margin = 8;
        const overlayRect = this.element.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - overlayRect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - overlayRect.height - margin);
        const clampedLeft = Math.min(Math.max(left, margin), maxLeft);
        const clampedTop = Math.min(Math.max(top, margin), maxTop);

        this.element.style.left = `${clampedLeft}px`;
        this.element.style.top = `${clampedTop}px`;
        this.element.style.right = 'auto';

        this.updateLauncherPosition(clampedLeft, clampedTop);
    }

    updateLauncherPosition(left, top) {
        if (!this.launcher) return;

        this.launcher.style.left = `${left}px`;
        this.launcher.style.top = `${top}px`;
        this.launcher.style.right = 'auto';
    }

    startDrag(event) {
        if (event.button !== 0) return;
        if (event.target.closest('button')) return;

        const overlayRect = this.element.getBoundingClientRect();
        this.dragState.isDragging = true;
        this.dragState.offsetX = event.clientX - overlayRect.left;
        this.dragState.offsetY = event.clientY - overlayRect.top;

        this.element.classList.add('dragging');
        event.preventDefault();
    }

    onDrag(event) {
        if (!this.dragState.isDragging || !this.element) return;

        this.setPosition(
            event.clientX - this.dragState.offsetX,
            event.clientY - this.dragState.offsetY
        );
    }

    stopDrag() {
        if (!this.dragState.isDragging || !this.element) return;

        this.dragState.isDragging = false;
        this.element.classList.remove('dragging');
    }

    handleResize() {
        if (!this.element) return;

        const overlayRect = this.element.getBoundingClientRect();
        this.setPosition(overlayRect.left, overlayRect.top);
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        this.element.classList.toggle('collapsed', this.isCollapsed);

        const collapseBtn = document.getElementById('chess-assistant-collapse');
        if (collapseBtn) {
            collapseBtn.textContent = this.isCollapsed ? '+' : '−';
            collapseBtn.title = this.isCollapsed ? 'Expand overlay' : 'Collapse overlay';
        }
    }

    hideOverlay() {
        this.isHidden = true;
        this.element.classList.add('hidden');
        this.launcher.classList.add('visible');
    }

    showOverlay() {
        this.isHidden = false;
        this.element.classList.remove('hidden');
        this.launcher.classList.remove('visible');

        const overlayRect = this.element.getBoundingClientRect();
        this.setPosition(overlayRect.left, overlayRect.top);
    }

    toggleEnabled() {
        this.isEnabled = !this.isEnabled;
        this.updateEnabledButton();

        this.updateMessage(
            this.isEnabled
                ? (this.autoAnalyze ? 'Auto-analysis enabled' : 'Click "Analyze" to get move suggestions')
                : 'Assistant disabled'
        );

        chrome.storage.sync.set({ enabled: this.isEnabled });
    }

    toggleAutoAnalyze() {
        this.autoAnalyze = !this.autoAnalyze;
        this.updateAutoButton();

        this.updateMessage(
            this.autoAnalyze
                ? 'Auto-analysis enabled'
                : 'Click "Analyze" to get move suggestions'
        );

        chrome.storage.sync.set({ autoAnalyze: this.autoAnalyze });
    }

    updateEnabledButton() {
        const btn = document.getElementById('chess-assistant-toggle');
        if (!btn) return;

        btn.textContent = this.isEnabled ? 'ON' : 'OFF';
        btn.classList.toggle('off', !this.isEnabled);
    }

    updateAutoButton() {
        const btn = document.getElementById('chess-assistant-auto');
        if (!btn) return;

        btn.textContent = this.autoAnalyze ? 'AUTO' : 'MANUAL';
        btn.classList.toggle('off', !this.autoAnalyze);
    }

    async analyze() {
        if (!this.isEnabled) return;

        this.showLoading();
        await this.analysisService.analyze();
    }

    displayMoves(moves) {
        const container = document.getElementById('chess-assistant-moves');
        if (!container) return;

        if (moves.length === 0) {
            container.innerHTML = '<div class="loading">No moves found</div>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        let html = '';

        const board = document.querySelector(SELECTORS.BOARD);
        const isFlipped = board ? MoveHighlighter.isBoardFlipped(board) : false;

        moves.forEach((moveData, index) => {
            const scoreStr = this.formatScore(moveData);
            const displayMove = this.getDisplayMove(moveData.move, isFlipped);
            html += `
                <div class="move-item" data-move="${moveData.move}" title="UCI: ${moveData.move}">
                    <span class="medal">${medals[index]}</span>
                    <span class="move">${displayMove}</span>
                    <span class="score">${scoreStr}</span>
                </div>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.move-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const move = item.getAttribute('data-move');
                MoveHighlighter.highlight(move);
            });

            item.addEventListener('mouseleave', () => {
                MoveHighlighter.clearAll();
            });
        });
    }

    getDisplayMove(uciMove, isFlipped) {
        if (!isFlipped) return uciMove;

        const match = String(uciMove).match(/^([a-h][1-8])([a-h][1-8])([a-z])?$/);
        if (!match) return uciMove;

        const from = this.mirrorSquare(match[1]);
        const to = this.mirrorSquare(match[2]);
        const promotion = match[3] || '';
        return `${from}${to}${promotion}`;
    }

    mirrorSquare(square) {
        const fileCode = square.charCodeAt(0) - 96;
        const rank = Number.parseInt(square[1], 10);
        if (!Number.isFinite(fileCode) || !Number.isFinite(rank)) return square;

        const mirroredFile = String.fromCharCode(96 + (9 - fileCode));
        const mirroredRank = String(9 - rank);
        return `${mirroredFile}${mirroredRank}`;
    }

    formatScore(moveData) {
        if (Math.abs(moveData.score) > 100) {
            if (moveData.mateIn !== undefined) {
                const absMate = Math.abs(moveData.mateIn);
                if (absMate === 1) {
                    return moveData.mateIn > 0 ? 'Checkmate' : '-Checkmate';
                }
                return moveData.mateIn > 0 ? `Mate in ${absMate}` : `-Mate in ${absMate}`;
            }
            return moveData.score > 0 ? 'Mate!' : '-Mate';
        }
        return moveData.score > 0 ? `+${moveData.score.toFixed(2)}` : moveData.score.toFixed(2);
    }

    showLoading() {
        this.updateMessage('Analyzing position...');
    }

    showError(message) {
        const container = document.getElementById('chess-assistant-moves');
        if (container) {
            container.innerHTML = `<div class="loading" style="color: #ff6b6b;">${message}</div>`;
        }
    }

    updateMessage(message) {
        const container = document.getElementById('chess-assistant-moves');
        if (container) {
            container.innerHTML = `<div class="loading">${message}</div>`;
        }
    }
}
