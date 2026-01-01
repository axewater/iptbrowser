import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get cookie from .env
cookie_string = os.getenv('IPTORRENTS_COOKIE')

if not cookie_string:
    print("ERROR: IPTORRENTS_COOKIE not found in .env file")
    exit(1)

# Parse cookie string into dict
cookies = {}
for item in cookie_string.split('; '):
    if '=' in item:
        key, value = item.split('=', 1)
        cookies[key] = value

print(f"Using cookies: {list(cookies.keys())}")

# Fetch the main torrents page
url = "http://www.iptorrents.com/t"
print(f"\nFetching: {url}")

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

response = requests.get(url, cookies=cookies, headers=headers)

print(f"Status code: {response.status_code}")

if response.status_code == 200:
    # Save HTML for inspection
    with open('page_source.html', 'w', encoding='utf-8') as f:
        f.write(response.text)

    print("\n[OK] Page saved to page_source.html")

    # Parse with BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Check if we're logged in
    if 'login' in response.text.lower() and 'username' in response.text.lower():
        print("\n[WARNING] Appears to still be on login page - cookie might be invalid")
    else:
        print("\n[OK] Successfully logged in!")

    # Try to find torrent table
    table = soup.find('table', {'id': 't0'}) or soup.find('table', class_='torrents')

    if table:
        print("\n[OK] Found torrent table!")

        # Analyze table structure
        headers = table.find_all('th')
        print(f"\nTable headers ({len(headers)}):")
        for i, th in enumerate(headers):
            print(f"  {i}: {th.get_text(strip=True)}")

        # Get first few rows
        rows = table.find_all('tr')[1:6]  # Skip header, get first 5
        print(f"\nFound {len(rows)} sample torrents")

        for i, row in enumerate(rows, 1):
            cells = row.find_all('td')
            print(f"\n--- Torrent {i} ---")
            for j, cell in enumerate(cells):
                text = cell.get_text(strip=True)[:100]  # Truncate long text
                print(f"  Cell {j}: {text}")
    else:
        print("\n[ERROR] Could not find torrent table")
        print("\nSearching for other common elements...")

        # Look for categories
        categories = soup.find_all('a', href=lambda x: x and '/t?' in x)
        if categories:
            print(f"\nFound {len(categories)} category links:")
            for cat in categories[:10]:
                print(f"  - {cat.get_text(strip=True)}: {cat['href']}")

else:
    print(f"\n[ERROR] Failed to fetch page: {response.status_code}")
    print(response.text[:500])
