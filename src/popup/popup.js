// Popup script for Chess Assistant settings

document.addEventListener('DOMContentLoaded', function () {
    const depthSlider = document.getElementById('depth');
    const depthValue = document.getElementById('depthValue');
    const highlightColorInput = document.getElementById('highlightColor');
    const arrowColorInput = document.getElementById('arrowColor');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    const defaultHighlight = '#9bc700';
    const defaultArrow = '#9bc700';

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

    function updatePreview() {
        document.documentElement.style.setProperty('--example-highlight', highlightColorInput.value);
        document.documentElement.style.setProperty('--example-arrow', arrowColorInput.value);
    }

    function rgbToHex(rgb) {
        const parts = rgb.match(/\d+/g);
        if (!parts || parts.length < 3) return null;

        return `#${parts.slice(0, 3).map((value) => {
            const hex = parseInt(value, 10).toString(16);
            return hex.length === 1 ? `0${hex}` : hex;
        }).join('')}`;
    }

    // Load saved settings
    chrome.storage.sync.get(['depth', 'highlightColor', 'arrowColor'], function (result) {
        if (result && result.depth !== undefined) {
            const savedDepth = result.depth;
            depthSlider.value = savedDepth;
            depthValue.textContent = savedDepth;
            console.log('Chess Assistant - Loaded depth:', savedDepth);
        } else {
            console.log('Chess Assistant - No saved depth, using default: 15');
        }

        const savedHighlight = rgbToHex(result.highlightColor) || result.highlightColor || defaultHighlight;
        const savedArrow = rgbToHex(result.arrowColor) || result.arrowColor || defaultArrow;

        highlightColorInput.value = savedHighlight;
        arrowColorInput.value = savedArrow;
        updatePreview();
    });

    // Update display when slider changes
    depthSlider.addEventListener('input', function () {
        depthValue.textContent = this.value;
    });

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => activateTab(button.dataset.tab));
    });

    highlightColorInput.addEventListener('input', updatePreview);
    arrowColorInput.addEventListener('input', updatePreview);

    // Save settings
    saveBtn.addEventListener('click', function () {
        const depth = parseInt(depthSlider.value, 10);
        const highlightColor = highlightColorInput.value;
        const arrowColor = arrowColorInput.value;

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

            console.log('Chess Assistant - Saved settings:', {
                depth,
                highlightColor,
                arrowColor
            });

            // Show success message
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
