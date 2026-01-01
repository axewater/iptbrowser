import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import re

load_dotenv()

cookie_string = os.getenv('IPTORRENTS_COOKIE')
cookies = {}
for item in cookie_string.split('; '):
    if '=' in item:
        key, value = item.split('=', 1)
        cookies[key] = value

headers = {'User-Agent': 'Mozilla/5.0'}

# Try directly accessing PC games with full category path
urls_to_try = [
    ("Main page", "http://www.iptorrents.com/t"),
    ("Games ?74", "http://www.iptorrents.com/t?74"),
    ("PC-ISO ?43", "http://www.iptorrents.com/t?43"),
    ("PC-Rip ?45", "http://www.iptorrents.com/t?45"),
    ("Games with ;o=seeders", "http://www.iptorrents.com/t?74;o=seeders"),
]

for name, url in urls_to_try:
    print(f"\n{'='*80}")
    print(f"Testing: {name}")
    print(f"URL: {url}")
    print(f"{'='*80}")

    response = requests.get(url, cookies=cookies, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')

    # Find first 3 torrents
    torrent_links = soup.find_all('a', href=lambda x: x and '/t/' in x and x.startswith('/t/'), limit=5)

    print(f"First 5 torrents:")
    for i, link in enumerate(torrent_links, 1):
        name_text = link.get_text(strip=True)[:80]
        print(f"  {i}. {name_text}")

    # Check if this actually contains game names
    game_keywords = ['steam', 'crack', 'repack', 'gog', 'skidrow', 'codex', 'fitgirl', 'pc game']
    text_content = response.text.lower()

    found_keywords = [kw for kw in game_keywords if kw in text_content]
    if found_keywords:
        print(f"\n  Game keywords found: {', '.join(found_keywords)}")
