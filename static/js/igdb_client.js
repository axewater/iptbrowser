/**
 * IGDB API Client (Frontend)
 * Handles game metadata fetching from IGDB through backend proxy
 * with localStorage caching to minimize API calls
 *
 * Unlike TMDB (which calls API directly), IGDB client calls backend
 * proxy to keep OAuth credentials secure on server-side.
 */

class IGDBClient {
    constructor() {
        this.cacheKey = 'iptbrowser_igdb_cache';
        this.cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        // Load cache from localStorage
        this.cache = this._loadCache();
    }

    /**
     * Search for game by normalized name with optional platform filter
     * @param {string} gameName - Normalized game name (e.g., "half life")
     * @param {string} platform - Optional platform name (e.g., "PC", "Nintendo Switch")
     * @returns {Promise<Object>} Game data with cover, summary, rating, etc.
     */
    async searchGame(gameName, platform = null) {
        if (!gameName) {
            throw new Error('Game name is required');
        }

        // Create cache key from name + platform
        const cacheKey = this._createCacheKey(gameName, platform);

        // Check cache first
        const cached = this._getFromCache(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Call backend proxy
            const response = await fetch('/api/igdb/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_name: gameName,
                    platform: platform
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `IGDB API error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                // Cache the result
                this._saveToCache(cacheKey, result.data);
                return result.data;
            } else {
                throw new Error(result.error || 'Game not found');
            }

        } catch (error) {
            // Re-throw for caller to handle
            throw error;
        }
    }

    /**
     * Synchronously check if game is cached (no async/await)
     * @param {string} gameName - Normalized game name
     * @param {string} platform - Optional platform
     * @returns {Object|null} Cached data or null
     */
    isCached(gameName, platform = null) {
        const cacheKey = this._createCacheKey(gameName, platform);
        return this._getFromCache(cacheKey);
    }

    /**
     * Create cache key from game name and platform
     * @param {string} gameName - Game name
     * @param {string} platform - Platform (or null)
     * @returns {string} Cache key
     */
    _createCacheKey(gameName, platform) {
        return `${gameName.toLowerCase()}_${platform || 'any'}`;
    }

    /**
     * Load cache from localStorage
     * @returns {Object} Cache object
     */
    _loadCache() {
        try {
            const cacheStr = localStorage.getItem(this.cacheKey);
            if (cacheStr) {
                return JSON.parse(cacheStr);
            }
        } catch (error) {
            console.warn('Error loading IGDB cache:', error);
        }
        return {};
    }

    /**
     * Save cache to localStorage
     */
    _saveCache() {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
        } catch (error) {
            console.warn('Error saving IGDB cache - attempting cleanup');
            // If quota exceeded, try to cleanup old entries
            this._cleanupCache();
            // Retry save after cleanup
            try {
                localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
            } catch (retryError) {
                console.warn('Cache quota exceeded after cleanup');
            }
        }
    }

    /**
     * Get item from cache
     * @param {string} key - Cache key
     * @returns {Object|null} Cached data or null if expired/missing
     */
    _getFromCache(key) {
        const entry = this.cache[key];
        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > this.cacheDuration) {
            // Expired - remove from cache
            delete this.cache[key];
            this._saveCache();
            return null;
        }

        return entry.data;
    }

    /**
     * Save item to cache
     * @param {string} key - Cache key
     * @param {Object} data - Data to cache
     */
    _saveToCache(key, data) {
        this.cache[key] = {
            data: data,
            timestamp: Date.now()
        };
        this._saveCache();
    }

    /**
     * Cleanup expired cache entries
     */
    _cleanupCache() {
        const now = Date.now();
        let cleaned = false;

        for (const [key, entry] of Object.entries(this.cache)) {
            if (now - entry.timestamp > this.cacheDuration) {
                delete this.cache[key];
                cleaned = true;
            }
        }

        if (cleaned) {
            this._saveCache();
        }
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache = {};
        localStorage.removeItem(this.cacheKey);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats (entries, size)
     */
    getCacheStats() {
        const entries = Object.keys(this.cache).length;
        const cacheStr = JSON.stringify(this.cache);
        const size = new Blob([cacheStr]).size;

        return {
            entries: entries,
            size: size
        };
    }

    /**
     * Check backend status
     * @param {boolean} enabled - Whether IGDB is enabled in frontend
     * @returns {Promise<Object>} Backend status
     */
    async checkBackendStatus(enabled) {
        try {
            const response = await fetch(`/api/igdb/status?enabled=${enabled}`);

            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            console.warn('IGDB backend status check failed:', error.message);
            return {
                configured: false,
                enabled: false,
                has_credentials: false,
                token_valid: false,
                error: error.message
            };
        }
    }

    /**
     * Test IGDB connection
     * @returns {Promise<Object>} Test result
     */
    async testConnection() {
        try {
            const response = await fetch('/api/igdb/test', {
                method: 'POST'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Test failed: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            console.warn('IGDB connection test failed:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

// Export for use in other scripts
window.IGDBClient = IGDBClient;
