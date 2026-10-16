"""Ponte Notion -> file locali (sola lettura).

Uso:
  python notion_bridge.py scan     elenca pagine e database visibili all'integrazione
  python notion_bridge.py schema   salva la struttura dei database in export/schema.json
  python notion_bridge.py export   esporta tutte le righe dei database in export/<nome>.json
"""
import json
import pathlib
import sys
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).parent
API = "https://api.notion.com/v1"
VERSION = "2022-06-28"


def load_token():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("NOTION_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("NOTION_TOKEN mancante in .env")


TOKEN = load_token()


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Errore Notion {e.code}: {e.read().decode()}")


def paginate(method, path, body=None):
    body = dict(body or {})
    while True:
        res = call(method, path, body if method == "POST" else None)
        yield from res["results"]
        if not res.get("has_more"):
            break
        body["start_cursor"] = res["next_cursor"]


def plain(rich):
    return "".join(t.get("plain_text", "") for t in rich or [])


def title_of(obj):
    if obj["object"] == "database":
        return plain(obj.get("title"))
    for p in obj.get("properties", {}).values():
        if p.get("type") == "title":
            return plain(p["title"])
    return ""


def search_all():
    return list(paginate("POST", "/search", {"page_size": 100}))


def cmd_scan():
    for o in search_all():
        parent = o["parent"]
        ptype = parent["type"]
        print(f'{o["object"]:8} | {title_of(o) or "(senza titolo)"} | parent={ptype}:{parent.get(ptype)} | {o["id"]}')


def prop_value(p):
    t = p["type"]
    v = p.get(t)
    if t in ("title", "rich_text"):
        return plain(v)
    if t in ("select", "status"):
        return v and v["name"]
    if t == "multi_select":
        return [x["name"] for x in v]
    if t == "date":
        return v and {"start": v["start"], "end": v["end"]}
    if t == "relation":
        return [x["id"] for x in v]
    if t == "people":
        return [x.get("name") or x["id"] for x in v]
    if t == "files":
        return [x["name"] for x in v]
    if t == "formula":
        return v.get(v["type"])
    if t == "rollup":
        return v.get(v["type"]) if v["type"] != "array" else [prop_value(x) for x in v["array"]]
    return v


def databases():
    return [o for o in search_all() if o["object"] == "database"]


def cmd_schema():
    out = {}
    for db in databases():
        out[title_of(db) or db["id"]] = {
            "id": db["id"],
            "properties": {
                name: {"type": p["type"], **({"options": [o["name"] for o in p[p["type"]]["options"]]}
                                             if p["type"] in ("select", "multi_select", "status") else {})}
                for name, p in db["properties"].items()
            },
        }
    dest = ROOT / "export"
    dest.mkdir(exist_ok=True)
    (dest / "schema.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_export():
    dest = ROOT / "export"
    dest.mkdir(exist_ok=True)
    for db in databases():
        name = title_of(db) or db["id"]
        rows = [
            {"id": r["id"], **{k: prop_value(p) for k, p in r["properties"].items()}}
            for r in paginate("POST", f'/databases/{db["id"]}/query', {"page_size": 100})
        ]
        safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in name).strip()
        (dest / f"{safe}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{name}: {len(rows)} righe")


if __name__ == "__main__":
    {"scan": cmd_scan, "schema": cmd_schema, "export": cmd_export}[sys.argv[1] if len(sys.argv) > 1 else "scan"]()
