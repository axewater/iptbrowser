"""
Configuration Manager for IPT Browser
Handles cookie storage, validation, and hot reload without app restart
"""

import json
import os
import shutil
from datetime import datetime
from filelock import FileLock
from dotenv import load_dotenv


class ConfigManager:
    """
    Centralized configuration management with hot reload support
    Uses singleton pattern to ensure single instance across the app
    """

    _instance = None
    _initialized = False

    def __new__(cls, config_file='config.json'):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, config_file='config.json'):
        # Only initialize once (singleton pattern)
        if ConfigManager._initialized:
            return

        self.config_file = os.path.join(os.path.dirname(__file__), config_file)
        self.lock_file = self.config_file + '.lock'
        self.backup_file = self.config_file + '.backup'
        self.config = None

        # Load config on initialization
        self.load_config()

        ConfigManager._initialized = True

    def load_config(self):
        """Load configuration from file with thread-safe locking"""
        lock = FileLock(self.lock_file, timeout=10)

        with lock:
            if os.path.exists(self.config_file):
                try:
                    with open(self.config_file, 'r', encoding='utf-8') as f:
                        self.config = json.load(f)
                except (json.JSONDecodeError, IOError) as e:
                    print(f"Error loading config: {e}")
                    # Try to restore from backup
                    if os.path.exists(self.backup_file):
                        print("Attempting to restore from backup...")
                        shutil.copy(self.backup_file, self.config_file)
                        with open(self.config_file, 'r', encoding='utf-8') as f:
                            self.config = json.load(f)
                    else:
                        # Create default config
                        self.config = self._create_default_config()
            else:
                # Create default config
                self.config = self._create_default_config()

        return self.config

    def save_config(self, config=None):
        """Save configuration to file with atomic write"""
        if config is not None:
            self.config = config

        if self.config is None:
            self.config = self._create_default_config()

        lock = FileLock(self.lock_file, timeout=10)

        with lock:
            # Backup existing config
            if os.path.exists(self.config_file):
                shutil.copy(self.config_file, self.backup_file)

            # Atomic write: write to temp file, then rename
            temp_file = self.config_file + '.tmp'
            try:
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(self.config, f, indent=2, ensure_ascii=False)

                # Rename temp to actual config (atomic operation)
                if os.path.exists(self.config_file):
                    os.remove(self.config_file)
                os.rename(temp_file, self.config_file)

                return True
            except Exception as e:
                print(f"Error saving config: {e}")
                # Clean up temp file
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                return False

    def _create_default_config(self):
        """Create default configuration structure"""
        return {
            "cookie": {
                "value": "",
                "last_validated": None,
                "validation_status": "unknown",
                "expiry_detected": False
            },
            "app_settings": {
                "cache_duration": 15,
                "default_time_window_days": 30
            },
            "qbittorrent": {
                "enabled": False,
                "host": "http://theknox:5008",
                "username": "",
                "password": "",
                "category": "games",
                "use_category": True,
                "session": {
                    "sid": None,
                    "expires_at": None
                }
            }
        }

    def get_cookie(self):
        """Get cookie value from config"""
        if self.config is None:
            self.load_config()

        cookie_value = self.config.get('cookie', {}).get('value', '')
        return cookie_value if cookie_value else None

    def set_cookie(self, cookie_value):
        """Set cookie value and save to config"""
        if self.config is None:
            self.load_config()

        if 'cookie' not in self.config:
            self.config['cookie'] = {}

        self.config['cookie']['value'] = cookie_value
        self.config['cookie']['validation_status'] = 'unknown'

        return self.save_config()

    def get_last_validated(self):
        """Get last validation timestamp"""
        if self.config is None:
            self.load_config()

        timestamp_str = self.config.get('cookie', {}).get('last_validated')
        if timestamp_str:
            try:
                return datetime.fromisoformat(timestamp_str)
            except (ValueError, TypeError):
                return None
        return None

    def mark_validated(self, status='valid', expiry_detected=False):
        """Mark cookie as validated with timestamp"""
        if self.config is None:
            self.load_config()

        if 'cookie' not in self.config:
            self.config['cookie'] = {}

        self.config['cookie']['last_validated'] = datetime.now().isoformat()
        self.config['cookie']['validation_status'] = status
        self.config['cookie']['expiry_detected'] = expiry_detected

        return self.save_config()

    def get_validation_status(self):
        """Get current validation status"""
        if self.config is None:
            self.load_config()

        return self.config.get('cookie', {}).get('validation_status', 'unknown')

    def get_expiry_detected(self):
        """Check if cookie expiry was detected"""
        if self.config is None:
            self.load_config()

        return self.config.get('cookie', {}).get('expiry_detected', False)

    def get_app_setting(self, key, default=None):
        """Get application setting by key"""
        if self.config is None:
            self.load_config()

        return self.config.get('app_settings', {}).get(key, default)

    def set_app_setting(self, key, value):
        """Set application setting"""
        if self.config is None:
            self.load_config()

        if 'app_settings' not in self.config:
            self.config['app_settings'] = {}

        self.config['app_settings'][key] = value
        return self.save_config()

    # ============================================================================
    # qBittorrent Configuration Methods
    # ============================================================================

    def get_qbittorrent_config(self):
        """Get full qBittorrent configuration"""
        if self.config is None:
            self.load_config()

        return self.config.get('qbittorrent', self._create_default_config()['qbittorrent'])

    def get_qbittorrent_enabled(self):
        """Check if qBittorrent integration is enabled"""
        config = self.get_qbittorrent_config()
        return config.get('enabled', False)

    def get_qbittorrent_host(self):
        """Get qBittorrent host URL"""
        config = self.get_qbittorrent_config()
        return config.get('host', 'http://theknox:5008')

    def get_qbittorrent_credentials(self):
        """Get qBittorrent credentials as tuple (username, password)"""
        config = self.get_qbittorrent_config()
        return (config.get('username', ''), config.get('password', ''))

    def get_qbittorrent_category(self):
        """Get default qBittorrent category"""
        config = self.get_qbittorrent_config()
        return config.get('category', 'games')

    def get_qbittorrent_use_category(self):
        """Check if category should be used when adding torrents"""
        config = self.get_qbittorrent_config()
        return config.get('use_category', True)

    def set_qbittorrent_config(self, enabled=None, host=None, username=None, password=None, category=None, use_category=None):
        """
        Update qBittorrent configuration

        Args:
            enabled: Enable/disable integration
            host: qBittorrent host URL
            username: qBittorrent username
            password: qBittorrent password
            category: Default category for torrents
            use_category: Whether to use category when adding torrents
        """
        if self.config is None:
            self.load_config()

        if 'qbittorrent' not in self.config:
            self.config['qbittorrent'] = self._create_default_config()['qbittorrent']

        if enabled is not None:
            self.config['qbittorrent']['enabled'] = enabled
        if host is not None:
            self.config['qbittorrent']['host'] = host
        if username is not None:
            self.config['qbittorrent']['username'] = username
        if password is not None:
            self.config['qbittorrent']['password'] = password
        if category is not None:
            self.config['qbittorrent']['category'] = category
        if use_category is not None:
            self.config['qbittorrent']['use_category'] = use_category

        return self.save_config()

    def set_qbittorrent_session(self, sid, expires_at):
        """
        Cache qBittorrent session

        Args:
            sid: Session ID (SID cookie value)
            expires_at: Session expiration timestamp (ISO format string)
        """
        if self.config is None:
            self.load_config()

        if 'qbittorrent' not in self.config:
            self.config['qbittorrent'] = self._create_default_config()['qbittorrent']

        if 'session' not in self.config['qbittorrent']:
            self.config['qbittorrent']['session'] = {}

        self.config['qbittorrent']['session']['sid'] = sid
        self.config['qbittorrent']['session']['expires_at'] = expires_at

        return self.save_config()

    def clear_qbittorrent_session(self):
        """Invalidate cached qBittorrent session"""
        if self.config is None:
            self.load_config()

        if 'qbittorrent' not in self.config:
            return True

        if 'session' not in self.config['qbittorrent']:
            return True

        self.config['qbittorrent']['session'] = {
            'sid': None,
            'expires_at': None
        }

        return self.save_config()

    def migrate_from_env(self):
        """
        Migrate cookie from .env file to config.json
        Returns True if migration successful, False otherwise
        """
        env_path = os.path.join(os.path.dirname(__file__), '.env')

        if not os.path.exists(env_path):
            return False

        # Load .env
        load_dotenv()
        cookie = os.getenv('IPTORRENTS_COOKIE')

        if not cookie:
            return False

        # Save to config.json
        self.set_cookie(cookie)

        # Backup .env
        backup_path = env_path + '.backup'
        if not os.path.exists(backup_path):
            shutil.copy(env_path, backup_path)

        # Add migration note to .env
        try:
            with open(env_path, 'a', encoding='utf-8') as f:
                f.write('\n# MIGRATED TO config.json - This file is no longer used for cookies\n')
        except Exception as e:
            print(f"Warning: Could not update .env file: {e}")

        print(f"✓ Migrated cookie from .env to config.json")
        print(f"✓ Backed up .env to {backup_path}")

        return True


# Convenience function for quick access
def get_config_manager():
    """Get the singleton ConfigManager instance"""
    return ConfigManager()
