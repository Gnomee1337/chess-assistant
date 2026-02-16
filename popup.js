// Popup script for Chess Assistant settings

document.addEventListener('DOMContentLoaded', function () {
    const depthSlider = document.getElementById('depth');
    const depthValue = document.getElementById('depthValue');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    // Load saved settings
    chrome.storage.sync.get(['depth'], function (result) {
        if (result.depth) {
            depthSlider.value = result.depth;
            depthValue.textContent = result.depth;
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