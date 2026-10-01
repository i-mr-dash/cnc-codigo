"""Servidor estatico do jogo, sem cache (para o iPad sempre pegar a versao nova)."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8124


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print('CNC Codigo em http://localhost:%d' % PORT)
    ThreadingHTTPServer(('0.0.0.0', PORT), NoCacheHandler).serve_forever()
