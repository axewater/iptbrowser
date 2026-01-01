// IPTorrents Browser - Frontend JavaScript

let currentSort = 'snatched';
let currentOrder = 'desc';
let allTorrents = [];

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('IPTorrents Browser loaded');

    // Load torrents on page load
    loadTorrents();

    // Load stats
    loadStats();

    // Event listeners
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('refresh-btn').addEventListener('click', refreshData);

    // Real-time search
    document.getElementById('search-filter').addEventListener('input', applyFilters);

    // Table header sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            handleSort(sortField);
        });
    });

    // Load saved filters from localStorage
    loadSavedFilters();
});

// Load torrents from API
async function loadTorrents() {
    showLoading(true);
    hideError();

    try {
        const params = buildQueryParams();
        const response = await fetch(`/api/torrents?${params}`);

        if (!response.ok) {
            throw new Error('Failed to fetch torrents');
        }

        const data = await response.json();
        allTorrents = data.torrents;

        displayTorrents(allTorrents);
        updateResultsCount(allTorrents.length);

        // Save current filters
        saveFilters();

    } catch (error) {
        console.error('Error loading torrents:', error);
        showError();
    } finally {
        showLoading(false);
    }
}

// Build query parameters from filters
function buildQueryParams() {
    const params = new URLSearchParams();

    // Categories
    const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
        .map(cb => cb.value);

    if (selectedCategories.length > 0) {
        params.append('categories', selectedCategories.join(','));
    }

    // Days
    const days = document.getElementById('days-filter').value;
    if (days) {
        params.append('days', days);
    }

    // Min snatched
    const minSnatched = document.getElementById('min-snatched').value;
    if (minSnatched && minSnatched > 0) {
        params.append('min_snatched', minSnatched);
    }

    // Exclude keywords
    const exclude = document.getElementById('exclude-filter').value.trim();
    if (exclude) {
        params.append('exclude', exclude);
    }

    // Search
    const search = document.getElementById('search-filter').value.trim();
    if (search) {
        params.append('search', search);
    }

    // Sort
    params.append('sort', currentSort);
    params.append('order', currentOrder);

    return params.toString();
}

// Display torrents in table
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

    torrents.forEach(torrent => {
        const row = createTorrentRow(torrent);
        tbody.appendChild(row);
    });
}

// Create a table row for a torrent
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

// Handle sorting
function handleSort(field) {
    if (currentSort === field) {
        // Toggle order
        currentOrder = currentOrder === 'desc' ? 'asc' : 'desc';
    } else {
        // New sort field, default to descending
        currentSort = field;
        currentOrder = 'desc';
    }

    // Update UI
    updateSortIndicators();

    // Reload with new sort
    loadTorrents();
}

// Update sort indicators in table headers
function updateSortIndicators() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('active', 'asc', 'desc');
        const icon = header.querySelector('.sort-icon');
        icon.textContent = '';
    });

    const activeHeader = document.querySelector(`.sortable[data-sort="${currentSort}"]`);
    if (activeHeader) {
        activeHeader.classList.add('active', currentOrder);
        const icon = activeHeader.querySelector('.sort-icon');
        icon.textContent = currentOrder === 'desc' ? '▼' : '▲';
    }
}

// Apply filters
function applyFilters() {
    loadTorrents();
}

// Clear all filters
function clearFilters() {
    // Uncheck categories except defaults
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = (cb.value === 'PC-ISO' || cb.value === 'PC-Rip');
    });

    // Reset other filters
    document.getElementById('days-filter').value = '7';
    document.getElementById('min-snatched').value = '0';
    document.getElementById('exclude-filter').value = '';
    document.getElementById('search-filter').value = '';

    // Reset sort
    currentSort = 'snatched';
    currentOrder = 'desc';
    updateSortIndicators();

    // Reload
    loadTorrents();
}

// Refresh data from server
async function refreshData() {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing...';

    try {
        const response = await fetch('/api/refresh');
        const data = await response.json();

        console.log('Refresh response:', data);

        // Reload torrents
        await loadTorrents();
        await loadStats();

        btn.textContent = 'Refreshed!';
        setTimeout(() => {
            btn.textContent = 'Refresh Data';
        }, 2000);

    } catch (error) {
        console.error('Error refreshing:', error);
        btn.textContent = 'Error!';
        setTimeout(() => {
            btn.textContent = 'Refresh Data';
        }, 2000);
    } finally {
        btn.disabled = false;
    }
}

// Load stats from API
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        const statusEl = document.getElementById('cache-status');
        statusEl.textContent = `${stats.total} torrents | Cache: ${stats.cache_age || 'N/A'}`;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Update results count
function updateResultsCount(count) {
    const countEl = document.getElementById('results-count');
    countEl.textContent = `${count} torrent${count !== 1 ? 's' : ''} found`;
}

// Show/hide loading spinner
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// Show error message
function showError() {
    document.getElementById('error').style.display = 'block';
    document.querySelector('.table-container').style.display = 'none';
}

// Hide error message
function hideError() {
    document.getElementById('error').style.display = 'none';
}

// Save filters to localStorage
function saveFilters() {
    const filters = {
        categories: Array.from(document.querySelectorAll('input[name="category"]:checked'))
            .map(cb => cb.value),
        days: document.getElementById('days-filter').value,
        minSnatched: document.getElementById('min-snatched').value,
        exclude: document.getElementById('exclude-filter').value,
        sort: currentSort,
        order: currentOrder
    };

    localStorage.setItem('iptbrowser_filters', JSON.stringify(filters));
}

// Load saved filters from localStorage
function loadSavedFilters() {
    const saved = localStorage.getItem('iptbrowser_filters');

    if (!saved) {
        return;
    }

    try {
        const filters = JSON.parse(saved);

        // Restore categories
        if (filters.categories) {
            document.querySelectorAll('input[name="category"]').forEach(cb => {
                cb.checked = filters.categories.includes(cb.value);
            });
        }

        // Restore other filters (don't restore search)
        if (filters.days) {
            document.getElementById('days-filter').value = filters.days;
        }

        if (filters.minSnatched) {
            document.getElementById('min-snatched').value = filters.minSnatched;
        }

        if (filters.exclude) {
            document.getElementById('exclude-filter').value = filters.exclude;
        }

        // Restore sort
        if (filters.sort) {
            currentSort = filters.sort;
        }

        if (filters.order) {
            currentOrder = filters.order;
        }

        updateSortIndicators();

    } catch (error) {
        console.error('Error loading saved filters:', error);
    }
}
