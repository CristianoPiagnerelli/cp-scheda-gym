/**
 * Script del Foglio Google "cp-scheda-gym": fa da ponte tra il foglio e l'app sul telefono.
 * Va incollato in Estensioni > Apps Script del foglio e pubblicato come "App web".
 * La copia con la chiave vera è in private/Code.gs (mai su GitHub).
 *
 * @OnlyCurrentDoc  ← lo script può accedere SOLO a questo foglio, a nient'altro del tuo account.
 */
const KEY = '__CHIAVE__';
const SHEET_ID = ''; // vuoto: lo script è dentro il foglio (consigliato, permessi minimi)
const APP_URL = 'https://cristianopiagnerelli.github.io/cp-scheda-gym/';
const LOG_HEAD = ['Inizio', 'Durata (min)', 'Giorno', 'Esercizio', 'Serie', 'Kg', 'Reps', 'Outlook', 'Nota esercizio', 'Nota allenamento', 'ID'];
const TIPI = ['Pesi', 'Corpo libero', 'A tempo (sec)', 'Cardio (min)'];

/** Da eseguire una volta dall'editor: prepara le schede e chiede le autorizzazioni. */
function prepara() {
  const ss = setup_();
  const prog = ss.getSheetByName('Programma');
  const last = Math.max(prog.getMaxRows(), 200);
  prog.setFrozenRows(1);
  prog.getRange(1, 1, 1, prog.getLastColumn()).setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
  prog.getRange(2, 4, last - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TIPI, true).setAllowInvalid(false).build());
  prog.getRange(2, 10, last - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Sì'], true).build());
  prog.autoResizeColumns(1, prog.getLastColumn());
  for (const name of ['Allenamenti', 'Coach']) {
    const sh = ss.getSheetByName(name);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
  }
  Logger.log('Fogli pronti.');
}

/** Da eseguire dopo la pubblicazione come App web: scrive il link da aprire sul telefono. */
function mostraLink() {
  const link = ScriptApp.getService().getUrl() + '?k=' + KEY;
  Logger.log('Apri questo link sul telefono (una volta sola):\n' + APP_URL + '#/collega/' + encodeURIComponent(link));
}

function doGet(e) { return handle_(e, null); }
function doPost(e) { return handle_(e, JSON.parse(e.postData.contents)); }

function handle_(e, body) {
  try {
    if ((e.parameter.k || (body && body.k)) !== KEY) return out_({ ok: false, error: 'Chiave non valida' });
    const ss = setup_();
    const act = body && { addMemory: addMemory_, setDay: setDay_, setRest: setRest_, setWarmup: setWarmup_, setGuide: setGuide_, setCoach: setCoach_, updateProgram: updateProgram_, deleteSessionsSince: deleteSessionsSince_ }[body.action];
    if (act) return out_(act(ss, body));
    if (body && body.action === 'saveSession') return out_(saveSession_(ss, body.session));
    return out_(load_(ss));
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function setup_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Programma')) ss.getSheets()[0].setName('Programma');
  if (!ss.getSheetByName('Allenamenti')) {
    const log = ss.insertSheet('Allenamenti');
    log.appendRow(LOG_HEAD);
    log.setFrozenRows(1);
    log.getRange('A:A').setNumberFormat('dd/mm/yyyy HH:mm');
  }
  if (!ss.getSheetByName('Memoria')) {
    const m = ss.insertSheet('Memoria');
    m.getRange(1, 1, 1, 4).setValues([['Data', 'Tema', 'Nota', 'Fonte']]).setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
    m.setFrozenRows(1);
    m.setColumnWidth(3, 600);
  }
  if (!ss.getSheetByName('Coach')) {
    const c = ss.insertSheet('Coach');
    c.getRange('A1:A2').setValues([['Nota del coach'], ['']]);
    c.setColumnWidth(1, 700);
  }
  return ss;
}

// Righe del foglio come oggetti, con le intestazioni in minuscolo come chiavi.
function table_(sh) {
  const v = sh.getDataRange().getValues();
  const head = v.shift().map(h => String(h).trim().toLowerCase());
  return v
    .filter(r => r.some(x => x !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].getTime() : r[i]])));
}

function load_(ss) {
  return {
    ok: true,
    url: ss.getUrl(),
    program: table_(ss.getSheetByName('Programma')),
    sessions: table_(ss.getSheetByName('Allenamenti')),
    guide: ss.getSheetByName('Guida') ? table_(ss.getSheetByName('Guida')) : [],
    memory: table_(ss.getSheetByName('Memoria')),
    coach: String(ss.getSheetByName('Coach').getRange('A2').getValue() || ''),
    next: (c => ({ day: String(c[0][0] || ''), at: c[0][1] instanceof Date ? c[0][1].getTime() : Number(c[0][1]) || 0 }))(ss.getSheetByName('Coach').getRange('A5:B5').getValues()),
  };
}

function saveSession_(ss, s) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const log = ss.getSheetByName('Allenamenti');
    const head = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
    const idCol = head.indexOf('id');
    if (log.getLastRow() > 1 && idCol >= 0) {
      const ids = log.getRange(2, idCol + 1, log.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
      if (ids.includes(String(s.id))) return { ok: true, duplicate: true };
    }
    const start = new Date(s.start);
    const dur = Math.round((s.end - s.start) / 60000);
    const rows = [];
    s.entries.forEach(en => en.sets.forEach((st, i) => rows.push(
      [start, dur, s.dayName, en.name, i + 1, st.kg ?? '', st.reps ?? '', en.outlook || '', en.note || '', s.note || '', s.id])));
    if (rows.length) log.getRange(log.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    // Il carico usato diventa il nuovo "Kg" del programma (come facevi in Notion).
    const prog = ss.getSheetByName('Programma');
    const v = prog.getDataRange().getValues();
    const h = v[0].map(x => String(x).trim().toLowerCase());
    const gi = h.indexOf('giorno'), ei = h.indexOf('esercizio'), ki = h.indexOf('kg');
    if (ki >= 0) s.entries.forEach(en => {
      const kgs = en.sets.map(x => x.kg).filter(x => x !== null && x !== '' && x !== undefined);
      if (!kgs.length) return;
      for (let r = 1; r < v.length; r++) {
        if (String(v[r][gi]).trim() === s.dayName && String(v[r][ei]).trim() === en.name) prog.getRange(r + 1, ki + 1).setValue(Math.max(...kgs));
      }
    });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Cambia il recupero di un esercizio (scelto dall'app).
function setRest_(ss, b) {
  const prog = ss.getSheetByName('Programma');
  const v = prog.getDataRange().getValues();
  const h = v[0].map(x => String(x).trim().toLowerCase());
  const gi = h.indexOf('giorno'), ei = h.indexOf('esercizio'), ri = h.indexOf('recupero (s)');
  if (ri < 0) return { ok: true, skipped: 'colonna Recupero (s) mancante' };
  for (let r = 1; r < v.length; r++) {
    if (String(v[r][gi]).trim() === b.dayName && String(v[r][ei]).trim() === b.name && !/^warm/i.test(String(v[r][h.indexOf('fase')] || ''))) {
      prog.getRange(r + 1, ri + 1).setValue(Number(b.rest));
      return { ok: true };
    }
  }
  return { ok: true, skipped: 'esercizio non trovato' };
}

/* ---------- azioni del coach (usate da Claude con coach.py) ---------- */

const GUIDE_HEAD = ['Esercizio', 'Immagini', 'Muscoli', 'Esecuzione', 'Consigli', 'Video'];

function head_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
}

// Colonna "Fase" nel Programma: "Warm-up" per il riscaldamento di quel giorno, vuota per l'allenamento.
function ensureFase_(prog) {
  let h = head_(prog);
  if (h.indexOf('fase') < 0) {
    prog.getRange(1, h.length + 1).setValue('Fase').setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
    h = head_(prog);
  }
  return h;
}

// Sostituisce il warm-up di un giorno. b = { dayName, items: [{ esercizio, tipo, serie, repsMin, repsMax, note }] }
function setWarmup_(ss, b) {
  const prog = ss.getSheetByName('Programma');
  const h = ensureFase_(prog);
  const col = n => h.indexOf(n);
  const v = prog.getDataRange().getValues();
  // via le righe del warm-up di quel giorno e quelle del vecchio warm-up comune
  for (let r = v.length - 1; r >= 1; r--) {
    const g = String(v[r][col('giorno')]).trim(), f = String(v[r][col('fase')] || '').trim();
    if (/^warm/i.test(g) || (g === b.dayName && /^warm/i.test(f))) prog.deleteRow(r + 1);
  }
  const rows = b.items.map((it, i) => {
    const row = new Array(h.length).fill('');
    const set = (n, x) => { if (col(n) >= 0) row[col(n)] = x == null ? '' : x; };
    set('giorno', b.dayName); set('fase', 'Warm-up'); set('ordine', i + 1); set('esercizio', it.esercizio);
    set('tipo', it.tipo || 'Corpo libero'); set('serie', it.serie || 1); set('reps min', it.repsMin); set('reps max', it.repsMax ?? it.repsMin);
    set('note', it.note || '');
    return row;
  });
  if (!rows.length) return { ok: true };
  const now = prog.getDataRange().getValues();
  let at = now.findIndex((r, i) => i > 0 && String(r[col('giorno')]).trim() === b.dayName);
  if (at < 0) at = now.length; // giorno nuovo: in fondo
  prog.insertRowsBefore(at + 1, rows.length);
  prog.getRange(at + 1, 1, rows.length, h.length).setValues(rows).setBackground('#fff3e8');
  return { ok: true, rows: rows.length };
}

// Aggiunge o aggiorna le schede della Guida. b = { rows: [{ esercizio, immagini, muscoli, esecuzione, consigli, video }] }
function setGuide_(ss, b) {
  let g = ss.getSheetByName('Guida');
  if (!g) {
    g = ss.insertSheet('Guida');
    g.getRange(1, 1, 1, GUIDE_HEAD.length).setValues([GUIDE_HEAD]).setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
    g.setFrozenRows(1);
  }
  const v = g.getDataRange().getValues();
  const names = v.map(r => String(r[0]).trim().toLowerCase());
  b.rows.forEach(x => {
    const row = [x.esercizio, x.immagini || '', x.muscoli || '', x.esecuzione || '', x.consigli || '', x.video || ''];
    const i = names.indexOf(String(x.esercizio).trim().toLowerCase());
    if (i > 0) g.getRange(i + 1, 1, 1, row.length).setValues([row]);
    else { g.appendRow(row); names.push(String(x.esercizio).trim().toLowerCase()); }
  });
  g.getRange(2, 1, Math.max(g.getLastRow() - 1, 1), GUIDE_HEAD.length).setWrap(true).setVerticalAlignment('top');
  return { ok: true, rows: b.rows.length };
}

// b = { text } per la nota; b = { next: 'Giorno 3' } per scegliere il prossimo allenamento (vale finché non ne fai uno).
function setCoach_(ss, b) {
  const c = ss.getSheetByName('Coach');
  if (b.text !== undefined) c.getRange('A2').setValue(b.text || '');
  if (b.next !== undefined) c.getRange('A4:B5').setValues([['Prossimo giorno', 'Impostato il'], [b.next || '', new Date()]]);
  return { ok: true };
}

// Cambia uno o più campi di un esercizio del Programma. b = { dayName, name, values: { kg: 22, 'recupero (s)': 90 } }
// Le colonne che non esistono ancora vengono aggiunte in fondo (es. "Kg suggeriti", "Suggerito il").
function updateProgram_(ss, b) {
  const prog = ss.getSheetByName('Programma');
  let h = head_(prog);
  Object.keys(b.values).forEach(k => {
    if (h.indexOf(k.toLowerCase()) < 0) {
      prog.getRange(1, h.length + 1).setValue(k).setFontWeight('bold').setBackground('#ff7a1a').setFontColor('#ffffff');
      h = head_(prog);
    }
  });
  const v = prog.getDataRange().getValues();
  for (let r = 1; r < v.length; r++) {
    if (String(v[r][h.indexOf('giorno')]).trim() === b.dayName && String(v[r][h.indexOf('esercizio')]).trim() === b.name
        && !/^warm/i.test(String(v[r][h.indexOf('fase')] || ''))) {
      Object.entries(b.values).forEach(([k, x]) => { const c = h.indexOf(k.toLowerCase()); if (c >= 0) prog.getRange(r + 1, c + 1).setValue(x); });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Esercizio non trovato: ' + b.dayName + ' / ' + b.name };
}

// Cancella dagli Allenamenti le righe iniziate da `since` (ms) in poi: serve per togliere i test.
function deleteSessionsSince_(ss, b) {
  const log = ss.getSheetByName('Allenamenti');
  const v = log.getDataRange().getValues();
  let n = 0;
  for (let r = v.length - 1; r >= 1; r--) {
    if (v[r][0] instanceof Date && v[r][0].getTime() >= b.since) { log.deleteRow(r + 1); n++; }
  }
  return { ok: true, deleted: n };
}

/* ---------- memoria condivisa del coach (Claude sul PC e Claude sul telefono) ---------- */

// b = { tema, nota, fonte } -> una riga in Memoria con la data di oggi.
function addMemory_(ss, b) {
  if (!b.nota) return { ok: false, error: 'nota vuota' };
  ss.getSheetByName('Memoria').appendRow([new Date(), b.tema || '', b.nota, b.fonte || '']);
  return { ok: true };
}

// Crea o sostituisce un giorno intero del Programma (warm-up compreso).
// b = { dayName, items: [{ esercizio, tipo, serie, repsMin, repsMax, kg, recupero, perLato, note, fase }] }
function setDay_(ss, b) {
  const prog = ss.getSheetByName('Programma');
  const h = ensureFase_(prog);
  const col = n => h.indexOf(n);
  const v = prog.getDataRange().getValues();
  let at = -1;
  for (let r = v.length - 1; r >= 1; r--) {
    if (String(v[r][col('giorno')]).trim() === b.dayName) { prog.deleteRow(r + 1); at = r; }
  }
  const order = { w: 0, m: 0 };
  const rows = (b.items || []).map(it => {
    const warm = /^warm/i.test(it.fase || '');
    const row = new Array(h.length).fill('');
    const set = (n, x) => { if (col(n) >= 0) row[col(n)] = x == null ? '' : x; };
    set('giorno', b.dayName); set('fase', warm ? 'Warm-up' : ''); set('ordine', warm ? ++order.w : ++order.m);
    set('esercizio', it.esercizio); set('tipo', it.tipo || 'Corpo libero'); set('serie', it.serie || 1);
    set('reps min', it.repsMin); set('reps max', it.repsMax ?? it.repsMin); set('kg', it.kg);
    set('recupero (s)', warm ? '' : it.recupero); set('per lato', it.perLato ? 'Sì' : ''); set('note', it.note || '');
    return row;
  });
  if (!rows.length) return { ok: true, deleted: true };
  if (at < 0) at = prog.getLastRow(); // giorno nuovo: in fondo
  prog.insertRowsAfter(Math.max(at, 1), rows.length);
  prog.getRange(at + 1, 1, rows.length, h.length).setValues(rows).setBackground(null);
  rows.forEach((r, i) => { if (r[col('fase')]) prog.getRange(at + 1 + i, 1, 1, h.length).setBackground('#fff3e8'); });
  return { ok: true, rows: rows.length };
}
