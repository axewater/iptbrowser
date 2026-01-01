# IPT Browser - Developer Guide

## Project Overview

IPT Browser is a Flask-based web application that provides an enhanced browsing and filtering interface for IPTorrents.com. It scrapes torrent listings, caches them locally, and provides advanced filtering capabilities including multi-page fetching based on time periods.

**Key Features:**
- Multi-page torrent fetching based on time periods
- Advanced filtering (categories, time, snatched count, keywords)
- Caching system to reduce server load
- Sortable columns
- Dark-themed responsive UI
- Network-accessible server

## Quick Start

### Prerequisites
- Python 3.7+
- IPTorrents account with valid credentials
- Required packages: `flask`, `requests`, `beautifulsoup4`, `python-dotenv`

### Setup

1. **Install dependencies:**
   ```bash
   pip install flask requests beautifulsoup4 python-dotenv
   ```

2. **Create `.env` file** in project root:
   ```
   IPTORRENTS_COOKIE=uid=YOUR_UID; pass=YOUR_PASS_HASH
   ```

   Get your cookie from your browser's developer tools when logged into IPTorrents.

3. **Run the application:**
   ```bash
   python app.py
   ```

   Or for network access:
   ```bash
   python start_server.py
   ```

4. **Access the app:**
   - Local: http://localhost:5000
   - Network: http://YOUR_IP:5000

## Architecture

### Technology Stack
- **Backend:** Flask (Python)
- **Scraping:** BeautifulSoup4 + Requests
- **Frontend:** Vanilla JavaScript
- **Storage:** JSON file cache
- **Auth:** Cookie-based (from .env)

### Data Flow

```
┌─────────────┐
│ IPTorrents  │
│   Website   │
└──────┬──────┘
       │ HTTP + Cookies
       ▼
┌─────────────────────────────┐
│  scraper.py                 │
│  - Fetches pages            │
│  - Parses HTML              │
│  - Multi-page support       │
└──────┬──────────────────────┘
       │ Python objects
       ▼
┌─────────────────────────────┐
│  app.py (Flask)             │
│  - Caching (cache.json)     │
│  - Filtering                │
│  - API endpoints            │
└──────┬──────────────────────┘
       │ JSON API
       ▼
┌─────────────────────────────┐
│  Frontend (app.js)          │
│  - Renders table            │
│  - Handles user input       │
│  - Sorts/filters display    │
└─────────────────────────────┘
```

## File Structure

```
iptbrowser/
├── app.py                  # Main Flask application
├── scraper.py              # IPTorrents scraper module
├── start_server.py         # Network-accessible server launcher
├── .env                    # Environment variables (cookies)
├── cache.json              # Cached torrent data (auto-generated)
├── CLAUDE.md              # This developer guide
├── templates/
│   └── index.html         # Main HTML template
└── static/
    ├── css/
    │   └── style.css      # Dark theme styling
    └── js/
        └── app.js         # Frontend JavaScript
```

## Key Components

### 1. scraper.py

**Class: `IPTorrentsScraper`**

#### Key Methods:

**`fetch_torrents(categories, limit, days)`**
- Fetches torrents from specified categories
- `categories`: List of category names (e.g., ['PC-ISO', 'PC-Rip'])
- `limit`: Max torrents to return (None = all)
- `days`: Time period for multi-page fetching (None = single page only)

**`_fetch_category_pages(category_name, category_id, cutoff_time)`**
- Fetches multiple pages until reaching cutoff time
- Used when `days` parameter is specified
- Pagination URL format: `http://www.iptorrents.com/t?{category_id};o={offset}`
- Offset increments by 75 per page
- Safety limit: 50 pages maximum

**`_fetch_single_page(category_name, category_id, offset)`**
- Fetches a single page at given offset
- Returns list of parsed torrent dictionaries

**`_parse_torrents(html, category)`**
- Parses HTML table with id="torrents"
- Returns list of torrent objects

**`_parse_torrent_row(row, category)`**
- Extracts data from a single torrent row
- Returns torrent dictionary with fields:
  - `id`, `name`, `category`, `size`, `seeders`, `leechers`, `snatched`
  - `upload_time`, `timestamp`, `download_link`, `is_freeleech`, `url`

#### Categories:
```python
CATEGORIES = {
    'PC-ISO': '43',
    'PC-Rip': '45',
    'PC-Mixed': '2',
    'Nintendo': '47',
    'Playstation': '71',
    'Xbox': '44',
    'Wii': '50'
}
```

### 2. app.py

**Flask Application with Caching**

#### Configuration:
- `CACHE_FILE`: 'cache.json'
- `CACHE_DURATION`: 15 minutes

#### Key Functions:

**`refresh_torrents(force, categories, days)`**
- Main function to fetch/refresh torrents
- Uses cache if valid (unless `days` is specified)
- When `days` is set, always fetches fresh multi-page data
- Updates cache only when fetching all data (no time limit)

**`filter_torrents(torrents, filters)`**
- Applies client-side filters:
  - `categories`: Filter by category names
  - `days`: Filter by time period (handled by scraper now)
  - `min_snatched`: Minimum download count
  - `exclude`: Comma-separated keywords to exclude
  - `search`: Search in torrent names

**`sort_torrents(torrents, sort_by, order)`**
- Sorts by: `snatched`, `date`, `size`, `seeders`, `name`
- Order: `asc` or `desc`

#### API Endpoints:

**GET /**
- Main page
- Renders `index.html`

**GET /api/torrents**
- Fetch filtered torrents
- Query params: `categories`, `days`, `min_snatched`, `exclude`, `search`, `sort`, `order`
- Response: `{ count: N, torrents: [...] }`

**GET /api/refresh**
- Force refresh cache
- Response: `{ success: true, count: N, message: "..." }`

**GET /api/stats**
- Cache statistics
- Response: `{ total: N, cache_age: "X minutes ago", categories: {...}, cache_valid: bool }`

### 3. Frontend (app.js)

#### Key Functions:

**`loadTorrents()`**
- Fetches torrents from `/api/torrents` with current filters
- Updates UI with results
- Saves filters to localStorage

**`displayTorrents(torrents)`**
- Renders torrent table
- Shows count and "Showing X torrents" message

**`createTorrentRow(torrent)`**
- Creates HTML table row for a torrent
- Adds badges, links, download button

**`refreshData()`**
- Calls `/api/refresh` endpoint
- Reloads torrents after refresh

**`sortByColumn(column)`**
- Toggles sort order
- Updates visual indicators
- Re-sorts and displays torrents

## Multi-Page Fetching Logic

### How It Works

When a user selects a time period (e.g., "Last 30 days"):

1. **Request Flow:**
   ```
   User selects "Last 30 days"
   ↓
   Frontend: ?days=30
   ↓
   app.py: refresh_torrents(days=30)
   ↓
   scraper.py: fetch_torrents(days=30)
   ```

2. **Scraper Logic:**
   ```python
   cutoff_time = now - 30 days

   for each category:
       page = 1, offset = 0
       while page <= 50:
           fetch page at offset
           add torrents >= cutoff_time

           if oldest_torrent < cutoff_time:
               break  # Done with this category

           offset += 75
           page += 1
   ```

3. **Why This Approach:**
   - IPTorrents sorts by upload date (newest first)
   - Once we hit old torrents, no need to fetch more pages
   - Efficient: stops as soon as cutoff is reached
   - Complete: gets ALL torrents in time period

### Performance Considerations

**Without time period (default):**
- Uses cache (15 min duration)
- Fetches only first page
- Fast response (~1-2 seconds)

**With time period:**
- Always fetches fresh
- Multi-page fetching
- Slower response (depends on time range)
  - Last 7 days: ~3-5 seconds (1-2 pages)
  - Last 30 days: ~10-20 seconds (4-8 pages)
  - Last 60 days: ~20-40 seconds (8-15 pages)

**Caching Strategy:**
- Multi-page results are NOT cached (always fresh)
- This ensures accurate time-based filtering
- Cache only used for "all time" / no time filter

## How to Extend

### Add New Categories

1. **Add to scraper.py:**
   ```python
   CATEGORIES = {
       # ... existing ...
       'New-Category': 'CATEGORY_ID'
   }
   ```

2. **Find category ID:**
   - Browse to category on IPTorrents
   - Check URL: `iptorrents.com/t?XX` (XX is the ID)

3. **Update frontend (index.html):**
   ```html
   <input type="checkbox" id="new-category" value="New-Category">
   <label for="new-category">New Category</label>
   ```

### Add New Filters

1. **Backend (app.py):**
   ```python
   def filter_torrents(torrents, filters):
       # ... existing filters ...

       # New filter
       if 'my_filter' in filters and filters['my_filter']:
           value = filters['my_filter']
           filtered = [t for t in filtered if t['field'] == value]
   ```

2. **Frontend (index.html):**
   ```html
   <input type="text" id="my-filter" placeholder="My Filter">
   ```

3. **Frontend (app.js):**
   ```javascript
   function getFilters() {
       return {
           // ... existing ...
           my_filter: document.getElementById('my-filter').value
       };
   }
   ```

### Modify Parsing Logic

If IPTorrents changes their HTML structure:

**scraper.py:155-203** - Update `_parse_torrent_row()`

Common changes:
- Table structure: Update `_parse_torrents()` line 101
- Link format: Update regex patterns (lines 130, 136, 140)
- Cell positions: Update index calculations (lines 158-160)

### Change Pagination

If IPTorrents changes torrents per page:

**scraper.py:119** - Update `torrents_per_page = 75`

If URL format changes:

**scraper.py:98** - Update URL format in `_fetch_single_page()`

## Troubleshooting

### Authentication Issues

**Problem:** "IPTORRENTS_COOKIE not found in .env file"

**Solution:**
1. Create `.env` file in project root
2. Add: `IPTORRENTS_COOKIE=uid=XXXXX; pass=YYYYYYY`
3. Get cookie from browser when logged into IPTorrents

**Problem:** "Could not find torrent table"

**Solution:**
- Cookie might be expired
- Get fresh cookie from browser
- Ensure you're logged in on IPTorrents

### No Torrents Found

**Problem:** Multi-page fetching stops at page 1

**Solution:**
- Check if time period is too short
- Verify torrents exist in that time range
- Check console output for error messages

### Slow Performance

**Problem:** Fetching takes too long

**Solution:**
- Reduce time period (use 7 days instead of 60)
- Check network connection
- Consider reducing `max_pages` limit (scraper.py:118)

### Cache Issues

**Problem:** Seeing old data

**Solution:**
- Click "Refresh Data" button
- Delete `cache.json` file
- Reduce `CACHE_DURATION` in app.py:17

## Development Tips

### Testing the Scraper

Run scraper standalone:
```bash
python scraper.py
```

This will fetch 10 torrents and display them.

### Debugging

Enable Flask debug mode (already on in app.py:317):
```python
app.run(debug=True, host='0.0.0.0', port=5000)
```

Add print statements:
```python
print(f"Fetching page {page_num}...")
print(f"Found {len(torrents)} torrents")
```

### Browser Console

Check browser console for errors:
- Open Developer Tools (F12)
- Look for network errors
- Check JavaScript console for errors

### Network Inspection

Monitor API calls:
1. Open Developer Tools → Network tab
2. Filter by "Fetch/XHR"
3. Click `/api/torrents` to see request/response
4. Check query parameters and response data

## Code Style

### Python
- Follow PEP 8 conventions
- Use docstrings for functions
- Type hints encouraged but not required
- Keep functions focused and single-purpose

### JavaScript
- Use `const` for constants, `let` for variables
- Async/await for API calls
- Clear function and variable names
- Comment complex logic

### HTML/CSS
- Semantic HTML5 elements
- BEM-like class naming
- Mobile-responsive design
- Accessible forms (labels, ARIA when needed)

## Security Notes

### Cookie Handling
- Cookies stored in `.env` (gitignored)
- Never commit `.env` to version control
- Cookies have session-based authentication

### Input Validation
- URL parameters sanitized by Flask
- Search queries use case-insensitive substring matching
- No direct SQL/command injection risk (no database)

### Rate Limiting
- No built-in rate limiting
- Be respectful of IPTorrents servers
- Cache reduces request frequency
- Consider adding delays between pages if needed

## Future Improvements

### Potential Features
- [ ] Configurable torrents per page
- [ ] Export results to CSV/JSON
- [ ] Save custom filter presets
- [ ] Download multiple torrents at once
- [ ] Integration with torrent clients
- [ ] Real-time updates (WebSocket)
- [ ] User authentication/sessions
- [ ] Advanced search (regex, boolean operators)
- [ ] Statistics dashboard
- [ ] Request rate limiting/throttling

### Performance Optimizations
- [ ] Parallel page fetching (asyncio)
- [ ] Incremental cache updates
- [ ] Server-side pagination
- [ ] Compressed cache storage
- [ ] Database backend (SQLite)

### UX Improvements
- [ ] Loading indicators for multi-page fetches
- [ ] Progress bar showing page fetch status
- [ ] Toast notifications
- [ ] Keyboard shortcuts
- [ ] Column visibility toggle
- [ ] Responsive mobile design improvements

## Contributing

When contributing to this project:

1. Test your changes thoroughly
2. Update this guide if adding new features
3. Follow existing code style
4. Add comments for complex logic
5. Consider performance impact
6. Test with different time periods

## License

This is a personal project. Check with the project owner for usage rights.

## Contact

For questions about this codebase, refer to the git commit history or project documentation.

---

**Last Updated:** 2026-01-01
**Version:** 1.1 (Multi-page fetching support added)
