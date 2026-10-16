"""Genera le icone dell'app (manubrio arancione su fondo scuro)."""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).parent / "app" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
BG, FG = (17, 20, 24), (255, 122, 26)


def icon(size, pad):
    s = 4  # supersampling
    S = size * s
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    u = (S - 2 * pad * S) / 10  # griglia interna 10x10
    o = pad * S
    r = lambda x0, y0, x1, y1: d.rounded_rectangle([o + x0 * u, o + y0 * u, o + x1 * u, o + y1 * u], radius=u * 0.35, fill=FG)
    r(1.6, 4.55, 8.4, 5.45)   # barra
    r(2.1, 2.6, 3.1, 7.4)     # dischi sinistri
    r(0.9, 3.4, 1.9, 6.6)
    r(6.9, 2.6, 7.9, 7.4)     # dischi destri
    r(8.1, 3.4, 9.1, 6.6)
    return img.resize((size, size), Image.LANCZOS)


icon(192, 0.12).save(OUT / "icon-192.png")
icon(512, 0.12).save(OUT / "icon-512.png")
icon(512, 0.22).save(OUT / "maskable-512.png")
print("ok")
