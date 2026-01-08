"""
IGDB API Client
Handles authentication and game data retrieval from IGDB (Internet Game Database)

IGDB is owned by Twitch and uses Twitch OAuth2 for authentication.
"""

import os
import requests
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


class IGDBClient:
    """
    Client for IGDB API with OAuth2 token management

    Features:
    - OAuth2 token caching (60-day expiry)
    - Automatic token refresh
    - Game search by name with platform filtering
    - Response formatting for frontend consumption
    """

    def __init__(self, config_manager=None):
        """
        Initialize IGDB client

        Args:
            config_manager: ConfigManager instance (for future use)
        """
        self.config_manager = config_manager
        self.client_id = os.getenv('IGDB_CLIENT_ID')
        self.client_secret = os.getenv('IGDB_CLIENT_SECRET')

        if not self.client_id or not self.client_secret:
            logger.warning("IGDB credentials not found in environment variables")

        self.base_url = 'https://api.igdb.com/v4'
        self.oauth_url = 'https://id.twitch.tv/oauth2/token'
        self.access_token = None
        self.token_expiry = None

    def _get_access_token(self) -> Optional[str]:
        """
        Get or refresh OAuth access token

        Tokens are cached and automatically refreshed when they expire.
        IGDB tokens typically last 60 days (5,184,000 seconds).

        Returns:
            str: Access token, or None if authentication fails
        """
        # Check if cached token is still valid (with 5-minute buffer)
        if self.access_token and self.token_expiry:
            buffer_time = timedelta(minutes=5)
            if datetime.now() + buffer_time < self.token_expiry:
                logger.debug("Using cached IGDB access token")
                return self.access_token

        # Request new token
        logger.info("Requesting new IGDB access token from Twitch OAuth")

        try:
            response = requests.post(
                self.oauth_url,
                params={
                    'client_id': self.client_id,
                    'client_secret': self.client_secret,
                    'grant_type': 'client_credentials'
                },
                timeout=10
            )

            response.raise_for_status()

            data = response.json()
            self.access_token = data['access_token']

            # Calculate expiry time (typically 5,184,000 seconds = 60 days)
            expires_in = data.get('expires_in', 5184000)
            self.token_expiry = datetime.now() + timedelta(seconds=expires_in)

            logger.info(f"IGDB access token obtained, expires at {self.token_expiry}")
            return self.access_token

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to obtain IGDB access token: {e}")
            return None

    def search_game(self, game_name: str, platform_filter: Optional[str] = None) -> Optional[Dict]:
        """
        Search for game by normalized name with optional platform filter

        Uses IGDB's search functionality with Apicalypse query language.
        Returns the best match (first result).

        Args:
            game_name: Normalized game name (e.g., "half life")
            platform_filter: IGDB platform ID as string (e.g., "6" for PC, "130" for Switch)

        Returns:
            dict: Formatted game data, or None if not found
        """
        token = self._get_access_token()

        if not token:
            logger.error("Cannot search game: No valid access token")
            return None

        headers = {
            'Client-ID': self.client_id,
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json'
        }

        # Build Apicalypse query
        # Search by name, get top 5 results with all relevant fields
        query = f'search "{game_name}"; '
        query += 'fields name, cover.image_id, screenshots.image_id, videos.video_id, '
        query += 'rating, rating_count, aggregated_rating, aggregated_rating_count, '
        query += 'genres.name, platforms.name, involved_companies.company.name, '
        query += 'involved_companies.developer, first_release_date, summary; '

        # Add platform filter if specified
        if platform_filter:
            query += f'where platforms = ({platform_filter}); '

        query += 'limit 5;'

        logger.debug(f"IGDB query: {query}")

        try:
            response = requests.post(
                f'{self.base_url}/games',
                headers=headers,
                data=query.encode('utf-8'),
                timeout=10
            )

            response.raise_for_status()

            games = response.json()

            if not games or len(games) == 0:
                logger.info(f"No game found for '{game_name}'" +
                          (f" on platform {platform_filter}" if platform_filter else ""))
                return None

            # Return best match (first result)
            logger.info(f"Found game: {games[0].get('name')} for search '{game_name}'")
            return self._format_game_data(games[0])

        except requests.exceptions.RequestException as e:
            logger.error(f"IGDB API request failed: {e}")
            return None
        except (ValueError, KeyError) as e:
            logger.error(f"Failed to parse IGDB response: {e}")
            return None

    def _format_game_data(self, game: Dict) -> Dict:
        """
        Format IGDB response for frontend consumption

        Extracts and formats relevant game data including cover images,
        screenshots, trailers, ratings, and metadata.

        Args:
            game: Raw IGDB game object

        Returns:
            dict: Formatted game data with consistent structure
        """
        # Extract cover URL (use cover_big size: 264x374)
        cover_url = None
        if game.get('cover'):
            image_id = game['cover'].get('image_id')
            if image_id:
                cover_url = f'https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg'

        # Extract screenshots (limit to 4, use medium size)
        screenshots = []
        for shot in game.get('screenshots', [])[:4]:
            image_id = shot.get('image_id')
            if image_id:
                screenshots.append(
                    f'https://images.igdb.com/igdb/image/upload/t_screenshot_med/{image_id}.jpg'
                )

        # Extract developer from involved companies
        developer = 'Unknown'
        for company in game.get('involved_companies', []):
            if company.get('developer'):
                company_name = company.get('company', {}).get('name')
                if company_name:
                    developer = company_name
                    break

        # Extract video URLs (YouTube)
        videos = []
        for video in game.get('videos', []):
            video_id = video.get('video_id')
            if video_id:
                videos.append(f'https://www.youtube.com/watch?v={video_id}')

        # Format ratings (IGDB uses 0-100 scale)
        rating = game.get('rating')
        if rating:
            rating = round(rating / 10, 1)  # Convert to 0-10 scale

        aggregated_rating = game.get('aggregated_rating')
        if aggregated_rating:
            aggregated_rating = round(aggregated_rating / 10, 1)

        # Format release date (Unix timestamp to year)
        release_year = None
        first_release_date = game.get('first_release_date')
        if first_release_date:
            try:
                release_year = datetime.fromtimestamp(first_release_date).year
            except:
                pass

        # Build formatted response
        formatted = {
            'name': game.get('name', 'Unknown'),
            'summary': game.get('summary', 'No description available.'),
            'cover_url': cover_url,
            'screenshots': screenshots,
            'rating': rating,  # User rating (0-10)
            'rating_count': game.get('rating_count'),
            'aggregated_rating': aggregated_rating,  # Critic rating (0-10)
            'aggregated_rating_count': game.get('aggregated_rating_count'),
            'release_date': first_release_date,  # Unix timestamp
            'release_year': release_year,
            'genres': [g['name'] for g in game.get('genres', [])],
            'platforms': [p['name'] for p in game.get('platforms', [])],
            'developer': developer,
            'trailer_url': videos[0] if videos else None,
            'igdb_id': game.get('id')
        }

        return formatted

    def test_connection(self) -> Dict:
        """
        Test IGDB connection and credentials

        Attempts to search for a known game ("Half-Life") to verify
        that authentication and API calls work correctly.

        Returns:
            dict: Test result with success status and message
        """
        try:
            # Try to get access token
            token = self._get_access_token()

            if not token:
                return {
                    'success': False,
                    'message': 'Failed to obtain access token. Check IGDB credentials in .env file.'
                }

            # Test with a known game
            test_game = self.search_game("Half-Life", platform_filter="6")  # PC platform

            if test_game:
                token_expiry_str = self.token_expiry.isoformat() if self.token_expiry else 'unknown'
                return {
                    'success': True,
                    'message': f'Connected successfully. Found: {test_game.get("name")}',
                    'token_expiry': token_expiry_str,
                    'test_game': test_game
                }
            else:
                return {
                    'success': False,
                    'message': 'Connection successful but test game search failed'
                }

        except Exception as e:
            logger.error(f"IGDB connection test failed: {e}")
            return {
                'success': False,
                'message': f'Connection test failed: {str(e)}'
            }

    def get_token_status(self) -> Dict:
        """
        Get current OAuth token status

        Returns:
            dict: Token status information
        """
        if not self.access_token or not self.token_expiry:
            return {
                'has_token': False,
                'is_valid': False
            }

        is_valid = datetime.now() < self.token_expiry

        return {
            'has_token': True,
            'is_valid': is_valid,
            'expiry': self.token_expiry.isoformat(),
            'expires_in_days': (self.token_expiry - datetime.now()).days if is_valid else 0
        }


# Platform ID mapping for reference
IGDB_PLATFORMS = {
    'PC': '6',
    'PlayStation 4': '48',
    'PlayStation 5': '167',
    'Xbox One': '49',
    'Xbox Series X|S': '169',
    'Nintendo Switch': '130',
    'Wii': '5',
    'Wii U': '41',
    'Nintendo 3DS': '37',
    'PlayStation 3': '9',
    'Xbox 360': '12'
}


if __name__ == '__main__':
    # Standalone testing
    from dotenv import load_dotenv

    # Load .env file for standalone testing
    load_dotenv()

    logging.basicConfig(level=logging.DEBUG)

    client = IGDBClient()

    print("Testing IGDB connection...")
    result = client.test_connection()
    print(f"Success: {result['success']}")
    print(f"Message: {result['message']}")

    if result['success']:
        print(f"\nTest game data:")
        test_game = result.get('test_game', {})
        print(f"  Name: {test_game.get('name')}")
        print(f"  Developer: {test_game.get('developer')}")
        print(f"  Rating: {test_game.get('rating')}/10")
        print(f"  Genres: {', '.join(test_game.get('genres', []))}")
        print(f"  Cover: {test_game.get('cover_url')}")
        print(f"  Trailer: {test_game.get('trailer_url')}")
