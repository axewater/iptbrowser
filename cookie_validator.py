"""
Cookie Validator for IPT Browser
Tests cookie validity by making test requests to IPTorrents
"""

import requests
import re
from bs4 import BeautifulSoup
from datetime import datetime


class CookieValidator:
    """Validates IPTorrents cookies by making test requests"""

    def __init__(self):
        self.base_url = "http://www.iptorrents.com"
        # Use a torrent listing page for testing (PC-ISO category)
        # This is more reliable than the base URL which might redirect
        self.test_url = "http://www.iptorrents.com/t?43"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

    def test_cookie(self, cookie_string):
        """
        Test cookie validity by making a request to IPTorrents

        Args:
            cookie_string: Cookie string in format "uid=XXX; pass=YYY"

        Returns:
            dict: {
                'valid': bool,
                'message': str,
                'user_info': dict or None,
                'expiry_detected': bool,
                'tested_at': str (ISO format)
            }
        """
        if not cookie_string:
            return {
                'valid': False,
                'message': 'No cookie provided',
                'user_info': None,
                'expiry_detected': False,
                'tested_at': datetime.now().isoformat()
            }

        # Parse cookie string into dict
        cookies = self._parse_cookie_string(cookie_string)

        if not cookies:
            return {
                'valid': False,
                'message': 'Invalid cookie format',
                'user_info': None,
                'expiry_detected': False,
                'tested_at': datetime.now().isoformat()
            }

        try:
            # Make test request to IPTorrents torrent listing page
            # Using a category page is more reliable than base URL
            response = requests.get(
                self.test_url,
                cookies=cookies,
                headers=self.headers,
                timeout=15,
                allow_redirects=False  # Don't follow redirects automatically
            )

            # Check for redirects (session expired)
            if response.status_code in [301, 302, 303, 307, 308]:
                redirect_location = response.headers.get('Location', '')
                if 'login' in redirect_location.lower():
                    return {
                        'valid': False,
                        'message': 'Cookie expired - redirected to login page',
                        'user_info': None,
                        'expiry_detected': True,
                        'tested_at': datetime.now().isoformat()
                    }
                # If redirected but not to login, follow the redirect
                else:
                    try:
                        # Follow redirect and check that page
                        response = requests.get(
                            self.test_url,
                            cookies=cookies,
                            headers=self.headers,
                            timeout=15,
                            allow_redirects=True  # Follow redirects this time
                        )
                    except Exception:
                        # If redirect fails, assume cookie might be invalid
                        pass

            # Check for forbidden
            if response.status_code == 403:
                return {
                    'valid': False,
                    'message': 'Cookie rejected - access forbidden',
                    'user_info': None,
                    'expiry_detected': True,
                    'tested_at': datetime.now().isoformat()
                }

            # Check for success
            if response.status_code == 200:
                # Parse HTML to check if we're actually logged in
                soup = BeautifulSoup(response.text, 'html.parser')

                # Check for expiration messages
                if self.detect_expiration(response.text, soup):
                    return {
                        'valid': False,
                        'message': 'Cookie expired - session expired message detected',
                        'user_info': None,
                        'expiry_detected': True,
                        'tested_at': datetime.now().isoformat()
                    }

                # Try to extract user info
                user_info = self.parse_user_info(soup)

                if user_info and user_info.get('username'):
                    # Successfully logged in
                    return {
                        'valid': True,
                        'message': f"Cookie is valid - logged in as {user_info['username']}",
                        'user_info': user_info,
                        'expiry_detected': False,
                        'tested_at': datetime.now().isoformat()
                    }
                else:
                    # Page loaded but no user info (might not be logged in)
                    return {
                        'valid': False,
                        'message': 'Cookie may be invalid - no user info found',
                        'user_info': None,
                        'expiry_detected': True,
                        'tested_at': datetime.now().isoformat()
                    }

            # Other status codes
            return {
                'valid': False,
                'message': f"Unexpected response status: {response.status_code}",
                'user_info': None,
                'expiry_detected': False,
                'tested_at': datetime.now().isoformat()
            }

        except requests.RequestException as e:
            return {
                'valid': False,
                'message': f"Network error: {str(e)}",
                'user_info': None,
                'expiry_detected': False,
                'tested_at': datetime.now().isoformat()
            }
        except Exception as e:
            return {
                'valid': False,
                'message': f"Error testing cookie: {str(e)}",
                'user_info': None,
                'expiry_detected': False,
                'tested_at': datetime.now().isoformat()
            }

    def detect_expiration(self, html_text, soup=None):
        """
        Detect if the page indicates session expiration

        Args:
            html_text: Raw HTML text
            soup: BeautifulSoup object (optional)

        Returns:
            bool: True if expiration detected
        """
        # Check for common expiration messages
        expiration_indicators = [
            'session has expired',
            'session expired',
            'please log in',
            'please login',
            'your session',
            'logged out'
        ]

        html_lower = html_text.lower()
        for indicator in expiration_indicators:
            if indicator in html_lower:
                return True

        # Check if we're on the login page
        if soup:
            # Look for login form
            login_form = soup.find('form', {'action': lambda x: x and 'login' in x.lower()})
            if login_form:
                return True

            # Look for login input fields
            username_input = soup.find('input', {'name': lambda x: x and 'username' in x.lower()})
            password_input = soup.find('input', {'type': 'password'})
            if username_input and password_input:
                return True

        return False

    def parse_user_info(self, soup):
        """
        Extract user information from IPTorrents page

        Args:
            soup: BeautifulSoup object of the page

        Returns:
            dict: User info or None
        """
        user_info = {
            'username': None,
            'ratio': None,
            'upload': None,
            'download': None
        }

        try:
            # Try to find username in common locations
            # IPTorrents typically shows username in the header/navbar

            # Method 1: Look for user profile link with class="uname"
            user_link = soup.find('a', {'class': 'uname'})
            if user_link:
                # Extract direct text nodes only (skip nested div text)
                direct_texts = [str(t).strip() for t in user_link.contents
                                if isinstance(t, str) and t.strip()]
                if direct_texts:
                    user_info['username'] = direct_texts[0]

            # Try to extract stats from tTipWrap spans
            stats_spans = soup.find_all('span', {'class': lambda x: x and 'tTipWrap' in str(x)})

            for stats_span in stats_spans:
                try:
                    # Get tooltip label to identify stat type
                    tooltip_div = stats_span.find('div', {'class': 'tTip'})
                    if not tooltip_div:
                        continue

                    label = tooltip_div.get_text(strip=True).lower()

                    # Extract value text (after tooltip and icon)
                    value_text = None
                    tag_count = 0
                    for child in stats_span.children:
                        if hasattr(child, 'name') and child.name:  # It's a tag
                            tag_count += 1
                        elif isinstance(child, str) and child.strip():  # It's text
                            if tag_count >= 2:  # After tooltip div and icon
                                value_text = child.strip()
                                break

                    if not value_text:
                        continue

                    # Store based on label type
                    if 'upload' in label:
                        user_info['upload'] = value_text
                    elif 'download' in label:
                        user_info['download'] = value_text
                    elif 'ratio' in label:
                        ratio_match = re.search(r'([\d.]+)', value_text)
                        if ratio_match:
                            user_info['ratio'] = ratio_match.group(1)
                except Exception as e:
                    # Skip individual stats if extraction fails
                    continue

        except Exception as e:
            print(f"Error parsing user info: {e}")

        return user_info if user_info.get('username') else None

    def _parse_cookie_string(self, cookie_string):
        """
        Parse cookie string into dictionary

        Args:
            cookie_string: String like "uid=123; pass=abc"

        Returns:
            dict: Cookie dictionary
        """
        cookies = {}
        try:
            for item in cookie_string.split('; '):
                if '=' in item:
                    key, value = item.split('=', 1)
                    cookies[key.strip()] = value.strip()
        except Exception as e:
            print(f"Error parsing cookie string: {e}")
            return {}

        return cookies


# Convenience function
def validate_cookie(cookie_string):
    """Quick validation function"""
    validator = CookieValidator()
    return validator.test_cookie(cookie_string)
