/**
 * Cookie Manager - Frontend Logic
 * Handles cookie viewing, editing, testing, and browser extraction
 */

// State
let currentCookie = null;
let isMasked = true;
let isEditing = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCookieStatus();
    setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle mask button
    document.getElementById('toggle-mask-btn').addEventListener('click', toggleMask);

    // Edit/Save/Cancel buttons
    document.getElementById('edit-cookie-btn').addEventListener('click', enableEdit);
    document.getElementById('save-cookie-btn').addEventListener('click', saveCookie);
    document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);

    // Test cookie button
    document.getElementById('test-cookie-btn').addEventListener('click', testCookie);
}

/**
 * Load current cookie status
 */
async function loadCookieStatus() {
    try {
        const response = await fetch('/api/cookie/status');
        const data = await response.json();

        if (data.error) {
            showError('cookie-status', data.error);
            return;
        }

        // Display status
        displayCookieStatus(data);

        // Load masked cookie into textarea
        if (data.masked_cookie) {
            document.getElementById('cookie-value').value = data.masked_cookie;
            currentCookie = data.masked_cookie;
        }

    } catch (error) {
        showError('cookie-status', `Error loading status: ${error.message}`);
    }
}

/**
 * Display cookie status information
 */
function displayCookieStatus(data) {
    const container = document.getElementById('cookie-status');

    const statusBadge = getStatusBadge(data.validation_status);
    const lastValidated = data.last_validated
        ? new Date(data.last_validated).toLocaleString()
        : 'Never';

    container.innerHTML = `
        <div class="status-grid">
            <div class="status-item">
                <span class="status-label">Status:</span>
                <span class="status-badge ${data.validation_status}">${statusBadge}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Cookie configured:</span>
                <span class="status-value">${data.has_cookie ? 'Yes' : 'No'}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Last validated:</span>
                <span class="status-value">${lastValidated}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Storage:</span>
                <span class="status-value">${data.source}</span>
            </div>
        </div>
        ${data.expiry_detected ? '<div class="warning-message">⚠️ Cookie expiration detected. Please update your cookie.</div>' : ''}
    `;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const badges = {
        'valid': '✓ Valid',
        'invalid': '✗ Invalid',
        'expired': '⏱ Expired',
        'unknown': '? Unknown'
    };
    return badges[status] || badges['unknown'];
}

/**
 * Toggle cookie masking
 */
async function toggleMask() {
    const textarea = document.getElementById('cookie-value');
    const button = document.getElementById('toggle-mask-btn');

    if (isMasked) {
        // Unmask - fetch real cookie
        try {
            const response = await fetch('/api/cookie/get?unmask=true');
            const data = await response.json();

            if (data.error) {
                showToast(data.error, 'error');
                return;
            }

            textarea.value = data.cookie || '';
            currentCookie = data.cookie;
            isMasked = false;
            button.querySelector('.icon').textContent = '🙈';
            button.title = 'Hide';

        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    } else {
        // Mask - fetch masked cookie
        loadCookieStatus();
        isMasked = true;
        button.querySelector('.icon').textContent = '👁️';
        button.title = 'Show/Hide';
    }
}

/**
 * Enable edit mode
 */
function enableEdit() {
    const textarea = document.getElementById('cookie-value');
    const editBtn = document.getElementById('edit-cookie-btn');
    const saveBtn = document.getElementById('save-cookie-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');

    // Make textarea editable
    textarea.readOnly = false;
    textarea.focus();

    // Show Save/Cancel, hide Edit
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';

    isEditing = true;

    // If still masked, unmask first
    if (isMasked) {
        toggleMask();
    }
}

/**
 * Cancel edit mode
 */
function cancelEdit() {
    const textarea = document.getElementById('cookie-value');
    const editBtn = document.getElementById('edit-cookie-btn');
    const saveBtn = document.getElementById('save-cookie-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');

    // Revert to readonly
    textarea.readOnly = true;

    // Restore original value
    loadCookieStatus();

    // Show Edit, hide Save/Cancel
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';

    isEditing = false;
    isMasked = true;
}

/**
 * Save cookie
 */
async function saveCookie() {
    const textarea = document.getElementById('cookie-value');
    const newCookie = textarea.value.trim();

    if (!newCookie) {
        showToast('Cookie value cannot be empty', 'error');
        return;
    }

    // Basic validation
    if (!newCookie.includes('uid=') || !newCookie.includes('pass=')) {
        showToast('Invalid cookie format. Must contain uid= and pass=', 'error');
        return;
    }

    try {
        const response = await fetch('/api/cookie/set', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cookie: newCookie })
        });

        const data = await response.json();

        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        if (data.success) {
            showToast(data.message, 'success');

            // Exit edit mode
            cancelEdit();

            // Reload status
            loadCookieStatus();
        }

    } catch (error) {
        showToast(`Error saving cookie: ${error.message}`, 'error');
    }
}

/**
 * Test cookie validity
 */
async function testCookie() {
    const button = document.getElementById('test-cookie-btn');
    const resultDiv = document.getElementById('test-result');
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');

    // Show loading state
    button.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
        const response = await fetch('/api/cookie/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.error) {
            showToast(data.error, 'error');
            resultDiv.style.display = 'none';
            return;
        }

        // Display result
        displayTestResult(data);

        // Reload status to update validation info
        loadCookieStatus();

    } catch (error) {
        showToast(`Error testing cookie: ${error.message}`, 'error');
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

    const statusClass = result.valid ? 'success' : 'error';
    const statusIcon = result.valid ? '✓' : '✗';

    let html = `
        <div class="result-header ${statusClass}">
            <span class="result-icon">${statusIcon}</span>
            <span class="result-message">${result.message}</span>
        </div>
    `;

    if (result.user_info) {
        html += `
            <div class="user-info">
                <h4>User Information:</h4>
                <ul>
                    ${result.user_info.username ? `<li><strong>Username:</strong> ${result.user_info.username}</li>` : ''}
                    ${result.user_info.ratio ? `<li><strong>Ratio:</strong> ${result.user_info.ratio}</li>` : ''}
                    ${result.user_info.upload ? `<li><strong>Upload:</strong> ${result.user_info.upload}</li>` : ''}
                    ${result.user_info.download ? `<li><strong>Download:</strong> ${result.user_info.download}</li>` : ''}
                </ul>
            </div>
        `;
    }

    if (result.expiry_detected) {
        html += '<div class="expiry-warning">⚠️ Cookie appears to be expired. Please update it.</div>';
    }

    resultDiv.innerHTML = html;
    resultDiv.style.display = 'block';
    resultDiv.className = `test-result ${statusClass}`;
}

// Browser detection and extraction functions removed
// Modern browsers use app-bound encryption that prevents automatic cookie extraction
// Users must manually copy cookies from browser DevTools

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
