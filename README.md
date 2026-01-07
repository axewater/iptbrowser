# IPT Browser

A modern, feature-rich web application for browsing and managing IPTorrents.com content with advanced filtering, movie metadata integration, intelligent caching, and seamless qBittorrent integration.

[![Python 3.7+](https://img.shields.io/badge/python-3.7+-blue.svg)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/flask-3.0.0-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/license-Personal-orange.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
  - [IPTorrents Cookie Setup](#iptorrents-cookie-setup)
  - [TMDB Integration (Movie Metadata)](#tmdb-integration-movie-metadata)
  - [qBittorrent Setup](#qbittorrent-setup)
- [Usage](#usage)
  - [Browsing Torrents](#browsing-torrents)
  - [Movie Features](#movie-features)
  - [Filtering & Sorting](#filtering--sorting)
  - [Adding Torrents to qBittorrent](#adding-torrents-to-qbittorrent)
- [Architecture](#architecture)
- [Advanced Features](#advanced-features)
  - [Intelligent Caching System](#intelligent-caching-system)
  - [Movie Deduplication](#movie-deduplication)
  - [Pagination](#pagination)
  - [Multi-Page Fetching](#multi-page-fetching)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Performance & Optimization](#performance--optimization)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Security Notes](#security-notes)
- [Credits](#credits)
- [License](#license)

---

## Features

### Core Features
- **🎨 Modern Web Interface** - Clean, responsive design with real-time updates
- **🔍 Advanced Filtering** - Filter by category, time period, snatched count, search terms, and exclusions
- **📊 Smart Sorting** - Sort by name, date, size, seeders, leechers, or snatched count
- **🚀 Intelligent Caching** - Multi-layer caching system for instant performance
  - Backend cache (15 minutes) for torrent listings
  - Frontend cache (7 days) for movie metadata
  - Session-level in-memory cache for zero-latency re-renders
- **🔄 Auto-Refresh** - Configurable automatic cache refresh with smart prompts
- **📱 Responsive Design** - Works seamlessly on desktop, tablet, and mobile

### Movie-Specific Features
- **🎬 TMDB Integration** - Rich movie metadata with posters, trailers, cast, and plot summaries
- **🎭 Movie Deduplication** - Intelligent grouping of different versions (2160p, 1080p, etc.)
- **📺 Expandable Versions** - View all available quality versions with one click
- **⚡ Progressive Loading** - Smooth, rate-limited metadata loading with instant cache rendering
- **🖼️ Visual Browsing** - Movie posters, IMDb ratings, and release info at a glance

### Integration & Management
- **🔐 Cookie Management** - Built-in tool for easy IPTorrents authentication setup
- **🌐 Browser Cookie Extraction** - Automatic cookie extraction from Chrome, Firefox, Edge, Brave
- **📥 qBittorrent Integration** - One-click torrent downloads directly to your client
- **👤 User Statistics** - Real-time ratio, upload/download stats, and account info
- **💾 Configuration Persistence** - All settings saved and synchronized automatically

### Developer Features
- **🔌 RESTful API** - Clean JSON endpoints for all operations
- **🏗️ Modular Architecture** - Well-organized, maintainable codebase
- **📝 Comprehensive Logging** - Detailed console logs for debugging
- **🔄 Hot Reload** - Automatic config reloading on changes
- **🧪 Test Scripts** - Standalone testing utilities included

---

## Screenshots

> **Note:** Add screenshots of your application here to showcase the interface.

**Main Interface:**
- Torrent listing with inline metadata
- Filter controls and category selection
- Sort functionality and pagination

**Movie View with TMDB Data:**
- Movie posters and cover images
- Cast, director, and plot information
- YouTube trailer links
- Expandable version groups

**Settings & Configuration:**
- Cookie manager interface
- qBittorrent configuration
- TMDB API key setup

---

## Quick Start

### Prerequisites

- **Python 3.7 or higher**
- **IPTorrents account** (active membership required)
- **(Optional)** qBittorrent with Web UI enabled
- **(Optional)** TMDB API key for movie metadata

### 5-Minute Setup

```bash
# 1. Clone or download this repository
git clone <repository-url>
cd iptbrowser

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the application
python app.py

# 4. Open your browser
# Navigate to: http://localhost:5000
```

On first run, you'll be prompted to set up your IPTorrents cookie via the built-in Cookie Manager.

---

## Installation

### Step 1: Install Dependencies

```bash
pip install -r requirements.txt
```

**Dependencies installed:**
- `flask==3.0.0` - Web framework
- `requests==2.31.0` - HTTP client for API calls
- `beautifulsoup4==4.12.2` - HTML parsing
- `python-dotenv==1.0.0` - Environment variable management
- `pywin32` - Windows-specific features (Windows only)
- `filelock` - Thread-safe file operations

### Step 2: Verify Installation

```bash
python -c "import flask, requests, bs4; print('All dependencies installed successfully!')"
```

### Step 3: Run the Application

**Local access only:**
```bash
python app.py
```
Access at: `http://localhost:5000`

**Network access (all devices on your network):**
```bash
python start_server.py
```
Access at: `http://<your-ip>:5000`

---

## Configuration

### IPTorrents Cookie Setup

IPTorrents requires authentication. You have two options:

#### Option 1: Cookie Manager (Recommended)

1. **Navigate to Cookie Manager:**
   ```
   http://localhost:5000/cookie-manager
   ```

2. **Copy Cookie from Browser:**
   - Press `F12` to open Developer Tools
   - Go to **Application** (Chrome) or **Storage** (Firefox) tab
   - Navigate to **Cookies** → `www.iptorrents.com`
   - Find cookies named `uid` and `pass`
   - Copy their values

3. **Paste into Cookie Manager:**
   ```
   uid=YOUR_UID_VALUE; pass=YOUR_PASS_VALUE
   ```

4. **Save and Test:**
   - Click "Save Changes"
   - Click "Test Cookie" to verify

#### Option 2: Manual `.env` File

Create a `.env` file in the project root:

```bash
IPTORRENTS_COOKIE=uid=YOUR_UID; pass=YOUR_PASS
```

**Cookie Format:**
```
uid=123456; pass=abcdef1234567890abcdef1234567890
```

**Cookie Expiration:**
- Cookies typically last 30-90 days
- The app will notify you when your cookie expires
- Simply extract a fresh cookie when needed

---

### TMDB Integration (Movie Metadata)

Enable rich movie metadata including posters, trailers, cast, and plot summaries.

#### Step 1: Get a TMDB API Key

1. **Create Account:**
   - Visit: https://www.themoviedb.org/signup
   - Register for a free account

2. **Request API Key:**
   - Go to: https://www.themoviedb.org/settings/api
   - Click "Request API Key"
   - Choose "Developer" option
   - Fill out the simple form (personal/educational use)

3. **Copy API Key:**
   - You'll receive an API key (v3 auth)
   - Format: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

#### Step 2: Configure in IPT Browser

1. **Open Settings Panel:**
   - Click the **gear icon** (⚙️) in the top-right corner

2. **Enter TMDB Settings:**
   - Paste your API key in the "TMDB API Key" field
   - Check "Enable TMDB Integration"
   - Click "Save Settings"

3. **Verify:**
   - Browse to a movie category (Movie/4K, Movie/BD-Rip, etc.)
   - Movie posters and metadata should appear automatically
   - Look for the "▼ More" button on movie torrents

#### Features Enabled:
- Movie posters (300px width)
- Plot summaries from TMDB
- Cast and crew information
- YouTube trailer links
- IMDb ratings and release dates
- Genre tags

#### Caching:
- TMDB data is cached in your browser for **7 days**
- Subsequent page loads and sorts are **instant** (no API calls)
- Cache persists across browser sessions

---

### qBittorrent Setup

Add torrents directly to qBittorrent with one click.

#### Step 1: Enable qBittorrent Web UI

1. **Open qBittorrent:**
   - Go to **Tools** → **Options** → **Web UI**

2. **Enable Web UI:**
   - Check "**Enable the Web User Interface (Remote control)**"
   - Set port (default: `8080`)
   - Set username (default: `admin`)
   - Set password (choose a secure password)

3. **Optional Settings:**
   - Enable "**Bypass authentication for clients on localhost**" (if running on same machine)
   - Note the IP address (usually `127.0.0.1` or `localhost`)

4. **Apply and Restart:**
   - Click "Apply"
   - Restart qBittorrent if prompted

#### Step 2: Configure in IPT Browser

1. **Open Settings Panel:**
   - Click the **gear icon** (⚙️) in the interface

2. **Enter qBittorrent Settings:**
   - **Host:** `http://localhost:8080` (or your custom port)
   - **Username:** Your qBittorrent Web UI username
   - **Password:** Your qBittorrent Web UI password

3. **Test Connection:**
   - Click "Test Connection"
   - Should display: "✓ Connected to qBittorrent successfully"

4. **Save:**
   - Click "Save Settings"

#### Troubleshooting qBittorrent Connection:

**"Connection refused":**
- Verify qBittorrent is running
- Check Web UI is enabled
- Try both `localhost` and `127.0.0.1`
- Verify port number (check qBittorrent settings)

**"Authentication failed":**
- Double-check username and password
- Ensure no extra spaces in credentials
- Check for special characters that might need escaping

**"Cannot add torrent":**
- Verify qBittorrent has write permissions to download directory
- Check qBittorrent disk space
- Ensure torrent URL is accessible

---

## Usage

### Browsing Torrents

**Select Categories:**
1. Click the **Settings icon** (⚙️)
2. Check/uncheck desired categories:
   - **Games:** PC-ISO, PC-Rip, PC-Mixed, Nintendo, Playstation, Xbox, Wii
   - **Movies:** Movie/4K, Movie/BD-Rip, Movie/HD/Bluray, Movie/Web-DL, Movie/x265
   - *(Expand categories based on your `CATEGORIES` dict)*
3. Click "Apply"

**Time Period Filtering:**
- Use the **dropdown** to select:
  - **All** - Show all cached data (fastest)
  - **7 days** - Last week's uploads
  - **30 days** - Last month
  - **60 days** - Last two months
  - **90 days** - Last three months

**Note:** Time filtering triggers multi-page fetching and may take 10-40 seconds depending on the period.

---

### Movie Features

**Viewing Movie Metadata:**
1. Browse to a movie category
2. Movie rows automatically expand showing:
   - **Movie poster** (if TMDB enabled)
   - **Plot summary**
   - **Cast and director**
   - **YouTube trailer link** (click to watch)
   - **IMDb rating, runtime, release date**

**Grouped Movie Versions:**
- Movies with multiple quality versions are **automatically grouped**
- Main row shows the **best version** (highest snatched count + quality)
- Click **"Show N versions"** to expand all available versions:
  - 2160p (4K)
  - 1080p (Blu-ray)
  - 720p (HD)
  - Different releases (WEB-DL, BluRay, etc.)

**Quality Indicators:**
- Each version shows quality badge (2160p, 1080p, etc.)
- Seeders and snatched count for each version
- Upload date for each release

---

### Filtering & Sorting

**Search:**
- Type in the **search box** to filter by torrent name
- Case-insensitive substring matching
- Real-time filtering (300ms debounce)
- Example: `"batman"` finds "The Batman 2022", "Batman Begins", etc.

**Exclude Keywords:**
- Enter comma-separated keywords to filter out
- Example: `"cam, ts, screener"` removes low-quality releases
- Useful for excluding unwanted content

**Minimum Snatched:**
- Set minimum download count to find popular torrents
- Example: `10` shows only torrents downloaded 10+ times
- Great for finding well-seeded, verified content

**Sorting:**
Click any column header to sort:
- **Name** - Alphabetical
- **Date** - Upload time (newest first)
- **Size** - File size (largest first)
- **Seeders** - Active seeders (most first)
- **Leechers** - Active leechers (most first)
- **Snatched** - Download count (most popular first)

Click again to reverse order (ascending ↔ descending).

**Pagination:**
- Default: **50 torrents per page**
- Navigate with **◀ Previous** and **Next ▶** buttons
- Page counter shows current position
- Pagination preserves filters and sort order

---

### Adding Torrents to qBittorrent

**One-Click Download:**
1. Find the torrent you want
2. Click the **download icon** (📥) in the torrent row
3. Torrent is added to qBittorrent automatically
4. Toast notification confirms success

**Download Options:**
- Torrents added to qBittorrent in **paused** state by default
- Automatic categorization in qBittorrent (preserves IPTorrents category)
- Download location uses qBittorrent's default save path

**Manual Download:**
- Right-click the **torrent name** → "Copy Link Address"
- Add manually in qBittorrent → "Add Torrent Link"

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  HTML/CSS  │  │  JavaScript │  │  localStorage Cache  │ │
│  │  Interface │  │   (app.js)  │  │   (TMDB 7-day)       │ │
│  └────────────┘  └─────────────┘  └──────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/JSON API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Flask Backend (app.py)                  │
│  ┌──────────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │  API Endpoints   │  │  Cache Layer  │  │   Config     │ │
│  │  /api/torrents   │  │  (cache.json) │  │ (config.json)│ │
│  │  /api/refresh    │  │  15 min TTL   │  │  Hot-reload  │ │
│  │  /api/qbittorrent│  └───────────────┘  └──────────────┘ │
│  └──────────────────┘                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP + Cookies
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   IPTorrents.com (scraper.py)                │
│  ┌──────────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │  Multi-page Fetch│  │  HTML Parsing  │  │  Metadata   │ │
│  │  Time-based      │  │  BeautifulSoup │  │  Extraction │ │
│  │  Pagination      │  │  Table parsing │  │  IMDB IDs   │ │
│  └──────────────────┘  └────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌────────────────────────┐        ┌────────────────────────────┐
│  qBittorrent Web UI    │        │     TMDB API               │
│  - Add torrents        │◄───────┤  - Movie metadata          │
│  - Session management  │        │  - Posters, trailers       │
└────────────────────────┘        │  - Cast, crew, plot        │
                                  └────────────────────────────┘
```

### Data Flow

**Initial Page Load:**
1. Browser requests `GET /api/torrents?mode=cache-only`
2. Flask returns cached data (15-min cache) instantly
3. JavaScript renders torrent table
4. Movie rows pre-check localStorage TMDB cache
5. Cached movies render with posters/metadata immediately
6. Uncached movies show spinner and queue for TMDB fetch
7. Progressive loader fetches metadata with 250ms delay between requests

**Sort/Filter Operations:**
1. User clicks sort column or updates filter
2. JavaScript filters/sorts data **client-side** (instant, no API call)
3. DOM rebuilds with new order
4. Movie metadata uses **session cache** (in-memory, <1ms)
5. Zero spinners for cached content
6. Zero API calls

**Refresh Data:**
1. User clicks "Refresh Data" button
2. Request: `GET /api/refresh?mode=incremental`
3. Backend fetches only **new torrents** since last update
4. Merges with existing cache
5. Returns updated data + metadata
6. Frontend displays new torrents at top

---

## Advanced Features

### Intelligent Caching System

IPT Browser uses a **three-tier caching architecture** for optimal performance:

#### Tier 1: Backend Cache (`cache.json`)
- **Duration:** 15 minutes (configurable)
- **Stores:** Raw torrent listings from IPTorrents
- **Purpose:** Avoid repeated IPTorrents scraping
- **Invalidation:** Time-based expiration or manual refresh
- **Size:** ~300KB for 1000 torrents

**Cache Structure:**
```json
{
  "metadata": {
    "created_at": "2026-01-07T10:00:00",
    "updated_at": "2026-01-07T10:15:00",
    "default_window_days": 30,
    "categories": {
      "PC-ISO": {
        "newest_timestamp": "2026-01-07T09:45:00",
        "oldest_timestamp": "2025-12-08T10:00:00",
        "count": 245
      }
    }
  },
  "data": [ /* array of torrent objects */ ]
}
```

**Refresh Modes:**
- `cache-only` - Return cached data immediately (instant)
- `incremental` - Fetch only new torrents since last update
- `full` - Complete re-fetch with specified time window

#### Tier 2: Frontend Cache (localStorage)
- **Duration:** 7 days
- **Stores:** TMDB movie metadata (posters, trailers, cast, plot)
- **Purpose:** Avoid repeated TMDB API calls
- **Storage:** Browser's localStorage API
- **Size:** ~50KB per movie × cache size

**Benefits:**
- Persists across page refreshes
- Shared across browser tabs
- No API rate limiting concerns
- Instant movie metadata rendering

#### Tier 3: Session Cache (In-Memory)
- **Duration:** Current browser session
- **Stores:** Already-loaded TMDB data from localStorage
- **Purpose:** Avoid repeated localStorage reads during sorts
- **Speed:** <0.001ms access time (RAM)

**Benefits:**
- Zero latency on repeated sorts
- Eliminates localStorage I/O overhead
- Cleared on page refresh (localStorage persists)

**Performance Impact:**
```
First page load (empty cache):     ~2-10s  (fetch + TMDB)
Second page load (cache populated): ~100ms  (cache-only)
Sort operation (session cache):     ~5ms    (client-side)
Filter operation (no cache):        ~20ms   (client-side)
```

---

### Movie Deduplication

IPT Browser intelligently groups different versions of the same movie.

#### How It Works

**Step 1: Title Normalization**
- Removes quality indicators (2160p, 1080p, BluRay, WEB-DL, etc.)
- Removes year patterns `(2024)`, `[2024]`
- Removes language tags (Multi, Hindi, English, etc.)
- Removes edition types (Extended, Director's Cut, Unrated, etc.)
- Normalizes whitespace and special characters

Example:
```
Input:  "The Batman 2022 2160p UHD BluRay x265-RELEASE"
        "The Batman 2022 1080p BluRay x264-ANOTHER"
        "The Batman (2022) 720p WEB-DL"

Normalized: "the batman"

Result: All three grouped under one expandable entry
```

**Step 2: Quality Scoring**
Each version is scored for sorting within the group:
- 2160p / 4K = 4 points
- 1080p = 3 points
- 720p = 2 points
- 480p / SD = 1 point
- Unknown = 0 points

**Step 3: Version Sorting**
Within each group, versions are sorted by:
1. **Snatched count** (most popular first)
2. **Quality score** (highest quality first)
3. **Upload date** (newest first)

**Step 4: Display**
- **Main row** shows the top-ranked version (usually most popular + highest quality)
- **"Show N versions"** button displays count of grouped versions
- Click to expand and see all versions with individual download links

#### Configuration

Enable/disable in code:
```javascript
AppState.pagination.enableDeduplication = true;  // Default: enabled
```

**Categories Eligible for Deduplication:**
- Movie/4K
- Movie/BD-Rip
- Movie/HD/Bluray
- Movie/Web-DL
- Movie/x265

Game torrents are **not deduplicated** (different games, not versions).

---

### Pagination

**Features:**
- Default: 50 torrents per page
- Configurable via `AppState.pagination.itemsPerPage`
- Navigation: Previous/Next buttons
- Page counter: "Page X of Y"
- Total results displayed below controls

**Behavior:**
- Pagination applies **after** filtering and sorting
- Changing filters/sort resets to page 1
- Page state preserved during TMDB metadata loading
- Responsive: adjusts button states (disabled on first/last page)

**Performance:**
- Only visible torrents (current page) have metadata loaded
- Scrolling through pages triggers progressive TMDB loading
- Session cache ensures instant re-rendering when returning to previous pages

---

### Multi-Page Fetching

When filtering by time period, IPT Browser automatically fetches multiple pages from IPTorrents.

#### How It Works

**URL Pattern:**
```
http://www.iptorrents.com/t?{category_id};o={offset}
```
- `category_id`: Category identifier (e.g., `43` for PC-ISO)
- `offset`: Pagination offset (increments by 75 per page)

**Fetching Strategy:**
1. Calculate cutoff timestamp: `now - (days × 24 hours)`
2. Fetch page 1 (offset=0)
3. Parse torrents and check oldest timestamp
4. If `oldest_torrent_time < cutoff_time`, **stop** (got all torrents in range)
5. Otherwise, fetch next page (offset += 75)
6. Repeat until cutoff reached or **max 50 pages** (safety limit)

**Example Timeline:**

| Time Period | Typical Pages | Fetch Time |
|-------------|---------------|------------|
| 7 days      | 1-2 pages     | 3-5s       |
| 30 days     | 4-8 pages     | 10-20s     |
| 60 days     | 8-15 pages    | 20-40s     |
| 90 days     | 12-20 pages   | 30-60s     |

**Optimization:**
- Pages fetched **sequentially** (avoid rate limiting)
- **Early exit** when cutoff reached (don't over-fetch)
- Safety limit of 50 pages (prevent runaway fetching)

**Future Enhancement:**
- Parallel fetching with `asyncio` could reduce fetch time by 50-70%

---

## API Endpoints

### Torrent Endpoints

#### `GET /api/torrents`

Fetch torrents with filtering and caching options.

**Query Parameters:**
- `mode` (string): `cache-only` | `incremental` | `full` (default: `full`)
- `categories` (string): Comma-separated category names (required)
- `days` (int): Time window in days (optional, only with `mode=full`)

**Example Requests:**
```bash
# Get cached data (instant)
GET /api/torrents?mode=cache-only&categories=PC-ISO,PC-Rip

# Incremental refresh (fetch new torrents only)
GET /api/torrents?mode=incremental&categories=PC-ISO

# Full refresh with time window
GET /api/torrents?mode=full&categories=PC-ISO&days=30
```

**Response:**
```json
{
  "torrents": [ /* array of torrent objects */ ],
  "metadata": {
    "cache_age": "5 minutes",
    "total_count": 1247,
    "categories": { /* per-category stats */ }
  }
}
```

**Torrent Object:**
```json
{
  "id": "t12345678",
  "name": "Game Title 2024 PC ISO",
  "category": "PC-ISO",
  "size": "45.2 GB",
  "seeders": 152,
  "leechers": 23,
  "snatched": 1847,
  "upload_time": "2 hours ago",
  "timestamp": 1704638400,
  "download_link": "https://www.iptorrents.com/download.php/...",
  "url": "https://www.iptorrents.com/details.php?id=12345678",
  "imdb_id": "tt1234567",  // if available
  "metadata": {
    "rating": 7.8,
    "year": 2024,
    "genres": ["Action", "Adventure"],
    "quality": "2160p",
    "uploader": "Username"
  }
}
```

---

#### `GET /api/refresh`

Force cache refresh with options for incremental or full update.

**Query Parameters:**
- `mode` (string): `incremental` | `full` (default: `incremental`)
- `days` (int): Time window for full refresh (default: 30)

**Example:**
```bash
# Quick refresh (new torrents only)
GET /api/refresh?mode=incremental

# Full refresh (30 days)
GET /api/refresh?mode=full&days=30
```

**Response:**
```json
{
  "status": "success",
  "message": "Cache refreshed successfully",
  "torrents_added": 47,
  "total_count": 1294
}
```

---

#### `GET /api/stats`

Get cache statistics and system status.

**Response:**
```json
{
  "cache": {
    "age": "12 minutes",
    "size": 1294,
    "created_at": "2026-01-07T10:00:00",
    "updated_at": "2026-01-07T10:12:00"
  },
  "categories": {
    "PC-ISO": {
      "count": 245,
      "newest": "2026-01-07T10:05:00",
      "oldest": "2025-12-08T10:00:00"
    }
  }
}
```

---

### User Endpoints

#### `GET /api/user/info`

Get current IPTorrents user information.

**Response:**
```json
{
  "username": "YourUsername",
  "ratio": 2.45,
  "uploaded": "1.2 TB",
  "downloaded": "500 GB",
  "bonus_points": 12450
}
```

---

### Cookie Endpoints

#### `GET /api/cookie/status`

Check if cookie is configured and valid.

**Response:**
```json
{
  "configured": true,
  "valid": true,
  "username": "YourUsername"
}
```

---

#### `POST /api/cookie/save`

Save IPTorrents cookie.

**Request Body:**
```json
{
  "cookie": "uid=123456; pass=abcdef..."
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Cookie saved successfully"
}
```

---

#### `POST /api/cookie/test`

Test if cookie is valid.

**Request Body:**
```json
{
  "cookie": "uid=123456; pass=abcdef..."
}
```

**Response (Success):**
```json
{
  "valid": true,
  "username": "YourUsername",
  "ratio": 2.45
}
```

**Response (Failure):**
```json
{
  "valid": false,
  "error": "Authentication failed"
}
```

---

### qBittorrent Endpoints

#### `GET /api/qbittorrent/config`

Get qBittorrent configuration status.

**Response:**
```json
{
  "enabled": true,
  "host": "http://localhost:8080",
  "connected": true
}
```

---

#### `POST /api/qbittorrent/config`

Save qBittorrent configuration.

**Request Body:**
```json
{
  "host": "http://localhost:8080",
  "username": "admin",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "qBittorrent configured successfully"
}
```

---

#### `POST /api/qbittorrent/test`

Test qBittorrent connection.

**Request Body:**
```json
{
  "host": "http://localhost:8080",
  "username": "admin",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "connected": true,
  "version": "v4.6.0"
}
```

---

#### `POST /api/qbittorrent/add`

Add torrent to qBittorrent.

**Request Body:**
```json
{
  "url": "https://www.iptorrents.com/download.php/...",
  "category": "PC-ISO",
  "paused": false
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Torrent added successfully"
}
```

---

## Project Structure

```
iptbrowser/
│
├── app.py                          # Main Flask application & API endpoints
├── scraper.py                      # IPTorrents scraper with multi-page fetching
├── config_manager.py               # Thread-safe configuration management
├── cookie_validator.py             # Cookie validation & user info extraction
├── browser_cookie_extractor.py     # Automatic browser cookie extraction
├── qbittorrent_client.py          # qBittorrent Web API client
├── start_server.py                # Network-accessible server launcher
├── requirements.txt               # Python dependencies
├── .env                           # Environment variables (not in git)
├── config.json                    # User configuration (not in git)
├── cache.json                     # Torrent cache (not in git)
│
├── templates/
│   ├── index.html                 # Main interface template
│   └── cookie_manager.html        # Cookie management interface
│
├── static/
│   ├── css/
│   │   ├── style.css              # Main application styles
│   │   └── cookie_manager.css     # Cookie manager styles
│   │
│   └── js/
│       ├── app.js                 # Main application logic
│       ├── tmdb_client.js         # TMDB API client with caching
│       ├── tmdb_manager.js        # TMDB settings management
│       └── cookie_manager.js      # Cookie manager logic
│
├── test_*.py                      # Standalone test scripts
│
├── CLAUDE.md                      # Developer documentation
├── README.md                      # This file
└── LICENSE                        # License information
```

---

## Performance & Optimization

### Caching Performance

**Backend Cache (`cache.json`):**
- Read: ~50-100ms (JSON parsing)
- Write: ~100-200ms (atomic file write)
- Size: ~1KB per torrent (compressed JSON)

**Frontend Cache (localStorage):**
- Read: ~0.1-0.5ms per item
- Write: ~1-2ms per item
- Limit: 5-10MB (browser dependent)

**Session Cache (in-memory):**
- Read: <0.001ms (RAM access)
- Write: <0.001ms (object assignment)
- Limit: Browser JavaScript heap (~100MB typical)

### Network Performance

**IPTorrents Scraping:**
- Single page: ~500-1000ms
- Multi-page (30 days): ~10-20s
- Rate limit: No enforced limit (sequential fetching recommended)

**TMDB API:**
- Movie lookup: ~200-500ms per movie
- Rate limit: 40 requests per 10 seconds
- Our implementation: 250ms delay = 4 req/sec (well under limit)

### Client-Side Performance

**Rendering:**
- Initial render (50 torrents): ~50-100ms
- Re-render on sort: ~20-50ms
- DOM updates (cached movies): ~5-10ms

**Filtering:**
- Client-side filtering (1000 torrents): ~10-20ms
- Search with 300ms debounce: Smooth, no lag
- Sort operations: Instant (<50ms)

### Optimization Tips

**For Faster Browsing:**
1. Use `cache-only` mode when possible (instant loading)
2. Enable TMDB integration (cached posters load instantly on revisits)
3. Use shorter time periods (7-30 days) for faster multi-page fetching
4. Keep selected categories under 5 for faster fetching

**For Lower Bandwidth:**
1. Disable TMDB integration (no poster downloads)
2. Use cache when possible (no IPTorrents requests)
3. Minimize time-window fetching (fetches only 1 page when no time filter)

**For Best Experience:**
1. Enable all features (TMDB, qBittorrent)
2. Let caches populate on first load
3. Subsequent loads will be nearly instant
4. Sort/filter operations are always instant (client-side)

---

## Troubleshooting

### Cookie Issues

**"Invalid cookie format" error:**
```
✗ Cookie must contain both 'uid' and 'pass'
```
**Solution:**
- Ensure cookie format: `uid=123456; pass=abcdef...`
- Both `uid` and `pass` must be present
- Check for typos or missing semicolon

---

**"Cookie validation failed" error:**
```
✗ Could not validate cookie with IPTorrents
```
**Solutions:**
1. Cookie may have expired - extract fresh cookie from browser
2. Verify you're logged into IPTorrents in your browser
3. Check internet connection
4. Try Cookie Manager's "Test Cookie" function
5. Clear browser cookies and log back into IPTorrents

---

**Cookie extraction fails:**
```
✗ Could not extract cookies from browser
```
**Solutions:**
- **Windows:** Ensure browser is fully closed (check Task Manager)
- **Linux:** Verify browser profile path is correct
- **macOS:** Grant terminal permission to access browser data
- **All platforms:** Try manual cookie copy (see Cookie Manager guide)

---

### TMDB Issues

**"TMDB API error: 401":**
```
✗ Invalid API key
```
**Solution:**
- Verify API key is correct (no extra spaces)
- Ensure API key is activated (check TMDB dashboard)
- Request new API key if needed

---

**"Movie not found in TMDB":**
```
⚠ Could not load movie data: Movie not found
```
**Reasons:**
- Movie too new (not yet in TMDB database)
- IMDB ID extraction failed from IPTorrents page
- Movie not released theatrically (direct-to-video)
- Non-English title (TMDB may not have entry)

**Solution:**
- Wait for TMDB database to update (usually within days of release)
- Check TMDB.org manually to verify movie exists

---

**TMDB images not loading:**
```
Missing posters or broken image icons
```
**Solutions:**
1. Check browser console for network errors (F12)
2. Verify TMDB image CDN is accessible: `image.tmdb.org`
3. Check if browser ad-blocker is blocking images
4. Try clearing browser cache (Ctrl+Shift+Delete)

---

### qBittorrent Issues

**"Connection refused":**
```
✗ Failed to connect to qBittorrent
```
**Solutions:**
1. Verify qBittorrent is running
2. Check Web UI is enabled:
   - Tools → Options → Web UI → ✓ Enable Web UI
3. Verify port number (default: 8080)
4. Try both:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`
5. Check firewall isn't blocking port

---

**"Authentication failed":**
```
✗ qBittorrent authentication failed
```
**Solutions:**
1. Verify username and password in qBittorrent:
   - Tools → Options → Web UI
2. Check for extra spaces in credentials
3. Try default credentials: `admin` / (your password)
4. Reset qBittorrent Web UI password if forgotten

---

**"Torrent added but not appearing":**
```
✓ Torrent added successfully (but not visible in qBittorrent)
```
**Solutions:**
1. Refresh qBittorrent interface (F5)
2. Check "Paused" category (torrents added paused by default)
3. Verify download path has write permissions
4. Check qBittorrent logs for errors

---

### Performance Issues

**Slow page loading:**
```
Page takes 10+ seconds to load
```
**Solutions:**
1. Check cache mode:
   - Use `cache-only` for instant loading
   - Avoid time filters unless needed (triggers multi-page fetch)
2. Reduce selected categories (less data to fetch)
3. Check IPTorrents.com status (site may be slow)
4. Clear old cache: Delete `cache.json` and restart

---

**High memory usage:**
```
Browser tab using excessive RAM
```
**Solutions:**
1. Disable TMDB integration if not needed
2. Reduce page size (change `itemsPerPage` to 25)
3. Clear session cache: Refresh page (F5)
4. Clear localStorage:
   ```javascript
   localStorage.removeItem('iptbrowser_tmdb_cache');
   ```

---

**Multi-page fetch timeout:**
```
Fetching stops after 1-2 pages
```
**Solutions:**
1. Check console for errors (F12)
2. Verify cookie is still valid
3. Try shorter time period (7-30 days)
4. Check IPTorrents isn't rate-limiting
5. Restart app and try again

---

### General Issues

**"Port already in use" error:**
```
OSError: [Errno 98] Address already in use
```
**Solution:**
```bash
# Find process using port 5000
lsof -i :5000          # macOS/Linux
netstat -ano | findstr :5000    # Windows

# Kill the process and restart
```

---

**Changes not appearing:**
```
Modified code but no changes visible
```
**Solutions:**
1. Hard refresh browser: `Ctrl+Shift+R` (or `Cmd+Shift+R`)
2. Clear browser cache
3. Restart Flask app (picks up Python changes)
4. Check Flask debug mode is enabled (auto-reload)

---

**"Config not found" on startup:**
```
Config file not found, creating default...
```
**This is normal:**
- `config.json` is created automatically on first run
- Not an error, just informational

---

## Development

### Developer Documentation

See **[CLAUDE.md](CLAUDE.md)** for comprehensive developer documentation including:
- Architecture deep-dive
- Code style guidelines
- Adding new features
- Testing strategies
- Debugging tips
- Performance optimization
- API endpoint details

### Running in Debug Mode

```python
# app.py (line 1063)
app.run(debug=True, host='0.0.0.0', port=5000)
```

**Debug mode features:**
- Auto-reload on code changes
- Detailed error pages
- Interactive debugger in browser
- Verbose logging to console

### Testing

**Run standalone scraper:**
```bash
python scraper.py
```
Fetches 10 torrents and prints to console.

**Test cookie validation:**
```bash
python cookie_validator.py
```

**Test IMDB extraction:**
```bash
python test_imdb_extraction.py
```

**Test live scraping:**
```bash
python test_live_scrape.py
```

### Contributing

**Code Style:**
- Python: PEP 8
- JavaScript: ES6+ with `const`/`let`, async/await
- Comments: Descriptive docstrings for functions
- Naming: Descriptive variable names (no single letters except loops)

**Before Submitting:**
1. Test all functionality (cookie, TMDB, qBittorrent)
2. Ensure no sensitive data in commits
3. Update README if adding features
4. Add comments to complex logic
5. Verify compatibility with existing features

---

## Security Notes

### Sensitive Data

**NEVER commit these files to version control:**
- `.env` - Contains IPTorrents cookie
- `config.json` - Contains all credentials (cookie, qBittorrent, TMDB)
- `cache.json` - May contain user data
- `*.log` - May contain sensitive information

**Already in `.gitignore`:**
```gitignore
.env
config.json
cache.json
*.log
__pycache__/
venv/
```

### Cookie Security

- Cookies stored **locally only** (not transmitted to external services)
- Cookie extraction requires **local browser database access**
- No external transmission except to IPTorrents (HTTPS)
- Cookies expire periodically (refresh required)

### qBittorrent Security

- Credentials stored in `config.json` (local only)
- No external transmission
- Uses qBittorrent's built-in authentication
- Recommend strong password for Web UI

### TMDB API Key

- Free tier API key (public endpoints)
- Cached responses reduce API calls
- No personal data transmitted
- Rate limiting prevents abuse

### Network Security

- Application runs on `localhost` by default
- Network mode (`start_server.py`) exposes to LAN
- No built-in authentication (runs on trusted network)
- Use firewall rules if exposing to untrusted networks

### Best Practices

1. **Keep cookie fresh** - Rotate every 30-60 days
2. **Secure qBittorrent** - Strong Web UI password
3. **Firewall** - Block external access if not needed
4. **Updates** - Keep dependencies updated (`pip install -U -r requirements.txt`)
5. **Backups** - Back up `config.json` (excluding from public repos)

---

## Credits

**Built With:**
- [Flask](https://flask.palletsprojects.com/) - Python web framework
- [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/) - HTML parsing
- [Requests](https://requests.readthedocs.io/) - HTTP library
- [TMDB API](https://www.themoviedb.org/documentation/api) - Movie metadata

**Inspired By:**
- Modern web application design patterns
- User-friendly torrent management tools
- Community-driven feature requests

**Special Thanks:**
- IPTorrents for providing the service
- TMDB for free movie metadata API
- Open source community for dependencies

---

## License

**Personal Project**

This is a personal tool for browsing IPTorrents. Usage rights determined by repository owner.

**Dependencies:**
- All dependencies are open source with permissive licenses
- See individual package licenses for details

**Usage Notes:**
- Requires active IPTorrents membership
- Complies with IPTorrents terms of service
- For personal use only
- Not affiliated with IPTorrents

---

## Support & Feedback

**Issues:**
Report bugs or request features via GitHub Issues (if public repo).

**Updates:**
Check repository for updates and new features.

**Documentation:**
- User guide: This README
- Developer guide: [CLAUDE.md](CLAUDE.md)
- API reference: See [API Endpoints](#api-endpoints) section

---

**Version:** 2.1.0
**Last Updated:** 2026-01-07
**Minimum Python:** 3.7+
**Tested On:** Windows 10/11, Ubuntu 20.04+, macOS 12+

---

**Happy Browsing! 🎮🎬📥**
