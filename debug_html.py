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

# Try PC-ISO category
url = "http://www.iptorrents.com/t?43"
response = requests.get(url, cookies=cookies, headers=headers)

soup = BeautifulSoup(response.text, 'html.parser')

# Save a smaller snippet
with open('html_snippet.txt', 'w', encoding='utf-8') as f:
    # Find first torrent row and save it
    table = soup.find('table')
    if table:
        rows = table.find_all('tr')
        f.write(f"Total rows: {len(rows)}\n")
        f.write("="*80 + "\n\n")

        # Write first 3 rows
        for i, row in enumerate(rows[:5]):
            f.write(f"\n{'='*80}\n")
            f.write(f"ROW {i}\n")
            f.write(f"{'='*80}\n")
            f.write(row.prettify())
            f.write('\n\n')

print("Saved HTML snippet to html_snippet.txt")
print(f"First torrent link:")

# Find first actual torrent link
link = soup.find('a', href=lambda x: x and '/t/' in x and x.startswith('/t/'))
if link:
    print(f"  Text: {link.get_text(strip=True)}")
    print(f"  Href: {link['href']}")
    print(f"  Parent: {link.parent.name}")

print("\n Looking for games keywords...")
games_text = soup.find_all(string=lambda x: x and 'game' in x.lower())
print(f"Found {len(games_text)} instances of 'game'")
for i, text in enumerate(games_text[:5]):
    print(f"  {i+1}. {text.strip()[:100]}")
