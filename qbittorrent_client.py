"""
qBittorrent Web API Client
Handles authentication, session management, and torrent operations
"""

import requests
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QbittorrentError(Exception):
    """Base exception for qBittorrent client errors"""
    pass


class AuthenticationError(QbittorrentError):
    """Raised when authentication fails"""
    pass


class ConnectionError(QbittorrentError):
    """Raised when qBittorrent is unreachable"""
    pass


class TorrentAddError(QbittorrentError):
    """Raised when adding torrent fails"""
    pass


class QbittorrentClient:
    """
    qBittorrent Web API client with session management

    Handles authentication, session caching, and torrent operations
    """

    def __init__(self, config_manager):
        """
        Initialize qBittorrent client

        Args:
            config_manager: ConfigManager instance for reading/writing config
        """
        self.config_manager = config_manager
        self.session = requests.Session()
        self.session_expiry_minutes = 60  # Default session timeout

    def authenticate(self):
        """
        Authenticate with qBittorrent and get session cookie

        Returns:
            bool: True if authentication successful

        Raises:
            ConnectionError: If qBittorrent is unreachable
            AuthenticationError: If credentials are invalid
        """
        config = self.config_manager.get_qbittorrent_config()
        host = config.get('host', '')
        username = config.get('username', '')
        password = config.get('password', '')

        if not host or not username or not password:
            raise AuthenticationError("qBittorrent credentials not configured")

        # Ensure host ends without trailing slash
        host = host.rstrip('/')

        login_url = f"{host}/api/v2/auth/login"

        try:
            # Set required headers for CORS
            headers = {
                'Referer': host,
                'Origin': host
            }

            response = self.session.post(
                login_url,
                data={'username': username, 'password': password},
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                if response.text == 'Ok.':
                    # Authentication successful
                    # Save session cookie (SID) to config
                    sid = self.session.cookies.get('SID')
                    if sid:
                        expires_at = datetime.now() + timedelta(minutes=self.session_expiry_minutes)
                        self.config_manager.set_qbittorrent_session(sid, expires_at.isoformat())
                        logger.info(f"Successfully authenticated with qBittorrent at {host}")
                        return True
                    else:
                        raise AuthenticationError("No session cookie received")
                elif response.text == 'Fails.':
                    raise AuthenticationError("Invalid username or password")
                else:
                    raise AuthenticationError(f"Unexpected response: {response.text}")
            elif response.status_code == 403:
                raise AuthenticationError("IP banned due to too many failed login attempts")
            else:
                raise AuthenticationError(f"Authentication failed with status {response.status_code}")

        except requests.exceptions.ConnectionError as e:
            raise ConnectionError(f"Could not connect to qBittorrent at {host}") from e
        except requests.exceptions.Timeout as e:
            raise ConnectionError(f"Connection to qBittorrent timed out") from e
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Request failed: {str(e)}") from e

    def is_session_valid(self):
        """
        Check if cached session is still valid

        Returns:
            bool: True if session exists and hasn't expired
        """
        config = self.config_manager.get_qbittorrent_config()
        session_data = config.get('session', {})
        sid = session_data.get('sid')
        expires_at_str = session_data.get('expires_at')

        if not sid or not expires_at_str:
            return False

        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            # Consider session valid if it has at least 5 minutes left
            if datetime.now() + timedelta(minutes=5) < expires_at:
                # Restore session cookie
                self.session.cookies.set('SID', sid)
                return True
        except (ValueError, TypeError):
            pass

        return False

    def _ensure_authenticated(self):
        """
        Ensure client is authenticated, re-authenticate if needed

        Raises:
            AuthenticationError: If re-authentication fails
            ConnectionError: If qBittorrent is unreachable
        """
        if not self.is_session_valid():
            logger.info("Session expired or invalid, re-authenticating...")
            self.authenticate()

    def test_connection(self):
        """
        Test connection to qBittorrent and verify credentials

        Returns:
            dict: {'success': bool, 'message': str}
        """
        try:
            # Clear any cached session to force fresh authentication
            self.config_manager.clear_qbittorrent_session()
            self.session.cookies.clear()

            # Attempt to authenticate
            self.authenticate()

            return {
                'success': True,
                'message': 'Connected successfully'
            }
        except AuthenticationError as e:
            return {
                'success': False,
                'message': str(e)
            }
        except ConnectionError as e:
            return {
                'success': False,
                'message': str(e)
            }
        except Exception as e:
            return {
                'success': False,
                'message': f"Unexpected error: {str(e)}"
            }

    def add_torrent_url(self, torrent_url, category=None):
        """
        Add torrent to qBittorrent by downloading the .torrent file and uploading it

        This downloads the .torrent file using IPTorrents cookies, then uploads
        the file content to qBittorrent. This is necessary because qBittorrent
        can't authenticate with IPTorrents to download the file itself.

        Args:
            torrent_url: URL to .torrent file (must be accessible with IPTorrents cookies)
            category: Optional category to assign (None = no category)

        Returns:
            dict: {'success': bool, 'message': str}

        Raises:
            ConnectionError: If qBittorrent is unreachable
            AuthenticationError: If authentication fails
            TorrentAddError: If adding torrent fails
        """
        # Ensure we're authenticated with qBittorrent
        self._ensure_authenticated()

        config = self.config_manager.get_qbittorrent_config()
        host = config.get('host', '').rstrip('/')

        # Log the request details
        logger.info(f"Adding torrent to qBittorrent:")
        logger.info(f"  URL: {torrent_url}")
        logger.info(f"  Category: {category}")
        logger.info(f"  qBittorrent host: {host}")

        try:
            # Step 1: Download the .torrent file from IPTorrents
            logger.info("Step 1: Downloading .torrent file from IPTorrents...")
            torrent_data = self._download_torrent_file(torrent_url)

            if not torrent_data:
                raise TorrentAddError("Failed to download .torrent file from IPTorrents")

            logger.info(f"  Downloaded {len(torrent_data)} bytes")

            # Step 2: Upload the .torrent file to qBittorrent
            logger.info("Step 2: Uploading .torrent file to qBittorrent...")
            add_url = f"{host}/api/v2/torrents/add"

            # Set required headers
            headers = {
                'Referer': host,
                'Origin': host
            }

            # Extract filename from URL
            import re
            filename_match = re.search(r'/([^/]+\.torrent)$', torrent_url)
            filename = filename_match.group(1) if filename_match else 'download.torrent'

            # Prepare multipart form data with the .torrent file
            files = {
                'torrents': (filename, torrent_data, 'application/x-bittorrent')
            }

            data = {
                'paused': 'false'  # Start immediately
            }

            # Add category if specified
            if category:
                data['category'] = category

            logger.debug(f"Request data: {data}")
            logger.debug(f"Uploading file: {filename}")

            response = self.session.post(
                add_url,
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )

            logger.info(f"qBittorrent response status: {response.status_code}")
            logger.info(f"qBittorrent response text: {response.text}")
            logger.debug(f"qBittorrent response headers: {dict(response.headers)}")

            if response.status_code == 200:
                if response.text == 'Ok.':
                    # Get torrent list to verify it was actually added
                    verification = self._verify_torrent_added(torrent_url)
                    if verification['success']:
                        logger.info(f"✓ Verified torrent was added: {filename}")
                        return {
                            'success': True,
                            'message': f"Torrent added successfully. {verification['message']}"
                        }
                    else:
                        logger.warning(f"⚠ qBittorrent said 'Ok.' but torrent not found in queue!")
                        logger.warning(f"  Verification details: {verification['message']}")
                        return {
                            'success': False,
                            'message': f"qBittorrent accepted the file but torrent not in queue. {verification['message']}"
                        }
                else:
                    # qBittorrent sometimes returns other messages
                    # Check if it's an error
                    if 'fail' in response.text.lower():
                        logger.error(f"qBittorrent returned failure: {response.text}")
                        raise TorrentAddError(f"Failed to add torrent: {response.text}")
                    else:
                        # Assume success if no explicit failure message
                        logger.info(f"Torrent add response: {response.text}")
                        return {
                            'success': True,
                            'message': f'Torrent added (response: {response.text})'
                        }
            elif response.status_code == 403:
                # Session might have expired, try to re-authenticate
                logger.warning("Got 403, attempting re-authentication...")
                self.config_manager.clear_qbittorrent_session()
                self._ensure_authenticated()
                # Retry the request
                return self.add_torrent_url(torrent_url, category)
            elif response.status_code == 415:
                logger.error(f"qBittorrent rejected torrent (415 Unsupported Media Type)")
                raise TorrentAddError("Invalid torrent file or URL")
            else:
                logger.error(f"qBittorrent request failed: status={response.status_code}, text={response.text}")
                raise TorrentAddError(f"Failed with status {response.status_code}: {response.text}")

        except TorrentAddError:
            raise  # Re-raise our own exceptions
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error to qBittorrent at {host}: {e}")
            raise ConnectionError(f"Could not connect to qBittorrent at {host}") from e
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout connecting to qBittorrent: {e}")
            raise ConnectionError(f"Connection to qBittorrent timed out") from e
        except requests.exceptions.RequestException as e:
            logger.error(f"Request exception: {e}")
            raise TorrentAddError(f"Request failed: {str(e)}") from e

    def _download_torrent_file(self, torrent_url):
        """
        Download .torrent file from IPTorrents using authentication cookies

        Args:
            torrent_url: URL to the .torrent file

        Returns:
            bytes: The .torrent file content, or None if download failed
        """
        # Get IPTorrents cookie from config
        iptorrents_cookie = self.config_manager.get_cookie()

        if not iptorrents_cookie:
            logger.error("No IPTorrents cookie found in config")
            return None

        # Parse cookie string into dict
        cookies = {}
        for item in iptorrents_cookie.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key] = value

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        try:
            logger.debug(f"Downloading from: {torrent_url}")
            logger.debug(f"Using IPTorrents cookies: {list(cookies.keys())}")

            response = requests.get(
                torrent_url,
                cookies=cookies,
                headers=headers,
                timeout=30
            )

            logger.debug(f"Download response status: {response.status_code}")
            logger.debug(f"Download response Content-Type: {response.headers.get('Content-Type')}")

            if response.status_code == 200:
                # Verify it's actually a torrent file
                if response.content[:11] == b'd8:announce':  # Torrent files start with bencode dictionary
                    logger.info("✓ Successfully downloaded .torrent file")
                    return response.content
                else:
                    logger.error("Downloaded content is not a valid .torrent file")
                    logger.error(f"Content preview: {response.content[:100]}")
                    return None
            else:
                logger.error(f"Failed to download .torrent file: HTTP {response.status_code}")
                logger.error(f"Response: {response.text[:200]}")
                return None

        except Exception as e:
            logger.error(f"Exception while downloading .torrent file: {e}")
            return None

    def _verify_torrent_added(self, torrent_url, timeout_seconds=5):
        """
        Verify that a torrent was actually added to qBittorrent by checking the torrent list

        Args:
            torrent_url: The URL of the torrent we expect to find
            timeout_seconds: How many seconds to wait for verification

        Returns:
            dict: {'success': bool, 'message': str}
        """
        import time

        config = self.config_manager.get_qbittorrent_config()
        host = config.get('host', '').rstrip('/')
        list_url = f"{host}/api/v2/torrents/info"

        try:
            # Wait a moment for qBittorrent to process the torrent
            time.sleep(1)

            response = self.session.get(list_url, timeout=10)

            if response.status_code == 200:
                torrents = response.json()
                logger.debug(f"Found {len(torrents)} torrents in qBittorrent queue")

                # Extract the torrent filename from the URL
                # Example: http://www.iptorrents.com/download.php/7092771/voices38-fifa.22.torrent
                import re
                filename_match = re.search(r'/([^/]+)\.torrent$', torrent_url)
                expected_name_part = filename_match.group(1) if filename_match else None

                if expected_name_part:
                    logger.debug(f"Looking for torrent with name containing: {expected_name_part}")

                    # Check if any torrent name contains our expected part
                    for torrent in torrents:
                        torrent_name = torrent.get('name', '').lower()
                        if expected_name_part.lower() in torrent_name:
                            return {
                                'success': True,
                                'message': f"Found in queue as: {torrent.get('name', 'Unknown')}"
                            }

                # If we get here, torrent was not found
                return {
                    'success': False,
                    'message': f"Torrent not found in queue (checked {len(torrents)} torrents)"
                }
            else:
                logger.warning(f"Could not verify torrent: status {response.status_code}")
                return {
                    'success': False,
                    'message': f"Could not verify (API returned {response.status_code})"
                }

        except Exception as e:
            logger.warning(f"Could not verify torrent was added: {e}")
            return {
                'success': False,
                'message': f"Verification failed: {str(e)}"
            }
