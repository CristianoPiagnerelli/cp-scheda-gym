# cp-scheda-gym

App personale per la palestra (PWA installabile su Android): allenamento guidato, timer di recupero
con schermo sempre acceso, storico e progressi.

I dati stanno in un Foglio Google privato su Drive:
- **Programma**: una riga per esercizio (si modifica nel foglio, come prima in Notion);
- **Allenamenti**: scritto dall'app, una riga per serie;
- **Coach**: nota mostrata nella home dell'app.

Il codice pubblicato non contiene dati personali. L'app parla con il foglio tramite lo script in
`apps-script/Code.gs`, incollato *dentro* il foglio (Estensioni > Apps Script) con `@OnlyCurrentDoc`:
può accedere solo a quel foglio, a nient'altro dell'account. È pubblicato come App web ed è protetto
da una chiave segreta. La copia con la
chiave vera è in `private/Code.gs`, esclusa da git. Senza rete l'app salva gli allenamenti e li invia
al foglio appena torna la connessione.

- `app/` — l'app (pubblicata su GitHub Pages a ogni push)
- `apps-script/Code.gs` — script del foglio (senza chiave)
- `notion_bridge.py` — ponte in sola lettura verso Notion usato per la migrazione (token in `.env`, ora rimosso)
- `notion_to_app.py`, `make_sheet.py` — conversione della Scheda Notion nel programma del foglio
- `coach.py` — invia al foglio le modifiche del coach (`python coach.py --leggi` per leggere)
- `serve.py` — server locale di prova: `python serve.py 8766`
