"""
IPTorrents Browser - Flask Web Application
Provides a better filtering interface for IPTorrents
"""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from scraper import IPTorrentsScraper, CATEGORIES

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Cache configuration
CACHE_FILE = 'cache.json'
CACHE_DURATION = 15  # minutes

# Global cache
torrents_cache = {
    'data': [],
    'timestamp': None
}


def load_cache():
    """Load torrents from cache file"""
    global torrents_cache

    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Convert timestamp strings back to datetime
                for torrent in data.get('data', []):
                    if 'timestamp' in torrent:
                        torrent['timestamp'] = datetime.fromisoformat(torrent['timestamp'])
                torrents_cache = {
                    'data': data.get('data', []),
                    'timestamp': datetime.fromisoformat(data['timestamp']) if data.get('timestamp') else None
                }
                print(f"Loaded {len(torrents_cache['data'])} torrents from cache")
        except Exception as e:
            print(f"Error loading cache: {e}")


def save_cache():
    """Save torrents to cache file"""
    try:
        # Convert datetime objects to ISO strings for JSON serialization
        cache_data = {
            'data': [],
            'timestamp': torrents_cache['timestamp'].isoformat() if torrents_cache['timestamp'] else None
        }

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
    if not torrents_cache['timestamp']:
        return False

    age = datetime.now() - torrents_cache['timestamp']
    return age < timedelta(minutes=CACHE_DURATION)


def refresh_torrents(force=False):
    """Refresh torrent data from IPTorrents"""
    global torrents_cache

    if not force and is_cache_valid():
        print("Using cached data")
        return torrents_cache['data']

    print("Fetching fresh data from IPTorrents...")

    try:
        scraper = IPTorrentsScraper()
        torrents = scraper.fetch_torrents(categories=['PC-ISO', 'PC-Rip'])

        torrents_cache = {
            'data': torrents,
            'timestamp': datetime.now()
        }

        save_cache()
        return torrents

    except Exception as e:
        print(f"Error fetching torrents: {e}")
        # Return cached data if available
        return torrents_cache['data']


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
    API endpoint to fetch filtered torrents

    Query parameters:
        - categories: Comma-separated category names
        - days: Number of days back
        - min_snatched: Minimum snatched count
        - exclude: Comma-separated keywords to exclude
        - search: Search query
        - sort: Sort field (snatched, date, size, seeders, name)
        - order: Sort order (asc, desc)
    """
    # Get fresh torrents (uses cache if valid)
    torrents = refresh_torrents()

    # Parse filters from query parameters
    filters = {}

    if request.args.get('categories'):
        filters['categories'] = request.args.get('categories').split(',')

    if request.args.get('days'):
        filters['days'] = request.args.get('days')

    if request.args.get('min_snatched'):
        filters['min_snatched'] = request.args.get('min_snatched')

    if request.args.get('exclude'):
        filters['exclude'] = request.args.get('exclude')

    if request.args.get('search'):
        filters['search'] = request.args.get('search')

    # Apply filters
    filtered = filter_torrents(torrents, filters)

    # Apply sorting
    sort_by = request.args.get('sort', 'snatched')
    order = request.args.get('order', 'desc')
    filtered = sort_torrents(filtered, sort_by, order)

    # Convert datetime objects to strings for JSON
    result = []
    for torrent in filtered:
        t = torrent.copy()
        if 'timestamp' in t:
            t['timestamp'] = t['timestamp'].isoformat()
        result.append(t)

    return jsonify({
        'count': len(result),
        'torrents': result
    })


@app.route('/api/refresh')
def api_refresh():
    """Force refresh torrent data"""
    torrents = refresh_torrents(force=True)

    return jsonify({
        'success': True,
        'count': len(torrents),
        'message': f'Refreshed {len(torrents)} torrents'
    })


@app.route('/api/stats')
def api_stats():
    """Get statistics about cached torrents"""
    torrents = torrents_cache['data']

    if not torrents:
        return jsonify({
            'total': 0,
            'cache_age': None
        })

    cache_age = None
    if torrents_cache['timestamp']:
        age = datetime.now() - torrents_cache['timestamp']
        cache_age = f"{int(age.total_seconds() / 60)} minutes ago"

    # Calculate stats
    categories_count = {}
    for t in torrents:
        cat = t['category']
        categories_count[cat] = categories_count.get(cat, 0) + 1

    return jsonify({
        'total': len(torrents),
        'cache_age': cache_age,
        'categories': categories_count,
        'cache_valid': is_cache_valid()
    })


if __name__ == '__main__':
    print("=" * 60)
    print("IPTorrents Browser")
    print("=" * 60)

    # Load cache on startup
    load_cache()

    # Start Flask app
    print("\nStarting web server on http://localhost:5000")
    print("Press Ctrl+C to stop\n")

    app.run(debug=True, host='0.0.0.0', port=5000)
