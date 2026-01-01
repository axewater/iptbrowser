# IPT Browser - Developer Guide

Developer documentation for the IPT Browser project. For user-facing documentation, see [README.md](README.md).

## Architecture Overview

```
┌─────────────────┐
│  IPTorrents.com │
└────────┬────────┘
         │ HTTP + Cookies
         ▼
┌──────────────────────────────┐
│  scraper.py                  │
│  - Multi-page fetching       │
│  - HTML parsing (BS4)        │
│  - Time-based pagination     │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  app.py (Flask)              │
│  - Smart caching             │
│  - API endpoints             │
│  - Config management         │
└──────────┬───────────────────┘
           │ JSON API
           ▼
┌──────────────────────────────┐    ┌──────────────────┐
│  Frontend (app.js)           │    │  qBittorrent     │
│  - Client-side filtering     │◄───┤  Web API         │
│  - Dynamic rendering         │    │  - Add torrents  │
│  - Settings management       │    └──────────────────┘
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
    'PC-ISO': '43', 'PC-Rip': '45', 'PC-Mixed': '2',
    'Nintendo': '47', 'Playstation': '71', 'Xbox': '44', 'Wii': '50'
}
```

**Parsing:** Targets table with `id="torrents"`, extracts data from `<tr>` elements.

### 2. app.py - Flask Backend

**Caching Strategy:**
- Duration: 15 minutes (configurable via `CACHE_DURATION`)
- File: `cache.json`
- Bypass: Any request with `days` parameter
- Structure: Metadata + torrent data with per-category tracking

**Key API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/torrents` | GET | Fetch filtered torrents |
| `/api/refresh` | GET | Force cache refresh |
| `/api/stats` | GET | Cache and user statistics |
| `/api/cookie/*` | Various | Cookie management |
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
  "selected_categories": ["PC-ISO", "PC-Rip"],
  "qbittorrent": {
    "host": "http://localhost:8080",
    "username": "admin",
    "password": "adminpass"
  }
}
```

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

### app.js - Main Application

**State Management:**
- Filters stored in localStorage
- Sort state (column, direction)
- Settings panel visibility

**Key Functions:**
- `loadTorrents()`: Fetch and display torrents
- `displayTorrents(torrents)`: Render torrent table
- `sortByColumn(column)`: Client-side sorting
- `refreshData()`: Force cache refresh

**Performance:**
- Batch DOM updates
- Debounced filter changes
- Incremental rendering for large datasets

### cookie_manager.js - Cookie Management

**Features:**
- Real-time cookie status checking
- Browser cookie extraction
- Cookie testing and validation
- Live feedback and error handling

## Development Workflows

### Adding New Categories

1. **scraper.py:11** - Add to `CATEGORIES` dict
2. Find category ID from IPTorrents URL: `iptorrents.com/t?XX`
3. **templates/index.html** - Add checkbox in category section
4. **static/js/app.js** - No changes needed (dynamic)

### Modifying Parsing Logic

**If IPTorrents changes HTML structure:**
- **scraper.py:155-203** - `_parse_torrent_row()` method
- Common changes:
  - Table selector: Line 101 (`table#torrents`)
  - Link patterns: Lines 130, 136, 140 (regex)
  - Cell indices: Lines 158-160

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

**Enable Flask debug mode:**
```python
# app.py:317 (already enabled)
app.run(debug=True, host='0.0.0.0', port=5000)
```

**Browser debugging:**
- F12 → Network tab → Filter "Fetch/XHR"
- Check `/api/torrents` request/response
- Console for JavaScript errors

## Performance Considerations

### Multi-Page Fetching

| Time Period | Pages | Avg Time |
|-------------|-------|----------|
| 7 days      | 1-2   | 3-5s     |
| 30 days     | 4-8   | 10-20s   |
| 60 days     | 8-15  | 20-40s   |

**Optimizations:**
- Pages fetched sequentially (could parallelize with asyncio)
- Early exit when cutoff reached
- Max 50 pages safety limit

### Caching

**Cache hits:** ~100ms response time
**Cache miss:** 1-2s for single page, 10-40s for multi-page

**Strategy:**
- Use cache for "all time" browsing
- Bypass cache for time-filtered queries
- 15-minute expiration balances freshness vs performance

## Security

### Sensitive Data

**Never commit to git:**
- `.env` (IPTorrents cookie)
- `config.json` (all credentials)
- `*.log` files
- `cache.json` (may contain user data)

**Already in .gitignore:** All above files

### Cookie Handling

- Cookies stored locally only
- Cookie extraction requires local browser DB access
- No external transmission except to IPTorrents

### Input Validation

- Flask auto-sanitizes URL parameters
- Search uses safe substring matching
- No SQL injection risk (no database)
- No command injection (no shell commands)

## Common Issues

### "Could not find torrent table"

**Cause:** Cookie expired or invalid
**Fix:** Extract fresh cookie via Cookie Manager

### Multi-page stops at page 1

**Cause:** Time period too short, or no recent torrents
**Debug:** Check console output for "Found X torrents on page Y"

### Cache not updating

**Cause:** Cache still valid
**Fix:** Click "Refresh Data" or delete `cache.json`

## Code Style

- **Python:** PEP 8, docstrings for public methods, type hints encouraged
- **JavaScript:** `const`/`let`, async/await, descriptive names
- **HTML/CSS:** Semantic HTML5, mobile-responsive, accessible

## Future Enhancements

**Performance:**
- [ ] Parallel page fetching (asyncio/aiohttp)
- [ ] WebSocket for real-time updates
- [ ] Database backend (SQLite) for better caching
- [ ] Server-side pagination

**Features:**
- [ ] Batch torrent downloads
- [ ] Export to CSV/JSON
- [ ] Custom filter presets
- [ ] Advanced search (regex, boolean)
- [ ] Statistics dashboard
- [ ] Request rate limiting

**UX:**
- [ ] Progress bar for multi-page fetches
- [ ] Toast notifications
- [ ] Keyboard shortcuts
- [ ] Column visibility toggle

## Testing

Currently no automated tests. Consider adding:
- Unit tests for parsing logic (scraper.py)
- Integration tests for API endpoints
- Mock IPTorrents responses for testing
- Cookie extraction tests (careful with browser DBs)

## Debugging Tips

**Backend:**
```python
# Add to any function
print(f"Debug: {variable}")
import pprint; pprint.pprint(data)
```

**Frontend:**
```javascript
// In browser console
console.log('Current filters:', getFilters());
console.table(torrents);  // Nice table view
```

**Network:**
- Monitor all `/api/*` calls in Network tab
- Check response times, payloads
- Verify request parameters

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

**Last Updated:** 2026-01-01
**Version:** 2.0 (Added qBittorrent integration, cookie management, enhanced caching)
