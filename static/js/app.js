// IPTorrents Browser - Frontend JavaScript
// Optimized with client-side state management

// ===================================================================
// STATE MANAGEMENT
// ===================================================================

const AppState = {
    // Raw data (all torrents, never modified after fetch)
    allTorrents: [],

    // Computed view (filtered + sorted)
    displayedTorrents: [],

    // Metadata from server
    metadata: null,

    // Current filters (not sent to API - handled client-side)
    currentFilters: {
        categories: ['PC-ISO', 'PC-Rip'],
        days: null,  // null = show all cached data
        minSnatched: 0,
        exclude: '',
        search: ''
    },

    // Current sort
    currentSort: {
        field: 'snatched',
        order: 'desc'
    },

    // UI state
    isLoading: false,

    // qBittorrent integration state
    qbittorrentEnabled: false,
    qbittorrentConfig: null,

    // TMDB integration state
    tmdbEnabled: false,
    tmdbApiKey: null,
    tmdbClient: null,
    expandedRows: new Set()
};

// Search debounce timer
let searchTimeout = null;

// ===================================================================
// INITIALIZATION
// ===================================================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('IPTorrents Browser loaded - Optimized version');

    // Load saved settings and filters
    loadSavedSettings();
    loadSavedFilters();

    // Initialize app with smart loading strategy
    await initializeApp();

    // Setup event listeners
    setupEventListeners();
});

async function initializeApp() {
    console.log('Initializing app...');

    // 1. Load cached data immediately (instant page load)
    await loadCachedData();

    // 2. Load user info
    await loadUserInfo();

    // 3. Load qBittorrent settings
    await loadQbittorrentSettings();

    // 4. Load TMDB settings
    loadTMDBSettings();

    // 5. Apply filters and display
    applyFiltersAndSort();

    // 6. Check if cache is old, offer to refresh
    if (shouldAutoRefresh()) {
        showRefreshPrompt();
    }
}

async function loadCachedData() {
    showLoading(true);

    try {
        const categories = AppState.currentFilters.categories.join(',');
        const response = await fetch(`/api/torrents?mode=cache-only&categories=${categories}`);

        if (!response.ok) {
            throw new Error('Failed to fetch cached torrents');
        }

        const data = await response.json();

        AppState.allTorrents = data.torrents || [];
        AppState.metadata = data.metadata || {};

        console.log(`Loaded ${AppState.allTorrents.length} torrents from cache`);

        // Update cache status
        updateCacheStatus();

    } catch (error) {
        console.error('Error loading cached data:', error);
        showError('Failed to load cached data');
    } finally {
        showLoading(false);
    }
}

async function loadUserInfo() {
    try {
        const response = await fetch('/api/user/info');

        if (!response.ok) {
            console.error('Failed to fetch user info');
            return;
        }

        const data = await response.json();

        if (data.logged_in && data.user_info) {
            updateUserInfoDisplay(data.user_info);
        } else {
            hideUserInfoDisplay();
        }

    } catch (error) {
        console.error('Error loading user info:', error);
        hideUserInfoDisplay();
    }
}

function updateUserInfoDisplay(userInfo) {
    const userInfoEl = document.getElementById('user-info');
    const userNameEl = document.getElementById('user-name');
    const userRatioEl = document.getElementById('user-ratio');
    const userUploadEl = document.getElementById('user-upload');
    const userDownloadEl = document.getElementById('user-download');

    if (userInfo.username) {
        userNameEl.textContent = userInfo.username;
    }

    if (userInfo.ratio) {
        userRatioEl.textContent = userInfo.ratio;
    }

    if (userInfo.upload) {
        userUploadEl.textContent = userInfo.upload;
    }

    if (userInfo.download) {
        userDownloadEl.textContent = userInfo.download;
    }

    // Show the user info section
    userInfoEl.style.display = 'flex';
}

function hideUserInfoDisplay() {
    const userInfoEl = document.getElementById('user-info');
    userInfoEl.style.display = 'none';
}

function shouldAutoRefresh() {
    const settings = getSettings();

    // Check if auto-refresh and refresh prompt are enabled
    if (!settings.autoRefresh.enabled || !settings.showRefreshPrompt) {
        return false;
    }

    if (!AppState.metadata || !AppState.metadata.cache_age) {
        return false;
    }

    // Parse cache age
    const ageStr = AppState.metadata.cache_age;
    const match = ageStr.match(/(\d+)\s+(minutes?|hours?)/);

    if (!match) return false;

    const value = parseInt(match[1]);
    const unit = match[2];
    const threshold = settings.autoRefresh.threshold;

    // Auto-refresh if cache is older than threshold
    if (unit.startsWith('hour')) {
        return true;
    } else if (unit.startsWith('minute') && value >= threshold) {
        return true;
    }

    return false;
}

function showRefreshPrompt() {
    const cacheAge = AppState.metadata.cache_age;
    const message = `Data is ${cacheAge} old. Refresh for new torrents?`;

    // Show toast with refresh option
    showToast(message, 'info', () => refreshData(false)); // false = incremental
}

// ===================================================================
// DATA FETCHING
// ===================================================================

async function refreshData(force = false) {
    const btn = document.getElementById('refresh-btn');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = force ? 'Full Refresh...' : 'Quick Refresh...';

    try {
        const categories = AppState.currentFilters.categories.join(',');
        const days = getTimeWindowDays();
        const mode = force ? 'full' : 'incremental';

        let url = `/api/refresh?mode=${mode}&categories=${categories}`;
        if (force && days) {
            url += `&days=${days}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        console.log('Refresh response:', data);

        // Reload torrents with appropriate mode
        if (force) {
            // Full refresh - fetch all data
            await loadFullData();
        } else {
            // Incremental - reload cache (which now has new torrents)
            await loadCachedData();
        }

        // Re-apply filters and sort
        applyFiltersAndSort();

        // Show success message
        const newCount = data.new_torrents || 0;
        if (newCount > 0) {
            showToast(`${newCount} new torrent${newCount !== 1 ? 's' : ''} added!`, 'success');
        } else {
            showToast('No new torrents found', 'info');
        }

        btn.textContent = 'Refreshed!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);

    } catch (error) {
        console.error('Error refreshing:', error);
        showToast('Refresh failed', 'error');
        btn.textContent = 'Error!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    } finally {
        btn.disabled = false;
    }
}

async function loadFullData() {
    showLoading(true);

    try {
        const categories = AppState.currentFilters.categories.join(',');
        const days = getTimeWindowDays();

        const response = await fetch(`/api/torrents?mode=full&categories=${categories}&days=${days}`);

        if (!response.ok) {
            throw new Error('Failed to fetch torrents');
        }

        const data = await response.json();

        AppState.allTorrents = data.torrents || [];
        AppState.metadata = data.metadata || {};

        console.log(`Loaded ${AppState.allTorrents.length} torrents (full fetch)`);

        updateCacheStatus();

    } catch (error) {
        console.error('Error loading full data:', error);
        showError('Failed to load data');
    } finally {
        showLoading(false);
    }
}

// ===================================================================
// CLIENT-SIDE FILTERING
// ===================================================================

function applyFiltersAndSort() {
    // Start with all data
    let filtered = AppState.allTorrents;

    // Apply filters in order
    filtered = filterByCategories(filtered);
    filtered = filterByDays(filtered);
    filtered = filterByMinSnatched(filtered);
    filtered = filterByExclude(filtered);
    filtered = filterBySearch(filtered);

    // Sort
    filtered = sortTorrents(filtered);

    // Update state and display
    AppState.displayedTorrents = filtered;
    displayTorrents(filtered);
    updateResultsCount(filtered.length);

    // Save filters to localStorage
    saveFilters();
}

function filterByCategories(torrents) {
    const categories = AppState.currentFilters.categories;

    if (!categories || categories.length === 0) {
        return torrents;
    }

    return torrents.filter(t => categories.includes(t.category));
}

function filterByDays(torrents) {
    const days = AppState.currentFilters.days;

    if (!days || days <= 0) {
        return torrents;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return torrents.filter(t => {
        const torrentDate = new Date(t.timestamp);
        return torrentDate >= cutoff;
    });
}

function filterByMinSnatched(torrents) {
    const min = AppState.currentFilters.minSnatched;

    if (!min || min <= 0) {
        return torrents;
    }

    return torrents.filter(t => t.snatched >= min);
}

function filterByExclude(torrents) {
    const exclude = AppState.currentFilters.exclude;

    if (!exclude || exclude.trim() === '') {
        return torrents;
    }

    const keywords = exclude.toLowerCase().split(',').map(k => k.trim()).filter(k => k);

    if (keywords.length === 0) {
        return torrents;
    }

    return torrents.filter(t =>
        !keywords.some(kw => t.name.toLowerCase().includes(kw))
    );
}

function filterBySearch(torrents) {
    const search = AppState.currentFilters.search;

    if (!search || search.trim() === '') {
        return torrents;
    }

    const query = search.toLowerCase();
    return torrents.filter(t => t.name.toLowerCase().includes(query));
}

// ===================================================================
// CLIENT-SIDE SORTING
// ===================================================================

// Pre-defined comparators (extracted from sort loop for 2x performance)
const COMPARATORS = {
    snatched: (a, b) => b.snatched - a.snatched,
    seeders: (a, b) => b.seeders - a.seeders,
    leechers: (a, b) => b.leechers - a.leechers,
    date: (a, b) => b.timestamp - a.timestamp,
    size: (a, b) => parseSize(b.size) - parseSize(a.size),
    name: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
};

function sortTorrents(torrents) {
    const { field, order } = AppState.currentSort;

    const comparator = COMPARATORS[field];
    if (!comparator) {
        return [...torrents]; // Unknown field, return copy unsorted
    }

    const sorted = [...torrents]; // Don't mutate original
    sorted.sort(comparator);

    // Reverse if ascending (comparators default to descending)
    return order === 'asc' ? sorted.reverse() : sorted;
}

function parseSize(sizeStr) {
    // Parse size for sorting (convert to MB)
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);

    if (!match) {
        return 0;
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === 'GB') {
        return value * 1024;
    } else if (unit === 'TB') {
        return value * 1024 * 1024;
    }

    return value; // MB
}

// ===================================================================
// EVENT HANDLERS
// ===================================================================

function setupEventListeners() {
    // Filter buttons
    document.getElementById('apply-filters').addEventListener('click', onFilterChange);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);

    // Category quick select buttons
    document.getElementById('select-games-btn').addEventListener('click', selectAllGames);
    document.getElementById('select-movies-btn').addEventListener('click', selectAllMovies);

    // Exclude "update" button
    document.getElementById('exclude-update-btn').addEventListener('click', addUpdateToExclude);

    // Refresh buttons (top and bottom)
    document.getElementById('refresh-btn').addEventListener('click', () => refreshData(false));
    document.getElementById('refresh-btn-bottom').addEventListener('click', () => refreshData(false));

    // Search with debounce
    document.getElementById('search-filter').addEventListener('input', onSearchInput);

    // Other filter inputs
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.addEventListener('change', onCategoryChange);
    });

    document.getElementById('days-filter').addEventListener('change', onFilterChange);
    document.getElementById('min-snatched').addEventListener('change', onFilterChange);
    document.getElementById('exclude-filter').addEventListener('input', onFilterChange);

    // Table header sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            onSortChange(sortField);
        });
    });

    // Settings button (if exists)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettings);
    }
}

function onFilterChange() {
    // Update state from UI
    updateFiltersFromUI();

    // Re-filter and display (instant!)
    applyFiltersAndSort();
}

function onCategoryChange() {
    // Update categories from checkboxes
    const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
        .map(cb => cb.value);

    AppState.currentFilters.categories = selectedCategories;

    // Check if we have data for these categories in cache
    // For now, just re-filter
    // TODO: Could fetch new category data if not in cache
    applyFiltersAndSort();
}

function onSearchInput() {
    // Debounce search for smooth typing
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        AppState.currentFilters.search = document.getElementById('search-filter').value.trim();
        applyFiltersAndSort();
    }, 300); // 300ms delay
}

function onSortChange(field) {
    // Toggle or change sort
    if (AppState.currentSort.field === field) {
        AppState.currentSort.order = AppState.currentSort.order === 'desc' ? 'asc' : 'desc';
    } else {
        AppState.currentSort.field = field;
        AppState.currentSort.order = 'desc';
    }

    // Re-sort and display (instant!)
    applyFiltersAndSort();

    updateSortIndicators();
}

function clearFilters() {
    // Reset categories to defaults
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = (cb.value === 'PC-ISO' || cb.value === 'PC-Rip');
    });

    // Reset other filters
    document.getElementById('days-filter').value = '';
    document.getElementById('min-snatched').value = '0';
    document.getElementById('exclude-filter').value = '';
    document.getElementById('search-filter').value = '';

    // Reset state
    AppState.currentFilters = {
        categories: ['PC-ISO', 'PC-Rip'],
        days: null,
        minSnatched: 0,
        exclude: '',
        search: ''
    };

    // Reset sort
    AppState.currentSort = {
        field: 'snatched',
        order: 'desc'
    };

    updateSortIndicators();

    // Re-apply filters (will show all data)
    applyFiltersAndSort();
}

function selectAllGames() {
    // List of all game categories
    const gameCategories = ['PC-ISO', 'PC-Rip', 'PC-Mixed', 'Nintendo', 'Playstation', 'Xbox', 'Wii'];

    // Uncheck all categories first
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = false;
    });

    // Check only game categories
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        if (gameCategories.includes(cb.value)) {
            cb.checked = true;
        }
    });

    // Trigger category change
    onCategoryChange();
}

function selectAllMovies() {
    // List of all movie categories
    const movieCategories = ['Movie/4K', 'Movie/BD-Rip', 'Movie/HD/Bluray', 'Movie/Web-DL', 'Movie/x265'];

    // Uncheck all categories first
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = false;
    });

    // Check only movie categories
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        if (movieCategories.includes(cb.value)) {
            cb.checked = true;
        }
    });

    // Trigger category change
    onCategoryChange();
}

function addUpdateToExclude() {
    const excludeField = document.getElementById('exclude-filter');
    const currentValue = excludeField.value.trim();

    // Check if "update" is already in the exclude list
    const excludeList = currentValue ? currentValue.split(',').map(s => s.trim().toLowerCase()) : [];

    if (!excludeList.includes('update')) {
        // Add "update" to the list
        const newValue = currentValue ? currentValue + ', update' : 'update';
        excludeField.value = newValue;

        // Trigger the filter change
        onFilterChange();
    }
}

function updateFiltersFromUI() {
    // Update categories
    AppState.currentFilters.categories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
        .map(cb => cb.value);

    // Update days
    const daysValue = document.getElementById('days-filter').value;
    AppState.currentFilters.days = daysValue ? parseInt(daysValue) : null;

    // Update min snatched
    const minSnatchedValue = document.getElementById('min-snatched').value;
    AppState.currentFilters.minSnatched = minSnatchedValue ? parseInt(minSnatchedValue) : 0;

    // Update exclude
    AppState.currentFilters.exclude = document.getElementById('exclude-filter').value.trim();

    // Update search (if not debouncing)
    AppState.currentFilters.search = document.getElementById('search-filter').value.trim();
}

// ===================================================================
// UI DISPLAY
// ===================================================================

function displayTorrents(torrents) {
    const tbody = document.getElementById('torrents-body');
    tbody.innerHTML = '';

    if (torrents.length === 0) {
        document.getElementById('no-results').style.display = 'block';
        document.querySelector('.table-container').style.display = 'none';
        return;
    }

    document.getElementById('no-results').style.display = 'none';
    document.querySelector('.table-container').style.display = 'block';

    // Use DocumentFragment to batch DOM updates (single reflow instead of N reflows)
    const fragment = document.createDocumentFragment();
    torrents.forEach(torrent => {
        const row = createTorrentRow(torrent);
        fragment.appendChild(row);
    });
    tbody.appendChild(fragment);  // Single DOM reflow - 3-5x faster!
}

function createTorrentRow(torrent) {
    const tr = document.createElement('tr');

    // Name
    const nameCell = document.createElement('td');
    nameCell.className = 'torrent-name';

    const nameLink = document.createElement('a');
    nameLink.href = torrent.url || '#';
    nameLink.target = '_blank';
    nameLink.textContent = torrent.name;
    nameLink.className = 'torrent-link';

    nameCell.appendChild(nameLink);

    if (torrent.is_freeleech) {
        const freeleechBadge = document.createElement('span');
        freeleechBadge.className = 'badge badge-freeleech';
        freeleechBadge.textContent = 'FL';
        nameCell.appendChild(freeleechBadge);
    }

    tr.appendChild(nameCell);

    // Metadata (only for movie categories)
    const metadataCell = document.createElement('td');
    metadataCell.className = 'metadata-cell';

    if (torrent.metadata && isMovieCategory(torrent.category)) {
        const meta = torrent.metadata;
        const metaContent = [];

        // Rating
        if (meta.rating) {
            metaContent.push(`<span class="meta-rating">★ ${meta.rating}</span>`);
        }

        // Year
        if (meta.year) {
            metaContent.push(`<span class="meta-year">${meta.year}</span>`);
        }

        // Genres
        if (meta.genres && meta.genres.length > 0) {
            const genreStr = meta.genres.slice(0, 3).join(', ');
            metaContent.push(`<span class="meta-genres">${genreStr}</span>`);
        }

        // Quality
        if (meta.quality) {
            metaContent.push(`<span class="meta-quality">${meta.quality}</span>`);
        }

        metadataCell.innerHTML = metaContent.join(' ');

        // Add expand button if TMDB is enabled and we have year (for search)
        if (AppState.tmdbEnabled && meta.year) {
            const expandBtn = document.createElement('button');
            expandBtn.className = 'btn-expand-meta';
            expandBtn.textContent = AppState.expandedRows.has(torrent.id) ? '▲ Less' : '▼ More';
            expandBtn.onclick = (e) => {
                e.preventDefault();
                toggleMetadataRow(torrent, tr);
            };
            metadataCell.appendChild(document.createElement('br'));
            metadataCell.appendChild(expandBtn);
        }
    } else {
        metadataCell.textContent = '-';
    }

    tr.appendChild(metadataCell);

    // Category
    const categoryCell = document.createElement('td');
    categoryCell.innerHTML = `<span class="badge badge-category">${torrent.category}</span>`;
    tr.appendChild(categoryCell);

    // Size
    const sizeCell = document.createElement('td');
    sizeCell.textContent = torrent.size;
    tr.appendChild(sizeCell);

    // Seeders
    const seedersCell = document.createElement('td');
    seedersCell.className = 'text-center';
    seedersCell.innerHTML = `<span class="badge badge-seeders">${torrent.seeders}</span>`;
    tr.appendChild(seedersCell);

    // Leechers
    const leechersCell = document.createElement('td');
    leechersCell.className = 'text-center';
    leechersCell.innerHTML = `<span class="badge badge-leechers">${torrent.leechers}</span>`;
    tr.appendChild(leechersCell);

    // Snatched
    const snatchedCell = document.createElement('td');
    snatchedCell.className = 'text-center';
    snatchedCell.innerHTML = `<span class="badge badge-snatched">${torrent.snatched}</span>`;
    tr.appendChild(snatchedCell);

    // Date
    const dateCell = document.createElement('td');
    dateCell.className = 'date-cell';
    dateCell.textContent = torrent.upload_time;
    tr.appendChild(dateCell);

    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';

    if (torrent.download_link) {
        // Show qBittorrent button if enabled
        if (AppState.qbittorrentEnabled) {
            const qbtBtn = document.createElement('button');
            qbtBtn.className = 'btn btn-qbittorrent';
            qbtBtn.textContent = 'Send to qBittorrent';
            qbtBtn.title = 'Send to qBittorrent';
            qbtBtn.onclick = (e) => {
                e.preventDefault();
                sendToQbittorrent(torrent.download_link, torrent.name, qbtBtn);
            };
            actionsCell.appendChild(qbtBtn);
        }

        // Always show download link
        const downloadBtn = document.createElement('a');
        downloadBtn.href = torrent.download_link;
        downloadBtn.className = 'btn btn-download';
        downloadBtn.textContent = 'Download';
        downloadBtn.title = 'Download .torrent file';
        actionsCell.appendChild(downloadBtn);
    }

    tr.appendChild(actionsCell);

    return tr;
}

function updateSortIndicators() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('active', 'asc', 'desc');
        const icon = header.querySelector('.sort-icon');
        if (icon) {
            icon.textContent = '';
        }
    });

    const activeHeader = document.querySelector(`.sortable[data-sort="${AppState.currentSort.field}"]`);
    if (activeHeader) {
        activeHeader.classList.add('active', AppState.currentSort.order);
        const icon = activeHeader.querySelector('.sort-icon');
        if (icon) {
            icon.textContent = AppState.currentSort.order === 'desc' ? '▼' : '▲';
        }
    }
}

function updateResultsCount(count) {
    const countEl = document.getElementById('results-count');
    if (countEl) {
        countEl.textContent = `Showing ${count} torrent${count !== 1 ? 's' : ''}`;
    }
}

function updateCacheStatus() {
    const statusEl = document.getElementById('cache-status');
    if (!statusEl) return;

    const total = AppState.metadata.total_torrents || AppState.allTorrents.length;
    const cacheAge = AppState.metadata.cache_age || 'N/A';

    statusEl.textContent = `${total} torrents | Cache: ${cacheAge}`;
}

function showLoading(show) {
    AppState.isLoading = show;

    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.textContent = message || 'An error occurred';
        errorEl.style.display = 'block';
    }

    document.querySelector('.table-container').style.display = 'none';
}

function hideError() {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

// ===================================================================
// TOAST NOTIFICATIONS
// ===================================================================

function showToast(message, type = 'info', action = null) {
    const settings = getSettings();

    // Don't show toasts if disabled (except for settings confirmation and errors)
    if (!settings.showToasts && type !== 'success' && type !== 'error') {
        return;
    }

    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');

    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
        `;
        document.body.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 16px;
        margin-bottom: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        min-width: 250px;
        animation: slideIn 0.3s ease-out;
    `;

    toast.textContent = message;

    // Add action button if provided
    if (action) {
        const actionBtn = document.createElement('button');
        actionBtn.textContent = 'Refresh';
        actionBtn.style.cssText = `
            margin-left: 10px;
            padding: 4px 12px;
            background-color: rgba(255,255,255,0.3);
            border: 1px solid white;
            color: white;
            border-radius: 3px;
            cursor: pointer;
        `;
        actionBtn.onclick = () => {
            action();
            toast.remove();
        };
        toast.appendChild(actionBtn);
    }

    toastContainer.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ===================================================================
// SETTINGS PANEL
// ===================================================================

function openSettings() {
    const modal = document.getElementById('settings-modal');

    // Load current settings into UI
    loadSettingsIntoUI();

    // Show modal
    modal.style.display = 'block';

    // Setup event listeners for modal (only once)
    if (!modal.dataset.listenersAttached) {
        setupSettingsModalListeners();
        modal.dataset.listenersAttached = 'true';
    }
}

function setupSettingsModalListeners() {
    // Close buttons
    document.getElementById('close-settings').onclick = closeSettings;
    document.getElementById('cancel-settings').onclick = closeSettings;

    // Save button
    document.getElementById('save-settings').onclick = saveSettingsFromUI;

    // Click outside to close
    document.querySelector('.modal-overlay').onclick = closeSettings;

    // Time window change - update info text
    document.getElementById('setting-time-window').addEventListener('change', updateTimeWindowInfo);

    // Auto-refresh checkbox - toggle threshold visibility
    document.getElementById('setting-auto-refresh').addEventListener('change', toggleAutoRefreshThreshold);

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('settings-modal').style.display === 'block') {
            closeSettings();
        }
    });
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function loadSettingsIntoUI() {
    const settings = getSettings();

    // Time window
    document.getElementById('setting-time-window').value = settings.timeWindow;
    updateTimeWindowInfo();

    // Auto-refresh
    document.getElementById('setting-auto-refresh').checked = settings.autoRefresh.enabled;
    document.getElementById('setting-auto-refresh-threshold').value = settings.autoRefresh.threshold;
    toggleAutoRefreshThreshold();

    // Default sort
    document.getElementById('setting-default-sort').value = settings.defaultSort.field;
    const orderRadio = document.querySelector(`input[name="sort-order"][value="${settings.defaultSort.order}"]`);
    if (orderRadio) {
        orderRadio.checked = true;
    }

    // Default categories
    document.querySelectorAll('.default-category').forEach(cb => {
        cb.checked = settings.defaultCategories.includes(cb.value);
    });

    // Notifications
    document.getElementById('setting-show-toasts').checked = settings.showToasts;
    document.getElementById('setting-show-refresh-prompt').checked = settings.showRefreshPrompt;
}

async function saveSettingsFromUI() {
    const settings = {
        timeWindow: parseInt(document.getElementById('setting-time-window').value),
        autoRefresh: {
            enabled: document.getElementById('setting-auto-refresh').checked,
            threshold: parseInt(document.getElementById('setting-auto-refresh-threshold').value)
        },
        defaultSort: {
            field: document.getElementById('setting-default-sort').value,
            order: document.querySelector('input[name="sort-order"]:checked').value
        },
        defaultCategories: Array.from(document.querySelectorAll('.default-category:checked')).map(cb => cb.value),
        showToasts: document.getElementById('setting-show-toasts').checked,
        showRefreshPrompt: document.getElementById('setting-show-refresh-prompt').checked
    };

    saveSettings(settings);

    closeSettings();

    // Show success message
    showToast('Settings saved successfully!', 'success');

    // Apply settings immediately
    applySettings(settings);
}

function updateTimeWindowInfo() {
    const days = parseInt(document.getElementById('setting-time-window').value);
    const infoEl = document.getElementById('time-window-info');

    const info = {
        7: '~100-150 torrents, ~5-8s load',
        14: '~200-250 torrents, ~8-12s load',
        30: '~300-400 torrents, ~10-15s load',
        60: '~600-800 torrents, ~20-30s load'
    };

    infoEl.textContent = info[days] || '';
}

function toggleAutoRefreshThreshold() {
    const enabled = document.getElementById('setting-auto-refresh').checked;
    const container = document.getElementById('auto-refresh-threshold-container');
    container.style.display = enabled ? 'block' : 'none';
}

// Cache settings in memory to avoid synchronous localStorage reads (eliminates lag)
let cachedSettings = null;

function getSettings() {
    // Return cached settings if available
    if (cachedSettings) {
        return cachedSettings;
    }

    // Load settings from localStorage with defaults
    const defaults = {
        timeWindow: 30,
        autoRefresh: {
            enabled: true,
            threshold: 10
        },
        defaultSort: {
            field: 'snatched',
            order: 'desc'
        },
        defaultCategories: ['PC-ISO', 'PC-Rip'],
        showToasts: true,
        showRefreshPrompt: true
    };

    const saved = localStorage.getItem('iptbrowser_settings');
    if (!saved) {
        cachedSettings = defaults;
        return defaults;
    }

    try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle missing keys
        cachedSettings = {
            timeWindow: parsed.timeWindow || defaults.timeWindow,
            autoRefresh: parsed.autoRefresh || defaults.autoRefresh,
            defaultSort: parsed.defaultSort || defaults.defaultSort,
            defaultCategories: parsed.defaultCategories || defaults.defaultCategories,
            showToasts: parsed.showToasts !== undefined ? parsed.showToasts : defaults.showToasts,
            showRefreshPrompt: parsed.showRefreshPrompt !== undefined ? parsed.showRefreshPrompt : defaults.showRefreshPrompt
        };
        return cachedSettings;
    } catch (e) {
        console.error('Error loading settings:', e);
        cachedSettings = defaults;
        return defaults;
    }
}

function saveSettings(settings) {
    cachedSettings = settings;  // Update cache
    localStorage.setItem('iptbrowser_settings', JSON.stringify(settings));
}

function applySettings(settings) {
    // Apply time window (already handled by getTimeWindowDays())

    // Apply default categories
    AppState.currentFilters.categories = settings.defaultCategories;
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = settings.defaultCategories.includes(cb.value);
    });

    // Apply default sort
    AppState.currentSort.field = settings.defaultSort.field;
    AppState.currentSort.order = settings.defaultSort.order;
    updateSortIndicators();

    // Re-filter and sort with new settings
    applyFiltersAndSort();
}

function getTimeWindowDays() {
    const settings = getSettings();
    return settings.timeWindow;
}

function saveTimeWindowDays(days) {
    // Deprecated - now part of full settings object
    const settings = getSettings();
    settings.timeWindow = days;
    saveSettings(settings);
}

// ===================================================================
// LOCALSTORAGE PERSISTENCE
// ===================================================================

function saveFilters() {
    const filters = {
        categories: AppState.currentFilters.categories,
        days: AppState.currentFilters.days,
        minSnatched: AppState.currentFilters.minSnatched,
        exclude: AppState.currentFilters.exclude,
        sort: AppState.currentSort.field,
        order: AppState.currentSort.order
    };

    localStorage.setItem('iptbrowser_filters', JSON.stringify(filters));
}

function loadSavedFilters() {
    const saved = localStorage.getItem('iptbrowser_filters');

    if (!saved) {
        return;
    }

    try {
        const filters = JSON.parse(saved);

        // Restore categories
        if (filters.categories) {
            AppState.currentFilters.categories = filters.categories;

            document.querySelectorAll('input[name="category"]').forEach(cb => {
                cb.checked = filters.categories.includes(cb.value);
            });
        }

        // Restore other filters (don't restore search)
        if (filters.days) {
            AppState.currentFilters.days = filters.days;
            document.getElementById('days-filter').value = filters.days;
        }

        if (filters.minSnatched) {
            AppState.currentFilters.minSnatched = filters.minSnatched;
            document.getElementById('min-snatched').value = filters.minSnatched;
        }

        if (filters.exclude) {
            AppState.currentFilters.exclude = filters.exclude;
            document.getElementById('exclude-filter').value = filters.exclude;
        }

        // Restore sort
        if (filters.sort) {
            AppState.currentSort.field = filters.sort;
        }

        if (filters.order) {
            AppState.currentSort.order = filters.order;
        }

        updateSortIndicators();

    } catch (error) {
        console.error('Error loading saved filters:', error);
    }
}

function loadSavedSettings() {
    // Load time window setting
    // (Already handled in getTimeWindowDays())
}

// ===================================================================
// QBITTORRENT INTEGRATION
// ===================================================================

async function loadQbittorrentSettings() {
    try {
        const response = await fetch('/api/qbittorrent/config');
        const config = await response.json();
        AppState.qbittorrentEnabled = config.enabled;
        AppState.qbittorrentConfig = config;
        console.log('qBittorrent integration:', config.enabled ? 'enabled' : 'disabled');
    } catch (error) {
        console.error('Error loading qBittorrent settings:', error);
        AppState.qbittorrentEnabled = false;
    }
}

async function sendToQbittorrent(torrentUrl, torrentName, buttonEl) {
    // Disable button and show loading state
    buttonEl.disabled = true;
    buttonEl.classList.add('sending');
    const originalText = buttonEl.textContent;
    buttonEl.textContent = 'Sending...';

    try {
        const response = await fetch('/api/qbittorrent/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                torrent_url: torrentUrl,
                torrent_name: torrentName
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Success
            buttonEl.textContent = '✓ Added!';
            buttonEl.classList.add('success');
            showToast(`Added "${torrentName}" to qBittorrent`, 'success');

            // Reset after 2 seconds
            setTimeout(() => {
                buttonEl.textContent = originalText;
                buttonEl.classList.remove('sending', 'success');
                buttonEl.disabled = false;
            }, 2000);
        } else {
            // Error
            showToast(result.message || 'Failed to add torrent', 'error');
            buttonEl.textContent = originalText;
            buttonEl.classList.remove('sending');
            buttonEl.disabled = false;
        }
    } catch (error) {
        showToast('Network error: Could not reach server', 'error');
        buttonEl.textContent = originalText;
        buttonEl.classList.remove('sending');
        buttonEl.disabled = false;
    }
}

// ===================================================================
// TMDB METADATA INTEGRATION
// ===================================================================

function isMovieCategory(category) {
    const movieCategories = ['Movie/4K', 'Movie/BD-Rip', 'Movie/HD/Bluray', 'Movie/Web-DL', 'Movie/x265'];
    return movieCategories.includes(category);
}

async function toggleMetadataRow(torrent, torrentRow) {
    const metadataRowId = `metadata-row-${torrent.id}`;
    const existingMetadataRow = document.getElementById(metadataRowId);

    // Check if already expanded
    if (existingMetadataRow) {
        // Collapse: remove the expanded row
        existingMetadataRow.remove();
        AppState.expandedRows.delete(torrent.id);

        // Update button text
        const btn = torrentRow.querySelector('.btn-expand-meta');
        if (btn) {
            btn.textContent = '▼ More';
        }
        return;
    }

    // Expand: insert new row with loading spinner
    AppState.expandedRows.add(torrent.id);

    const metadataRow = document.createElement('tr');
    metadataRow.id = metadataRowId;
    metadataRow.className = 'metadata-row';

    const metadataCell = document.createElement('td');
    metadataCell.colSpan = 9; // Adjust based on total number of columns
    metadataCell.className = 'metadata-container';
    metadataCell.innerHTML = '<div class="loading-spinner">Loading movie data...</div>';

    metadataRow.appendChild(metadataCell);
    torrentRow.parentNode.insertBefore(metadataRow, torrentRow.nextSibling);

    // Update button text
    const btn = torrentRow.querySelector('.btn-expand-meta');
    if (btn) {
        btn.textContent = '▲ Less';
    }

    // Fetch TMDB data
    try {
        if (!AppState.tmdbClient) {
            throw new Error('TMDB client not initialized');
        }

        let movieData;

        // Try IMDB ID first if available
        if (torrent.imdb_id) {
            console.log(`Fetching via IMDB ID: ${torrent.imdb_id}`);
            movieData = await AppState.tmdbClient.findByIMDBId(torrent.imdb_id);
        } else if (torrent.metadata && torrent.metadata.year) {
            // Fallback: search by title and year
            // Extract clean title from torrent name (remove year, quality, release group, etc.)
            const cleanTitle = extractMovieTitle(torrent.name);
            console.log(`Original: "${torrent.name}"`);
            console.log(`Extracted: "${cleanTitle}" (${torrent.metadata.year})`);
            movieData = await AppState.tmdbClient.findByTitleAndYear(cleanTitle, torrent.metadata.year);
        } else {
            throw new Error('No IMDB ID or year available for this torrent');
        }

        metadataCell.innerHTML = renderMetadataContent(movieData);
    } catch (error) {
        console.error('Error fetching TMDB data:', error);
        metadataCell.innerHTML = `
            <div class="metadata-error">
                <p>Could not load movie data: ${error.message}</p>
                <p>Please check your TMDB API key in settings.</p>
            </div>
        `;
    }
}

function extractMovieTitle(torrentName) {
    // Remove common patterns: year, quality, codec, release group
    let title = torrentName;

    // Replace dots and underscores with spaces first
    title = title.replace(/[._]/g, ' ');

    // Remove year (e.g., "2023", "(2023)", "[2023]")
    title = title.replace(/[\[\(]?\b\d{4}\b[\]\)]?/g, '');

    // Remove region/language tags
    title = title.replace(/\b(NORDiC|GERMAN|FRENCH|SPANISH|ITALIAN|JAPANESE|KOREAN|CHINESE|MULTi|DUAL|SUBBED)\b/gi, '');

    // Remove quality indicators (be more aggressive, remove everything after first match)
    const qualityPattern = /\b(2160p|1080p|720p|480p|4K|UHD|HD|BluRay|BDRip|BD-Rip|WEB-DL|WEBRip|DVDRip|HDTV|Remux|Blu-ray|HDR|HDR10|DoVi|DV|SDR)\b.*/i;
    title = title.replace(qualityPattern, '');

    // Remove audio/video codecs and formats
    title = title.replace(/\b(x264|x265|H264|H265|HEVC|AVC|AAC|DTS|TrueHD|Atmos|DD5|DDP|AC3|FLAC|MP3|DTS-HD)\b.*/gi, '');

    // Additional cleanup for common release patterns
    title = title.replace(/\b(Extended|Edition|Remastered|Director'?s?|Cut|PROPER|REPACK|iNTERNAL|UNRATED|Theatrical)\b/gi, '');

    // Remove anything in brackets or parentheses
    title = title.replace(/[\[\(][^\]\)]*[\]\)]/g, '');

    // Remove release group patterns at the end (dash followed by alphanumeric)
    title = title.replace(/-[A-Z0-9]+$/i, '');

    // Remove extra whitespace and trim
    title = title.replace(/\s+/g, ' ').trim();

    return title;
}

function renderMetadataContent(movieData) {
    const posterUrl = movieData.poster_url || '/static/img/no-poster.png';

    let castHtml = '';
    if (movieData.cast && movieData.cast.length > 0) {
        castHtml = movieData.cast.map(actor => `
            <div class="cast-member">
                ${actor.profile_path ?
                    `<img src="${actor.profile_path}" alt="${actor.name}" class="cast-photo">` :
                    '<div class="cast-photo-placeholder">?</div>'
                }
                <div class="cast-info">
                    <div class="cast-name">${actor.name}</div>
                    <div class="cast-character">${actor.character}</div>
                </div>
            </div>
        `).join('');
    } else {
        castHtml = '<p>No cast information available.</p>';
    }

    return `
        <div class="metadata-grid">
            <div class="meta-poster-section">
                <img src="${posterUrl}" alt="${movieData.title}" class="meta-poster" onerror="this.src='/static/img/no-poster.png'">
            </div>
            <div class="meta-info-section">
                <h3 class="meta-title">${movieData.title}</h3>
                ${movieData.trailer_url ?
                    `<a href="${movieData.trailer_url}" target="_blank" class="btn-trailer" title="Watch trailer on YouTube">
                        <span class="trailer-icon">▶️</span> Watch Trailer
                    </a>` :
                    ''}
                ${movieData.release_date ? `<p class="meta-release-date">Released: ${movieData.release_date}</p>` : ''}
                ${movieData.runtime ? `<p class="meta-runtime">Runtime: ${movieData.runtime} minutes</p>` : ''}
                ${movieData.vote_average ? `<p class="meta-vote"><span class="meta-rating">★ ${movieData.vote_average.toFixed(1)}</span>/10</p>` : ''}
                ${movieData.director ? `<p class="meta-director"><strong>Director:</strong> ${movieData.director}</p>` : ''}
                ${movieData.genres && movieData.genres.length > 0 ?
                    `<p class="meta-genres-list"><strong>Genres:</strong> ${movieData.genres.join(', ')}</p>` :
                    ''}
                <div class="meta-plot">
                    <strong>Plot:</strong>
                    <p>${movieData.plot}</p>
                </div>
            </div>
            <div class="meta-cast-section">
                <h4>Cast</h4>
                <div class="cast-list">
                    ${castHtml}
                </div>
            </div>
        </div>
    `;
}

function loadTMDBSettings() {
    const savedApiKey = localStorage.getItem('tmdb_api_key');
    const savedEnabled = localStorage.getItem('tmdb_enabled') === 'true';

    console.log('Loading TMDB settings:', { hasApiKey: !!savedApiKey, enabled: savedEnabled });

    if (savedApiKey && savedEnabled) {
        AppState.tmdbApiKey = savedApiKey;
        AppState.tmdbEnabled = true;

        // Check if TMDBClient is available
        if (typeof TMDBClient !== 'undefined') {
            AppState.tmdbClient = new TMDBClient(savedApiKey);
            console.log('TMDB integration enabled with client');
        } else {
            console.error('TMDBClient not found! Make sure tmdb_client.js is loaded.');
        }
    } else {
        console.log('TMDB not enabled:', savedEnabled ? 'No API key' : 'Disabled in settings');
    }
}

// Note: saveTMDBSettings() is now in tmdb_manager.js (dedicated settings page)

// ===================================================================
// KEYBOARD SHORTCUTS (Future enhancement)
// ===================================================================

// Add CSS animation for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
