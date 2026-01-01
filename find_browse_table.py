import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

cookie_string = os.getenv('IPTORRENTS_COOKIE')
cookies = {}
for item in cookie_string.split('; '):
    if '=' in item:
        key, value = item.split('=', 1)
        cookies[key] = value

headers = {'User-Agent': 'Mozilla/5.0'}

# Try PC-ISO
url = "http://www.iptorrents.com/t?43"
response = requests.get(url, cookies=cookies, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

print("Looking for all tables...")
print("="*80)

tables = soup.find_all('table')
print(f"\nFound {len(tables)} tables\n")

for i, table in enumerate(tables):
    table_id = table.get('id', '')
    table_class = table.get('class', [])

    print(f"Table {i}:")
    print(f"  ID: {table_id}")
    print(f"  Class: {table_class}")

    # Count rows
    rows = table.find_all('tr')
    print(f"  Rows: {len(rows)}")

    # Check if it has torrent-looking content
    torrent_links = table.find_all('a', href=lambda x: x and '/t/' in x)
    download_links = table.find_all('a', href=lambda x: x and '/download.php' in x)

    print(f"  Torrent links: {len(torrent_links)}")
    print(f"  Download links: {len(download_links)}")

    # If this looks like the main browse table
    if len(rows) > 20 and len(torrent_links) > 10:
        print("\n  >>> This might be the main browse table! <<<")
        print("\n  First 5 torrent names:")

        for j, link in enumerate(torrent_links[:5], 1):
            print(f"    {j}. {link.get_text(strip=True)[:80]}")

    print()

# Also look for the main torrents div/section
print("\n" + "="*80)
print("Looking for torrents div/section...")

torrents_div = soup.find('div', id=lambda x: x and 'torrent' in x.lower())
if torrents_div:
    print(f"Found div: {torrents_div.get('id')}")

# Look for table with id containing 'torrent' or 'browse'
browse_table = soup.find('table', id=lambda x: x and ('torrent' in x.lower() or 'browse' in x.lower()))
if browse_table:
    print(f"Found browse table: {browse_table.get('id')}")

# Save full HTML for manual inspection
with open('pc_iso_page.html', 'w', encoding='utf-8') as f:
    f.write(response.text)

print("\nSaved full HTML to pc_iso_page.html for manual inspection")
