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

# Get main page
url = "http://www.iptorrents.com/t"
response = requests.get(url, cookies=cookies, headers=headers)

soup = BeautifulSoup(response.text, 'html.parser')

print("Looking for category links...")
print("="*80)

# Find all links with category numbers
links = soup.find_all('a', href=True)

categories = {}
for link in links:
    href = link.get('href', '')
    text = link.get_text(strip=True)

    # Look for simple ?XX pattern or complex patterns
    if href.startswith('?') and len(href) <= 4:
        if 'game' in text.lower() or 'pc' in text.lower():
            categories[text] = href
            print(f"{text:30s} -> {href}")

print("\n" + "="*80)
print("\nTrying main Games category...")

# Try the main Games category
games_url = "http://www.iptorrents.com/t?74"
response = requests.get(games_url, cookies=cookies, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

# Find subcategory links
print("\nSubcategories found on Games page:")
links = soup.find_all('a', href=lambda x: x and '?' in x)

for link in links:
    text = link.get_text(strip=True)
    href = link.get('href', '')

    if 'pc' in text.lower() or 'game' in text.lower():
        print(f"  {text:40s} -> {href}")

print("\n" + "="*80)
print("\nChecking first torrent on Games page...")

# Find first torrent
torrent_link = soup.find('a', href=lambda x: x and '/t/' in x and x.startswith('/t/'))
if torrent_link:
    print(f"Name: {torrent_link.get_text(strip=True)}")
    print(f"Link: {torrent_link['href']}")
