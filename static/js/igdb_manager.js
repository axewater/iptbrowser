/**
 * IGDB Manager Page JavaScript
 * Handles IGDB configuration and testing
 *
 * Note: Unlike TMDB, IGDB credentials are stored in .env file (server-side)
 * Frontend only stores enable/disable toggle in localStorage
 */

let igdbClient = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('IGDB Manager loaded');

    loadCurrentSettings();
    setupEventListeners();
    updateCacheStats();
    checkBackendStatus();
});

function setupEventListeners() {
    // Enable/disable checkbox
    document.getElementById('igdb-enabled').addEventListener('change', function() {
        saveSettings();
        updateStatus();
    });

    // Test button
    document.getElementById('test-igdb-btn').addEventListener('click', testConnection);

    // Clear cache button
    document.getElementById('clear-cache-btn').addEventListener('click', clearCache);
}

function loadCurrentSettings() {
    const savedEnabled = localStorage.getItem('igdb_enabled') === 'true';
    document.getElementById('igdb-enabled').checked = savedEnabled;

    // Initialize client if enabled
    if (savedEnabled) {
        igdbClient = new IGDBClient();
    }

    updateStatus();
}

function updateStatus() {
    const enabled = document.getElementById('igdb-enabled').checked;
    const statusDiv = document.getElementById('igdb-status');

    let statusHtml = '';

    if (enabled) {
        statusHtml = `
            <div class="status-success">
                <div class="status-icon">✓</div>
                <div class="status-content">
                    <h3>IGDB Integration Enabled</h3>
                    <p>Game metadata is active</p>
                    <p class="status-detail">Showing covers, info, trailers for game torrents</p>
                </div>
            </div>
        `;
    } else {
        statusHtml = `
            <div class="status-inactive">
                <div class="status-icon">○</div>
                <div class="status-content">
                    <h3>IGDB Integration Disabled</h3>
                    <p>Game metadata is not active</p>
                    <p class="status-detail">Enable below to show rich game information</p>
                </div>
            </div>
        `;
    }

    statusDiv.innerHTML = statusHtml;
}

function saveSettings() {
    const enabled = document.getElementById('igdb-enabled').checked;

    // Save to localStorage
    localStorage.setItem('igdb_enabled', enabled.toString());

    // Update client
    if (enabled) {
        if (!igdbClient) {
            igdbClient = new IGDBClient();
        }
    } else {
        igdbClient = null;
    }

    console.log('IGDB settings saved:', { enabled });
    showMessage('Settings saved successfully! Changes will apply on the main page.', 'success');
}

async function checkBackendStatus() {
    const backendStatusDiv = document.getElementById('backend-status');
    backendStatusDiv.innerHTML = '<p>Checking backend status...</p>';

    try {
        const enabled = document.getElementById('igdb-enabled').checked;

        // Create temporary client to check status
        const tempClient = new IGDBClient();
        const status = await tempClient.checkBackendStatus(enabled);

        let statusHtml = '';

        if (status.configured && status.token_valid) {
            statusHtml = `
                <div class="status-success">
                    <div class="status-icon">✓</div>
                    <div class="status-content">
                        <h3>Backend Configured</h3>
                        <p>IGDB credentials are set in .env file</p>
                        <p class="status-detail">OAuth token is valid and ready</p>
                    </div>
                </div>
            `;
        } else if (status.configured && !status.token_valid) {
            statusHtml = `
                <div class="status-warning">
                    <div class="status-icon">⚠</div>
                    <div class="status-content">
                        <h3>Token Issue</h3>
                        <p>Credentials found but OAuth token may be invalid</p>
                        <p class="status-detail">Try testing connection below</p>
                    </div>
                </div>
            `;
        } else {
            statusHtml = `
                <div class="status-error">
                    <div class="status-icon">✗</div>
                    <div class="status-content">
                        <h3>Not Configured</h3>
                        <p>IGDB credentials not found in .env file</p>
                        <p class="status-detail">Follow setup instructions below to configure</p>
                    </div>
                </div>
            `;
        }

        backendStatusDiv.innerHTML = statusHtml;

    } catch (error) {
        console.error('Error checking backend status:', error);
        backendStatusDiv.innerHTML = `
            <div class="status-error">
                <div class="status-icon">✗</div>
                <div class="status-content">
                    <h3>Status Check Failed</h3>
                    <p>${error.message}</p>
                    <p class="status-detail">Check that the Flask server is running</p>
                </div>
            </div>
        `;
    }
}

async function testConnection() {
    const testBtn = document.getElementById('test-igdb-btn');
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    try {
        showMessage('Testing IGDB connection with "Half-Life"...', 'info');

        // Create temporary client for testing
        const testClient = new IGDBClient();
        const result = await testClient.testConnection();

        if (result.success) {
            const testGame = result.test_game || {};
            const tokenExpiry = result.token_expiry ?
                new Date(result.token_expiry).toLocaleString() : 'Unknown';

            const resultHtml = `
                <div class="status-success">
                    <div class="status-icon">✓</div>
                    <div class="status-content">
                        <h3>Connection Successful!</h3>
                        <p>${result.message}</p>
                        <p class="status-detail">
                            ${testGame.name ? `Game: ${testGame.name}<br>` : ''}
                            ${testGame.developer ? `Developer: ${testGame.developer}<br>` : ''}
                            ${testGame.rating ? `Rating: ${testGame.rating}/10<br>` : ''}
                            Token expires: ${tokenExpiry}
                        </p>
                    </div>
                </div>
            `;
            showMessage(resultHtml, 'success', true);

            // Update cache stats
            updateCacheStats();

            // Refresh backend status
            checkBackendStatus();
        } else {
            throw new Error(result.message || 'Connection test failed');
        }

    } catch (error) {
        console.error('Connection test failed:', error);
        const errorHtml = `
            <div class="status-error">
                <div class="status-icon">✗</div>
                <div class="status-content">
                    <h3>Connection Failed</h3>
                    <p>${error.message}</p>
                    <p class="status-detail">
                        Common issues:<br>
                        • IGDB credentials not set in .env file<br>
                        • Invalid client ID or client secret<br>
                        • Network connectivity issues<br>
                        • Twitch OAuth service temporarily down
                    </p>
                </div>
            </div>
        `;
        showMessage(errorHtml, 'error', true);
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
    }
}

function clearCache() {
    if (!confirm('Clear IGDB cache? Game data will be fetched fresh from the API.')) {
        return;
    }

    localStorage.removeItem('iptbrowser_igdb_cache');

    // Reinitialize client
    const enabled = document.getElementById('igdb-enabled').checked;
    if (enabled) {
        igdbClient = new IGDBClient();
    }

    updateCacheStats();
    showMessage('Cache cleared successfully!', 'success');
}

function updateCacheStats() {
    const cacheStr = localStorage.getItem('iptbrowser_igdb_cache');
    const entriesEl = document.getElementById('cache-entries');
    const sizeEl = document.getElementById('cache-size');

    if (!cacheStr) {
        entriesEl.textContent = '0';
        sizeEl.textContent = '0 KB';
        return;
    }

    try {
        const cache = JSON.parse(cacheStr);
        const entries = Object.keys(cache).length;
        const size = new Blob([cacheStr]).size;
        const sizeKB = (size / 1024).toFixed(2);

        entriesEl.textContent = entries;
        sizeEl.textContent = sizeKB + ' KB';
    } catch (error) {
        console.error('Error reading cache stats:', error);
        entriesEl.textContent = 'Error';
        sizeEl.textContent = 'Error';
    }
}

function showMessage(message, type = 'info', isHtml = false) {
    const messageDiv = document.getElementById('igdb-message');
    messageDiv.style.display = 'block';
    messageDiv.className = 'test-result ' + type;

    if (isHtml) {
        messageDiv.innerHTML = message;
    } else {
        messageDiv.textContent = message;
    }

    // Auto-hide success/info messages after 5 seconds
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}
