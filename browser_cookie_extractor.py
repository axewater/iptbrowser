"""
Browser Cookie Extractor for IPT Browser
Extracts IPTorrents cookies from local browser databases
Supports: Chrome, Edge, Firefox
"""

import os
import sqlite3
import shutil
import tempfile
from datetime import datetime

# Windows DPAPI for Chrome/Edge cookie decryption
try:
    import win32crypt
    DPAPI_AVAILABLE = True
except ImportError:
    DPAPI_AVAILABLE = False
    print("Warning: win32crypt not available. Chrome/Edge extraction will not work.")


class BrowserCookieExtractor:
    """Extract IPTorrents cookies from local browser databases"""

    def __init__(self):
        self.domain = 'iptorrents.com'
        self.required_cookies = ['uid', 'pass']

    def detect_browsers(self):
        """
        Detect which browsers are installed and have cookie databases

        Returns:
            list: List of available browser dicts
        """
        browsers = []

        # Chrome
        chrome_path = self._get_chrome_cookie_path()
        if chrome_path and os.path.exists(chrome_path):
            browsers.append({
                'name': 'Chrome',
                'id': 'chrome',
                'path': chrome_path,
                'available': True
            })

        # Edge
        edge_path = self._get_edge_cookie_path()
        if edge_path and os.path.exists(edge_path):
            browsers.append({
                'name': 'Edge',
                'id': 'edge',
                'path': edge_path,
                'available': True
            })

        # Firefox
        firefox_paths = self._get_firefox_cookie_paths()
        if firefox_paths:
            for profile_name, profile_path in firefox_paths:
                browsers.append({
                    'name': f'Firefox ({profile_name})',
                    'id': 'firefox',
                    'path': profile_path,
                    'profile': profile_name,
                    'available': True
                })

        return browsers

    def extract_from_chrome(self, profile='Default'):
        """
        Extract cookies from Chrome

        Args:
            profile: Chrome profile name (default: "Default")

        Returns:
            dict: {success, cookie, browser, profile, error}
        """
        if not DPAPI_AVAILABLE:
            return {
                'success': False,
                'cookie': None,
                'browser': 'Chrome',
                'profile': profile,
                'error': 'win32crypt library not available. Install pywin32.'
            }

        cookie_path = self._get_chrome_cookie_path(profile)

        if not cookie_path or not os.path.exists(cookie_path):
            return {
                'success': False,
                'cookie': None,
                'browser': 'Chrome',
                'profile': profile,
                'error': f'Chrome cookie database not found at {cookie_path}'
            }

        return self._extract_chromium_cookies(cookie_path, 'Chrome', profile)

    def extract_from_edge(self, profile='Default'):
        """
        Extract cookies from Edge

        Args:
            profile: Edge profile name (default: "Default")

        Returns:
            dict: {success, cookie, browser, profile, error}
        """
        if not DPAPI_AVAILABLE:
            return {
                'success': False,
                'cookie': None,
                'browser': 'Edge',
                'profile': profile,
                'error': 'win32crypt library not available. Install pywin32.'
            }

        cookie_path = self._get_edge_cookie_path(profile)

        if not cookie_path or not os.path.exists(cookie_path):
            return {
                'success': False,
                'cookie': None,
                'browser': 'Edge',
                'profile': profile,
                'error': f'Edge cookie database not found at {cookie_path}'
            }

        return self._extract_chromium_cookies(cookie_path, 'Edge', profile)

    def extract_from_firefox(self, profile=None):
        """
        Extract cookies from Firefox

        Args:
            profile: Firefox profile name (optional, uses first found if None)

        Returns:
            dict: {success, cookie, browser, profile, error}
        """
        firefox_paths = self._get_firefox_cookie_paths()

        if not firefox_paths:
            return {
                'success': False,
                'cookie': None,
                'browser': 'Firefox',
                'profile': profile,
                'error': 'Firefox cookie database not found'
            }

        # Use specified profile or first available
        profile_name, cookie_path = firefox_paths[0]
        if profile:
            for p_name, p_path in firefox_paths:
                if p_name == profile:
                    profile_name, cookie_path = p_name, p_path
                    break

        return self._extract_firefox_cookies(cookie_path, profile_name)

    def _extract_chromium_cookies(self, cookie_path, browser_name, profile):
        """
        Extract cookies from Chromium-based browsers (Chrome, Edge)

        Args:
            cookie_path: Path to cookie database
            browser_name: Browser name for display
            profile: Profile name

        Returns:
            dict: Result dictionary
        """
        # Copy database to temp file (browser might have it locked)
        temp_dir = tempfile.gettempdir()
        temp_cookie_path = os.path.join(temp_dir, f'cookies_{browser_name.lower()}.sqlite')

        try:
            shutil.copy2(cookie_path, temp_cookie_path)
        except Exception as e:
            return {
                'success': False,
                'cookie': None,
                'browser': browser_name,
                'profile': profile,
                'error': f'Could not copy cookie database: {str(e)}. Close {browser_name} and try again.'
            }

        try:
            # Connect to database
            conn = sqlite3.connect(temp_cookie_path)
            cursor = conn.cursor()

            # Query for IPTorrents cookies
            query = """
                SELECT name, encrypted_value, expires_utc
                FROM cookies
                WHERE host_key LIKE ?
            """

            cursor.execute(query, (f'%{self.domain}%',))
            rows = cursor.fetchall()

            conn.close()

            if not rows:
                # Clean up temp file
                if os.path.exists(temp_cookie_path):
                    os.remove(temp_cookie_path)

                return {
                    'success': False,
                    'cookie': None,
                    'browser': browser_name,
                    'profile': profile,
                    'error': f'No cookies found for {self.domain}. Make sure you are logged into IPTorrents in {browser_name}.'
                }

            # Extract and decrypt cookies
            cookies = {}
            for name, encrypted_value, expires_utc in rows:
                if name in self.required_cookies:
                    try:
                        # Decrypt using Windows DPAPI
                        decrypted_value = win32crypt.CryptUnprotectData(encrypted_value, None, None, None, 0)[1].decode('utf-8')
                        cookies[name] = decrypted_value
                    except Exception as e:
                        print(f"Error decrypting {name} cookie: {e}")

            # Clean up temp file
            if os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)

            # Check if we got all required cookies
            missing = [c for c in self.required_cookies if c not in cookies]
            if missing:
                return {
                    'success': False,
                    'cookie': None,
                    'browser': browser_name,
                    'profile': profile,
                    'error': f'Missing required cookies: {", ".join(missing)}'
                }

            # Format cookie string
            cookie_string = '; '.join([f'{name}={value}' for name, value in cookies.items()])

            return {
                'success': True,
                'cookie': cookie_string,
                'browser': browser_name,
                'profile': profile,
                'error': None
            }

        except Exception as e:
            # Clean up temp file
            if os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)

            return {
                'success': False,
                'cookie': None,
                'browser': browser_name,
                'profile': profile,
                'error': f'Error extracting cookies: {str(e)}'
            }

    def _extract_firefox_cookies(self, cookie_path, profile_name):
        """
        Extract cookies from Firefox

        Args:
            cookie_path: Path to Firefox cookie database
            profile_name: Profile name

        Returns:
            dict: Result dictionary
        """
        # Copy database to temp file (browser might have it locked)
        temp_dir = tempfile.gettempdir()
        temp_cookie_path = os.path.join(temp_dir, 'cookies_firefox.sqlite')

        try:
            shutil.copy2(cookie_path, temp_cookie_path)
        except Exception as e:
            return {
                'success': False,
                'cookie': None,
                'browser': 'Firefox',
                'profile': profile_name,
                'error': f'Could not copy cookie database: {str(e)}. Close Firefox and try again.'
            }

        try:
            # Connect to database
            conn = sqlite3.connect(temp_cookie_path)
            cursor = conn.cursor()

            # Query for IPTorrents cookies
            query = """
                SELECT name, value, expiry
                FROM moz_cookies
                WHERE host LIKE ?
            """

            cursor.execute(query, (f'%{self.domain}%',))
            rows = cursor.fetchall()

            conn.close()

            if not rows:
                # Clean up temp file
                if os.path.exists(temp_cookie_path):
                    os.remove(temp_cookie_path)

                return {
                    'success': False,
                    'cookie': None,
                    'browser': 'Firefox',
                    'profile': profile_name,
                    'error': f'No cookies found for {self.domain}. Make sure you are logged into IPTorrents in Firefox.'
                }

            # Extract cookies (Firefox cookies are NOT encrypted)
            cookies = {}
            for name, value, expiry in rows:
                if name in self.required_cookies:
                    cookies[name] = value

            # Clean up temp file
            if os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)

            # Check if we got all required cookies
            missing = [c for c in self.required_cookies if c not in cookies]
            if missing:
                return {
                    'success': False,
                    'cookie': None,
                    'browser': 'Firefox',
                    'profile': profile_name,
                    'error': f'Missing required cookies: {", ".join(missing)}'
                }

            # Format cookie string
            cookie_string = '; '.join([f'{name}={value}' for name, value in cookies.items()])

            return {
                'success': True,
                'cookie': cookie_string,
                'browser': 'Firefox',
                'profile': profile_name,
                'error': None
            }

        except Exception as e:
            # Clean up temp file
            if os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)

            return {
                'success': False,
                'cookie': None,
                'browser': 'Firefox',
                'profile': profile_name,
                'error': f'Error extracting cookies: {str(e)}'
            }

    def _get_chrome_cookie_path(self, profile='Default'):
        """Get Chrome cookie database path"""
        local_app_data = os.getenv('LOCALAPPDATA')
        if not local_app_data:
            return None

        cookie_path = os.path.join(local_app_data, 'Google', 'Chrome', 'User Data', profile, 'Cookies')
        return cookie_path if os.path.exists(cookie_path) else None

    def _get_edge_cookie_path(self, profile='Default'):
        """Get Edge cookie database path"""
        local_app_data = os.getenv('LOCALAPPDATA')
        if not local_app_data:
            return None

        cookie_path = os.path.join(local_app_data, 'Microsoft', 'Edge', 'User Data', profile, 'Cookies')
        return cookie_path if os.path.exists(cookie_path) else None

    def _get_firefox_cookie_paths(self):
        """
        Get Firefox cookie database paths for all profiles

        Returns:
            list: List of (profile_name, cookie_path) tuples
        """
        app_data = os.getenv('APPDATA')
        if not app_data:
            return []

        firefox_dir = os.path.join(app_data, 'Mozilla', 'Firefox', 'Profiles')
        if not os.path.exists(firefox_dir):
            return []

        profiles = []
        try:
            for profile_dir in os.listdir(firefox_dir):
                cookie_path = os.path.join(firefox_dir, profile_dir, 'cookies.sqlite')
                if os.path.exists(cookie_path):
                    # Extract profile name (usually format: xxxxx.profile-name)
                    profile_name = profile_dir.split('.', 1)[1] if '.' in profile_dir else profile_dir
                    profiles.append((profile_name, cookie_path))
        except Exception as e:
            print(f"Error detecting Firefox profiles: {e}")

        return profiles


# Convenience function
def extract_cookie_from_browser(browser='chrome', profile='Default'):
    """
    Quick extraction function

    Args:
        browser: Browser name ('chrome', 'edge', 'firefox')
        profile: Profile name

    Returns:
        dict: Result dictionary
    """
    extractor = BrowserCookieExtractor()

    if browser.lower() == 'chrome':
        return extractor.extract_from_chrome(profile)
    elif browser.lower() == 'edge':
        return extractor.extract_from_edge(profile)
    elif browser.lower() == 'firefox':
        return extractor.extract_from_firefox(profile)
    else:
        return {
            'success': False,
            'cookie': None,
            'browser': browser,
            'profile': profile,
            'error': f'Unsupported browser: {browser}'
        }
