"""Server locale di prova: python serve.py [porta]  (default 8765).
Forza i tipi MIME giusti: su Windows .js puo' risultare text/plain e il service worker non parte."""
import functools
import http.server
import pathlib
import sys

H = http.server.SimpleHTTPRequestHandler
H.extensions_map.update({".js": "text/javascript", ".webmanifest": "application/manifest+json", ".json": "application/json"})
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.test(HandlerClass=functools.partial(H, directory=str(pathlib.Path(__file__).parent / "app")), port=port, bind="127.0.0.1")
