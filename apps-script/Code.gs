/**
 * Script del Foglio Google "cp-scheda-gym": fa da ponte tra il foglio e l'app sul telefono.
 * Va incollato in Estensioni > Apps Script del foglio e pubblicato come "App web".
 * La copia con la chiave vera è in private/Code.gs (mai su GitHub).
 */
const KEY = '__CHIAVE__';
const SHEET_ID = ''; // vuoto se lo script è dentro il foglio
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
    if (body && body.action === 'setRest') return out_(setRest_(ss, body));
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
    coach: String(ss.getSheetByName('Coach').getRange('A2').getValue() || ''),
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
    if (String(v[r][gi]).trim() === b.dayName && String(v[r][ei]).trim() === b.name) {
      prog.getRange(r + 1, ri + 1).setValue(Number(b.rest));
      return { ok: true };
    }
  }
  return { ok: true, skipped: 'esercizio non trovato' };
}
