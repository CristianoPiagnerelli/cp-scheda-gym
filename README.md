# cp-scheda-gym

App personale per la palestra (PWA installabile su Android): programma, allenamenti con storico,
timer di recupero con schermo sempre acceso, riepilogo da passare al coach.

Il codice pubblicato non contiene dati personali: programma e allenamenti vivono solo nel telefono
(localStorage). Al primo avvio si importa il file del programma.

- `app/` — l'app (pubblicata su GitHub Pages)
- `notion_bridge.py` — ponte in sola lettura verso Notion (token in `.env`, escluso da git)
- `notion_to_app.py` — converte l'export Notion in `private/programma.json`
- `serve.py` — server locale di prova su http://localhost:8765
