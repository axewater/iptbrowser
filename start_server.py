"""
IPTorrents Browser - Network-accessible server launcher
Shows local IP addresses and starts the Flask server
"""

import socket
import os
from app import app, load_cache

def get_local_ip():
    """Get local network IP address"""
    try:
        # Create a socket to find local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Connect to a public DNS (doesn't actually send data)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "Unable to determine"

def print_banner():
    """Print startup banner with network info"""
    print("="*80)
    print("  IPTorrents Browser - PC Games Filter")
    print("="*80)
    print()
    print("  Server starting...")
    print()

    # Get network addresses
    hostname = socket.gethostname()
    local_ip = get_local_ip()

    print("  Access the application at:")
    print()
    print(f"    Local:        http://localhost:5000")
    print(f"    Local:        http://127.0.0.1:5000")
    if local_ip != "Unable to determine":
        print(f"    On Network:   http://{local_ip}:5000")
    print(f"    Hostname:     http://{hostname}:5000")
    print()
    print("="*80)
    print()
    print("  Share the network URL with other devices on your LAN!")
    print()
    print("  Press Ctrl+C to stop the server")
    print()
    print("="*80)
    print()

if __name__ == '__main__':
    # Load cache on startup
    load_cache()

    # Print banner
    print_banner()

    # Start Flask app
    # host='0.0.0.0' makes it accessible from network
    # port=5000 is the default port
    app.run(
        debug=False,  # Set to False for network access (more stable)
        host='0.0.0.0',
        port=5000,
        threaded=True  # Handle multiple connections
    )
