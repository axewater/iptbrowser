# IPT Browser - Developer Guide

Developer documentation for the IPT Browser project. For user-facing documentation, see [README.md](README.md).

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────────┐
│  IPTorrents.com │         │  TMDB API (Movies)  │
└────────┬────────┘         └─────────┬───────────┘
         │ HTTP + Cookies             │ REST API
         ▼                            │
┌──────────────────────────────┐     │
│  scraper.py                  │     │
│  - Multi-page fetching       │     │
│  - HTML parsing (BS4)        │     │
│  - IMDB ID extraction        │     │
│  - Metadata extraction       │     │
│  - Time-based pagination     │     │
└──────────┬───────────────────┘     │
           │                         │
           ▼                         │
┌──────────────────────────────┐    │
│  app.py (Flask)              │    │
│  - 3-tier caching system     │    │
│  - Movie/game deduplication  │    │
│  - API endpoints             │    │
│  - Config management         │    │
└──────────┬───────────────────┘    │
           │ JSON API                │
           ▼                         │
┌──────────────────────────────┐    │    ┌──────────────────┐
│  Frontend (app.js)           │◄───┘    │  qBittorrent     │
│  - Client-side filtering     │         │  Web API         │
│  - TMDB integration          │◄────────┤  - Add torrents  │
│  - Movie/game grouping UI    │         └──────────────────┘
│  - Progressive loading       │
│  - Pagination & rendering    │
│  - Session-level caching     │
└──────────────────────────────┘
```

## Core Components

### 1. scraper.py - IPTorrents Scraper

**Class:** `IPTorrentsScraper`

**Key Method:**
```python
fetch_torrents(categories, limit=None, days=None)
```
- `days=None`: Fetch first page only, use cache
- `days=N`: Fetch all pages until cutoff time (N days ago)

**Multi-Page Logic:**
```python
# Pagination: offset increments by 75 (torrents per page)
# URL: http://www.iptorrents.com/t?{category_id};o={offset}
# Stops when: oldest_torrent < cutoff_time OR max_pages (50) reached
```

**Categories:**
```python
CATEGORIES = {
    # Game categories
    'PC-ISO': '43', 'PC-Rip': '45', 'PC-Mixed': '2',
    'Nintendo': '47', 'Playstation': '71', 'Xbox': '44', 'Wii': '50',

    # Movie categories (added in v3.0)
    'Movie/4K': '101',
    'Movie/BD-Rip': '90',
    'Movie/HD/Bluray': '48',
    'Movie/Web-DL': '20',
    'Movie/x265': '100'
}
```

**Parsing:** Targets table with `id="torrents"`, extracts data from `<tr>` elements.

**IMDB ID Extraction (scraper.py:327-333):**
- Searches for links with pattern `/t?qf=all;q=tt{imdb_id}`
- Extracts IMDB ID using regex `q=(tt\d+)`
- Stored in torrent object as `imdb_id` field
- Used for TMDB API lookups

**Metadata Extraction:**
- **Quality**: 2160p, 1080p, 720p, 480p, 4K, UHD
- **Year**: Release year from torrent title
- **Genres**: From category mapping
- All metadata stored in `torrent.metadata` object

### 2. app.py - Flask Backend

**3-Tier Caching System:**

The application uses a sophisticated 3-tier caching system for optimal performance:

1. **Backend Cache (15 minutes)**
   - File: `cache.json`
   - Stores: Torrent listings from IPTorrents
   - Structure: Metadata + torrent data with per-category tracking
   - Bypass: Any request with `days` parameter triggers fresh fetch
   - Benefits: Reduces IPTorrents scraping load, fast initial page loads

2. **Frontend localStorage Cache (7 days)**
   - Storage: Browser localStorage (`iptbrowser_tmdb_cache`)
   - Stores: Movie metadata from TMDB API (posters, cast, plot, trailers)
   - Key: IMDB ID
   - Benefits: Eliminates redundant TMDB API calls, instant metadata rendering

3. **Session In-Memory Cache (current session)**
   - Storage: `AppState.sessionMetadataCache` JavaScript object
   - Stores: Movie metadata for current page session
   - Benefits: Zero-latency re-renders during sorting, filtering, pagination
   - Cleared: On page refresh/close

**Cache Flow:**
```
User Request → Check Session Cache → Check localStorage → API Call → Store in all 3 tiers
```

**Key API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Main torrent browser page |
| `/cookie-manager` | GET | Cookie management interface |
| `/qbittorrent-manager` | GET | qBittorrent configuration page |
| `/tmdb-manager` | GET | TMDB API key management page |
| `/api/torrents` | GET | Fetch filtered torrents |
| `/api/refresh` | GET | Force cache refresh |
| `/api/stats` | GET | Cache and user statistics |
| `/api/user/info` | GET | Get IPTorrents user info (ratio, stats) |
| `/api/cookie/*` | Various | Cookie management operations |
| `/api/qbittorrent/*` | Various | qBittorrent integration |

**Filtering Logic:**
```python
# Applied in order:
1. categories (scraper level)
2. days (scraper level via cutoff_time)
3. min_snatched (backend filter)
4. search (case-insensitive substring)
5. exclude (comma-separated keywords)
```

### 3. config_manager.py - Configuration

**Features:**
- Thread-safe config operations with file locking
- Atomic writes (write to temp → rename)
- Auto-migration from old formats
- Hot-reload support via file watching

**Config Structure:**
```json
{
  "cookie": "uid=...; pass=...",
  "selected_categories": ["PC-ISO", "PC-Rip", "Movie/4K"],
  "qbittorrent": {
    "host": "http://localhost:8080",
    "username": "admin",
    "password": "adminpass"
  }
}
```

**Note:** TMDB API key is stored in browser localStorage (`tmdb_api_key`), not in config.json, as it's a client-side integration.

### 4. qbittorrent_client.py - Torrent Client Integration

**Features:**
- Session-based authentication
- Automatic cookie management
- Connection pooling via `requests.Session`
- Comprehensive error handling

**Main Operations:**
- `authenticate()`: Get session cookie
- `add_torrent_url(url, category, paused)`: Add torrent by URL
- Session caching for performance

### 5. browser_cookie_extractor.py - Cookie Extraction

**Supported Browsers:**
- Chrome/Chromium, Firefox, Edge, Brave

**Process:**
1. Locate browser profile directory
2. Copy SQLite cookies database (avoid locks)
3. Query for IPTorrents domain cookies
4. Decrypt cookies (OS-specific)
5. Format as cookie header string

**Platform Support:** Windows, Linux, macOS

### 6. cookie_validator.py - Cookie Validation

**Validation Steps:**
1. Format check (uid + pass)
2. HTTP request to IPTorrents
3. Parse response for user info
4. Extract username, ratio, upload/download stats

**Returns:** User data or error message

## Frontend Architecture

### Overview

The frontend is built with vanilla JavaScript using a modern state management approach. Movie-specific features utilize TMDB API for rich metadata integration with intelligent caching and progressive loading.

### Key JavaScript Modules

**static/js/app.js** - Main application controller
**static/js/tmdb_client.js** - TMDB API client
**static/js/tmdb_manager.js** - TMDB settings UI
**static/js/cookie_manager.js** - Cookie management UI
**static/js/qbittorrent_manager.js** - qBittorrent settings UI

### app.js - Main Application

**State Management (`AppState` object):**
- `allTorrents`: Raw torrent data (immutable after fetch)
- `displayedTorrents`: Computed view (filtered + sorted + deduplicated)
- `metadata`: Server metadata (cache status, timestamps)
- `currentFilters`: Active filters (categories, search, exclusions, etc.)
- `currentSort`: Sort field and order (name, date, size, seeders, etc.)
- `sessionMetadataCache`: In-memory cache for TMDB data
- `pagination`: Current page, items per page, deduplication toggle
- `tmdbEnabled`: TMDB integration toggle
- `qbittorrentEnabled`: qBittorrent integration status

**Key Functions:**

*Data Fetching & Display:*
- `loadTorrents()`: Fetch torrents from API and render
- `displayTorrents(torrents)`: Render torrent table with pagination
- `refreshData()`: Force cache refresh with user feedback

*Movie Features:*
- `deduplicateMovies(torrents)`: Group multiple versions of same movie (deprecated, now part of deduplicateTorrents)
- `normalizeMovieTitle(title)`: Strip quality/year/language for grouping
- `getQualityScore(quality)`: Score quality for sorting (4K > 1080p > 720p)
- `MovieMetadataLoader`: Progressive TMDB data loading with rate limiting

*Game Features:*
- `deduplicateGames(games)`: Group multiple versions of same game
- `deduplicateTorrents(torrents)`: Unified deduplication for both movies and games
- `normalizeGameTitle(title)`: Strip platform/region/release group/version for grouping
- `detectGamePatterns(title)`: Detect UPDATE/DLC/PATCH markers before normalization
- `getReleaseTypeScore(category)`: Score release types (ISO > Mixed > Rip)
- `isGameCategory(category)`: Helper to identify game categories

*Filtering & Sorting:*
- `applyFilters(torrents)`: Client-side filtering (search, exclude, min_snatched)
- `sortTorrents(torrents)`: Client-side sorting with optimized comparators
- `sortByColumn(column)`: Toggle sort order on column click

*Pagination:*
- `renderPagination()`: Render page controls
- `goToPage(page)`: Navigate to specific page
- `updateItemsPerPage(count)`: Change items per page

**Performance Optimizations:**
- **Batch DOM updates**: Build HTML strings, single innerHTML write
- **Pre-compiled comparators**: Extracted sort functions for 2x speed
- **Incremental rendering**: Only render visible page (50 items default)
- **Progressive loading**: TMDB metadata loads with 250ms delays
- **Cache-first rendering**: Check session/localStorage before API calls

### tmdb_client.js - TMDB API Client

**Class:** `TMDBClient`

**Features:**
- IMDB ID to TMDB movie ID resolution
- Fetches comprehensive movie metadata:
  - Poster images (300px width)
  - Plot summaries (overview)
  - Cast and crew (top 5 actors + director)
  - Release dates and runtime
  - YouTube trailer links
  - Genres and ratings
- 7-day localStorage cache per IMDB ID
- Automatic cache expiration and cleanup

**Key Methods:**
- `findByIMDBId(imdbId)`: Main lookup function
  1. Check cache first (fast path)
  2. Call TMDB `/find/{imdb_id}` endpoint
  3. Fetch detailed movie data with credits
  4. Cache result in localStorage
  5. Return enriched movie object

**Cache Structure:**
```javascript
{
  "tt1234567": {
    imdbId: "tt1234567",
    title: "Movie Title",
    posterUrl: "https://image.tmdb.org/t/p/w300/...",
    overview: "Plot summary...",
    releaseDate: "2023-05-15",
    cast: ["Actor 1", "Actor 2", ...],
    director: "Director Name",
    trailerUrl: "https://youtube.com/watch?v=...",
    cachedAt: 1704672000000  // Timestamp
  }
}
```

### tmdb_manager.js - TMDB Settings Manager

**Features:**
- API key configuration UI
- Enable/disable TMDB integration toggle
- Test API key connectivity
- View cache statistics (entries, size)
- Clear cache functionality
- Real-time validation feedback

**Storage:**
- `localStorage.getItem('tmdb_api_key')`: API key
- `localStorage.getItem('tmdb_enabled')`: Toggle state
- `localStorage.getItem('iptbrowser_tmdb_cache')`: Metadata cache

**Workflow:**
1. User enters TMDB API key
2. Click "Test & Save" to validate
3. Key stored in localStorage
4. Main app detects key and enables TMDB features
5. Movie posters/metadata appear automatically

### cookie_manager.js - Cookie Management

**Features:**
- Real-time cookie status checking
- Browser cookie extraction (Chrome, Firefox, Edge, Brave)
- Cookie testing and validation
- User info display (ratio, upload/download)
- Live feedback and error handling

## Advanced Features

### Movie Deduplication Algorithm

**Purpose:** Group different quality versions of the same movie (e.g., 4K, 1080p, 720p) into a single expandable row.

**Implementation (app.js:622-686):**

1. **Title Normalization** (`normalizeMovieTitle`)
   - Remove quality indicators: 2160p, 1080p, 720p, 4K, UHD, HDR, etc.
   - Remove release formats: BluRay, WEB-DL, BD-Rip, etc.
   - Remove language tags: [Hindi English], (Multi), etc.
   - Remove year patterns: (2023), [2023]
   - Remove edition types: Extended, Director's Cut, Unrated
   - Strip leading articles: "The", "A", "An"
   - Normalize whitespace and punctuation

2. **Grouping Logic**
   ```javascript
   // Group by normalized title
   movieGroups[normalizedTitle].push(torrent);
   ```

3. **Version Sorting** (within each group)
   - Primary: Snatched count (popularity)
   - Secondary: Quality score (4K=4, 1080p=3, 720p=2, 480p=1)
   - Tertiary: Upload date (newest first)

4. **Display Strategy**
   - Best version shown as main row
   - If multiple versions exist:
     - Set `torrent.isGrouped = true`
     - Store all versions in `torrent.versions[]`
     - Show expand button (▼) to reveal other versions
   - Single versions displayed normally

**Example:**
```
The Dark Knight (2008) 2160p BluRay x265
The Dark Knight 2008 1080p WEB-DL
The.Dark.Knight.2008.720p.BDRip

→ Groups to single row "Dark Knight" with 3 versions expandable
```

### Game Deduplication Algorithm

**Purpose:** Group different versions of the same game (e.g., ISO, RIP, updates, DLC) into a single expandable row with visual badges for updates and DLC.

**Implementation (app.js:818-890):**

1. **Pattern Detection** (`detectGamePatterns`) - **BEFORE** normalization
   - Detects UPDATE markers:
     - Standard format: `Update v1.2`, `Update 20251218`
     - Date-first format: `01122025 Update` (DDMMYYYY)
   - Detects DLC/Expansion markers
   - Detects PATCH/HOTFIX markers
   - Stores version numbers for display in badges
   - **False positive prevention**: Requires version number (e.g., `Update Edition` is NOT flagged)

2. **Title Normalization** (`normalizeGameTitle`)
   - Remove platform indicators: x64, x86, 32bit, 64bit, PC, Windows
   - Remove region codes: USA, EUR, JPN, PAL, NTSC, MULTI
   - Remove release types: ISO, RIP, REPACK, PROPER, INTERNAL
   - Remove update/patch patterns (both formats):
     - `Update v1.0.11` or `Patch v1 0 11` (version after)
     - `01122025 Update` (date before)
   - Remove DLC/Expansion markers
   - Remove version numbers: v1.0, v20251218, Build.12345
   - Remove edition types: Ultimate, Gold, Deluxe, GOTY, Director's Cut, etc.
   - Remove language tags: [English], [Multi], (Multi-Language)
   - Remove year patterns: (2023), [2023], 2023
   - Remove release groups: -RUNE, -CODEX, -RELOADED, etc.
   - Strip leading articles: "The", "A", "An"
   - Normalize whitespace and delimiters

3. **Grouping Logic**
   ```javascript
   // Detect patterns first (preserve for badges)
   const patterns = detectGamePatterns(torrent.name);
   Object.assign(torrent, patterns);  // Store: hasUpdate, isDLC, etc.

   // Normalize and group
   const normalizedTitle = normalizeGameTitle(torrent.name);
   gameGroups[normalizedTitle].push(torrent);

   // Create cleaned display name
   torrent.displayName = capitalizeWords(normalizedTitle);
   ```

4. **Version Sorting** (within each group)
   - Primary: Snatched count (popularity)
   - Secondary: Release type score (ISO=3, Mixed=2, Rip=1)
   - Tertiary: Seeders (availability)
   - Quaternary: Upload date (newest first)

5. **Display Strategy**
   - Cleaned name shown in UI (e.g., "Flatout 2" instead of "Flatout 2 01122025 Update-RUNE")
   - Visual badges appear after name:
     - **Orange badge**: `UPDATE 1.0.11` (for updates with version)
     - **Purple badge**: `DLC` or `DLC: Pack Name` (for DLC content)
     - **Cyan badge**: `PATCH 1.2` (for patches with version)
   - If multiple versions exist:
     - Set `torrent.isGrouped = true`
     - Store all versions in `torrent.versions[]`
     - Show expand button to reveal other versions
   - Single versions displayed with badges but no expand button

6. **Visual Badges** (CSS: style.css:454-496)
   ```css
   .badge-update  { background: #ff9800; }  /* Orange */
   .badge-dlc     { background: #9c27b0; }  /* Purple */
   .badge-patch   { background: #00bcd4; }  /* Cyan */
   ```

**Examples:**
```
Input:  "Senuas Saga Hellblade II Enhanced Update v20251218-RUNE"
Output: "Senuas Saga Hellblade II" [ORANGE: UPDATE 20251218]

Input:  "Flatout 2 01122025 Update-TENOKE"
Output: "Flatout 2" [ORANGE: UPDATE 01122025]

Input:  "The Witcher 3 GOTY Edition v1.32 DLC Pack-CODEX"
Output: "Witcher 3" [PURPLE: DLC]

Multiple versions grouped:
- "Grand Theft Auto VI PC-ISO-CODEX" (100 snatched)
- "Grand.Theft.Auto.VI.PC-Rip-RELOADED" (50 snatched)
→ Groups to single row "Grand Theft Auto Vi" with 2 versions expandable
  (ISO version shown first due to higher release type score)
```

**Edge Cases Handled:**
- Games with "Update" in the title (e.g., "Warfare Update Edition") are NOT flagged unless followed by version number
- Date formats before "Update" (DDMMYYYY pattern)
- Version numbers with spaces: `v1 0 11` normalized to `1.0.11`
- Director's Cut with/without apostrophe: `Director's Cut` and `Directors Cut`
- Console games (Nintendo, PlayStation, Xbox, Wii) use same normalization

### Pagination System

**Features:**
- Client-side pagination (no server round-trips)
- Configurable items per page (25, 50, 100, 200, All)
- Page navigation controls (First, Prev, 1, 2, 3..., Next, Last)
- Preserves filters and sort order across pages
- Deduplication toggle (enable/disable movie and game grouping)

**State Management:**
```javascript
AppState.pagination = {
    currentPage: 1,
    itemsPerPage: 50,
    totalPages: 0,
    enableDeduplication: true
}
```

**Performance:**
- Only renders current page (50 items by default)
- Instant page switching (no API calls)
- Smooth scrolling to top on page change

### Progressive Movie Metadata Loading

**Problem:** Loading 200+ TMDB API calls simultaneously hits rate limits and causes browser lag.

**Solution:** `MovieMetadataLoader` class with controlled sequential loading

**Algorithm:**
1. Build queue of all movie torrents on current page
2. Check 3-tier cache for each movie (session → localStorage → API)
3. For cache misses, load sequentially with 250ms delay
4. Render metadata as it arrives (progressive enhancement)
5. Cancel queue if user changes page/filter

**Benefits:**
- Respects TMDB rate limits (40 requests/10 seconds)
- Smooth UI updates (no blocking)
- Cached movies render instantly (no delay)
- User can interact while metadata loads

**Code Location:** `app.js:64-141` (MovieMetadataLoader class)

## Development Workflows

### Setting Up TMDB Integration

**Get TMDB API Key:**
1. Create free account at https://www.themoviedb.org/signup
2. Go to Settings → API → Request API Key
3. Select "Developer" and fill out form
4. Copy API Key (v3 auth)

**Configure in App:**
1. Navigate to `/tmdb-manager` page
2. Paste API key
3. Click "Test & Save"
4. Enable TMDB integration toggle
5. Return to main page - movie posters will appear automatically

**How It Works:**
- Frontend only (no backend storage)
- API key stored in localStorage
- Each movie with IMDB ID triggers TMDB lookup
- Results cached for 7 days
- Works offline for cached movies

### Adding New Categories

1. **scraper.py:21-34** - Add to `CATEGORIES` dict
2. Find category ID from IPTorrents URL: `iptorrents.com/t?XX`
3. **templates/index.html** - Add checkbox in category section
4. **static/js/app.js** - No changes needed (dynamic)
5. For movie categories, ensure name starts with "Movie/" for deduplication

### Modifying Parsing Logic

**If IPTorrents changes HTML structure:**
- **scraper.py:309-486** - `_parse_torrent_row()` method
- Common changes:
  - Table selector: Find torrent table (`table#torrents`)
  - Torrent title link: Line 318 (`href="/t/{id}"`)
  - IMDB ID extraction: Lines 327-333 (`/t?qf=all;q=tt{imdb_id}`)
  - Download link: Line 336 (`/download.php/`)
  - Size extraction: Line 341 (regex for GB/MB/TB)
  - Seeders/leechers/snatched: Lines 354-381 (nested `<td>` handling)
  - Upload time: Lines 385-410 (relative time parsing)

### Adding New Filters

1. **Backend (app.py:filter_torrents):**
   ```python
   if 'new_filter' in filters:
       filtered = [t for t in filtered if condition(t)]
   ```

2. **Frontend (index.html):**
   ```html
   <input type="text" id="new-filter" placeholder="Filter">
   ```

3. **Frontend (app.js:getFilters):**
   ```javascript
   new_filter: document.getElementById('new-filter').value
   ```

### Testing Changes

**Run scraper standalone:**
```bash
python scraper.py
# Fetches 10 torrents and prints them
```

**Test specific features:**
```bash
# Test IMDB extraction
python test_imdb_extraction.py

# Test metadata parsing
python test_metadata_parsing.py

# Test live scraping
python test_live_scrape.py

# Test cookie reading
python test_cookie_read.py
```

### Caching Strategy

**Backend Cache (cache.json):**
- **Cache hit:** ~50-100ms response time
- **Cache miss:** 1-2s for single page, 10-40s for multi-page fetch
- **Strategy:**
  - Use cache for "all time" browsing (fast)
  - Bypass cache for time-filtered queries (`?days=7`)
  - 15-minute expiration balances freshness vs performance
  - Incremental updates: fetch only new torrents since last cache

**Frontend TMDB Cache (localStorage):**
- **Cache hit:** Instant (0ms - synchronous read)
- **Cache miss:** 200-500ms per movie (TMDB API call)
- **Strategy:**
  - 7-day expiration for movie metadata
  - Cache key: IMDB ID
  - Pre-check cache before rendering to eliminate loading flicker
  - Automatically prune expired entries on access

**Session Cache (in-memory):**
- **Access time:** <1ms (JavaScript object lookup)
- **Lifetime:** Current page session only
- **Purpose:** Zero-latency re-renders during sorting/filtering/pagination
- **Cleared:** On page reload or navigation away

**Performance Metrics:**
- First load (cold cache): 2-3s backend + progressive TMDB loading
- Second load (warm cache): 100ms backend + 0ms TMDB (instant)
- Sort/filter/paginate: <50ms (pure client-side, session cache)


## Project Structure

```
iptbrowser/
│
├── app.py                          # Flask backend (main application)
├── scraper.py                      # IPTorrents scraper with IMDB extraction
├── config_manager.py               # Thread-safe config management
├── cookie_validator.py             # Cookie validation logic
├── qbittorrent_client.py          # qBittorrent API client
├── browser_cookie_extractor.py    # Browser cookie extraction utility
├── start_server.py                # Development server launcher
├── start.ps1                      # PowerShell startup script
│
├── config.json                    # User configuration (cookies, settings)
├── cache.json                     # Backend torrent cache (15 min TTL)
│
├── templates/
│   ├── index.html                 # Main torrent browser page
│   ├── cookie_manager.html        # Cookie management interface
│   ├── qbittorrent_manager.html   # qBittorrent settings page
│   └── tmdb_manager.html          # TMDB API key configuration
│
├── static/
│   ├── css/
│   │   └── style.css              # All application styles
│   │
│   └── js/
│       ├── app.js                 # Main frontend application
│       ├── tmdb_client.js         # TMDB API client
│       ├── tmdb_manager.js        # TMDB settings UI
│       ├── cookie_manager.js      # Cookie management UI
│       └── qbittorrent_manager.js # qBittorrent settings UI
│
└── test_*.py                      # Testing utilities (various features)
```

**Key Files by Feature:**

| Feature | Files |
|---------|-------|
| Torrent Scraping | `scraper.py`, `app.py` |
| Movie Metadata | `tmdb_client.js`, `tmdb_manager.js`, `scraper.py` (IMDB extraction) |
| Caching | `app.py` (backend), `tmdb_client.js` (localStorage), `app.js` (session) |
| Cookie Management | `cookie_manager.py/js`, `browser_cookie_extractor.py`, `cookie_validator.py` |
| qBittorrent | `qbittorrent_client.py`, `qbittorrent_manager.js` |
| UI/Frontend | `app.js`, `index.html`, `style.css` |
| Configuration | `config_manager.py`, `config.json` |

## Code Style

- **Python:** PEP 8, docstrings for public methods, type hints encouraged
- **JavaScript:** `const`/`let`, async/await, descriptive names
- **HTML/CSS:** Semantic HTML5, mobile-responsive, accessible
- **Comments:** Explain "why", not "what" - code should be self-documenting

## Future Enhancements

**Performance:**
- [ ] Parallel page fetching (asyncio/aiohttp)
- [ ] WebSocket for real-time updates
- [ ] Database backend (SQLite) for better long-term caching
- [ ] Server-side pagination for extremely large datasets
- [ ] Web Worker for off-thread sorting/filtering

**Features:**
- [ ] Advanced search (regex, boolean operators)
- [ ] Statistics dashboard (trending movies, category breakdown)
- [ ] Request rate limiting for scraper
- [ ] Watchlist/favorites system
- [ ] Export torrents to CSV/JSON
- [ ] Dark mode support
- [ ] Custom quality preferences per user

**Movie Features:**
- [ ] Rotten Tomatoes scores integration
- [ ] Netflix/streaming availability checker
- [ ] Similar movies recommendations
- [ ] Auto-download best quality based on rules

**UX:**
- [ ] Progress bar for multi-page fetches
- [ ] Toast notifications for operations
- [ ] Column visibility toggle
- [ ] Keyboard shortcuts
- [ ] Torrent comparison view
- [ ] Mobile-optimized movie cards view


## File Change Detection

**config.json auto-reload:**
- Uses file modification time (mtime) checking
- Polling interval: 1 second
- Thread-safe with locks

**Cookie hot-reload:**
- Cookie changes trigger scraper reload
- No app restart needed
- Useful for testing different accounts

---

## Version History

**Version 3.0** (Current)
- Added TMDB integration with movie metadata (posters, cast, trailers, plot)
- Added 5 movie categories (4K, BD-Rip, HD/Bluray, Web-DL, x265)
- Implemented IMDB ID extraction from torrent listings
- Added intelligent movie deduplication and grouping
- **Added game name normalization and deduplication**
  - Intelligent game title cleanup (removes platform, region, version, release groups)
  - Game grouping by normalized title (ISO/Rip/Mixed versions grouped together)
  - Visual badges for UPDATE/DLC/PATCH markers (orange/purple/cyan)
  - Pattern detection for multiple update formats (standard and date-first)
  - Release type scoring (ISO > Mixed > Rip)
  - Cleaned display names while preserving original for download
- Implemented 3-tier caching system (backend, localStorage, session)
- Added pagination with configurable items per page
- Added progressive movie metadata loading with rate limiting
- Enhanced browser cookie extraction (Brave, modern Chrome AES encryption)
- Performance optimizations: 3-5x faster frontend rendering and backend fetching

**Version 2.0**
- Added qBittorrent integration with one-click downloads
- Added cookie management system with browser extraction
- Enhanced caching with hot-reload support
- Added user info display (ratio, stats)

**Version 1.0**
- Initial release with basic torrent browsing
- Multi-page fetching
- Category filtering
- Basic caching
