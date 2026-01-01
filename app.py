"""
IPTorrents Browser - Flask Web Application
Provides a better filtering interface for IPTorrents
"""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from scraper import IPTorrentsScraper, CATEGORIES
from config_manager import ConfigManager

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Global config manager and scraper instances
config_manager = ConfigManager()
scraper_instance = None

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
            torrents_cache['data'] = torrents

            save_cache()

            return torrents, _get_cache_metadata(fetched_new=len(torrents))

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
    Apply filters to torrent list

    Filters:
        - categories: List of category names
        - days: Number of days back
        - min_snatched: Minimum snatched count
        - exclude: Comma-separated keywords to exclude
        - search: Search query for torrent names
    """
    filtered = torrents

    # Filter by categories
    if 'categories' in filters and filters['categories']:
        cats = filters['categories']
        if isinstance(cats, str):
            cats = [cats]
        filtered = [t for t in filtered if t['category'] in cats]

    # Filter by date
    if 'days' in filters and filters['days']:
        try:
            days = int(filters['days'])
            cutoff = datetime.now() - timedelta(days=days)
            filtered = [t for t in filtered if t['timestamp'] >= cutoff]
        except ValueError:
            pass

    # Filter by minimum snatched
    if 'min_snatched' in filters and filters['min_snatched']:
        try:
            min_snatched = int(filters['min_snatched'])
            filtered = [t for t in filtered if t['snatched'] >= min_snatched]
        except ValueError:
            pass

    # Exclude keywords
    if 'exclude' in filters and filters['exclude']:
        exclude_keywords = [kw.strip().lower() for kw in filters['exclude'].split(',') if kw.strip()]
        if exclude_keywords:
            filtered = [
                t for t in filtered
                if not any(keyword in t['name'].lower() for keyword in exclude_keywords)
            ]

    # Search query
    if 'search' in filters and filters['search']:
        query = filters['search'].lower()
        filtered = [t for t in filtered if query in t['name'].lower()]

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
