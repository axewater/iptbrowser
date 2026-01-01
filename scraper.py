"""
IPTorrents Scraper Module
Scrapes torrent listings from IPTorrents with authentication
"""

import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dotenv import load_dotenv
import concurrent.futures

# Load environment variables
load_dotenv()

# Base URL
BASE_URL = "http://www.iptorrents.com"

# PC Games category IDs (from analysis)
CATEGORIES = {
    'PC-ISO': '43',
    'PC-Rip': '45',
    'PC-Mixed': '2',
    'Nintendo': '47',
    'Playstation': '71',
    'Xbox': '44',
    'Wii': '50'
}


class IPTorrentsScraper:
    """Scraper for IPTorrents site"""

    def __init__(self, config_manager=None):
        """Initialize scraper with cookie from ConfigManager"""
        from config_manager import ConfigManager

        self.config_manager = config_manager or ConfigManager()
        cookie_string = self.config_manager.get_cookie()

        if not cookie_string:
            raise ValueError("Cookie not found in config. Please configure via /cookie-manager")

        # Parse cookie string
        self.cookies = {}
        for item in cookie_string.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                self.cookies[key] = value

        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

    def reload_cookie(self):
        """Hot reload cookie from config without restarting scraper"""
        self.config_manager.load_config()
        cookie_string = self.config_manager.get_cookie()

        if not cookie_string:
            raise ValueError("Cookie not found in config. Please configure via /cookie-manager")

        # Re-parse cookie string
        self.cookies = {}
        for item in cookie_string.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                self.cookies[key] = value

    def fetch_torrents(self, categories=['PC-ISO', 'PC-Rip'], limit=None, days=None):
        """
        Fetch torrents from specified categories with multi-page support

        Args:
            categories: List of category names (default: PC-ISO and PC-Rip)
            limit: Maximum number of torrents to fetch (None = all)
            days: Number of days back to fetch (None = all available, enables multi-page)

        Returns:
            List of torrent dictionaries
        """
        all_torrents = []
        cutoff_time = None

        # Calculate cutoff time if days is specified
        if days:
            cutoff_time = datetime.now() - timedelta(days=days)
            print(f"Fetching torrents from last {days} days (since {cutoff_time.strftime('%Y-%m-%d %H:%M')})")

        for category_name in categories:
            if category_name not in CATEGORIES:
                print(f"Warning: Unknown category '{category_name}', skipping")
                continue

            category_id = CATEGORIES[category_name]

            # Fetch multiple pages if days is specified, otherwise just first page
            if days:
                torrents = self._fetch_category_pages(category_name, category_id, cutoff_time)
            else:
                torrents = self._fetch_single_page(category_name, category_id, offset=0)

            all_torrents.extend(torrents)
            print(f"  Total: {len(torrents)} torrents in {category_name}")

        # Sort by date (newest first) and apply limit
        all_torrents.sort(key=lambda x: x['timestamp'], reverse=True)

        if limit:
            all_torrents = all_torrents[:limit]

        return all_torrents

    def fetch_incremental(self, categories, newest_timestamps):
        """
        Fetch only new torrents since the last known timestamp for each category
        This is the "only fetch new things" optimization

        Args:
            categories: List of category names to check for updates
            newest_timestamps: Dict mapping category name -> datetime of newest cached torrent

        Returns:
            List of NEW torrent dictionaries only
        """
        all_new_torrents = []

        print(f"Fetching incremental updates for {len(categories)} categories...")

        for category_name in categories:
            if category_name not in CATEGORIES:
                print(f"Warning: Unknown category '{category_name}', skipping")
                continue

            category_id = CATEGORIES[category_name]
            cutoff_timestamp = newest_timestamps.get(category_name)

            if not cutoff_timestamp:
                # No cached data for this category, fetch first page only
                print(f"  {category_name}: No cached data, fetching first page")
                torrents = self._fetch_single_page(category_name, category_id, offset=0)
                all_new_torrents.extend(torrents)
                print(f"    Found {len(torrents)} torrents")
                continue

            # Fetch pages until we hit the cutoff timestamp
            print(f"  {category_name}: Checking for new torrents since {cutoff_timestamp.strftime('%Y-%m-%d %H:%M')}")
            torrents = self._fetch_until_timestamp(category_name, category_id, cutoff_timestamp)

            all_new_torrents.extend(torrents)
            if torrents:
                print(f"    Found {len(torrents)} new torrents")
            else:
                print(f"    No new torrents")

        # Sort by date (newest first)
        all_new_torrents.sort(key=lambda x: x['timestamp'], reverse=True)

        print(f"Total new torrents: {len(all_new_torrents)}")
        return all_new_torrents

    def _fetch_until_timestamp(self, category_name, category_id, cutoff_timestamp):
        """
        Fetch pages until we encounter the cutoff timestamp
        This stops fetching as soon as we hit already-cached torrents

        Args:
            category_name: Name of the category
            category_id: ID of the category
            cutoff_timestamp: datetime - stop when we hit torrents older than this

        Returns:
            List of new torrent dictionaries
        """
        new_torrents = []
        offset = 0
        page_num = 1
        max_pages = 5  # Limit to first 5 pages for incremental (new torrents should be recent)
        torrents_per_page = 75

        while page_num <= max_pages:
            torrents = self._fetch_single_page(category_name, category_id, offset)

            if not torrents:
                break

            # Check each torrent
            hit_cutoff = False
            for torrent in torrents:
                if torrent['timestamp'] > cutoff_timestamp:
                    # This is new! Add it
                    new_torrents.append(torrent)
                else:
                    # We've hit old data, stop fetching this category
                    hit_cutoff = True
                    break

            if hit_cutoff:
                break

            # Move to next page
            offset += torrents_per_page
            page_num += 1

        return new_torrents

    def _fetch_single_page(self, category_name, category_id, offset=0):
        """Fetch a single page of torrents"""
        if offset > 0:
            url = f"{BASE_URL}/t?{category_id};o={offset}"
        else:
            url = f"{BASE_URL}/t?{category_id}"

        try:
            response = requests.get(url, cookies=self.cookies, headers=self.headers, timeout=30)
            response.raise_for_status()

            torrents = self._parse_torrents(response.text, category_name)
            return torrents

        except requests.RequestException as e:
            print(f"  Error fetching {category_name} (offset {offset}): {e}")
            return []

    def _fetch_category_pages(self, category_name, category_id, cutoff_time):
        """Fetch multiple pages concurrently for 3-5x faster performance"""
        torrents_per_page = 75  # IPTorrents typically shows 75 per page
        max_pages = 50  # Safety limit

        # Estimate pages needed (fetch first page to check, then parallelize rest)
        print(f"Fetching {category_name} torrents (multi-page concurrent)...")

        # Fetch first page to check if we have any data
        first_page = self._fetch_single_page(category_name, category_id, 0)
        if not first_page:
            print(f"  No torrents found")
            return []

        all_torrents = [t for t in first_page if t['timestamp'] >= cutoff_time]
        print(f"  Page 1: Found {len(first_page)} torrents, {len(all_torrents)} within time range")

        # Check if first page already shows old torrents
        oldest_on_first = min(first_page, key=lambda x: x['timestamp'])
        if oldest_on_first['timestamp'] < cutoff_time:
            print(f"  Already reached cutoff on page 1, stopping")
            return all_torrents

        # Estimate pages needed (assume ~10 pages max for concurrency)
        estimated_pages = min(10, max_pages - 1)  # -1 because we already fetched page 1

        # Generate offsets for concurrent fetching
        page_offsets = [(i + 1, (i + 1) * torrents_per_page) for i in range(estimated_pages)]

        # Fetch pages concurrently (max 3 at a time to be nice to server)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_page = {
                executor.submit(self._fetch_single_page, category_name, category_id, offset): (page_num, offset)
                for page_num, offset in page_offsets
            }

            for future in concurrent.futures.as_completed(future_to_page):
                page_num, offset = future_to_page[future]
                try:
                    torrents = future.result()
                    if torrents:
                        # Filter torrents within time range
                        within_range = [t for t in torrents if t['timestamp'] >= cutoff_time]
                        all_torrents.extend(within_range)
                        print(f"  Page {page_num}: Found {len(torrents)} torrents, {len(within_range)} within time range")
                except Exception as e:
                    print(f"  Error fetching page {page_num}: {e}")

        print(f"  Total torrents fetched: {len(all_torrents)}")
        return all_torrents

    def _parse_torrents(self, html, category):
        """Parse HTML and extract torrent data"""
        soup = BeautifulSoup(html, 'html.parser')
        torrents = []

        # Find the main torrent table
        # IPTorrents uses table id="torrents" for the browse listing
        table = soup.find('table', id='torrents')

        if not table:
            print("  Warning: Could not find torrent table with id='torrents'")
            return torrents

        # Find all torrent rows (skip header)
        rows = table.find_all('tr')[1:]  # Skip header row

        for row in rows:
            try:
                torrent = self._parse_torrent_row(row, category)
                if torrent:
                    torrents.append(torrent)
            except Exception as e:
                # Skip rows that can't be parsed
                continue

        return torrents

    def _parse_torrent_row(self, row, category):
        """Parse a single torrent row"""
        cells = row.find_all('td')

        if len(cells) < 5:
            return None

        # Find torrent name and link
        # The torrent title is usually in a link with href="/t/{id}"
        title_link = row.find('a', href=lambda x: x and '/t/' in x and not 'bookmark' in x and not 'comment' in x)

        if not title_link:
            return None

        name = title_link.get_text(strip=True)
        torrent_id_match = re.search(r'/t/(\d+)', title_link['href'])
        torrent_id = torrent_id_match.group(1) if torrent_id_match else None

        # Find download link
        download_link_elem = row.find('a', href=lambda x: x and '/download.php/' in x)
        download_link = BASE_URL + download_link_elem['href'] if download_link_elem else None

        # Extract size (look for patterns like "3.5 GB", "1.91 GB", "500 MB")
        size_text = row.get_text()
        size_match = re.search(r'([\d.]+)\s*(GB|MB|TB)', size_text, re.IGNORECASE)
        size = size_match.group(0) if size_match else 'Unknown'

        # Extract seeders, leechers, snatched
        # These are usually numeric values in cells
        numbers = []
        for cell in cells:
            text = cell.get_text(strip=True)
            # Look for pure numbers
            if text.isdigit():
                numbers.append(int(text))

        # Heuristic: usually seeders, leechers, snatched are the last numeric values
        seeders = numbers[-3] if len(numbers) >= 3 else 0
        leechers = numbers[-2] if len(numbers) >= 2 else 0
        snatched = numbers[-1] if len(numbers) >= 1 else 0

        # Extract upload time
        # Look for patterns like "10.9 hours ago", "1.2 days ago"
        time_match = re.search(r'([\d.]+)\s*(minute|hour|day|week|month)s?\s*ago', size_text, re.IGNORECASE)

        timestamp = datetime.now()
        upload_time = "Unknown"

        if time_match:
            value = float(time_match.group(1))
            unit = time_match.group(2).lower()

            upload_time = time_match.group(0)

            # Calculate timestamp
            if 'minute' in unit:
                timestamp = datetime.now() - timedelta(minutes=value)
            elif 'hour' in unit:
                timestamp = datetime.now() - timedelta(hours=value)
            elif 'day' in unit:
                timestamp = datetime.now() - timedelta(days=value)
            elif 'week' in unit:
                timestamp = datetime.now() - timedelta(weeks=value)
            elif 'month' in unit:
                timestamp = datetime.now() - timedelta(days=value * 30)

        # Check for freeleech (usually indicated by special icon or text)
        is_freeleech = bool(row.find(string=re.compile(r'freeleech', re.I)))

        return {
            'id': torrent_id,
            'name': name,
            'category': category,
            'size': size,
            'seeders': seeders,
            'leechers': leechers,
            'snatched': snatched,
            'upload_time': upload_time,
            'timestamp': timestamp,
            'download_link': download_link,
            'is_freeleech': is_freeleech,
            'url': f"{BASE_URL}/t/{torrent_id}" if torrent_id else None
        }


def parse_relative_time(time_str):
    """
    Parse relative time strings like '1.2 days ago' to datetime

    Args:
        time_str: String like "10.9 hours ago"

    Returns:
        datetime object
    """
    match = re.search(r'([\d.]+)\s*(minute|hour|day|week|month)s?\s*ago', time_str, re.IGNORECASE)

    if not match:
        return datetime.now()

    value = float(match.group(1))
    unit = match.group(2).lower()

    if 'minute' in unit:
        return datetime.now() - timedelta(minutes=value)
    elif 'hour' in unit:
        return datetime.now() - timedelta(hours=value)
    elif 'day' in unit:
        return datetime.now() - timedelta(days=value)
    elif 'week' in unit:
        return datetime.now() - timedelta(weeks=value)
    elif 'month' in unit:
        return datetime.now() - timedelta(days=value * 30)

    return datetime.now()


if __name__ == '__main__':
    # Test the scraper
    print("Testing IPTorrents Scraper...")
    print("=" * 60)

    scraper = IPTorrentsScraper()
    torrents = scraper.fetch_torrents(categories=['PC-ISO', 'PC-Rip'], limit=10)

    print(f"\n{'='*60}")
    print(f"Total torrents fetched: {len(torrents)}")
    print(f"{'='*60}\n")

    for i, torrent in enumerate(torrents, 1):
        print(f"{i}. [{torrent['category']}] {torrent['name']}")
        print(f"   Size: {torrent['size']} | S: {torrent['seeders']} L: {torrent['leechers']} | Snatched: {torrent['snatched']}")
        print(f"   Uploaded: {torrent['upload_time']}")
        if torrent['is_freeleech']:
            print(f"   [FREELEECH]")
        print()
