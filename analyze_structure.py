import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import json
import sys

# Redirect output to file to avoid encoding issues
sys.stdout = open('analysis_output.txt', 'w', encoding='utf-8')

# Load environment variables
load_dotenv()

# Get cookie from .env
cookie_string = os.getenv('IPTORRENTS_COOKIE')
cookies = {}
for item in cookie_string.split('; '):
    if '=' in item:
        key, value = item.split('=', 1)
        cookies[key] = value

# Fetch the main torrents page
url = "http://www.iptorrents.com/t"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

response = requests.get(url, cookies=cookies, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

print("="*60)
print("ANALYZING IPTORRENTS STRUCTURE")
print("="*60)

# Find all tables
tables = soup.find_all('table')
print(f"\nFound {len(tables)} tables on the page")

# Analyze each table
for i, table in enumerate(tables):
    table_id = table.get('id', 'no-id')
    table_class = table.get('class', [])
    print(f"\n--- Table {i+1} ---")
    print(f"  ID: {table_id}")
    print(f"  Classes: {table_class}")

    # Count rows
    rows = table.find_all('tr')
    print(f"  Rows: {len(rows)}")

    # If this looks like a torrent table (many rows), analyze it
    if len(rows) > 5:
        print(f"\n  >> This might be the torrent table! <<")

        # Get headers
        headers_row = table.find('tr')
        if headers_row:
            headers = headers_row.find_all(['th', 'td'])
            print(f"\n  Headers:")
            for j, h in enumerate(headers):
                print(f"    [{j}] {h.get_text(strip=True)}")

        # Analyze first torrent row
        print(f"\n  First torrent row analysis:")
        torrent_rows = rows[1:3]  # Get 2 sample rows

        for row_idx, row in enumerate(torrent_rows, 1):
            print(f"\n  === Sample Row {row_idx} ===")
            cells = row.find_all('td')

            for cell_idx, cell in enumerate(cells):
                # Get text content
                text = cell.get_text(strip=True)[:80]

                # Check for links
                links = cell.find_all('a')
                link_info = []
                for link in links:
                    href = link.get('href', '')
                    link_text = link.get_text(strip=True)[:40]
                    link_info.append(f"{link_text} -> {href}")

                # Check for images (category icons?)
                imgs = cell.find_all('img')
                img_info = [img.get('src', '') for img in imgs]

                print(f"    Cell [{cell_idx}]:")
                print(f"      Text: {text}")
                if link_info:
                    print(f"      Links: {link_info}")
                if img_info:
                    print(f"      Images: {img_info}")

                # Check for data attributes
                data_attrs = {k: v for k, v in cell.attrs.items() if k.startswith('data-')}
                if data_attrs:
                    print(f"      Data attrs: {data_attrs}")

# Look for category filters
print("\n" + "="*60)
print("CATEGORY NAVIGATION")
print("="*60)

# Find category links
cat_container = soup.find('div', class_='cat_container') or soup.find('div', id='categories')
if cat_container:
    print("\nFound category container!")
    cat_links = cat_container.find_all('a')
    for link in cat_links[:20]:
        print(f"  {link.get_text(strip=True)}: {link.get('href', '')}")
else:
    # Look for any links with category patterns
    all_links = soup.find_all('a', href=lambda x: x and ('/t?' in x or 'category' in x.lower()))
    print(f"\nFound {len(all_links)} potential category/filter links")

    # Group by pattern
    patterns = {}
    for link in all_links:
        href = link.get('href', '')
        text = link.get_text(strip=True)

        if '/t?' in href:
            # Extract parameter pattern
            if ';' in href:
                params = href.split('?')[1] if '?' in href else href
                pattern = params.split(';')[0] if ';' in params else params

                if pattern not in patterns:
                    patterns[pattern] = []
                patterns[pattern].append((text, href))

    print("\nGrouped by URL pattern:")
    for pattern, links in list(patterns.items())[:5]:
        print(f"\n  Pattern: {pattern}")
        for text, href in links[:3]:
            print(f"    {text}: {href}")

# Look for games category specifically
print("\n" + "="*60)
print("GAMES CATEGORIES")
print("="*60)

games_links = soup.find_all('a', string=lambda x: x and 'game' in x.lower())
print(f"\nFound {len(games_links)} links containing 'game':")
for link in games_links[:15]:
    print(f"  {link.get_text(strip=True)}: {link.get('href', '')}")

print("\n" + "="*60)
print("Detailed analysis saved!")
print("="*60)

# Close output file and print to console
sys.stdout.close()
sys.stdout = sys.__stdout__
print("Analysis complete! Check analysis_output.txt for results")
