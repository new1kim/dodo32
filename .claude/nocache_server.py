"""Static file server for local preview - sends no-cache headers so edited
files are always reloaded fresh (python -m http.server lets browsers cache
aggressively, which made preview verification unreliable)."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420
    http.server.test(HandlerClass=NoCacheHandler, port=port)
