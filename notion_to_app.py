"""Converte export/Scheda.json (dal ponte Notion) in private/programma.json, da importare nell app al primo avvio."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
rows = json.loads((ROOT / "export" / "Scheda.json").read_text(encoding="utf-8"))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def split_name(raw):
    m = re.match(r"(\d+)_(.*)", raw)
    return (int(m.group(1)), m.group(2).strip()) if m else (99, raw.strip())


def parse_kg(text):
    text = (text or "").strip()
    m = re.search(r"\d+(?:[.,]\d+)?", text)
    if not m:
        return None, False, ""
    kg = float(m.group().replace(",", "."))
    per_side = "lato" in text
    rest = text.replace(m.group(), "", 1).replace("lato", "").strip()
    return (int(kg) if kg.is_integer() else kg), per_side, (f"Notion: {text}" if rest else "")


def parse_rest(sel, note):
    src = sel or ""
    m = re.search(r"recupero\s*(\d+)\s*([’'”\"]+)", note or "")
    if m:
        return int(m.group(1)) * (1 if m.group(2) in ("”", '"', "''") else 60)
    if src.startswith("1'30"):
        return 90
    if src == "1'":
        return 60
    if src == "0'40":
        return 40
    return None


def kind_of(reps, kg):
    if kg is not None:
        return "weight"
    if "''" in reps or "”" in reps:
        return "time"
    if reps.endswith("'"):
        return "cardio"
    return "reps"


exercises, days, warmup = {}, {}, []
for r in rows:
    order, name = split_name(r["Esercizio"])
    if name.lower() == "warmup":
        continue
    reps = (r["Reps"] or "").replace("–", "-").strip()
    kg, per_side, kg_note = parse_kg(r["Kg"])
    kind = kind_of(reps, kg)
    ex_id = slug(name)
    exercises[ex_id] = {"name": name, "kind": kind, "perSide": per_side}
    note = r["Note"] or ""
    rest = parse_rest(r["Recupero"], note)
    note = re.sub(r"recupero\s*\d+\s*[’'”\"]+", "", note, flags=re.I).strip()
    item = {
        "order": order,
        "ex": ex_id,
        "sets": r["Serie"] or 1,
        "reps": reps.replace("''/lato", "").replace("''", "").replace("'", ""),
        "weight": kg,
        "rest": rest if rest is not None else (90 if kind == "weight" else 60),
        "note": "; ".join(x for x in (note, kg_note) if x),
        "outlook": r["Outlook"],
    }
    if kind == "cardio":
        item["sets"] = 1
    if "/lato" in reps:
        item["note"] = "; ".join(x for x in ("per lato", item["note"]) if x)
    if r["Giorno"] == "Warm-up":
        warmup.append(item)
    else:
        days.setdefault(r["Giorno"], []).append(item)


def clean(items):
    return [{k: v for k, v in i.items() if k != "order"} for i in sorted(items, key=lambda i: i["order"])]


seed = {
    "exercises": exercises,
    "program": {
        "warmup": {"id": "warmup", "name": "Warm-up", "items": clean(warmup)},
        "days": [
            {"id": f"g{n}", "name": name, "items": clean(days[name])}
            for n, name in enumerate(sorted(days), 1)
        ],
    },
    "coachMessage": "Programma importato da Notion. Da qui in poi ogni allenamento viene salvato nello storico.",
}
out = ROOT / "private" / "programma.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(seed, ensure_ascii=False, indent=1))
