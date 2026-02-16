// Popup script for Chess Assistant settings

document.addEventListener('DOMContentLoaded', function () {
    const depthSlider = document.getElementById('depth');
    const depthValue = document.getElementById('depthValue');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    // Load saved settings
    chrome.storage.sync.get(['depth'], function (result) {
        if (result && result.depth !== undefined) {
            const savedDepth = result.depth;
            depthSlider.value = savedDepth;
            depthValue.textContent = savedDepth;
            console.log('Chess Assistant - Loaded depth:', savedDepth);
        } else {
            console.log('Chess Assistant - No saved depth, using default: 15');
        }
    });

    // Update display when slider changes
    depthSlider.addEventListener('input', function () {
        depthValue.textContent = this.value;
    });

    // Save settings
    saveBtn.addEventListener('click', function () {
        const depth = parseInt(depthSlider.value);

        chrome.storage.sync.set({
            depth: depth,
            enabled: true
        }, function () {
            if (chrome.runtime.lastError) {
                console.error('Chess Assistant - Save error:', chrome.runtime.lastError);
                return;
            }

            console.log('Chess Assistant - Saved depth:', depth);

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