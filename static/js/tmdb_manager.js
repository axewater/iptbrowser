/**
 * TMDB Manager Page JavaScript
 * Handles TMDB configuration and testing
 */

let tmdbClient = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('TMDB Manager loaded');

    loadCurrentSettings();
    setupEventListeners();
    updateCacheStats();
});

function setupEventListeners() {
    // Save button
    document.getElementById('save-tmdb-btn').addEventListener('click', saveSettings);

    // Test button
    document.getElementById('test-tmdb-btn').addEventListener('click', testApiKey);

    // Clear cache button
    document.getElementById('clear-cache-btn').addEventListener('click', clearCache);

    // Toggle API key visibility
    document.getElementById('toggle-key-visibility').addEventListener('click', toggleKeyVisibility);

    // Enable/disable checkbox
    document.getElementById('tmdb-enabled').addEventListener('change', updateStatus);
}

function loadCurrentSettings() {
    const savedApiKey = localStorage.getItem('tmdb_api_key') || '';
    const savedEnabled = localStorage.getItem('tmdb_enabled') === 'true';

    document.getElementById('tmdb-api-key').value = savedApiKey;
    document.getElementById('tmdb-enabled').checked = savedEnabled;

    // Initialize client if enabled
    if (savedApiKey && savedEnabled) {
        tmdbClient = new TMDBClient(savedApiKey);
    }

    updateStatus();
}

function updateStatus() {
    const enabled = document.getElementById('tmdb-enabled').checked;
    const apiKey = document.getElementById('tmdb-api-key').value.trim();
    const statusDiv = document.getElementById('tmdb-status');

    let statusHtml = '';

    if (enabled && apiKey) {
        statusHtml = `
            <div class="status-success">
                <div class="status-icon">✓</div>
                <div class="status-content">
                    <h3>TMDB Integration Enabled</h3>
                    <p>Movie metadata is active. API key configured.</p>
                    <p class="status-detail">Showing posters, plot, cast for movie torrents</p>
                </div>
            </div>
        `;
    } else if (enabled && !apiKey) {
        statusHtml = `
            <div class="status-warning">
                <div class="status-icon">⚠</div>
                <div class="status-content">
                    <h3>TMDB Enabled, No API Key</h3>
                    <p>Integration is enabled but no API key is configured.</p>
                    <p class="status-detail">Enter your API key below and save.</p>
                </div>
            </div>
        `;
    } else {
        statusHtml = `
            <div class="status-inactive">
                <div class="status-icon">○</div>
                <div class="status-content">
                    <h3>TMDB Integration Disabled</h3>
                    <p>Movie metadata is not active.</p>
                    <p class="status-detail">Enable below to show rich movie information</p>
                </div>
            </div>
        `;
    }

    statusDiv.innerHTML = statusHtml;
}

function saveSettings() {
    const apiKey = document.getElementById('tmdb-api-key').value.trim();
    const enabled = document.getElementById('tmdb-enabled').checked;

    // Validate API key format (should be 32 chars alphanumeric)
    if (enabled && apiKey && !apiKey.match(/^[a-f0-9]{32}$/i)) {
        showMessage('Invalid API key format. TMDB API keys are 32 hexadecimal characters.', 'error');
        return;
    }

    // Save to localStorage
    localStorage.setItem('tmdb_api_key', apiKey);
    localStorage.setItem('tmdb_enabled', enabled.toString());

    // Update client
    if (apiKey && enabled) {
        tmdbClient = new TMDBClient(apiKey);
    } else {
        tmdbClient = null;
    }

    updateStatus();
    showMessage('Settings saved successfully! Changes will apply on the main page.', 'success');

    console.log('TMDB settings saved:', { enabled, hasKey: !!apiKey });
}

async function testApiKey() {
    const apiKey = document.getElementById('tmdb-api-key').value.trim();

    if (!apiKey) {
        showMessage('Please enter an API key first', 'error');
        return;
    }

    const testBtn = document.getElementById('test-tmdb-btn');
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    try {
        // Create a test client
        const testClient = new TMDBClient(apiKey);

        // Test with a well-known movie (The Matrix - tt0133093)
        const testImdbId = 'tt0133093';
        showMessage('Testing API key with "The Matrix"...', 'info');

        const movieData = await testClient.findByIMDBId(testImdbId);

        // If we got here, the API key works!
        const resultHtml = `
            <div class="status-success">
                <div class="status-icon">✓</div>
                <div class="status-content">
                    <h3>API Key Valid!</h3>
                    <p>Successfully fetched data for: <strong>${movieData.title}</strong></p>
                    <p class="status-detail">
                        Rating: ${movieData.vote_average ? movieData.vote_average.toFixed(1) : 'N/A'}/10<br>
                        Director: ${movieData.director}<br>
                        ${movieData.cast ? movieData.cast.length + ' cast members found' : 'No cast data'}
                    </p>
                </div>
            </div>
        `;
        showMessage(resultHtml, 'success', true);

        // Update cache stats after test
        updateCacheStats();

    } catch (error) {
        console.error('API key test failed:', error);
        const errorHtml = `
            <div class="status-error">
                <div class="status-icon">✗</div>
                <div class="status-content">
                    <h3>API Key Test Failed</h3>
                    <p>${error.message}</p>
                    <p class="status-detail">
                        Common issues:<br>
                        • Invalid API key format<br>
                        • API key not activated yet (wait a few minutes after creation)<br>
                        • Network connectivity issues<br>
                        • TMDB service temporarily down
                    </p>
                </div>
            </div>
        `;
        showMessage(errorHtml, 'error', true);
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test API Key';
    }
}

function clearCache() {
    const apiKey = document.getElementById('tmdb-api-key').value.trim();

    if (!apiKey) {
        showMessage('No API key configured', 'error');
        return;
    }

    const confirmed = confirm('Are you sure you want to clear the TMDB cache? This will remove all cached movie data.');

    if (!confirmed) {
        return;
    }

    // Clear the cache
    localStorage.removeItem('iptbrowser_tmdb_cache');

    // Reinitialize client
    if (tmdbClient) {
        tmdbClient = new TMDBClient(apiKey);
    }

    updateCacheStats();
    showMessage('Cache cleared successfully! Movie data will be fetched fresh from TMDB.', 'success');
}

function updateCacheStats() {
    const cacheStr = localStorage.getItem('iptbrowser_tmdb_cache');
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

function toggleKeyVisibility() {
    const input = document.getElementById('tmdb-api-key');
    const btn = document.getElementById('toggle-key-visibility');

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<span class="icon">🙈</span>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<span class="icon">👁️</span>';
    }
}

function showMessage(message, type = 'info', isHtml = false) {
    const messageDiv = document.getElementById('tmdb-message');

    messageDiv.style.display = 'block';
    messageDiv.className = 'test-result ' + type;

    if (isHtml) {
        messageDiv.innerHTML = message;
    } else {
        messageDiv.textContent = message;
    }

    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}
