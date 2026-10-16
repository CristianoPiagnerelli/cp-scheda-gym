"""Strumento del coach: invia al Foglio Google una lista di azioni (JSON) tramite lo script pubblicato.

Uso:  python coach.py private/<file>.json      (lista di oggetti {"action": ..., ...})
      python coach.py --leggi                  (scarica programma, allenamenti e guida)
Azioni: setWarmup, setGuide, setCoach, updateProgram, setRest, deleteSessionsSince.
Il link con la chiave viene letto da private/link-collegamento.txt (mai su GitHub)."""
import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent
link = (ROOT / "private" / "link-collegamento.txt").read_text(encoding="utf-8").strip()
url = urllib.parse.unquote(link.split("#/collega/", 1)[1])
key = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["k"][0]


def call(body=None):
    req = urllib.request.Request(url, data=json.dumps({**body, "k": key}).encode() if body else None,
                                 headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


if __name__ == "__main__":
    if sys.argv[1] == "--leggi":
        print(json.dumps(call(), ensure_ascii=False, indent=1))
    else:
        for a in json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")):
            res = call(a)
            print(a["action"], a.get("dayName", ""), "->", res)
            if not res.get("ok"):
                sys.exit(1)
