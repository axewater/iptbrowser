# IPT Browser

A modern web interface for browsing and managing IPTorrents.com content with advanced filtering, cookie management, and direct qBittorrent integration.

## Features

- **Enhanced Browsing**: Clean, responsive interface for browsing IPTorrents listings
- **Advanced Filtering**: Filter by category, time period, snatched count, and keywords
- **Smart Caching**: 15-minute cache with incremental updates for faster browsing
- **Cookie Management**: Easy-to-follow guide for setting up IPTorrents authentication
- **qBittorrent Integration**: Add torrents directly to your qBittorrent client with one click
- **Multi-Page Fetching**: Automatically fetches multiple pages based on time periods
- **Real-Time Stats**: Monitor cache status, user info, and download statistics

## Quick Start

### Prerequisites

- Python 3.7 or higher
- IPTorrents account
- (Optional) qBittorrent with Web UI enabled

### Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up your IPTorrents cookie:**

   You can either:
   - Use the built-in Cookie Manager (recommended)
   - Manually add to `.env` file: `IPTORRENTS_COOKIE=uid=YOUR_UID; pass=YOUR_PASS`

4. **Run the application:**
   ```bash
   python app.py
   ```

5. **Access the interface:**
   - Local: http://localhost:5000
   - Network: Run `python start_server.py` for network access

## Cookie Management

The built-in Cookie Manager helps you set up your IPTorrents authentication:

1. Navigate to http://localhost:5000/cookie-manager
2. Follow the step-by-step instructions to copy your cookie from your browser
3. Paste the cookie into the Cookie Value field
4. Click "Save Changes"
5. Test the cookie to verify it works

**Note:** Modern browsers use app-bound encryption that prevents automatic cookie extraction. You'll need to manually copy cookies from your browser's Developer Tools (F12).

## qBittorrent Setup

1. Enable qBittorrent Web UI:
   - Tools → Options → Web UI → Enable Web UI
   - Note the port (default: 8080)
   - Set username and password

2. Configure in IPT Browser:
   - Click Settings icon in the interface
   - Enter qBittorrent host (e.g., `http://localhost:8080`)
   - Enter username and password
   - Click "Test Connection"

3. Add torrents:
   - Browse torrents in the main interface
   - Click the download icon on any torrent
   - Torrent will be added directly to qBittorrent

## Usage

### Filtering Torrents

**By Category:**
- Check/uncheck categories in the sidebar
- Multiple categories can be selected

**By Time Period:**
- Select from dropdown: 7 days, 30 days, 60 days, or 90 days
- Automatically fetches multiple pages to get all torrents in the time range

**By Snatched Count:**
- Set minimum download count to find popular torrents

**By Keywords:**
- Search: Find torrents containing specific terms
- Exclude: Filter out torrents with unwanted keywords (comma-separated)

### Sorting

Click column headers to sort by:
- Name
- Date (upload time)
- Size
- Seeders
- Snatched count

### Settings Panel

Access via the gear icon:
- Manage selected categories
- Configure qBittorrent connection
- View connection status

## Project Structure

```
iptbrowser/
├── app.py                          # Main Flask application
├── scraper.py                      # IPTorrents scraper
├── config_manager.py               # Configuration management
├── cookie_validator.py             # Cookie validation
├── browser_cookie_extractor.py     # Browser cookie extraction
├── qbittorrent_client.py          # qBittorrent API client
├── start_server.py                # Network server launcher
├── requirements.txt               # Python dependencies
├── templates/
│   ├── index.html                 # Main interface
│   └── cookie_manager.html        # Cookie management UI
└── static/
    ├── css/
    │   ├── style.css              # Main styles
    │   └── cookie_manager.css     # Cookie manager styles
    └── js/
        ├── app.js                 # Main application logic
        └── cookie_manager.js      # Cookie manager logic
```

## Configuration

Configuration is stored in `config.json` (auto-created):

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

## Troubleshooting

### Cookie Issues

**"Invalid cookie" error:**
- Cookie may have expired - extract a fresh one
- Make sure you're logged into IPTorrents in your browser
- Try the Cookie Manager's test function

**Cookie extraction fails:**
- Make sure your browser is installed
- Close your browser and try again
- On Linux, ensure browser profile paths are correct

### qBittorrent Connection Issues

**"Connection refused":**
- Verify qBittorrent is running
- Check Web UI is enabled (Tools → Options → Web UI)
- Confirm the port number matches
- Try `http://localhost:8080` (not `127.0.0.1`)

**"Authentication failed":**
- Verify username and password in qBittorrent settings
- Check for spaces or special characters in credentials

### Performance

**Slow loading with time filters:**
- Multi-page fetching takes longer (expected behavior)
- Shorter time periods (7 days) load faster
- Use cache when possible (no time filter)

**Cache not updating:**
- Click "Refresh Data" to force update
- Cache auto-expires after 15 minutes
- Delete `cache.json` to clear cache manually

## Development

See [CLAUDE.md](CLAUDE.md) for detailed developer documentation.

## Security Notes

- `.env` and `config.json` contain sensitive data - never commit them to version control
- Cookie extraction requires local browser database access
- qBittorrent credentials are stored locally
- All data stays on your machine - no external services

## License

Personal project - see repository owner for usage rights.

## Credits

Built with Flask, BeautifulSoup4, and modern web standards.
