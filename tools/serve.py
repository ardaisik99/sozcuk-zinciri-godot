"""Serve the actual Godot web export locally. No third party packages required."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.pck': 'application/octet-stream'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--port', type=int, default=8060)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent.parent / 'docs'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(GameHandler, directory=str(directory)))
    print(f'Sözcük Zinciri: http://localhost:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
