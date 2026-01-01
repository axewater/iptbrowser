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

    def __init__(self):
        """Initialize scraper with cookie from .env"""
        cookie_string = os.getenv('IPTORRENTS_COOKIE')
        if not cookie_string:
            raise ValueError("IPTORRENTS_COOKIE not found in .env file")

        # Parse cookie string
        self.cookies = {}
        for item in cookie_string.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                self.cookies[key] = value

        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

    def fetch_torrents(self, categories=['PC-ISO', 'PC-Rip'], limit=None):
        """
        Fetch torrents from specified categories

        Args:
            categories: List of category names (default: PC-ISO and PC-Rip)
            limit: Maximum number of torrents to fetch (None = all)

        Returns:
            List of torrent dictionaries
        """
        all_torrents = []

        for category_name in categories:
            if category_name not in CATEGORIES:
                print(f"Warning: Unknown category '{category_name}', skipping")
                continue

            category_id = CATEGORIES[category_name]
            url = f"{BASE_URL}/t?{category_id}"

            print(f"Fetching {category_name} torrents from {url}...")

            try:
                response = requests.get(url, cookies=self.cookies, headers=self.headers, timeout=30)
                response.raise_for_status()

                torrents = self._parse_torrents(response.text, category_name)
                all_torrents.extend(torrents)

                print(f"  Found {len(torrents)} torrents in {category_name}")

            except requests.RequestException as e:
                print(f"  Error fetching {category_name}: {e}")

        # Sort by date (newest first) and apply limit
        all_torrents.sort(key=lambda x: x['timestamp'], reverse=True)

        if limit:
            all_torrents = all_torrents[:limit]

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
