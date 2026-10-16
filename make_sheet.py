"""Crea private/Programma.csv (tabella Programma del Foglio Google) da private/programma.json.
Le altre schede (Allenamenti, Coach) le crea lo script del foglio al primo collegamento."""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
data = json.loads((ROOT / "private" / "programma.json").read_text(encoding="utf-8"))
KIND = {"weight": "Pesi", "reps": "Corpo libero", "time": "A tempo (sec)", "cardio": "Cardio (min)"}

out = ROOT / "private" / "Programma.csv"
with out.open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Giorno", "Ordine", "Esercizio", "Tipo", "Serie", "Reps min", "Reps max", "Kg", "Recupero (s)", "Per lato", "Note"])
    for d in [data["program"]["warmup"], *data["program"]["days"]]:
        for n, it in enumerate(d["items"], 1):
            ex = data["exercises"][it["ex"]]
            lo, _, hi = it["reps"].partition("-")
            w.writerow([d["name"], n, ex["name"], KIND[ex["kind"]], it["sets"], lo, hi or lo,
                        it["weight"] if it["weight"] is not None else "",
                        it["rest"] if d["id"] != "warmup" else "", "Sì" if ex["perSide"] else "", it["note"]])
print(out.read_text(encoding="utf-8"))
