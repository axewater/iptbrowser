/**
 * TMDB API Client
 * Handles movie metadata fetching from The Movie Database API
 * with localStorage caching to minimize API calls
 */

class TMDBClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.imageBaseUrl = 'https://image.tmdb.org/t/p/w300';
        this.cacheKey = 'iptbrowser_tmdb_cache';
        this.cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        // Load cache from localStorage
        this.cache = this._loadCache();
    }

    /**
     * Find movie by IMDB ID and return enriched data
     * @param {string} imdbId - IMDB ID (e.g., "tt1234567")
     * @returns {Promise<Object>} Movie data with poster, plot, cast, etc.
     */
    async findByIMDBId(imdbId) {
        if (!imdbId || !imdbId.startsWith('tt')) {
            throw new Error('Invalid IMDB ID');
        }

        // Check cache first
        const cached = this._getFromCache(imdbId);
        if (cached) {
            console.log(`TMDB: Cache hit for ${imdbId}`);
            return cached;
        }

        console.log(`TMDB: Fetching data for ${imdbId}`);

        try {
            // Step 1: Find TMDB movie ID using IMDB ID
            const findUrl = `${this.baseUrl}/find/${imdbId}?api_key=${this.apiKey}&external_source=imdb_id`;
            const findResponse = await fetch(findUrl);

            if (!findResponse.ok) {
                throw new Error(`TMDB API error: ${findResponse.status}`);
            }

            const findData = await findResponse.json();

            // Check if we found a movie
            if (!findData.movie_results || findData.movie_results.length === 0) {
                throw new Error('Movie not found in TMDB');
            }

            const movie = findData.movie_results[0];
            const tmdbId = movie.id;

            // Step 2: Get detailed movie info with credits and videos
            const detailsUrl = `${this.baseUrl}/movie/${tmdbId}?api_key=${this.apiKey}&append_to_response=credits,videos`;
            const detailsResponse = await fetch(detailsUrl);

            if (!detailsResponse.ok) {
                throw new Error(`TMDB API error: ${detailsResponse.status}`);
            }

            const details = await detailsResponse.json();

            // Extract and format the data
            const movieData = this._formatMovieData(details);

            // Cache the result
            this._saveToCache(imdbId, movieData);

            return movieData;

        } catch (error) {
            console.error(`TMDB error for ${imdbId}:`, error);
            throw error;
        }
    }

    /**
     * Find movie by title and year (fallback when no IMDB ID)
     * @param {string} title - Movie title
     * @param {number} year - Release year
     * @returns {Promise<Object>} Movie data with poster, plot, cast, etc.
     */
    async findByTitleAndYear(title, year) {
        if (!title || !year) {
            throw new Error('Title and year are required');
        }

        // Create cache key from title+year
        const cacheKey = `title_${title}_${year}`;

        // Check cache first
        const cached = this._getFromCache(cacheKey);
        if (cached) {
            console.log(`TMDB: Cache hit for "${title}" (${year})`);
            return cached;
        }

        console.log(`TMDB: Searching for "${title}" (${year})`);

        try {
            // Step 1: Search for movie by title and year
            const searchUrl = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(title)}&year=${year}`;
            const searchResponse = await fetch(searchUrl);

            if (!searchResponse.ok) {
                throw new Error(`TMDB API error: ${searchResponse.status}`);
            }

            const searchData = await searchResponse.json();

            // Check if we found any results
            if (!searchData.results || searchData.results.length === 0) {
                // Try again without year as fallback
                console.log(`No exact match, trying without year...`);
                const fallbackUrl = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(title)}`;
                const fallbackResponse = await fetch(fallbackUrl);

                if (fallbackResponse.ok) {
                    const fallbackData = await fallbackResponse.json();
                    if (fallbackData.results && fallbackData.results.length > 0) {
                        // Use first result from fallback search
                        const movie = fallbackData.results[0];
                        const tmdbId = movie.id;

                        const detailsUrl = `${this.baseUrl}/movie/${tmdbId}?api_key=${this.apiKey}&append_to_response=credits,videos`;
                        const detailsResponse = await fetch(detailsUrl);

                        if (detailsResponse.ok) {
                            const details = await detailsResponse.json();
                            const movieData = this._formatMovieData(details);
                            this._saveToCache(cacheKey, movieData);
                            console.log(`Found via fallback: ${movieData.title}`);
                            return movieData;
                        }
                    }
                }

                throw new Error(`Movie "${title}" (${year}) not found in TMDB`);
            }

            // Get the first result (usually the best match)
            const movie = searchData.results[0];
            const tmdbId = movie.id;

            // Step 2: Get detailed movie info with credits and videos
            const detailsUrl = `${this.baseUrl}/movie/${tmdbId}?api_key=${this.apiKey}&append_to_response=credits,videos`;
            const detailsResponse = await fetch(detailsUrl);

            if (!detailsResponse.ok) {
                throw new Error(`TMDB API error: ${detailsResponse.status}`);
            }

            const details = await detailsResponse.json();

            // Extract and format the data
            const movieData = this._formatMovieData(details);

            // Cache the result
            this._saveToCache(cacheKey, movieData);

            return movieData;

        } catch (error) {
            console.error(`TMDB error for "${title}" (${year}):`, error);
            throw error;
        }
    }

    /**
     * Format movie data for display
     * @param {Object} details - Raw TMDB movie details
     * @returns {Object} Formatted movie data
     */
    _formatMovieData(details) {
        // Extract director from crew
        let director = 'Unknown';
        if (details.credits && details.credits.crew) {
            const directorObj = details.credits.crew.find(person => person.job === 'Director');
            if (directorObj) {
                director = directorObj.name;
            }
        }

        // Extract top 5 cast members
        let cast = [];
        if (details.credits && details.credits.cast) {
            cast = details.credits.cast.slice(0, 5).map(person => ({
                name: person.name,
                character: person.character,
                profile_path: person.profile_path ? `${this.imageBaseUrl}${person.profile_path}` : null
            }));
        }

        // Extract trailer (YouTube trailer preferred)
        let trailer_url = null;
        if (details.videos && details.videos.results) {
            // Find first YouTube trailer
            const trailer = details.videos.results.find(video =>
                video.site === 'YouTube' &&
                (video.type === 'Trailer' || video.type === 'Teaser')
            );

            if (trailer) {
                trailer_url = `https://www.youtube.com/watch?v=${trailer.key}`;
            }
        }

        return {
            title: details.title || 'Unknown',
            plot: details.overview || 'No plot summary available.',
            poster_url: details.poster_path ? `${this.imageBaseUrl}${details.poster_path}` : null,
            vote_average: details.vote_average || null,
            release_date: details.release_date || null,
            runtime: details.runtime || null,
            genres: details.genres ? details.genres.map(g => g.name) : [],
            cast: cast,
            director: director,
            trailer_url: trailer_url,
            tmdb_id: details.id
        };
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
            console.error('Error loading TMDB cache:', error);
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
            console.error('Error saving TMDB cache:', error);
            // If quota exceeded, clear old entries
            this._cleanupCache();
        }
    }

    /**
     * Get data from cache
     * @param {string} imdbId - IMDB ID
     * @returns {Object|null} Cached data or null
     */
    _getFromCache(imdbId) {
        const entry = this.cache[imdbId];
        if (!entry) {
            return null;
        }

        // Check if cache entry is still valid
        const now = Date.now();
        if (now - entry.timestamp > this.cacheDuration) {
            // Cache expired, remove it
            delete this.cache[imdbId];
            this._saveCache();
            return null;
        }

        return entry.data;
    }

    /**
     * Save data to cache
     * @param {string} imdbId - IMDB ID
     * @param {Object} data - Movie data to cache
     */
    _saveToCache(imdbId, data) {
        this.cache[imdbId] = {
            data: data,
            timestamp: Date.now()
        };
        this._saveCache();
    }

    /**
     * Clean up old cache entries to free space
     */
    _cleanupCache() {
        const now = Date.now();
        let cleaned = false;

        for (const [imdbId, entry] of Object.entries(this.cache)) {
            if (now - entry.timestamp > this.cacheDuration) {
                delete this.cache[imdbId];
                cleaned = true;
            }
        }

        if (cleaned) {
            this._saveCache();
        }
    }

    /**
     * Clear entire cache
     */
    clearCache() {
        this.cache = {};
        localStorage.removeItem(this.cacheKey);
        console.log('TMDB cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        return {
            entries: Object.keys(this.cache).length,
            size: new Blob([JSON.stringify(this.cache)]).size
        };
    }
}

// Export for use in other scripts
window.TMDBClient = TMDBClient;
