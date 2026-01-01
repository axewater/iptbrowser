/**
 * qBittorrent Manager - Frontend Logic
 * Handles qBittorrent configuration, testing, and status display
 */

// State
let currentConfig = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConnectionStatus();
    loadConfiguration();
    setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Enable checkbox - toggle config fields
    document.getElementById('qbt-enabled').addEventListener('change', toggleConfigFields);

    // Save configuration button
    document.getElementById('save-config-btn').addEventListener('click', saveConfiguration);

    // Test connection button
    document.getElementById('test-connection-btn').addEventListener('click', testConnection);

    // Help modal
    document.getElementById('help-btn').addEventListener('click', openHelpModal);
    document.getElementById('close-help').addEventListener('click', closeHelpModal);
    document.getElementById('close-help-footer').addEventListener('click', closeHelpModal);
    document.querySelector('#help-modal .modal-overlay').addEventListener('click', closeHelpModal);

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('help-modal').style.display === 'block') {
            closeHelpModal();
        }
    });
}

/**
 * Load current connection status
 */
async function loadConnectionStatus() {
    try {
        const response = await fetch('/api/qbittorrent/config');
        const config = await response.json();

        if (config.error) {
            showError('connection-status', config.error);
            return;
        }

        // Display status
        displayConnectionStatus(config);

    } catch (error) {
        showError('connection-status', `Error loading status: ${error.message}`);
    }
}

/**
 * Display connection status information
 */
function displayConnectionStatus(config) {
    const container = document.getElementById('connection-status');

    const statusBadge = config.enabled
        ? '<span class="status-badge valid">✓ Enabled</span>'
        : '<span class="status-badge unknown">Disabled</span>';

    const hasConfig = config.host && config.username;

    container.innerHTML = `
        <div class="status-grid">
            <div class="status-item">
                <span class="status-label">Status:</span>
                ${statusBadge}
            </div>
            <div class="status-item">
                <span class="status-label">Configuration:</span>
                <span class="status-value">${hasConfig ? 'Complete' : 'Incomplete'}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Host:</span>
                <span class="status-value">${config.host || 'Not configured'}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Category:</span>
                <span class="status-value">${config.category || 'None'}</span>
            </div>
        </div>
    `;
}

/**
 * Load current configuration
 */
async function loadConfiguration() {
    try {
        const response = await fetch('/api/qbittorrent/config');
        const config = await response.json();

        if (config.error) {
            console.error('Error loading config:', config.error);
            return;
        }

        // Store current config
        currentConfig = config;

        // Populate form fields
        document.getElementById('qbt-enabled').checked = config.enabled || false;
        document.getElementById('qbt-host').value = config.host || 'http://localhost:8080';
        document.getElementById('qbt-username').value = config.username || '';
        document.getElementById('qbt-password').value = config.password || '';
        document.getElementById('qbt-category').value = config.category || 'games';
        document.getElementById('qbt-use-category').checked = config.use_category !== false;
        document.getElementById('qbt-start-paused').checked = config.start_paused || false;

        // Toggle config fields based on enabled state
        toggleConfigFields();

    } catch (error) {
        console.error('Error loading configuration:', error);
        showToast('Failed to load configuration', 'error');
    }
}

/**
 * Toggle configuration fields visibility
 */
function toggleConfigFields() {
    const enabled = document.getElementById('qbt-enabled').checked;
    const fieldsContainer = document.getElementById('qbt-config-fields');
    fieldsContainer.style.display = enabled ? 'block' : 'none';
}

/**
 * Save configuration
 */
async function saveConfiguration() {
    const button = document.getElementById('save-config-btn');
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');

    // Get values from form
    const config = {
        enabled: document.getElementById('qbt-enabled').checked,
        host: document.getElementById('qbt-host').value.trim(),
        username: document.getElementById('qbt-username').value.trim(),
        password: document.getElementById('qbt-password').value,
        category: document.getElementById('qbt-category').value.trim(),
        use_category: document.getElementById('qbt-use-category').checked,
        start_paused: document.getElementById('qbt-start-paused').checked
    };

    // Validate if enabled
    if (config.enabled) {
        if (!config.host) {
            showToast('Host is required when qBittorrent integration is enabled', 'error');
            return;
        }
        if (!config.username) {
            showToast('Username is required when qBittorrent integration is enabled', 'error');
            return;
        }
        if (!config.password) {
            showToast('Password is required when qBittorrent integration is enabled', 'error');
            return;
        }
    }

    // Show loading state
    button.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
        const response = await fetch('/api/qbittorrent/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Configuration saved successfully!', 'success');
            currentConfig = config;

            // Reload status
            await loadConnectionStatus();
        } else {
            showToast(result.message || 'Failed to save configuration', 'error');
        }

    } catch (error) {
        showToast(`Error saving configuration: ${error.message}`, 'error');
    } finally {
        // Reset button state
        button.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

/**
 * Test connection to qBittorrent
 */
async function testConnection() {
    const button = document.getElementById('test-connection-btn');
    const resultDiv = document.getElementById('test-result');
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');

    // Show loading state
    button.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
        const response = await fetch('/api/qbittorrent/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        // Display result
        displayTestResult(result);

    } catch (error) {
        showToast(`Error testing connection: ${error.message}`, 'error');
        resultDiv.style.display = 'none';
    } finally {
        // Reset button state
        button.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

/**
 * Display test result
 */
function displayTestResult(result) {
    const resultDiv = document.getElementById('test-result');

    const statusClass = result.success ? 'success' : 'error';
    const statusIcon = result.success ? '✓' : '✗';

    let html = `
        <div class="result-header ${statusClass}">
            <span class="result-icon">${statusIcon}</span>
            <span class="result-message">${result.message}</span>
        </div>
    `;

    if (result.success && result.version) {
        html += `
            <div class="user-info">
                <h4>qBittorrent Information:</h4>
                <ul>
                    <li><strong>Version:</strong> ${result.version}</li>
                    ${result.api_version ? `<li><strong>API Version:</strong> ${result.api_version}</li>` : ''}
                </ul>
            </div>
        `;
    }

    if (!result.success && result.details) {
        html += `<div class="error-detail">${result.details}</div>`;
    }

    resultDiv.innerHTML = html;
    resultDiv.style.display = 'block';
    resultDiv.className = `test-result ${statusClass}`;
}

/**
 * Open help modal
 */
function openHelpModal() {
    document.getElementById('help-modal').style.display = 'block';
}

/**
 * Close help modal
 */
function closeHelpModal() {
    document.getElementById('help-modal').style.display = 'none';
}

/**
 * Show error message
 */
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="error-message">Error: ${message}</div>`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        'success': '✓',
        'error': '✗',
        'warning': '⚠️',
        'info': 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Show animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
