"""Server locale di prova (forza i tipi MIME giusti: su Windows .js puo' risultare text/plain)."""
import functools, http.server, pathlib
H = http.server.SimpleHTTPRequestHandler
H.extensions_map.update({".js": "text/javascript", ".webmanifest": "application/manifest+json", ".json": "application/json"})
http.server.test(HandlerClass=functools.partial(H, directory=str(pathlib.Path(__file__).parent / "app")), port=8765, bind="127.0.0.1")
