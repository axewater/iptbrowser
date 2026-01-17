"""
IPTorrents Browser - Flask Web Application
Provides a better filtering interface for IPTorrents
"""

import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request
from scraper import IPTorrentsScraper, CATEGORIES
from config_manager import ConfigManager
from qbittorrent_client import QbittorrentClient, AuthenticationError, ConnectionError, TorrentAddError
from igdb_client import IGDBClient, IGDB_PLATFORMS

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Global config manager and scraper instances
config_manager = ConfigManager()
scraper_instance = None
qbt_client = None
igdb_client = None


def get_qbt_client():
    """Get or create qBittorrent client instance"""
    global qbt_client
    if qbt_client is None:
        qbt_client = QbittorrentClient(config_manager)
    return qbt_client


def get_igdb_client():
    """Get or create IGDB client instance"""
    global igdb_client
    if igdb_client is None:
        igdb_client = IGDBClient(config_manager)
    return igdb_client

# Cache configuration
CACHE_FILE = 'cache.json'
CACHE_DURATION = 15  # minutes
DEFAULT_TIME_WINDOW_DAYS = 30  # Default time window for fetching torrents

# Global cache with enhanced metadata structure
torrents_cache = {
    'metadata': {
        'created_at': None,
        'updated_at': None,
        'default_window_days': DEFAULT_TIME_WINDOW_DAYS,
        'categories': {}  # Will store per-category metadata
    },
    'data': []
}


def get_scraper():
    """Get or create scraper instance (for hot reload support)"""
    global scraper_instance
    if scraper_instance is None:
        scraper_instance = IPTorrentsScraper(config_manager=config_manager)
    return scraper_instance


def mask_cookie(cookie_string):
    """
    Mask cookie for security (show first/last 4 chars)

    Args:
        cookie_string: Cookie string like "uid=123456; pass=abcdef"

    Returns:
        str: Masked cookie like "uid=1234...56; pass=abcd...ef"
    """
    if not cookie_string or len(cookie_string) < 20:
        return '****'

    parts = []
    for item in cookie_string.split('; '):
        if '=' in item:
            key, value = item.split('=', 1)
            if len(value) > 8:
                masked = f"{value[:4]}...{value[-4:]}"
            else:
                masked = '****'
            parts.append(f"{key}={masked}")

    return '; '.join(parts)


def load_cache():
    """Load torrents from cache file with migration from old format"""
    global torrents_cache

    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)

                # Check if this is old format (has 'timestamp' at root level)
                if 'timestamp' in data and 'metadata' not in data:
                    print("Migrating cache from old format to new format...")
                    # Old format - migrate to new structure
                    torrents_data = data.get('data', [])

                    # Convert timestamp strings back to datetime for torrents
                    for torrent in torrents_data:
                        if 'timestamp' in torrent:
                            torrent['timestamp'] = datetime.fromisoformat(torrent['timestamp'])

                    # Build metadata from existing data
                    cache_timestamp = datetime.fromisoformat(data['timestamp']) if data.get('timestamp') else None
                    categories_meta = _build_category_metadata(torrents_data)

                    torrents_cache = {
                        'metadata': {
                            'created_at': cache_timestamp,
                            'updated_at': cache_timestamp,
                            'default_window_days': DEFAULT_TIME_WINDOW_DAYS,
                            'categories': categories_meta
                        },
                        'data': torrents_data
                    }

                    # Save migrated cache
                    save_cache()
                    print(f"Migrated {len(torrents_data)} torrents to new cache format")

                else:
                    # New format - load directly
                    torrents_data = data.get('data', [])

                    # Convert timestamp strings back to datetime for torrents
                    for torrent in torrents_data:
                        if 'timestamp' in torrent:
                            torrent['timestamp'] = datetime.fromisoformat(torrent['timestamp'])

                    # Load metadata
                    metadata = data.get('metadata', {})
                    if 'created_at' in metadata and metadata['created_at']:
                        metadata['created_at'] = datetime.fromisoformat(metadata['created_at'])
                    if 'updated_at' in metadata and metadata['updated_at']:
                        metadata['updated_at'] = datetime.fromisoformat(metadata['updated_at'])

                    # Convert timestamp strings in category metadata
                    for cat_meta in metadata.get('categories', {}).values():
                        if 'newest_timestamp' in cat_meta and cat_meta['newest_timestamp']:
                            cat_meta['newest_timestamp'] = datetime.fromisoformat(cat_meta['newest_timestamp'])
                        if 'oldest_timestamp' in cat_meta and cat_meta['oldest_timestamp']:
                            cat_meta['oldest_timestamp'] = datetime.fromisoformat(cat_meta['oldest_timestamp'])

                    torrents_cache = {
                        'metadata': metadata,
                        'data': torrents_data
                    }

                    print(f"Loaded {len(torrents_data)} torrents from cache (new format)")

        except Exception as e:
            print(f"Error loading cache: {e}")


def _build_category_metadata(torrents):
    """Build category metadata from torrent data"""
    categories_meta = {}

    for torrent in torrents:
        cat = torrent.get('category')
        if not cat:
            continue

        if cat not in categories_meta:
            categories_meta[cat] = {
                'newest_timestamp': torrent['timestamp'],
                'oldest_timestamp': torrent['timestamp'],
                'count': 0
            }

        cat_meta = categories_meta[cat]
        cat_meta['count'] += 1

        # Update newest/oldest timestamps
        if torrent['timestamp'] > cat_meta['newest_timestamp']:
            cat_meta['newest_timestamp'] = torrent['timestamp']
        if torrent['timestamp'] < cat_meta['oldest_timestamp']:
            cat_meta['oldest_timestamp'] = torrent['timestamp']

    return categories_meta


def save_cache():
    """Save torrents to cache file with metadata"""
    try:
        # Convert datetime objects to ISO strings for JSON serialization
        cache_data = {
            'metadata': {
                'created_at': None,
                'updated_at': None,
                'default_window_days': DEFAULT_TIME_WINDOW_DAYS,
                'categories': {}
            },
            'data': []
        }

        # Convert metadata timestamps
        metadata = torrents_cache.get('metadata', {})
        if metadata.get('created_at'):
            cache_data['metadata']['created_at'] = metadata['created_at'].isoformat()
        if metadata.get('updated_at'):
            cache_data['metadata']['updated_at'] = metadata['updated_at'].isoformat()

        cache_data['metadata']['default_window_days'] = metadata.get('default_window_days', DEFAULT_TIME_WINDOW_DAYS)

        # Convert category metadata timestamps
        for cat, cat_meta in metadata.get('categories', {}).items():
            cache_data['metadata']['categories'][cat] = {
                'newest_timestamp': cat_meta['newest_timestamp'].isoformat() if cat_meta.get('newest_timestamp') else None,
                'oldest_timestamp': cat_meta['oldest_timestamp'].isoformat() if cat_meta.get('oldest_timestamp') else None,
                'count': cat_meta.get('count', 0)
            }

        # Convert torrent timestamps
        for torrent in torrents_cache['data']:
            torrent_copy = torrent.copy()
            if 'timestamp' in torrent_copy:
                torrent_copy['timestamp'] = torrent_copy['timestamp'].isoformat()
            cache_data['data'].append(torrent_copy)

        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, indent=2, ensure_ascii=False)

        print(f"Saved {len(torrents_cache['data'])} torrents to cache")
    except Exception as e:
        print(f"Error saving cache: {e}")


def is_cache_valid():
    """Check if cache is still valid"""
    metadata = torrents_cache.get('metadata', {})
    updated_at = metadata.get('updated_at')

    if not updated_at:
        return False

    age = datetime.now() - updated_at
    return age < timedelta(minutes=CACHE_DURATION)


def refresh_torrents(mode='full', categories=None, days=None, force=False):
    """
    Refresh torrent data from IPTorrents with mode-based caching

    Args:
        mode: Fetch mode ('cache-only', 'incremental', 'full')
        categories: List of categories to fetch (default: PC-ISO, PC-Rip)
        days: Number of days back to fetch for full mode (default: DEFAULT_TIME_WINDOW_DAYS)
        force: Force full refresh even if cache is valid (legacy support)

    Returns:
        tuple: (torrents list, metadata dict)
    """
    global torrents_cache

    # Default categories if not specified
    if categories is None:
        categories = ['PC-ISO', 'PC-Rip']

    # Default days for full fetch
    if days is None and mode == 'full':
        days = torrents_cache.get('metadata', {}).get('default_window_days', DEFAULT_TIME_WINDOW_DAYS)

    # Mode: cache-only - return cached data immediately
    if mode == 'cache-only':
        print("Using cached data (cache-only mode)")
        return torrents_cache['data'], _get_cache_metadata()

    # Mode: incremental - fetch only new torrents
    if mode == 'incremental':
        if not force:
            print("Fetching incremental updates...")
            new_count = _incremental_refresh(categories)
            return torrents_cache['data'], _get_cache_metadata(fetched_new=new_count)

    # Mode: full - fetch complete time window
    if mode == 'full' or force or not is_cache_valid():
        print(f"Fetching full data (last {days} days)...")

        try:
            scraper = get_scraper()
            torrents = scraper.fetch_torrents(categories=categories, days=days)

            # Build category metadata
            categories_meta = _build_category_metadata(torrents)

            # Update cache with new data
            now = datetime.now()
            metadata = torrents_cache.get('metadata', {})

            # Preserve created_at if it exists
            created_at = metadata.get('created_at', now)

            torrents_cache['metadata'] = {
                'created_at': created_at,
                'updated_at': now,
                'default_window_days': days,
                'categories': categories_meta
            }

            # Deduplicate by torrent ID before caching (safety check)
            unique_torrents = {}
            for t in torrents:
                if t['id'] not in unique_torrents:
                    unique_torrents[t['id']] = t

            deduplicated = list(unique_torrents.values())
            if len(deduplicated) < len(torrents):
                print(f"  [SAFETY] Removed {len(torrents) - len(deduplicated)} duplicate torrents before caching")

            torrents_cache['data'] = deduplicated

            save_cache()

            return deduplicated, _get_cache_metadata(fetched_new=len(deduplicated))

        except Exception as e:
            print(f"Error fetching torrents: {e}")
            # Return cached data if available
            return torrents_cache['data'], _get_cache_metadata()

    # Use cache if valid
    print("Using cached data")
    return torrents_cache['data'], _get_cache_metadata()


def _incremental_refresh(categories):
    """
    Fetch only new torrents since last cache update

    Args:
        categories: List of categories to fetch

    Returns:
        int: Number of new torrents added
    """
    global torrents_cache

    try:
        # Get newest timestamps for each category from cache
        cache_meta = torrents_cache.get('metadata', {})
        categories_meta = cache_meta.get('categories', {})

        newest_timestamps = {}
        for cat in categories:
            if cat in categories_meta:
                newest_timestamps[cat] = categories_meta[cat].get('newest_timestamp')

        # Fetch incremental updates
        scraper = get_scraper()
        new_torrents = scraper.fetch_incremental(categories, newest_timestamps)

        if not new_torrents:
            print("  No new torrents found")
            return 0

        # Merge new torrents with existing data
        existing_ids = {t['id'] for t in torrents_cache['data'] if t.get('id')}

        added = 0
        for torrent in new_torrents:
            if torrent['id'] not in existing_ids:
                torrents_cache['data'].append(torrent)
                added += 1

        # Sort by timestamp (newest first)
        torrents_cache['data'].sort(key=lambda x: x['timestamp'], reverse=True)

        # Update metadata
        categories_meta = _build_category_metadata(torrents_cache['data'])
        torrents_cache['metadata']['updated_at'] = datetime.now()
        torrents_cache['metadata']['categories'] = categories_meta

        save_cache()

        print(f"  Added {added} new torrents")
        return added

    except Exception as e:
        print(f"Error in incremental refresh: {e}")
        return 0


def _get_cache_metadata(fetched_new=0):
    """Get cache metadata for API responses"""
    metadata = torrents_cache.get('metadata', {})
    updated_at = metadata.get('updated_at')

    cache_age = None
    if updated_at:
        age_seconds = (datetime.now() - updated_at).total_seconds()
        age_minutes = int(age_seconds / 60)
        if age_minutes < 60:
            cache_age = f"{age_minutes} minutes ago"
        else:
            cache_age = f"{int(age_minutes / 60)} hours ago"

    return {
        'cache_age': cache_age,
        'categories': {k: {'count': v.get('count', 0)} for k, v in metadata.get('categories', {}).items()},
        'fetched_new': fetched_new,
        'total_torrents': len(torrents_cache['data'])
    }


def filter_torrents(torrents, filters):
    """
    Apply filters to torrent list (optimized for 2-3x faster performance)

    Filters:
        - categories: List of category names
        - days: Number of days back
        - min_snatched: Minimum snatched count
        - exclude: Comma-separated keywords to exclude
        - search: Search query for torrent names
    """
    # Pre-calculate filter conditions for efficiency
    cat_set = None
    cutoff_timestamp = None
    min_snatched_val = None
    exclude_keywords = None
    search_query = None

    # Prepare category filter (use set for O(1) lookup)
    if 'categories' in filters and filters['categories']:
        cats = filters['categories']
        if isinstance(cats, str):
            cats = [cats]
        cat_set = set(cats)

    # Prepare date filter
    if 'days' in filters and filters['days']:
        try:
            days = int(filters['days'])
            cutoff_timestamp = datetime.now() - timedelta(days=days)
        except ValueError:
            pass

    # Prepare snatched filter
    if 'min_snatched' in filters and filters['min_snatched']:
        try:
            min_snatched_val = int(filters['min_snatched'])
        except ValueError:
            pass

    # Prepare exclude keywords filter
    if 'exclude' in filters and filters['exclude']:
        exclude_keywords = [kw.strip().lower() for kw in filters['exclude'].split(',') if kw.strip()]

    # Prepare search query
    if 'search' in filters and filters['search']:
        search_query = filters['search'].lower()

    # Single-pass filtering (more efficient than multiple list comprehensions)
    filtered = []
    for t in torrents:
        # Category filter
        if cat_set and t['category'] not in cat_set:
            continue

        # Date filter
        if cutoff_timestamp and t['timestamp'] < cutoff_timestamp:
            continue

        # Snatched filter
        if min_snatched_val is not None and t['snatched'] < min_snatched_val:
            continue

        # Exclude keywords filter
        if exclude_keywords:
            name_lower = t['name'].lower()
            if any(keyword in name_lower for keyword in exclude_keywords):
                continue

        # Search query filter
        if search_query:
            if search_query not in t['name'].lower():
                continue

        filtered.append(t)

    return filtered


def sort_torrents(torrents, sort_by='snatched', order='desc'):
    """
    Sort torrents by specified field

    Args:
        torrents: List of torrents
        sort_by: Field to sort by (snatched, date, size, seeders, name)
        order: Sort order (asc or desc)
    """
    reverse = (order == 'desc')

    if sort_by == 'snatched':
        return sorted(torrents, key=lambda x: x['snatched'], reverse=reverse)
    elif sort_by == 'date':
        return sorted(torrents, key=lambda x: x['timestamp'], reverse=reverse)
    elif sort_by == 'seeders':
        return sorted(torrents, key=lambda x: x['seeders'], reverse=reverse)
    elif sort_by == 'name':
        return sorted(torrents, key=lambda x: x['name'].lower(), reverse=reverse)
    elif sort_by == 'size':
        # Parse size for sorting (convert to MB)
        def size_to_mb(size_str):
            import re
            match = re.search(r'([\d.]+)\s*(GB|MB|TB)', size_str, re.I)
            if not match:
                return 0
            value = float(match.group(1))
            unit = match.group(2).upper()
            if unit == 'GB':
                return value * 1024
            elif unit == 'TB':
                return value * 1024 * 1024
            return value

        return sorted(torrents, key=lambda x: size_to_mb(x['size']), reverse=reverse)

    return torrents


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html', categories=CATEGORIES)


@app.route('/api/torrents')
def api_torrents():
    """
    API endpoint to fetch torrents with mode-based caching

    Query parameters:
        - mode: Fetch mode ('cache-only', 'incremental', 'full') - default: 'full'
        - categories: Comma-separated category names
        - days: Number of days back (for 'full' mode only) - default: user's setting or DEFAULT_TIME_WINDOW_DAYS

    NOTE: Filtering and sorting have been moved to client-side for better performance.
          This endpoint returns the full dataset (unfiltered).
    """
    # Parse mode
    mode = request.args.get('mode', 'full')

    # Parse categories
    categories = None
    if request.args.get('categories'):
        categories = request.args.get('categories').split(',')

    # Parse days (for full mode)
    days = None
    if request.args.get('days'):
        try:
            days = int(request.args.get('days'))
        except ValueError:
            days = None

    # Fetch torrents with new mode-based caching
    torrents, metadata = refresh_torrents(mode=mode, categories=categories, days=days)

    # Filter by categories (only if specified and different from defaults)
    if categories:
        torrents = [t for t in torrents if t['category'] in categories]

    # Convert datetime objects to strings for JSON
    result = []
    for torrent in torrents:
        t = torrent.copy()
        if 'timestamp' in t:
            t['timestamp'] = t['timestamp'].isoformat()
        result.append(t)

    return jsonify({
        'torrents': result,  # Full dataset (unfiltered by other parameters)
        'metadata': metadata,  # Cache metadata
        'count': len(result)  # For backward compatibility
    })


@app.route('/api/refresh')
def api_refresh():
    """
    Refresh torrent data

    Query parameters:
        - force: 'true' for full refresh, otherwise incremental (default: incremental)
        - categories: Comma-separated category names
        - days: Number of days back for full refresh
    """
    # Parse parameters
    force = request.args.get('force', 'false').lower() == 'true'
    categories = None
    if request.args.get('categories'):
        categories = request.args.get('categories').split(',')

    days = None
    if request.args.get('days'):
        try:
            days = int(request.args.get('days'))
        except ValueError:
            days = None

    # Determine mode based on force parameter
    mode = 'full' if force else 'incremental'

    # Refresh torrents
    torrents, metadata = refresh_torrents(mode=mode, categories=categories, days=days, force=force)

    return jsonify({
        'success': True,
        'count': len(torrents),
        'new_torrents': metadata.get('fetched_new', 0),
        'mode_used': mode,
        'message': f"{'Full refresh' if mode == 'full' else 'Incremental refresh'}: {metadata.get('fetched_new', 0)} new torrents"
    })


@app.route('/api/stats')
def api_stats():
    """Get statistics about cached torrents"""
    torrents = torrents_cache['data']
    metadata = torrents_cache.get('metadata', {})

    if not torrents:
        return jsonify({
            'total': 0,
            'cache_age': None,
            'cache_valid': False
        })

    # Get cache age
    cache_age = None
    updated_at = metadata.get('updated_at')
    if updated_at:
        age_seconds = (datetime.now() - updated_at).total_seconds()
        age_minutes = int(age_seconds / 60)
        if age_minutes < 60:
            cache_age = f"{age_minutes} minutes ago"
        else:
            cache_age = f"{int(age_minutes / 60)} hours ago"

    # Get category stats from metadata
    categories_count = {}
    for cat, cat_meta in metadata.get('categories', {}).items():
        categories_count[cat] = cat_meta.get('count', 0)

    return jsonify({
        'total': len(torrents),
        'cache_age': cache_age,
        'categories': categories_count,
        'cache_valid': is_cache_valid(),
        'default_window_days': metadata.get('default_window_days', DEFAULT_TIME_WINDOW_DAYS)
    })


# ============================================================================
# Cookie Manager Routes
# ============================================================================

@app.route('/cookie-manager')
def cookie_manager():
    """Cookie manager page"""
    return render_template('cookie_manager.html')


@app.route('/qbittorrent-manager')
def qbittorrent_manager():
    """qBittorrent manager page"""
    return render_template('qbittorrent_manager.html')


@app.route('/tmdb-manager')
def tmdb_manager():
    """TMDB (movie metadata) manager page"""
    return render_template('tmdb_manager.html')


@app.route('/api/cookie/status')
def api_cookie_status():
    """Get current cookie status"""
    try:
        cookie = config_manager.get_cookie()
        last_validated = config_manager.get_last_validated()

        # Mask cookie for security
        masked_cookie = mask_cookie(cookie) if cookie else None

        return jsonify({
            'has_cookie': bool(cookie),
            'masked_cookie': masked_cookie,
            'last_validated': last_validated.isoformat() if last_validated else None,
            'validation_status': config_manager.get_validation_status(),
            'expiry_detected': config_manager.get_expiry_detected(),
            'source': 'config.json'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/get')
def api_cookie_get():
    """Get cookie value (optionally unmasked for editing)"""
    try:
        unmask = request.args.get('unmask', 'false').lower() == 'true'
        cookie = config_manager.get_cookie()

        if unmask:
            # Return full cookie (for editing)
            return jsonify({
                'cookie': cookie,
                'masked': False
            })
        else:
            # Return masked cookie
            return jsonify({
                'cookie': mask_cookie(cookie) if cookie else None,
                'masked': True
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/set', methods=['POST'])
def api_cookie_set():
    """Set new cookie value"""
    try:
        data = request.get_json()
        new_cookie = data.get('cookie', '').strip()

        if not new_cookie:
            return jsonify({'error': 'Cookie value required'}), 400

        # Validate format (basic check)
        if 'uid=' not in new_cookie or 'pass=' not in new_cookie:
            return jsonify({
                'error': 'Invalid cookie format. Expected: uid=...; pass=...'
            }), 400

        # Save cookie
        config_manager.set_cookie(new_cookie)

        # Hot reload scraper
        global scraper_instance
        if scraper_instance:
            try:
                scraper_instance.reload_cookie()
            except Exception as e:
                print(f"Warning: Could not reload scraper: {e}")
                # Reset scraper instance to force recreation
                scraper_instance = None

        return jsonify({
            'success': True,
            'message': 'Cookie updated successfully (hot reloaded)'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/test', methods=['POST'])
def api_cookie_test():
    """Test cookie validity"""
    try:
        from cookie_validator import CookieValidator

        data = request.get_json() or {}
        cookie = data.get('cookie')

        # Use current cookie if not provided
        if not cookie:
            cookie = config_manager.get_cookie()

        if not cookie:
            return jsonify({'error': 'No cookie to test'}), 400

        # Validate cookie
        validator = CookieValidator()
        result = validator.test_cookie(cookie)

        # Update config with validation result
        if result['valid']:
            config_manager.mark_validated('valid', False)
        else:
            status = 'expired' if result.get('expiry_detected') else 'invalid'
            config_manager.mark_validated(status, result.get('expiry_detected', False))

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/browsers')
def api_cookie_browsers():
    """Detect available browsers"""
    try:
        from browser_cookie_extractor import BrowserCookieExtractor

        extractor = BrowserCookieExtractor()
        browsers = extractor.detect_browsers()

        return jsonify({
            'browsers': browsers
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/extract', methods=['POST'])
def api_cookie_extract():
    """Extract cookie from browser"""
    try:
        from browser_cookie_extractor import BrowserCookieExtractor

        data = request.get_json()
        browser = data.get('browser', 'chrome').lower()
        profile = data.get('profile', 'Default')

        extractor = BrowserCookieExtractor()

        # Extract based on browser type
        if browser == 'chrome':
            result = extractor.extract_from_chrome(profile)
        elif browser == 'edge':
            result = extractor.extract_from_edge(profile)
        elif browser == 'brave':
            result = extractor.extract_from_brave(profile)
        elif browser == 'firefox':
            result = extractor.extract_from_firefox(profile)
        else:
            return jsonify({'error': f'Unsupported browser: {browser}'}), 400

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cookie/reload', methods=['POST'])
def api_cookie_reload():
    """Reload cookie in scraper without restart"""
    try:
        config_manager.load_config()

        global scraper_instance
        if scraper_instance:
            scraper_instance.reload_cookie()
        else:
            # Create new scraper instance
            scraper_instance = get_scraper()

        return jsonify({
            'success': True,
            'message': 'Cookie reloaded successfully'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/user/info')
def api_user_info():
    """Get current user info from cookie validation"""
    try:
        from cookie_validator import CookieValidator

        cookie = config_manager.get_cookie()

        if not cookie:
            return jsonify({
                'logged_in': False,
                'user_info': None
            })

        # Validate cookie and extract user info
        validator = CookieValidator()
        result = validator.test_cookie(cookie)

        if result.get('valid') and result.get('user_info'):
            return jsonify({
                'logged_in': True,
                'user_info': result['user_info']
            })
        else:
            return jsonify({
                'logged_in': False,
                'user_info': None,
                'message': result.get('message', 'Cookie validation failed')
            })

    except Exception as e:
        return jsonify({
            'logged_in': False,
            'user_info': None,
            'error': str(e)
        }), 500


# ============================================================================
# qBittorrent Integration Routes
# ============================================================================

@app.route('/api/qbittorrent/status')
def api_qbittorrent_status():
    """Get qBittorrent integration status"""
    try:
        config = config_manager.get_qbittorrent_config()

        return jsonify({
            'enabled': config.get('enabled', False),
            'host': config.get('host', ''),
            'connected': False  # Will be determined by actual connection test
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/qbittorrent/config', methods=['GET'])
def api_qbittorrent_config_get():
    """Get qBittorrent configuration (with masked password)"""
    try:
        config = config_manager.get_qbittorrent_config()

        # Mask password for security
        masked_config = config.copy()
        if config.get('password'):
            masked_config['password'] = '***'

        return jsonify(masked_config)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/qbittorrent/config', methods=['POST'])
def api_qbittorrent_config_set():
    """Update qBittorrent configuration"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        enabled = data.get('enabled', False)
        host = data.get('host', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        category = data.get('category', 'games').strip()
        use_category = data.get('use_category', True)

        # Validate host format
        if host and not host.startswith('http'):
            return jsonify({'error': 'Host must start with http:// or https://'}), 400

        # Don't update password if it's the masked value
        if password == '***':
            password = None

        # Save configuration
        config_manager.set_qbittorrent_config(
            enabled=enabled,
            host=host,
            username=username,
            password=password,
            category=category,
            use_category=use_category
        )

        return jsonify({
            'success': True,
            'message': 'qBittorrent settings saved'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/qbittorrent/test', methods=['POST'])
def api_qbittorrent_test():
    """Test qBittorrent connection and authentication"""
    try:
        client = get_qbt_client()
        result = client.test_connection()

        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Unexpected error: {str(e)}'
        }), 500


@app.route('/api/qbittorrent/add', methods=['POST'])
def api_qbittorrent_add():
    """Add torrent to qBittorrent"""
    try:
        data = request.get_json()

        if not data or 'torrent_url' not in data:
            return jsonify({'error': 'No torrent URL provided'}), 400

        torrent_url = data['torrent_url']
        torrent_name = data.get('torrent_name', 'Unknown')

        # Get client and configuration
        client = get_qbt_client()
        config = config_manager.get_qbittorrent_config()

        # Determine category
        category = None
        if config.get('use_category', True):
            category = config.get('category', 'games')
            if category == '':  # Empty string means no category
                category = None

        # Add torrent
        result = client.add_torrent_url(torrent_url, category)

        if result['success']:
            return jsonify({
                'success': True,
                'message': f'Added "{torrent_name}" to qBittorrent'
            })
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', 'Failed to add torrent')
            }), 500

    except ConnectionError as e:
        host = config_manager.get_qbittorrent_host()
        return jsonify({
            'success': False,
            'message': f'qBittorrent is unreachable at {host}. Check that qBittorrent is running and the host is correct.'
        }), 500

    except AuthenticationError as e:
        return jsonify({
            'success': False,
            'message': 'Authentication failed. Please check your username and password in Settings.'
        }), 500

    except TorrentAddError as e:
        return jsonify({
            'success': False,
            'message': f'Failed to add torrent: {str(e)}'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Unexpected error: {str(e)}'
        }), 500


# ===================================================================
# IGDB API ROUTES
# ===================================================================

@app.route('/api/igdb/search', methods=['POST'])
def api_igdb_search():
    """
    Search for game by normalized name

    Request JSON:
        {
            "game_name": "half life",
            "platform": "PC"  # optional
        }

    Response:
        {
            "success": true,
            "data": {
                "name": "Half-Life",
                "cover_url": "https://...",
                "summary": "...",
                "rating": 9.2,
                "genres": ["FPS", "Action"],
                ...
            }
        }
    """
    try:
        data = request.get_json()

        if not data or 'game_name' not in data:
            return jsonify({'success': False, 'error': 'game_name required'}), 400

        game_name = data.get('game_name')
        platform = data.get('platform')  # Optional

        # Map platform names to IGDB platform IDs
        platform_map = {
            'PC': '6',
            'Nintendo Switch': '130',
            'Nintendo 3DS': '37',
            'Wii': '5',
            'Wii U': '41',
            'PlayStation 3': '9',
            'PlayStation 4': '48',
            'PlayStation 5': '167',
            'Xbox 360': '12',
            'Xbox One': '49',
            'Xbox Series': '169'
        }

        platform_id = platform_map.get(platform) if platform else None

        # Get IGDB client and search
        client = get_igdb_client()
        game_data = client.search_game(game_name, platform_id)

        if game_data:
            return jsonify({
                'success': True,
                'data': game_data
            })
        else:
            # Return 200 OK - "not found" is a valid response, not an error
            return jsonify({
                'success': False,
                'error': 'Game not found in IGDB database'
            })

    except Exception as e:
        logger.error(f"IGDB search error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/igdb/status')
def api_igdb_status():
    """
    Check if IGDB is configured and working

    Query params:
        enabled: "true" if frontend has enabled IGDB

    Response:
        {
            "configured": true,
            "enabled": true,
            "has_credentials": true,
            "token_valid": true
        }
    """
    try:
        client_id = os.getenv('IGDB_CLIENT_ID')
        client_secret = os.getenv('IGDB_CLIENT_SECRET')

        has_credentials = bool(client_id and client_secret)

        # Check if enabled in frontend (passed as query param)
        enabled = request.args.get('enabled', 'false') == 'true'

        token_valid = False
        if has_credentials:
            try:
                client = get_igdb_client()
                token_status = client.get_token_status()
                token_valid = token_status.get('is_valid', False)
            except:
                pass

        return jsonify({
            'configured': has_credentials,
            'enabled': enabled,
            'has_credentials': has_credentials,
            'token_valid': token_valid
        })

    except Exception as e:
        logger.error(f"IGDB status check error: {e}")
        return jsonify({
            'configured': False,
            'enabled': False,
            'has_credentials': False,
            'token_valid': False,
            'error': str(e)
        }), 500


@app.route('/api/igdb/test', methods=['POST'])
def api_igdb_test():
    """
    Test IGDB connection with a known game

    Response:
        {
            "success": true,
            "message": "Connected successfully. Found: Half-Life",
            "token_expiry": "2025-03-10T14:23:45.123456",
            "test_game": {...}
        }
    """
    try:
        client = get_igdb_client()
        result = client.test_connection()
        return jsonify(result)

    except Exception as e:
        logger.error(f"IGDB connection test error: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


# ===================================================================
# TEMPLATE ROUTES
# ===================================================================

@app.route('/igdb-manager')
def igdb_manager():
    """IGDB settings page"""
    return render_template('igdb_manager.html')


if __name__ == '__main__':
    print("=" * 60)
    print("IPTorrents Browser")
    print("=" * 60)

    # Check for .env migration on first run
    if not os.path.exists('config.json'):
        print("\nFirst run detected - checking for .env migration...")
        if config_manager.migrate_from_env():
            print("✓ Migration successful!")
        else:
            print("ℹ No .env found - please configure cookie via /cookie-manager\n")

    # Load cache on startup
    load_cache()

    # Start Flask app
    print("\nStarting web server on http://localhost:5000")
    print("Cookie Manager: http://localhost:5000/cookie-manager")
    print("Press Ctrl+C to stop\n")

    app.run(debug=True, host='0.0.0.0', port=5000)
