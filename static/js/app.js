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
    metadataLoader: null,  // Progressive loader for movie metadata
    sessionMetadataCache: {},  // { imdbId: movieData or gameName_platform: gameData } - In-memory cache for current session

    // IGDB integration state
    igdbEnabled: false,
    igdbClient: null,
    gameMetadataLoader: null,  // Progressive loader for game metadata

    // Pagination state
    pagination: {
        currentPage: 1,
        itemsPerPage: 50,
        totalPages: 0,
        enableDeduplication: true
    }
};

// ===================================================================
// PROGRESSIVE MOVIE METADATA LOADER
// ===================================================================

/**
 * Progressive loader for movie metadata
 * Loads TMDB data for multiple movies with controlled delays to respect rate limits
 */
class MovieMetadataLoader {
    constructor(tmdbClient, delay = 250) {
        this.tmdbClient = tmdbClient;
        this.delay = delay;
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Add movies to the loading queue and start processing
     * @param {Array} torrents - Array of torrent objects (movie category only)
     */
    enqueue(torrents) {
        // Cancel any in-progress loading
        this.cancel();

        // Build queue from movie torrents only
        this.queue = torrents
            .filter(t => isMovieCategory(t.category))
            .map(torrent => ({ torrent, status: 'pending' }));

        // Start processing
        this.process();
    }

    /**
     * Process the queue sequentially with delays
     */
    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();

            if (item.status === 'cancelled') continue;

            item.status = 'loading';

            try {
                await this.loadMovieMetadata(item.torrent);
                item.status = 'loaded';
            } catch (error) {
                console.error(`Failed to load metadata for ${item.torrent.name}:`, error);
                item.status = 'error';
            }

            // Rate limiting delay between requests
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delay));
            }
        }

        this.isProcessing = false;
    }

    /**
     * Load metadata for a single movie and update its DOM row
     * @param {Object} torrent - Torrent object
     */
    async loadMovieMetadata(torrent) {
        const metadataRow = document.getElementById(`metadata-row-${torrent.id}`);
        if (!metadataRow) {
            console.warn(`Metadata row not found for torrent ${torrent.id}`);
            return;
        }

        const metadataCell = metadataRow.querySelector('.metadata-container');

        try {
            let movieData;

            // Try IMDB ID first if available
            if (torrent.imdb_id) {
                console.log(`Fetching via IMDB ID: ${torrent.imdb_id}`);
                movieData = await this.tmdbClient.findByIMDBId(torrent.imdb_id);
            } else if (torrent.metadata?.year) {
                // Fallback: search by title and year
                const cleanTitle = extractMovieTitle(torrent.name);
                console.log(`Fetching "${cleanTitle}" (${torrent.metadata.year})`);
                movieData = await this.tmdbClient.findByTitleAndYear(cleanTitle, torrent.metadata.year);
            } else {
                throw new Error('No IMDB ID or year available');
            }

            // Render the content using existing helper
            metadataCell.innerHTML = renderMetadataContent(movieData);

            // Store in session cache for future renders
            if (torrent.imdb_id && movieData) {
                AppState.sessionMetadataCache[torrent.imdb_id] = movieData;
            }

        } catch (error) {
            console.error('Error fetching TMDB data:', error);
            metadataCell.innerHTML = `
                <div class="metadata-error">
                    <p>Could not load movie data: ${error.message}</p>
                    <p class="error-hint">Check TMDB API key in settings or try refreshing.</p>
                </div>
            `;
        }
    }

    /**
     * Cancel all pending loads
     */
    cancel() {
        this.queue.forEach(item => {
            if (item.status === 'pending') {
                item.status = 'cancelled';
            }
        });
        this.queue = [];
        this.isProcessing = false;
    }
}

/**
 * Game Metadata Loader (Progressive IGDB Data Loading)
 * Loads game metadata from IGDB with rate limiting (4 req/sec)
 * Uses 3-tier caching: session → localStorage → API
 */
class GameMetadataLoader {
    constructor(igdbClient, delay = 250) {
        this.igdbClient = igdbClient;
        this.delay = delay;  // 250ms = 4 req/sec (IGDB rate limit)
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Add games to the loading queue and start processing
     * @param {Array} torrents - Array of torrent objects (game category only)
     */
    enqueue(torrents) {
        // Cancel any in-progress loading
        this.cancel();

        // Build queue from game torrents only
        this.queue = torrents
            .filter(t => isGameCategory(t.category))
            .map(torrent => ({ torrent, status: 'pending' }));

        // Start processing
        this.process();
    }

    /**
     * Process the queue sequentially with delays
     */
    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();

            if (item.status === 'cancelled') continue;

            item.status = 'loading';

            try {
                await this.loadGameMetadata(item.torrent);
                item.status = 'loaded';
            } catch (error) {
                console.error(`Failed to load metadata for ${item.torrent.name}:`, error);
                item.status = 'error';
            }

            // Rate limiting delay between requests
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delay));
            }
        }

        this.isProcessing = false;
    }

    /**
     * Load metadata for a single game and update its DOM row
     * @param {Object} torrent - Torrent object
     */
    async loadGameMetadata(torrent) {
        const metadataRow = document.getElementById(`metadata-row-${torrent.id}`);
        if (!metadataRow) {
            console.warn(`Metadata row not found for torrent ${torrent.id}`);
            return;
        }

        const metadataCell = metadataRow.querySelector('.metadata-container');

        try {
            // Use normalized name (from deduplication) or fallback to normalizing the torrent name
            const normalizedName = torrent.displayName || normalizeGameTitle(torrent.name);
            const platform = detectPlatform(torrent.category);

            console.log(`Fetching game metadata: "${normalizedName}" (${platform})`);

            const gameData = await this.igdbClient.searchGame(normalizedName, platform);

            // Render the content
            metadataCell.innerHTML = renderGameMetadataContent(gameData);

            // Store in session cache for future renders
            const cacheKey = `${normalizedName}_${platform}`;
            AppState.sessionMetadataCache[cacheKey] = gameData;

        } catch (error) {
            console.error('Error fetching IGDB data:', error);
            metadataCell.innerHTML = `
                <div class="metadata-error">
                    <p>Could not load game data: ${error.message}</p>
                    <p class="error-hint">Game may not be in IGDB database or check network connection.</p>
                </div>
            `;
        }
    }

    /**
     * Cancel all pending loads
     */
    cancel() {
        this.queue.forEach(item => {
            if (item.status === 'pending') {
                item.status = 'cancelled';
            }
        });
        this.queue = [];
        this.isProcessing = false;
    }
}

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

    // 5. Load IGDB settings
    loadIGDBSettings();

    // 6. Initialize pagination from URL/session
    initializePagination();

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

async function refreshData(force = true) {
    const btn = document.getElementById('refresh-btn');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Refreshing...';

    try {
        const categories = AppState.currentFilters.categories.join(',');
        const days = getTimeWindowDays();
        const mode = 'full';  // Always do full refresh to respect time window setting

        let url = `/api/refresh?mode=${mode}&categories=${categories}&days=${days}`;

        const response = await fetch(url);
        const data = await response.json();

        console.log('Refresh response:', data);

        // Full refresh - fetch all data
        await loadFullData();

        // Re-apply filters and sort
        applyFiltersAndSort();

        // Show success message
        const totalCount = AppState.allTorrents.length;
        showToast(`Refreshed! Loaded ${totalCount} torrent${totalCount !== 1 ? 's' : ''} (${days} days)`, 'success');

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

    // Deduplicate movies and games
    filtered = deduplicateTorrents(filtered);

    // Update state
    AppState.displayedTorrents = filtered;

    // Calculate pagination
    const totalItems = filtered.length;
    const itemsPerPage = AppState.pagination.itemsPerPage;
    AppState.pagination.totalPages = Math.ceil(totalItems / itemsPerPage) || 0;

    // Reset to page 1 if current page is out of bounds
    if (AppState.pagination.currentPage > AppState.pagination.totalPages) {
        AppState.pagination.currentPage = Math.max(1, AppState.pagination.totalPages);
    }

    // Update URL hash
    updatePageHash();

    // Display current page
    displayCurrentPage();
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
// MOVIE DEDUPLICATION
// ===================================================================

/**
 * Normalize movie title for deduplication
 * Removes year, quality, codec, release group, language tags, and other noise
 * @param {string} title - Raw torrent name
 * @returns {string} Normalized title for comparison
 */
function normalizeMovieTitle(title) {
    let normalized = title.toLowerCase();

    // Remove language tags: [Hindi English], (Multi), etc.
    normalized = normalized.replace(/[\[\(][^\]\)]*(?:hindi|english|multi|dual|audio|lang|spanish|french|german|italian|japanese|korean|chinese)[^\]\)]*[\]\)]/gi, '');

    // Remove "extended edition", "director's cut", "unrated", etc.
    normalized = normalized.replace(/\b(extended|unrated|uncut|director'?s?\s*cut|theatrical|remastered|anniversary|edition)\b/gi, '');

    // Remove year patterns: (2023), [2023], 2023
    normalized = normalized.replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '');

    // Remove quality indicators and everything after first quality marker
    const qualityPattern = /\b(2160p|1080p|720p|480p|4k|uhd|hd|sdr|hdr|dv|bluray|bdrip|bd-rip|web-dl|webrip|dvdrip|hdtv|remux|proper|repack)\b.*/i;
    normalized = normalized.replace(qualityPattern, '');

    // Remove common noise words at start
    normalized = normalized.replace(/^(the|a|an)\s+/i, '');

    // Replace dots/underscores/dashes with spaces
    normalized = normalized.replace(/[._\-]+/g, ' ');

    // Remove duplicate "the" that sometimes appears (e.g., "The Hobbit The Desolation")
    normalized = normalized.replace(/\bthe\s+the\b/gi, 'the');

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Detect special game patterns (UPDATE, DLC, PATCH) before normalization
 * This must be called BEFORE normalizeGameTitle() to preserve pattern info
 * @param {string} title - Raw torrent name
 * @returns {object} Pattern detection flags and extracted metadata
 */
function detectGamePatterns(title) {
    const patterns = {
        hasUpdate: false,
        updateVersion: null,
        isDLC: false,
        dlcName: null,
        hasPatch: false,
        patchVersion: null
    };

    // UPDATE detection: Must have version number to avoid false positives
    // Matches: "Update v1.2", "Update 20251218", "Update v1 0 11"
    // Also matches: "01122025 Update" (date before Update - DDMMYYYY format)
    // Doesn't match: "Update Edition" (no version)

    // Pattern 1: Standard "Update vX.X" format
    const updateMatch = title.match(/\bUpdate\s+v?([\d.\s]+)/i);
    if (updateMatch) {
        const version = updateMatch[1].trim().replace(/\s+/g, '.');
        if (version && /\d/.test(version)) {
            patterns.hasUpdate = true;
            patterns.updateVersion = version;
        }
    }

    // Pattern 2: Date before Update (e.g., "01122025 Update")
    const dateUpdateMatch = title.match(/\b(\d{8})\s+(Update|Patch|Hotfix)/i);
    if (dateUpdateMatch && !patterns.hasUpdate) {
        patterns.hasUpdate = true;
        patterns.updateVersion = dateUpdateMatch[1]; // Store the date
    }

    // PATCH detection
    const patchMatch = title.match(/\b(Patch|Hotfix)\s+v?([\d.\s]+)/i);
    if (patchMatch) {
        const version = patchMatch[2].trim().replace(/\s+/g, '.');
        if (version && /\d/.test(version)) {
            patterns.hasPatch = true;
            patterns.patchVersion = version;
        }
    }

    // DLC detection
    if (title.match(/\b(DLC|Expansion|Add-?on|Season\s*Pass)\b/i)) {
        patterns.isDLC = true;
        // Try to extract DLC name (e.g., "Game DLC Pack 1-GROUP" → "Pack 1")
        const dlcNameMatch = title.match(/\b(?:DLC|Expansion)[:\s-]+([^-]+?)(?:-[A-Z0-9]+)?$/i);
        if (dlcNameMatch) {
            patterns.dlcName = dlcNameMatch[1].trim();
        }
    }

    return patterns;
}

/**
 * Normalize game title for deduplication
 * Removes platform, region, release group, version, DLC markers, and other noise
 * @param {string} title - Raw torrent name
 * @returns {string} Normalized title for comparison
 */
function normalizeGameTitle(title) {
    let normalized = title.toLowerCase();

    // 1. Remove language tags: [English], [Multi], (Multi-Language)
    normalized = normalized.replace(/[\[\(][^\]\)]*(?:english|multi|language|multi\d*)[^\]\)]*[\]\)]/gi, '');

    // 2. Remove edition types: Ultimate, Gold, Deluxe, GOTY, Directors Cut, etc.
    normalized = normalized.replace(/\b(ultimate|gold|deluxe|goty|game\s*of\s*the\s*year|definitive|enhanced|complete|digital|premium|collectors?|special|directors?\s*cut)\s*(edition)?\b/gi, '');

    // 3. Remove year patterns: (2023), [2023], 2023
    normalized = normalized.replace(/[\[\(]?\b(19|20)\d{2}\b[\]\)]?/g, '');

    // 4. Remove update/patch patterns
    // Pattern A: Standard "Update vX.X" or "Patch v1.0.11"
    normalized = normalized.replace(/\b(update|patch|hotfix|fix)\s*v?[\d.\s]+/gi, '');
    // Pattern B: Date before Update - "01122025 Update" (DDMMYYYY format)
    normalized = normalized.replace(/\b\d{8}\s+(update|patch|hotfix|fix)\b/gi, '');

    // 5. Remove DLC/Expansion markers
    normalized = normalized.replace(/\b(dlc|expansion|add-?on|season\s*pass)\b/gi, '');

    // 6. Remove version numbers: v1.0, v1 02, v20251218, Build.12345
    // Handle both dots and spaces as separators
    normalized = normalized.replace(/\b(v|ver|version)[\d.\s]+\b/gi, '');
    normalized = normalized.replace(/\bbuild\.?\d+\b/gi, '');

    // 7. Remove platform indicators: x64, x86, 32bit, 64bit, PC, Windows
    normalized = normalized.replace(/\b(x64|x86|32-?bit|64-?bit|pc|windows|win64)\b/gi, '');

    // 8. Remove region codes: USA, EUR, JPN, PAL, NTSC, MULTI, World
    normalized = normalized.replace(/\b(usa|eur|jpn|pal|ntsc|multi|world|region\s*free)\b/gi, '');

    // 9. Remove release types: ISO, RIP, REPACK, PROPER, INTERNAL
    normalized = normalized.replace(/\b(iso|rip|repack|proper|internal|read\.?nfo)\b/gi, '');

    // 10. Remove release group at end (after dash): -RUNE, -CODEX, -RELOADED, etc.
    normalized = normalized.replace(/-[a-z0-9]+$/i, '');

    // 11. Remove common noise words at start
    normalized = normalized.replace(/^(the|a|an)\s+/i, '');

    // 12. Replace dots/underscores with spaces
    normalized = normalized.replace(/[._]+/g, ' ');

    // 13. Normalize whitespace (collapse multiple spaces)
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Extract quality score for comparison (higher is better)
 * @param {string} quality - Quality string from metadata (e.g., "2160p", "1080p")
 * @returns {number} Quality score (0-4)
 */
function getQualityScore(quality) {
    if (!quality) return 0;

    const q = quality.toLowerCase();
    if (q.includes('2160p') || q.includes('4k') || q.includes('uhd')) return 4;
    if (q.includes('1080p')) return 3;
    if (q.includes('720p')) return 2;
    if (q.includes('480p')) return 1;

    return 0;
}

/**
 * Extract release type score for games (higher is better)
 * @param {string} category - Game category (e.g., "PC-ISO", "PC-Rip")
 * @returns {number} Release type score (0-3)
 */
function getReleaseTypeScore(category) {
    const scores = {
        'PC-ISO': 3,      // Full ISO releases (best quality)
        'PC-Mixed': 2,    // Mixed content
        'PC-Rip': 1,      // Compressed/stripped (smaller but lower quality)
        'Nintendo': 2,
        'Playstation': 2,
        'Xbox': 2,
        'Wii': 2
    };
    return scores[category] || 0;
}

/**
 * Group movie torrents by normalized title
 * Creates grouped objects with all versions accessible
 * Non-movie torrents (games, PC) are left untouched
 * @param {Array} torrents - Array of torrent objects
 * @returns {Array} Array with grouped movies and ungrouped non-movies
 */
function deduplicateMovies(torrents) {
    // Check if deduplication is enabled
    if (!AppState.pagination.enableDeduplication) {
        return torrents;
    }

    // Movie categories to group
    const movieCategories = ['Movie/4K', 'Movie/BD-Rip', 'Movie/HD/Bluray', 'Movie/Web-DL', 'Movie/x265'];

    // Separate movies from non-movies
    const movies = torrents.filter(t => movieCategories.includes(t.category));
    const nonMovies = torrents.filter(t => !movieCategories.includes(t.category));

    // Group movies by normalized title
    const movieGroups = {};

    movies.forEach(torrent => {
        const normalizedTitle = normalizeMovieTitle(torrent.name);

        if (!movieGroups[normalizedTitle]) {
            movieGroups[normalizedTitle] = [];
        }

        movieGroups[normalizedTitle].push(torrent);
    });

    // Create grouped movie objects
    const groupedMovies = Object.values(movieGroups).map(group => {
        // Sort versions by: snatched count (desc), quality (desc), date (desc)
        const sortedVersions = group.sort((a, b) => {
            // 1. Snatched count (higher is better)
            if (b.snatched !== a.snatched) {
                return b.snatched - a.snatched;
            }

            // 2. Quality score (higher is better)
            const qualityA = a.metadata?.quality || '';
            const qualityB = b.metadata?.quality || '';
            const scoreA = getQualityScore(qualityA);
            const scoreB = getQualityScore(qualityB);

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            // 3. Upload date (newer first)
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        // Use the best version as the "main" torrent
        const mainTorrent = { ...sortedVersions[0] };

        // If multiple versions exist, mark as grouped and store all versions
        if (sortedVersions.length > 1) {
            mainTorrent.isGrouped = true;
            mainTorrent.versions = sortedVersions;
            mainTorrent.versionCount = sortedVersions.length;
        }

        return mainTorrent;
    });

    // Combine non-movies (untouched) with grouped movies
    return [...nonMovies, ...groupedMovies];
}

/**
 * Group game torrents by normalized title
 * Creates grouped objects with all versions accessible
 * Detects UPDATE/DLC/PATCH patterns and stores them for display
 * @param {Array} games - Array of game torrent objects
 * @returns {Array} Array with grouped games
 */
function deduplicateGames(games) {
    const gameGroups = {};

    games.forEach(torrent => {
        // Detect patterns BEFORE normalization (preserve for display)
        const patterns = detectGamePatterns(torrent.name);
        Object.assign(torrent, patterns);  // Store in torrent object

        // Normalize for grouping
        const normalizedTitle = normalizeGameTitle(torrent.name);

        // Store cleaned display name (capitalized normalized title)
        torrent.displayName = normalizedTitle
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        if (!gameGroups[normalizedTitle]) {
            gameGroups[normalizedTitle] = [];
        }

        gameGroups[normalizedTitle].push(torrent);
    });

    // Debug logging
    console.log('=== GAME GROUPING DEBUG ===');
    console.log('Total games:', games.length);
    console.log('Unique normalized titles:', Object.keys(gameGroups).length);
    Object.entries(gameGroups).forEach(([title, group]) => {
        if (group.length > 1) {
            console.log(`"${title}" has ${group.length} versions:`, group.map(g => g.name));
        }
    });
    console.log('=== END DEBUG ===');

    // Create grouped game objects
    const groupedGames = Object.values(gameGroups).map(group => {
        // Sort versions by: snatched (desc) → release type (desc) → seeders (desc) → date (desc)
        const sortedVersions = group.sort((a, b) => {
            // 1. Snatched count (higher is better - popularity)
            if (b.snatched !== a.snatched) {
                return b.snatched - a.snatched;
            }

            // 2. Release type score (ISO > Mixed > Rip)
            const scoreA = getReleaseTypeScore(a.category);
            const scoreB = getReleaseTypeScore(b.category);
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            // 3. Seeders (higher is better - availability)
            if (b.seeders !== a.seeders) {
                return b.seeders - a.seeders;
            }

            // 4. Upload date (newer first)
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        // Use the best version as the "main" torrent
        const mainTorrent = { ...sortedVersions[0] };

        // If multiple versions exist, mark as grouped and store all versions
        if (sortedVersions.length > 1) {
            mainTorrent.isGrouped = true;
            mainTorrent.versions = sortedVersions;
            mainTorrent.versionCount = sortedVersions.length;
        }

        return mainTorrent;
    });

    return groupedGames;
}

/**
 * Deduplicate both movies and games by normalized title
 * Wrapper function that applies appropriate deduplication to each content type
 * @param {Array} torrents - Array of all torrent objects
 * @returns {Array} Array with grouped movies, grouped games, and other torrents
 */
function deduplicateTorrents(torrents) {
    // Check if deduplication is enabled
    if (!AppState.pagination.enableDeduplication) {
        return torrents;
    }

    const movieCategories = ['Movie/4K', 'Movie/BD-Rip', 'Movie/HD/Bluray', 'Movie/Web-DL', 'Movie/x265'];
    const gameCategories = ['PC-ISO', 'PC-Rip', 'PC-Mixed', 'Nintendo', 'Playstation', 'Xbox', 'Wii'];

    // Separate by content type
    const movies = torrents.filter(t => movieCategories.includes(t.category));
    const games = torrents.filter(t => gameCategories.includes(t.category));
    const other = torrents.filter(t => !movieCategories.includes(t.category) && !gameCategories.includes(t.category));

    // Apply movie deduplication (use existing logic)
    const movieGroups = {};
    movies.forEach(torrent => {
        const normalizedTitle = normalizeMovieTitle(torrent.name);
        if (!movieGroups[normalizedTitle]) {
            movieGroups[normalizedTitle] = [];
        }
        movieGroups[normalizedTitle].push(torrent);
    });

    const groupedMovies = Object.values(movieGroups).map(group => {
        const sortedVersions = group.sort((a, b) => {
            if (b.snatched !== a.snatched) return b.snatched - a.snatched;
            const scoreA = getQualityScore(a.metadata?.quality || '');
            const scoreB = getQualityScore(b.metadata?.quality || '');
            if (scoreB !== scoreA) return scoreB - scoreA;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        const mainTorrent = { ...sortedVersions[0] };
        if (sortedVersions.length > 1) {
            mainTorrent.isGrouped = true;
            mainTorrent.versions = sortedVersions;
            mainTorrent.versionCount = sortedVersions.length;
        }
        return mainTorrent;
    });

    // Apply game deduplication
    const groupedGames = deduplicateGames(games);

    // Combine all: other (untouched) + grouped movies + grouped games
    return [...other, ...groupedMovies, ...groupedGames];
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
    document.getElementById('refresh-btn').addEventListener('click', () => refreshData());
    document.getElementById('refresh-btn-bottom').addEventListener('click', () => refreshData());

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

    // Handle browser back/forward navigation
    window.addEventListener('hashchange', () => {
        const newPage = readPageFromHash();
        if (newPage !== AppState.pagination.currentPage) {
            goToPage(newPage);
        }
    });
}

function onFilterChange() {
    // Update state from UI
    updateFiltersFromUI();

    // Reset to page 1 when filters change
    AppState.pagination.currentPage = 1;

    // Re-filter and display (instant!)
    applyFiltersAndSort();
}

function onCategoryChange() {
    // Update categories from checkboxes
    const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
        .map(cb => cb.value);

    AppState.currentFilters.categories = selectedCategories;

    // Reset to page 1 when categories change
    AppState.pagination.currentPage = 1;

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

        // Reset to page 1 on search
        AppState.pagination.currentPage = 1;

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

    // Reset to page 1 on sort change
    AppState.pagination.currentPage = 1;

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

    // Cancel any in-progress metadata loading
    if (AppState.metadataLoader) {
        AppState.metadataLoader.cancel();
    }

    if (torrents.length === 0) {
        document.getElementById('no-results').style.display = 'block';
        document.querySelector('.table-container').style.display = 'none';
        return;
    }

    document.getElementById('no-results').style.display = 'none';
    document.querySelector('.table-container').style.display = 'block';

    // Build DOM with expanded rows included
    const fragment = document.createDocumentFragment();
    const torrentsNeedingMetadata = [];

    torrents.forEach(torrent => {
        const row = createTorrentRow(torrent);
        fragment.appendChild(row);

        // If movie torrent with TMDB enabled, create expanded row
        if (row.dataset.autoExpand === 'true') {
            const metadataRow = createExpandedMetadataRow(torrent);
            fragment.appendChild(metadataRow);
            torrentsNeedingMetadata.push(torrent);
        }
    });

    tbody.appendChild(fragment);  // Single DOM reflow - 3-5x faster!

    // Start progressive loading (skip already-cached movies)
    if (AppState.metadataLoader && torrentsNeedingMetadata.length > 0) {
        // Filter out movies that already have rendered content
        const torrentsToLoad = torrentsNeedingMetadata.filter(torrent => {
            if (!torrent.imdb_id) return false;

            // Skip if in session cache (already rendered)
            if (AppState.sessionMetadataCache[torrent.imdb_id]) {
                return false;
            }

            // Skip if in localStorage cache (already rendered)
            if (AppState.tmdbClient && AppState.tmdbClient.isCached(torrent.imdb_id)) {
                return false;
            }

            return true;  // Not cached, needs loading
        });

        if (torrentsToLoad.length > 0) {
            console.log(`Starting progressive load for ${torrentsToLoad.length} movies (${torrentsNeedingMetadata.length - torrentsToLoad.length} cached)`);
            AppState.metadataLoader.enqueue(torrentsToLoad);
        } else {
            console.log('All movies cached, no loading needed');
        }
    }

    // Progressive game metadata loading (IGDB)
    if (AppState.gameMetadataLoader) {
        const gamesTorents = torrents.filter(t => isGameCategory(t.category) && t.displayName);

        // Filter out games that are already cached
        const gamesToLoad = gamesTorents.filter(t => {
            const normalizedName = t.displayName || normalizeGameTitle(t.name);
            const platform = detectPlatform(t.category);
            const cacheKey = `${normalizedName}_${platform}`;

            // Check session cache
            if (AppState.sessionMetadataCache[cacheKey]) {
                return false;
            }

            // Check localStorage cache
            if (AppState.igdbClient && AppState.igdbClient.isCached(normalizedName, platform)) {
                return false;
            }

            return true;  // Not cached, needs loading
        });

        if (gamesToLoad.length > 0) {
            console.log(`Starting progressive load for ${gamesToLoad.length} games (${gamesTorents.length - gamesToLoad.length} cached)`);
            AppState.gameMetadataLoader.enqueue(gamesToLoad);
        } else if (gamesTorents.length > 0) {
            console.log('All games cached, no loading needed');
        }
    }
}

// ===================================================================
// PAGINATION DISPLAY
// ===================================================================

/**
 * Display only the current page of torrents
 */
function displayCurrentPage() {
    const { currentPage, itemsPerPage } = AppState.pagination;
    const allTorrents = AppState.displayedTorrents;

    // Calculate slice boundaries
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    // Get torrents for current page
    const pageTorrents = allTorrents.slice(startIndex, endIndex);

    // Render torrents
    displayTorrents(pageTorrents);

    // Update pagination controls
    renderPaginationControls();
}

/**
 * Render pagination controls
 */
function renderPaginationControls() {
    const { currentPage, totalPages } = AppState.pagination;
    const container = document.getElementById('pagination-controls');

    if (!container) return;

    // Hide if only one page
    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    // Previous button
    const prevBtn = createPaginationButton('‹ Prev', currentPage - 1, currentPage === 1);
    container.appendChild(prevBtn);

    // Page numbers with smart ellipsis
    const pageButtons = generatePageButtons(currentPage, totalPages);
    pageButtons.forEach(btn => container.appendChild(btn));

    // Next button
    const nextBtn = createPaginationButton('Next ›', currentPage + 1, currentPage === totalPages);
    container.appendChild(nextBtn);

    // Page info
    const pageInfo = document.createElement('div');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    container.appendChild(pageInfo);
}

/**
 * Generate page number buttons with smart ellipsis
 * Shows: [1] ... [current-1] [current] [current+1] ... [last]
 */
function generatePageButtons(currentPage, totalPages) {
    const buttons = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
        // Show all pages if 7 or fewer
        for (let i = 1; i <= totalPages; i++) {
            buttons.push(createPaginationButton(i, i, false, i === currentPage));
        }
        return buttons;
    }

    // Always show first page
    buttons.push(createPaginationButton(1, 1, false, currentPage === 1));

    // Calculate range around current page
    const rangeStart = Math.max(2, currentPage - 1);
    const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    // Left ellipsis
    if (rangeStart > 2) {
        buttons.push(createEllipsis());
    }

    // Middle pages
    for (let i = rangeStart; i <= rangeEnd; i++) {
        buttons.push(createPaginationButton(i, i, false, i === currentPage));
    }

    // Right ellipsis
    if (rangeEnd < totalPages - 1) {
        buttons.push(createEllipsis());
    }

    // Always show last page
    if (totalPages > 1) {
        buttons.push(createPaginationButton(totalPages, totalPages, false, currentPage === totalPages));
    }

    return buttons;
}

/**
 * Create a pagination button
 */
function createPaginationButton(text, page, disabled, active = false) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${active ? 'active' : ''}`;
    btn.textContent = text;
    btn.disabled = disabled;

    if (!disabled) {
        btn.onclick = () => goToPage(page);
    }

    return btn;
}

/**
 * Create ellipsis element
 */
function createEllipsis() {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    return ellipsis;
}

/**
 * Navigate to specific page
 */
function goToPage(page) {
    const { totalPages } = AppState.pagination;

    // Validate page number
    if (page < 1 || page > totalPages) {
        return;
    }

    AppState.pagination.currentPage = page;

    // Scroll to top of results
    const resultsSection = document.querySelector('.results');
    if (resultsSection) {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update display
    displayCurrentPage();

    // Update URL hash
    updatePageHash();

    // Save to session storage
    sessionStorage.setItem('iptbrowser_current_page', page);
}

// ===================================================================
// URL HASH MANAGEMENT
// ===================================================================

/**
 * Update URL hash with current page
 */
function updatePageHash() {
    const { currentPage } = AppState.pagination;

    if (currentPage === 1) {
        // Remove hash for page 1
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } else {
        history.replaceState(null, '', `#page=${currentPage}`);
    }
}

/**
 * Read page number from URL hash
 */
function readPageFromHash() {
    const hash = window.location.hash;
    const match = hash.match(/#page=(\d+)/);

    if (match) {
        const page = parseInt(match[1]);
        if (page > 0) {
            return page;
        }
    }

    return 1;
}

/**
 * Initialize pagination from URL or session storage
 */
function initializePagination() {
    // Try URL hash first
    const hashPage = readPageFromHash();

    if (hashPage > 1) {
        AppState.pagination.currentPage = hashPage;
        return;
    }

    // Fallback to session storage
    const savedPage = sessionStorage.getItem('iptbrowser_current_page');

    if (savedPage) {
        const page = parseInt(savedPage);
        if (page > 0) {
            AppState.pagination.currentPage = page;
        }
    }
}

/**
 * Create an expanded metadata row with loading spinner
 * @param {Object} torrent - Torrent object
 * @returns {HTMLElement} Table row element
 */
function createExpandedMetadataRow(torrent) {
    const metadataRow = document.createElement('tr');
    metadataRow.id = `metadata-row-${torrent.id}`;
    metadataRow.className = 'metadata-row';

    const metadataCell = document.createElement('td');
    metadataCell.colSpan = 9;
    metadataCell.className = 'metadata-container';

    // Pre-check cache before showing spinner
    let cachedData = null;

    // Check session cache first (fastest - in-memory)
    if (torrent.imdb_id && AppState.sessionMetadataCache[torrent.imdb_id]) {
        cachedData = AppState.sessionMetadataCache[torrent.imdb_id];
    }
    // Check localStorage cache (synchronous)
    else if (torrent.imdb_id && AppState.tmdbClient) {
        cachedData = AppState.tmdbClient.isCached(torrent.imdb_id);

        // Store in session cache for future renders
        if (cachedData) {
            AppState.sessionMetadataCache[torrent.imdb_id] = cachedData;
        }
    }

    // If cached, render immediately; otherwise show spinner
    if (cachedData) {
        metadataCell.innerHTML = renderMetadataContent(cachedData);
    } else {
        metadataCell.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner-icon">⏳</div>
                <span>Loading movie data...</span>
            </div>
        `;
    }

    metadataRow.appendChild(metadataCell);
    return metadataRow;
}

function createTorrentRow(torrent) {
    const tr = document.createElement('tr');
    tr.id = `torrent-row-${torrent.id}`;
    if (torrent.isGrouped) {
        tr.dataset.grouped = 'true';
        tr.dataset.torrentId = torrent.id;
    }

    // Name
    const nameCell = document.createElement('td');
    nameCell.className = 'torrent-name';

    const nameLink = document.createElement('a');
    nameLink.href = torrent.url || '#';
    nameLink.target = '_blank';
    // Use cleaned display name for games, original name for others
    nameLink.textContent = torrent.displayName || torrent.name;
    nameLink.className = 'torrent-link';

    nameCell.appendChild(nameLink);

    if (torrent.is_freeleech) {
        const freeleechBadge = document.createElement('span');
        freeleechBadge.className = 'badge badge-freeleech';
        freeleechBadge.textContent = 'FL';
        nameCell.appendChild(freeleechBadge);
    }

    // Add game indicator badges (UPDATE, DLC, PATCH)
    if (isGameCategory(torrent.category)) {
        if (torrent.hasUpdate) {
            const updateChip = document.createElement('span');
            updateChip.className = 'badge badge-update';
            updateChip.textContent = torrent.updateVersion
                ? `UPDATE ${torrent.updateVersion}`
                : 'UPDATE';
            updateChip.title = 'This is an update or patch';
            nameCell.appendChild(updateChip);
        }

        if (torrent.isDLC) {
            const dlcChip = document.createElement('span');
            dlcChip.className = 'badge badge-dlc';
            dlcChip.textContent = torrent.dlcName
                ? `DLC: ${torrent.dlcName}`
                : 'DLC';
            dlcChip.title = 'This is DLC or expansion content';
            nameCell.appendChild(dlcChip);
        }

        if (torrent.hasPatch) {
            const patchChip = document.createElement('span');
            patchChip.className = 'badge badge-patch';
            patchChip.textContent = torrent.patchVersion
                ? `PATCH ${torrent.patchVersion}`
                : 'PATCH';
            patchChip.title = 'This is a patch or hotfix';
            nameCell.appendChild(patchChip);
        }
    }

    // Add versions button if this is a grouped movie or game
    if (torrent.isGrouped) {
        const versionsBtn = document.createElement('button');
        versionsBtn.className = 'btn-versions';
        versionsBtn.textContent = `Show ${torrent.versionCount} versions`;
        versionsBtn.title = 'Show all versions';
        versionsBtn.onclick = (e) => {
            e.preventDefault();
            toggleVersions(torrent.id);
        };
        nameCell.appendChild(versionsBtn);
    }

    tr.appendChild(nameCell);

    // Metadata (only for movie categories)
    const metadataCell = document.createElement('td');
    metadataCell.className = 'metadata-cell';

    if (torrent.metadata && isMovieCategory(torrent.category)) {
        const meta = torrent.metadata;

        // Only show quality badge in collapsed view (other info is in expanded panel)
        if (meta.quality) {
            metadataCell.innerHTML = `<span class="meta-quality">${meta.quality}</span>`;
        } else {
            metadataCell.textContent = '-';
        }

        // Mark this row for auto-expansion if TMDB enabled
        if (AppState.tmdbEnabled && meta.year) {
            tr.dataset.autoExpand = 'true';
            tr.dataset.torrentId = torrent.id;
        }
    } else if (isGameCategory(torrent.category)) {
        // Mark game row for auto-expansion if IGDB enabled
        if (AppState.igdbEnabled && torrent.displayName) {
            tr.dataset.autoExpand = 'true';
            tr.dataset.torrentId = torrent.id;
            metadataCell.textContent = '-';
        } else {
            metadataCell.textContent = '-';
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

/**
 * Toggle display of all versions for a grouped movie
 */
function toggleVersions(torrentId) {
    const versionsRowId = `versions-row-${torrentId}`;
    let versionsRow = document.getElementById(versionsRowId);
    const mainRow = document.getElementById(`torrent-row-${torrentId}`);
    const btn = mainRow ? mainRow.querySelector('.btn-versions') : null;
    const torrent = findTorrentById(torrentId);

    if (versionsRow) {
        // Versions row exists, toggle it
        if (versionsRow.style.display === 'none') {
            versionsRow.style.display = 'table-row';
            if (btn) btn.textContent = `Hide ${torrent.versionCount} versions`;
        } else {
            versionsRow.style.display = 'none';
            if (btn) btn.textContent = `Show ${torrent.versionCount} versions`;
        }
    } else {
        // Create versions row
        if (torrent && torrent.versions) {
            versionsRow = createVersionsRow(torrent);
            // Insert after main row
            if (mainRow && mainRow.nextSibling) {
                mainRow.parentNode.insertBefore(versionsRow, mainRow.nextSibling);
            } else if (mainRow) {
                mainRow.parentNode.appendChild(versionsRow);
            }
            if (btn) btn.textContent = `Hide ${torrent.versionCount} versions`;
        }
    }
}

/**
 * Create a row showing all versions of a grouped movie
 */
function createVersionsRow(torrent) {
    const versionsRow = document.createElement('tr');
    versionsRow.id = `versions-row-${torrent.id}`;
    versionsRow.className = 'versions-row';

    const versionsCell = document.createElement('td');
    versionsCell.colSpan = 9; // Span all columns
    versionsCell.className = 'versions-cell';

    const versionsContainer = document.createElement('div');
    versionsContainer.className = 'versions-container';

    const versionsTitle = document.createElement('div');
    versionsTitle.className = 'versions-title';
    versionsTitle.textContent = `All Versions (${torrent.versionCount})`;
    versionsContainer.appendChild(versionsTitle);

    const versionsList = document.createElement('div');
    versionsList.className = 'versions-list';

    torrent.versions.forEach((version, index) => {
        const versionItem = document.createElement('div');
        versionItem.className = 'version-item';

        // Version details
        const versionInfo = document.createElement('div');
        versionInfo.className = 'version-info';

        const versionName = document.createElement('div');
        versionName.className = 'version-name';
        versionName.textContent = version.name;
        versionInfo.appendChild(versionName);

        const versionMeta = document.createElement('div');
        versionMeta.className = 'version-meta';
        versionMeta.innerHTML = `
            <span class="badge badge-category">${version.category}</span>
            <span>${version.size}</span>
            <span class="badge badge-seeders">${version.seeders}S</span>
            <span class="badge badge-leechers">${version.leechers}L</span>
            <span class="badge badge-snatched">${version.snatched} snatched</span>
            <span>${version.upload_time}</span>
        `;
        versionInfo.appendChild(versionMeta);

        versionItem.appendChild(versionInfo);

        // Version actions
        const versionActions = document.createElement('div');
        versionActions.className = 'version-actions';

        if (version.download_link) {
            // qBittorrent button
            if (AppState.qbittorrentEnabled) {
                const qbtBtn = document.createElement('button');
                qbtBtn.className = 'btn btn-qbittorrent btn-sm';
                qbtBtn.textContent = 'Send';
                qbtBtn.title = 'Send to qBittorrent';
                qbtBtn.onclick = (e) => {
                    e.preventDefault();
                    sendToQbittorrent(version.download_link, version.name, qbtBtn);
                };
                versionActions.appendChild(qbtBtn);
            }

            // Download button
            const downloadBtn = document.createElement('a');
            downloadBtn.href = version.download_link;
            downloadBtn.className = 'btn btn-download btn-sm';
            downloadBtn.textContent = 'Download';
            downloadBtn.title = 'Download .torrent file';
            versionActions.appendChild(downloadBtn);
        }

        versionItem.appendChild(versionActions);
        versionsList.appendChild(versionItem);
    });

    versionsContainer.appendChild(versionsList);
    versionsCell.appendChild(versionsContainer);
    versionsRow.appendChild(versionsCell);

    return versionsRow;
}

/**
 * Find torrent by ID in displayed torrents
 */
function findTorrentById(torrentId) {
    return AppState.displayedTorrents.find(t => t.id === torrentId);
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

function updateResultsCount(totalCount) {
    const countEl = document.getElementById('results-count');
    if (countEl) {
        const { currentPage, itemsPerPage, totalPages } = AppState.pagination;
        const startIndex = (currentPage - 1) * itemsPerPage + 1;
        const endIndex = Math.min(currentPage * itemsPerPage, totalCount);

        if (totalPages > 1) {
            countEl.textContent = `Showing ${startIndex}-${endIndex} of ${totalCount} torrents`;
        } else {
            countEl.textContent = `Showing ${totalCount} torrent${totalCount !== 1 ? 's' : ''}`;
        }
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

    // Pagination settings
    document.getElementById('setting-items-per-page').value = settings.pagination?.itemsPerPage || 50;
    document.getElementById('setting-enable-deduplication').checked = settings.pagination?.enableDeduplication !== false;
}

async function saveSettingsFromUI() {
    const oldSettings = getSettings();

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
        showRefreshPrompt: document.getElementById('setting-show-refresh-prompt').checked,
        pagination: {
            itemsPerPage: parseInt(document.getElementById('setting-items-per-page').value),
            enableDeduplication: document.getElementById('setting-enable-deduplication').checked
        }
    };

    // Check if time window changed
    const timeWindowChanged = oldSettings.timeWindow !== settings.timeWindow;

    saveSettings(settings);

    closeSettings();

    // Show success message
    showToast('Settings saved successfully!', 'success');

    // Apply settings immediately
    applySettings(settings);

    // If time window changed, trigger full refresh to fetch new data range
    if (timeWindowChanged) {
        showToast(`Time window changed to ${settings.timeWindow} days - fetching new data...`, 'info');
        await loadFullData();
    }
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
        showRefreshPrompt: true,
        pagination: {
            itemsPerPage: 50,
            enableDeduplication: true
        }
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
            showRefreshPrompt: parsed.showRefreshPrompt !== undefined ? parsed.showRefreshPrompt : defaults.showRefreshPrompt,
            pagination: parsed.pagination || defaults.pagination
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

    // Apply pagination settings
    if (settings.pagination) {
        AppState.pagination.itemsPerPage = settings.pagination.itemsPerPage;
        AppState.pagination.enableDeduplication = settings.pagination.enableDeduplication;
    }

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

function isGameCategory(category) {
    const gameCategories = ['PC-ISO', 'PC-Rip', 'PC-Mixed', 'Nintendo', 'Playstation', 'Xbox', 'Wii'];
    return gameCategories.includes(category);
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
            AppState.metadataLoader = new MovieMetadataLoader(AppState.tmdbClient, 250);
            console.log('TMDB integration enabled with progressive loader');
        } else {
            console.error('TMDBClient not found! Make sure tmdb_client.js is loaded.');
        }
    } else {
        console.log('TMDB not enabled:', savedEnabled ? 'No API key' : 'Disabled in settings');
    }
}

// Note: saveTMDBSettings() is now in tmdb_manager.js (dedicated settings page)

// ===================================================================
// IGDB METADATA INTEGRATION
// ===================================================================

/**
 * Detect platform from torrent category
 * @param {string} category - Torrent category
 * @returns {string} Platform name for IGDB API
 */
function detectPlatform(category) {
    const platformMap = {
        'PC-ISO': 'PC',
        'PC-Rip': 'PC',
        'PC-Mixed': 'PC',
        'Nintendo': 'Nintendo Switch',  // Ambiguous - could be various Nintendo consoles
        'Playstation': 'PlayStation 4',  // Ambiguous - defaults to PS4
        'Xbox': 'Xbox One',              // Ambiguous - defaults to Xbox One
        'Wii': 'Wii'
    };
    return platformMap[category] || 'PC';
}

/**
 * Render game metadata content
 * @param {Object} gameData - Game metadata from IGDB
 * @returns {string} HTML string
 */
function renderGameMetadataContent(gameData) {
    const releaseYear = gameData.release_year || 'N/A';
    const rating = gameData.rating ? `${gameData.rating}/10` : 'N/A';
    const genres = gameData.genres && gameData.genres.length > 0 ?
        gameData.genres.join(', ') : 'N/A';

    let html = '<div class="game-metadata">';

    // Cover image
    if (gameData.cover_url) {
        html += `
            <div class="game-cover">
                <img src="${gameData.cover_url}" alt="${gameData.name}" />
            </div>
        `;
    }

    // Info section
    html += '<div class="game-info">';
    html += `<h4>${gameData.name}</h4>`;
    html += `<div class="game-rating">Rating: ${rating} | ${releaseYear}</div>`;
    html += `<div class="game-genres">${genres}</div>`;

    if (gameData.summary) {
        html += `<p class="game-summary">${gameData.summary}</p>`;
    }

    html += `<div class="game-developer">Developer: ${gameData.developer || 'Unknown'}</div>`;

    // Trailer link
    if (gameData.trailer_url) {
        html += `<a href="${gameData.trailer_url}" target="_blank" class="trailer-link">Watch Trailer</a>`;
    }

    html += '</div>';  // game-info
    html += '</div>';  // game-metadata

    return html;
}

/**
 * Load IGDB settings and initialize client
 */
function loadIGDBSettings() {
    const savedEnabled = localStorage.getItem('igdb_enabled') === 'true';

    console.log('Loading IGDB settings:', { enabled: savedEnabled });

    if (savedEnabled) {
        AppState.igdbEnabled = true;

        // Check if IGDBClient is available
        if (typeof IGDBClient !== 'undefined') {
            AppState.igdbClient = new IGDBClient();
            AppState.gameMetadataLoader = new GameMetadataLoader(AppState.igdbClient, 250);
            console.log('IGDB integration enabled with progressive loader');
        } else {
            console.error('IGDBClient not found! Make sure igdb_client.js is loaded.');
        }
    } else {
        console.log('IGDB not enabled');
    }
}

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
