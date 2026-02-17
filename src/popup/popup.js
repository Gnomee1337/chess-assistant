// Popup script for Chess Assistant settings

document.addEventListener('DOMContentLoaded', function () {
    const depthSlider = document.getElementById('depth');
    const depthValue = document.getElementById('depthValue');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    const defaultHighlight = '#9bc700';
    const defaultArrow = '#9bc700';
    const presets = ['#9bc700', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'];

    const pickers = {
        highlight: {
            swatch: document.getElementById('highlightSwatch'),
            hex: document.getElementById('highlightHex'),
            r: document.getElementById('highlightR'),
            g: document.getElementById('highlightG'),
            b: document.getElementById('highlightB'),
            presetsContainer: document.getElementById('highlightPresets')
        },
        arrow: {
            swatch: document.getElementById('arrowSwatch'),
            hex: document.getElementById('arrowHex'),
            r: document.getElementById('arrowR'),
            g: document.getElementById('arrowG'),
            b: document.getElementById('arrowB'),
            presetsContainer: document.getElementById('arrowPresets')
        }
    };

    function activateTab(tabName) {
        tabButtons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        tabPanels.forEach((panel) => {
            const isActive = panel.id === `${tabName}Tab`;
            panel.classList.toggle('active', isActive);
            panel.hidden = !isActive;
        });
    }

    function normalizeHex(value, fallback) {
        if (!value) return fallback;

        const stringValue = String(value).trim();
        const rgbMatch = stringValue.match(/(\d+)\D+(\d+)\D+(\d+)/);
        if (stringValue.startsWith('rgb') && rgbMatch) {
            const red = Math.min(255, parseInt(rgbMatch[1], 10));
            const green = Math.min(255, parseInt(rgbMatch[2], 10));
            const blue = Math.min(255, parseInt(rgbMatch[3], 10));
            return rgbToHex(red, green, blue);
        }

        let hex = stringValue.startsWith('#') ? stringValue.slice(1) : stringValue;
        if (hex.length === 3) {
            hex = hex.split('').map((ch) => ch + ch).join('');
        }

        if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
            return fallback;
        }

        return `#${hex.toLowerCase()}`;
    }

    function hexToRgb(hex) {
        const clean = normalizeHex(hex, '#000000').slice(1);
        return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        return `#${[r, g, b].map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`;
    }

    function setPickerColor(name, hex) {
        const picker = pickers[name];
        if (!picker) return;

        const normalized = normalizeHex(hex, name === 'highlight' ? defaultHighlight : defaultArrow);
        const rgb = hexToRgb(normalized);

        picker.hex.value = normalized;
        picker.r.value = rgb.r;
        picker.g.value = rgb.g;
        picker.b.value = rgb.b;
        picker.swatch.style.backgroundColor = normalized;

        const presetButtons = picker.presetsContainer.querySelectorAll('.preset-btn');
        presetButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.color === normalized);
        });

        updatePreview();
    }

    function getPickerColor(name) {
        const picker = pickers[name];
        if (!picker) return '#000000';

        return normalizeHex(picker.hex.value, '#000000');
    }

    function syncFromSliders(name) {
        const picker = pickers[name];
        const hex = rgbToHex(picker.r.value, picker.g.value, picker.b.value);
        setPickerColor(name, hex);
    }

    function updatePreview() {
        document.documentElement.style.setProperty('--example-highlight', getPickerColor('highlight'));
        document.documentElement.style.setProperty('--example-arrow', getPickerColor('arrow'));
    }

    function buildPresetButtons(name) {
        const picker = pickers[name];
        picker.presetsContainer.innerHTML = '';

        presets.forEach((color) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'preset-btn';
            button.dataset.color = color;
            button.style.backgroundColor = color;
            button.title = `Use ${color}`;

            button.addEventListener('click', () => {
                setPickerColor(name, color);
            });

            picker.presetsContainer.appendChild(button);
        });
    }

    function wirePickerEvents(name) {
        const picker = pickers[name];

        picker.r.addEventListener('input', () => syncFromSliders(name));
        picker.g.addEventListener('input', () => syncFromSliders(name));
        picker.b.addEventListener('input', () => syncFromSliders(name));

        picker.hex.addEventListener('input', () => {
            const candidate = picker.hex.value;
            const normalized = normalizeHex(candidate, null);
            if (normalized) {
                setPickerColor(name, normalized);
            }
        });

        picker.hex.addEventListener('blur', () => {
            setPickerColor(name, picker.hex.value);
        });
    }

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => activateTab(button.dataset.tab));
    });

    depthSlider.addEventListener('input', function () {
        depthValue.textContent = this.value;
    });

    Object.keys(pickers).forEach((name) => {
        buildPresetButtons(name);
        wirePickerEvents(name);
    });

    // Load saved settings
    chrome.storage.sync.get(['depth', 'highlightColor', 'arrowColor'], function (result) {
        if (result && result.depth !== undefined) {
            const savedDepth = result.depth;
            depthSlider.value = savedDepth;
            depthValue.textContent = savedDepth;
        }

        setPickerColor('highlight', normalizeHex(result.highlightColor, defaultHighlight));
        setPickerColor('arrow', normalizeHex(result.arrowColor, defaultArrow));
    });

    // Save settings
    saveBtn.addEventListener('click', function () {
        const depth = parseInt(depthSlider.value, 10);
        const highlightColor = getPickerColor('highlight');
        const arrowColor = getPickerColor('arrow');

        chrome.storage.sync.set({
            depth,
            enabled: true,
            highlightColor,
            arrowColor
        }, function () {
            if (chrome.runtime.lastError) {
                console.error('Chess Assistant - Save error:', chrome.runtime.lastError);
                return;
            }

            status.classList.add('show');
            saveBtn.textContent = '✓ Saved!';
            saveBtn.style.background = '#4ade80';

            setTimeout(function () {
                status.classList.remove('show');
                saveBtn.textContent = 'Save Settings';
            }, 2000);
        });
    });
});
