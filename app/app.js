'use strict';

const KEY = 'palestra.v1';
const OUTLOOKS = ['Easy', 'Barely/doable', 'Barely', 'Collapse'];
const KINDS = { weight: 'Pesi', reps: 'Corpo libero', time: 'A tempo (sec)', cardio: 'Cardio (min)' };

const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => (v === '' || v == null || isNaN(+v) ? null : +v);
const fmtKg = v => (v == null ? '' : String(v).replace('.', ','));
const pad = n => String(n).padStart(2, '0');
const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const mmss = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const restLabel = s => (s >= 60 ? `${Math.floor(s / 60)}'${s % 60 ? pad(s % 60) : ''}` : `${s}"`);
const dateIt = t => new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const range = reps => { const m = String(reps).match(/(\d+)(?:\s*-\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : [null, null]; };

let db;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const exName = id => db.exercises[id]?.name || id;
const allDays = () => [db.program.warmup, ...db.program.days];
const findDay = id => allDays().find(d => d.id === id);

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

/* ---------- storico ---------- */

function lastEntry(exId) {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const e = db.sessions[i].entries.find(x => x.ex === exId);
    if (e) return { s: db.sessions[i], e };
  }
  return null;
}

function setsText(e, kind) {
  return e.sets.map(s => {
    if (kind === 'weight') return `${fmtKg(s.kg)}×${s.reps ?? '?'}`;
    if (kind === 'time') return `${s.reps ?? '?'}"`;
    if (kind === 'cardio') return `${s.reps ?? '?'}'`;
    return `${s.reps ?? '?'}`;
  }).join(', ');
}

// Regola di progressione semplice (doppia progressione): tutte le serie al massimo del range e non al limite -> aumenta.
function suggestion(item, last) {
  const ex = db.exercises[item.ex];
  if (!last || ex?.kind !== 'weight') return '';
  const [lo, hi] = range(item.reps);
  const sets = last.e.sets;
  const kg = Math.max(...sets.map(s => s.kg || 0));
  if (!kg || lo == null) return '';
  if (last.e.outlook === 'Collapse' || sets.some(s => (s.reps ?? 0) < lo)) return `Resta a ${fmtKg(kg)} kg finché non chiudi tutte le serie nel range.`;
  if (sets.length >= item.sets && sets.every(s => (s.reps ?? 0) >= hi) && last.e.outlook !== 'Barely') {
    const step = kg >= 30 ? 2.5 : kg > 10 ? 2 : 1;
    return `Hai chiuso tutto a ${hi}: prova ${fmtKg(kg + step)} kg.`;
  }
  return '';
}

function nextDay() {
  const days = db.program.days;
  const last = [...db.sessions].reverse().find(s => days.some(d => d.id === s.dayId));
  if (!last) return days[0];
  const i = days.findIndex(d => d.id === last.dayId);
  return days[(i + 1) % days.length];
}

/* ---------- viste ---------- */

function home() {
  if (!db.program.days.length) return `<h1>Palestra</h1>
    <div class="card accent">
      <h3>Benvenuto</h3>
      <p class="muted">I tuoi dati restano solo su questo telefono. Per iniziare importa il file del programma (es. <b>programma.json</b>, mandato da Drive, mail o chat).</p>
      <input type="file" accept=".json,application/json" id="importFile" class="full">
    </div>`;
  const a = db.active;
  const week = db.sessions.filter(s => s.start > Date.now() - 7 * 864e5).length;
  const month = db.sessions.filter(s => s.start > Date.now() - 28 * 864e5).length;
  const nd = nextDay();
  return `
    <h1>Palestra</h1>
    ${db.coachMessage ? `<div class="card accent"><div class="muted small">Nota del coach</div><p>${h(db.coachMessage).replace(/\n/g, '<br>')}</p></div>` : ''}
    ${a ? `<div class="card accent"><div class="row between"><div><h3>Allenamento in corso</h3><div class="muted">${h(findDay(a.dayId)?.name)} · iniziato alle ${clock(a.start).slice(0, 5)}</div></div><a class="btn primary" href="#/session">Riprendi</a></div></div>` : ''}
    <div class="card row between">
      <div><b>${week}</b> <span class="muted">negli ultimi 7 giorni</span></div>
      <div><b>${(month / 4).toFixed(1).replace('.', ',')}</b> <span class="muted">a settimana (4 sett.)</span></div>
    </div>
    <h2>Scegli l'allenamento</h2>
    ${db.program.days.map(d => {
      const last = [...db.sessions].reverse().find(s => s.dayId === d.id);
      return `<div class="card row between">
        <div class="grow"><h3>${h(d.name)} ${d === nd ? '<span class="tag next">prossimo</span>' : ''}</h3>
          <div class="muted small">${d.items.map(i => h(exName(i.ex))).join(' · ')}</div>
          <div class="muted small">${last ? 'Ultima volta: ' + dateIt(last.start) : 'Mai fatto nell\'app'}</div></div>
        <button class="${d === nd ? 'primary' : ''}" data-act="start" data-day="${d.id}" ${a ? 'disabled' : ''}>Inizia</button>
      </div>`;
    }).join('')}`;
}

function session() {
  const a = db.active;
  if (!a) return `<h1>Nessun allenamento in corso</h1><a class="btn primary" href="#/">Torna a Oggi</a>`;
  const day = findDay(a.dayId);
  const wu = db.program.warmup;
  const wuDone = wu.items.filter(i => a.warmup[i.ex]).length;
  return `
    <div class="row between"><h1>${h(day.name)}</h1><span class="muted" id="elapsed"></span></div>
    <details class="card" ${wuDone < wu.items.length ? 'open' : ''}>
      <summary class="row between"><h3>Warm-up</h3><span class="muted">${wuDone}/${wu.items.length}</span></summary>
      ${wu.items.map(i => `<label class="wu"><input type="checkbox" data-act="wu" data-ex="${i.ex}" ${a.warmup[i.ex] ? 'checked' : ''}>
        <span class="grow">${h(exName(i.ex))}</span><span class="muted">${i.sets > 1 ? i.sets + '×' : ''}${h(i.reps)}</span></label>`).join('')}
    </details>
    ${day.items.map(item => exerciseCard(item, a.entries[item.ex])).join('')}
    <label class="muted small">Note sull'allenamento</label>
    <textarea data-field="sessionNote">${h(a.note || '')}</textarea>
    <div class="row" style="margin-top:14px">
      <button class="danger" data-act="cancel">Annulla</button>
      <button class="primary grow" data-act="finish">Termina allenamento</button>
    </div>`;
}

function exerciseCard(item, entry) {
  const ex = db.exercises[item.ex] || { name: item.ex, kind: 'weight' };
  const last = lastEntry(item.ex);
  const done = entry.sets.filter(s => s.done).length;
  const unit = ex.kind === 'time' ? 'sec' : ex.kind === 'cardio' ? 'min' : 'reps';
  const tip = suggestion(item, last);
  const lastTxt = last
    ? `Ultima volta (${dateIt(last.s.start)}): <b>${setsText(last.e, ex.kind)}</b>${last.e.outlook ? ' · ' + h(last.e.outlook) : ''}`
    : item.weight != null ? `Da Notion: <b>${fmtKg(item.weight)} kg</b>${item.outlook ? ' · ' + h(item.outlook) : ''}` : '';
  return `<div class="card ex ${done >= entry.sets.length ? 'done' : ''}">
    <div class="row between"><h3><a href="#/ex/${item.ex}" style="color:inherit">${h(ex.name)}</a></h3><span class="muted">${done}/${entry.sets.length}</span></div>
    <div class="muted small">${item.sets} × ${h(item.reps)} ${unit}${ex.kind !== 'cardio' ? ' · rec ' + restLabel(item.rest) : ''}${ex.perSide ? ' · kg per lato' : ''}${item.note ? ' · ' + h(item.note) : ''}</div>
    ${lastTxt ? `<div class="hint">${lastTxt}</div>` : ''}
    ${tip ? `<div class="tip">${h(tip)}</div>` : ''}
    <div class="sets">
      ${entry.sets.map((s, i) => `<div class="set ${ex.kind === 'weight' ? '' : 'simple'}">
        <span class="n">${i + 1}</span>
        ${ex.kind === 'weight' ? `<label><input type="number" inputmode="decimal" step="0.5" data-field="kg" data-ex="${item.ex}" data-i="${i}" value="${s.kg ?? ''}">kg</label>` : ''}
        <label><input type="number" inputmode="numeric" data-field="reps" data-ex="${item.ex}" data-i="${i}" value="${s.reps ?? ''}">${unit}</label>
        <button class="check ${s.done ? 'on' : ''}" data-act="set" data-ex="${item.ex}" data-i="${i}">✓</button>
      </div>`).join('')}
    </div>
    <div class="row" style="margin-top:6px">
      <button class="small ghost" data-act="addSet" data-ex="${item.ex}">+ serie</button>
      ${entry.sets.length > 1 ? `<button class="small ghost" data-act="delSet" data-ex="${item.ex}">− serie</button>` : ''}
    </div>
    ${ex.kind === 'weight' ? `<div class="chips">${OUTLOOKS.map(o => `<button class="chip ${entry.outlook === o ? 'on' : ''}" data-act="outlook" data-ex="${item.ex}" data-v="${o}">${o}</button>`).join('')}</div>` : ''}
    <input type="text" class="full" style="margin-top:10px" placeholder="Nota" data-field="note" data-ex="${item.ex}" value="${h(entry.note || '')}">
  </div>`;
}

function historyView() {
  if (!db.sessions.length) return `<h1>Storico</h1><p class="muted">Ancora nessun allenamento salvato. Finisci il primo e lo trovi qui.</p>`;
  const exIds = [...new Set(db.sessions.flatMap(s => s.entries.map(e => e.ex)))]
    .filter(id => db.exercises[id]?.kind === 'weight');
  return `<h1>Storico</h1>
    <details class="card"><summary><h3>Progressi per esercizio ›</h3></summary>
      ${exIds.map(id => `<p><a href="#/ex/${id}">${h(exName(id))}</a></p>`).join('')}
    </details>
    ${[...db.sessions].reverse().map(s => `<details class="card">
      <summary class="row between"><div><h3>${dateIt(s.start)} · ${h(s.dayName)}</h3>
        <div class="muted small">${Math.round((s.end - s.start) / 60000)} min · ${s.entries.length} esercizi</div></div><span class="muted">›</span></summary>
      <table>${s.entries.map(e => `<tr><td>${h(exName(e.ex))}</td><td>${setsText(e, db.exercises[e.ex]?.kind)}${e.outlook ? `<div class="muted small">${h(e.outlook)}</div>` : ''}${e.note ? `<div class="muted small">${h(e.note)}</div>` : ''}</td></tr>`).join('')}</table>
      ${s.note ? `<p class="muted">${h(s.note)}</p>` : ''}
      <button class="small danger" data-act="delSession" data-id="${s.id}">Elimina</button>
    </details>`).join('')}`;
}

function exercisePage(id) {
  const ex = db.exercises[id];
  const rows = db.sessions.map(s => ({ s, e: s.entries.find(e => e.ex === id) })).filter(r => r.e);
  const pts = rows.map(r => ({ t: r.s.start, v: Math.max(...r.e.sets.map(x => (ex?.kind === 'weight' ? x.kg : x.reps) || 0)) }));
  return `<h1>${h(ex?.name || id)}</h1>
    <p class="muted">${ex?.kind === 'weight' ? 'Carico massimo per allenamento (kg)' : 'Massimo per allenamento'}</p>
    ${pts.length > 1 ? chart(pts) : '<p class="muted">Servono almeno due allenamenti per il grafico.</p>'}
    <table><tr><th>Data</th><th>Serie</th><th></th></tr>
      ${rows.reverse().map(r => `<tr><td>${dateIt(r.s.start)}</td><td>${setsText(r.e, ex?.kind)}</td><td class="muted">${h(r.e.outlook || '')}</td></tr>`).join('')}
    </table>
    <p><a href="javascript:history.back()">‹ Indietro</a></p>`;
}

function chart(pts) {
  const W = 340, H = 160, P = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = t => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = v => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="var(--line)"/>
    <text x="2" y="${y(hi) + 4}">${fmtKg(hi)}</text><text x="2" y="${y(lo) + 4}">${fmtKg(lo)}</text>
    <text x="${P}" y="${H - 8}">${dateIt(t0)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${dateIt(t1)}</text>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
    ${pts.map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('')}
  </svg>`;
}

function program() {
  const opts = Object.entries(db.exercises).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, e]) => `<option value="${id}">${h(e.name)}</option>`).join('');
  return `<h1>Programma</h1>
    <p class="muted">Le modifiche valgono dal prossimo allenamento. Lo storico non cambia.</p>
    ${allDays().map(d => `<div class="card">
      <div class="row between">
        ${d.id === 'warmup' ? `<h3>${h(d.name)}</h3>` : `<input type="text" class="grow" data-pday="${d.id}" data-pfield="name" value="${h(d.name)}">`}
        ${d.id === 'warmup' ? '' : `<button class="small danger" data-act="delDay" data-day="${d.id}">Elimina giorno</button>`}
      </div>
      ${d.items.map((it, i) => `<div class="pitem">
        <b>${h(exName(it.ex))} <span class="muted small">${KINDS[db.exercises[it.ex]?.kind] || ''}</span></b>
        <div class="row">
          <button class="small ghost" data-act="mv" data-day="${d.id}" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'}>↑</button>
          <button class="small ghost" data-act="mv" data-day="${d.id}" data-i="${i}" data-d="1" ${i < d.items.length - 1 ? '' : 'disabled'}>↓</button>
          <button class="small danger ghost" data-act="rmItem" data-day="${d.id}" data-i="${i}">✕</button>
        </div>
        <div class="pfields">
          <label>Serie<input type="number" data-pday="${d.id}" data-i="${i}" data-pfield="sets" value="${it.sets}"></label>
          <label>Reps<input type="text" data-pday="${d.id}" data-i="${i}" data-pfield="reps" value="${h(it.reps)}"></label>
          ${db.exercises[it.ex]?.kind === 'weight' ? `<label>Kg base<input type="number" step="0.5" data-pday="${d.id}" data-i="${i}" data-pfield="weight" value="${it.weight ?? ''}"></label>` : ''}
          ${d.id === 'warmup' ? '' : `<label>Rec. (s)<input type="number" step="5" data-pday="${d.id}" data-i="${i}" data-pfield="rest" value="${it.rest}"></label>`}
          <label class="wide">Nota<input type="text" data-pday="${d.id}" data-i="${i}" data-pfield="note" value="${h(it.note || '')}"></label>
        </div>
      </div>`).join('')}
      <div class="row wrap" style="margin-top:10px">
        <select class="grow" id="add-${d.id}"><option value="">Aggiungi esercizio esistente…</option>${opts}</select>
        <button class="small" data-act="addItem" data-day="${d.id}">Aggiungi</button>
      </div>
    </div>`).join('')}
    <div class="card">
      <h3>Nuovo esercizio</h3>
      <div class="row wrap" style="margin-top:8px">
        <input type="text" id="newExName" class="grow" placeholder="Nome (es. Hip Thrust)">
        <select id="newExKind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <label class="muted small"><input type="checkbox" id="newExSide"> kg per lato</label>
        <button class="small" data-act="newEx">Crea</button>
      </div>
      <p class="muted small">Poi aggiungilo a un giorno con il menu sopra.</p>
    </div>
    <button class="full" data-act="addDay">+ Aggiungi giorno</button>`;
}

function data() {
  const n = db.sessions.length;
  return `<h1>Dati e coach</h1>
    <div class="card">
      <h3>Per il coach</h3>
      <p class="muted">Copia il riepilogo e incollalo nella chat con Claude: analizza i progressi e ti propone il programma aggiornato.</p>
      <button class="primary full" data-act="coachCopy">Copia riepilogo allenamenti</button>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted">${n} allenamenti salvati su questo telefono. Fai un backup ogni tanto (es. su Google Drive).</p>
      <button class="full" data-act="export">Esporta backup (.json)</button>
      <p class="muted small" style="margin-top:12px">Importa un backup completo, oppure un file con solo il programma preparato dal coach (lo storico resta).</p>
      <input type="file" accept=".json,application/json" id="importFile" class="full">
    </div>
    <div class="card">
      <h3>Nota del coach</h3>
      <textarea data-field="coachMessage">${h(db.coachMessage || '')}</textarea>
    </div>
    <div class="card">
      <h3>Notifiche e schermo</h3>
      <p class="muted">Durante l'allenamento lo schermo resta acceso. A fine recupero il telefono vibra e suona; con le notifiche attive l'avviso arriva anche a schermo bloccato.</p>
      <button class="full" data-act="askNotif">Attiva notifiche (${'Notification' in window ? Notification.permission : 'non supportate'})</button>
    </div>
    <button class="danger full" data-act="reset">Cancella tutto e reimporta da Notion</button>`;
}

/* ---------- render ---------- */

function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const views = { '': home, session, history: historyView, ex: exercisePage, program, data };
  $('#main').innerHTML = (views[route] || home)(arg && decodeURIComponent(arg));
  document.querySelectorAll('nav a').forEach(a => {
    const r = a.getAttribute('href').slice(2);
    a.classList.toggle('on', r === route || (r === '' && (route === 'session' || !views[route])));
  });
  keepAwake();
  tick();
}
const go = hash => (location.hash === hash ? render() : (location.hash = hash));

/* ---------- azioni ---------- */

function startSession(dayId) {
  const day = findDay(dayId);
  const entries = {};
  for (const item of day.items) {
    const last = lastEntry(item.ex);
    const [lo] = range(item.reps);
    entries[item.ex] = {
      sets: Array.from({ length: item.sets }, (_, i) => {
        const ls = last?.e.sets[i] || last?.e.sets[last.e.sets.length - 1];
        return { kg: ls?.kg ?? item.weight ?? null, reps: ls?.reps ?? lo, done: false };
      }),
      outlook: null,
      note: '',
    };
  }
  db.active = { id: uid(), dayId, start: Date.now(), warmup: {}, entries, note: '' };
  save();
  unlockAudio();
  askNotif();
  go('#/session');
}

function finishSession() {
  const a = db.active;
  const day = findDay(a.dayId);
  const entries = day.items
    .map(item => ({ item, en: a.entries[item.ex] }))
    .filter(({ en }) => en && en.sets.some(s => s.done))
    .map(({ item, en }) => ({ ex: item.ex, sets: en.sets.filter(s => s.done).map(({ kg, reps }) => ({ kg, reps })), outlook: en.outlook, note: en.note }));
  if (!entries.length) {
    if (!confirm('Nessuna serie segnata come fatta. Scartare l\'allenamento?')) return;
  } else {
    db.sessions.push({ id: a.id, dayId: a.dayId, dayName: day.name, start: a.start, end: Date.now(), entries, note: a.note });
    // il peso usato diventa il nuovo "kg base" del programma
    for (const e of entries) {
      const item = day.items.find(i => i.ex === e.ex);
      const kgs = e.sets.map(s => s.kg).filter(v => v != null);
      if (item && kgs.length) item.weight = Math.max(...kgs);
    }
  }
  db.active = null;
  db.timer = null;
  save();
  clearNotif();
  toast(entries.length ? 'Allenamento salvato 💪' : 'Allenamento scartato');
  go(entries.length ? '#/history' : '#/');
}

function moveItem(dayId, i, d) {
  const items = findDay(dayId).items;
  const j = i + d;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  save();
  render();
}

const actions = {
  start: el => startSession(el.dataset.day),
  wu: el => { db.active.warmup[el.dataset.ex] = el.checked; save(); },
  set: el => {
    const en = db.active.entries[el.dataset.ex];
    const s = en.sets[+el.dataset.i];
    s.done = !s.done;
    save();
    const item = findDay(db.active.dayId).items.find(i => i.ex === el.dataset.ex);
    const kind = db.exercises[el.dataset.ex]?.kind;
    if (s.done && kind !== 'cardio') startTimer(item.rest, `${exName(el.dataset.ex)} · serie ${+el.dataset.i + 1}`);
    render();
  },
  addSet: el => { const sets = db.active.entries[el.dataset.ex].sets; const l = sets[sets.length - 1]; sets.push({ kg: l?.kg ?? null, reps: l?.reps ?? null, done: false }); save(); render(); },
  delSet: el => { db.active.entries[el.dataset.ex].sets.pop(); save(); render(); },
  outlook: el => { const en = db.active.entries[el.dataset.ex]; en.outlook = en.outlook === el.dataset.v ? null : el.dataset.v; save(); render(); },
  finish: () => finishSession(),
  cancel: () => { if (confirm('Annullare l\'allenamento? Quanto segnato finora andrà perso.')) { db.active = null; db.timer = null; save(); clearNotif(); go('#/'); } },
  timerAdd: el => { if (db.timer) { db.timer.end += +el.dataset.sec * 1000; db.timer.total = Math.max(1, db.timer.total + +el.dataset.sec); save(); showTimerNotif(); tick(); } },
  timerSkip: () => { db.timer = null; save(); clearNotif(); tick(); },
  delSession: el => { if (confirm('Eliminare questo allenamento dallo storico?')) { db.sessions = db.sessions.filter(s => s.id !== el.dataset.id); save(); render(); } },
  mv: el => moveItem(el.dataset.day, +el.dataset.i, +el.dataset.d),
  rmItem: el => { const d = findDay(el.dataset.day); if (confirm(`Togliere ${exName(d.items[+el.dataset.i].ex)} da ${d.name}?`)) { d.items.splice(+el.dataset.i, 1); save(); render(); } },
  addItem: el => {
    const id = $(`#add-${el.dataset.day}`).value;
    if (!id) return;
    const ex = db.exercises[id];
    findDay(el.dataset.day).items.push({ ex: id, sets: el.dataset.day === 'warmup' ? 1 : 3, reps: ex.kind === 'cardio' ? '15' : ex.kind === 'time' ? '30' : '8-10', weight: null, rest: ex.kind === 'weight' ? 90 : 60, note: '' });
    save(); render();
  },
  newEx: () => {
    const name = $('#newExName').value.trim();
    if (!name) return;
    const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (db.exercises[id]) return toast('Esiste già');
    db.exercises[id] = { name, kind: $('#newExKind').value, perSide: $('#newExSide').checked };
    save(); render(); toast(`Creato: ${name}`);
  },
  addDay: () => { const n = db.program.days.length + 1; db.program.days.push({ id: uid(), name: `Giorno ${n}`, items: [] }); save(); render(); },
  delDay: el => { const d = findDay(el.dataset.day); if (confirm(`Eliminare ${d.name} dal programma? Lo storico resta.`)) { db.program.days = db.program.days.filter(x => x !== d); save(); render(); } },
  coachCopy: async () => {
    const txt = coachSummary();
    try { await navigator.clipboard.writeText(txt); toast('Copiato: incollalo nella chat'); }
    catch { $('#main').insertAdjacentHTML('beforeend', `<textarea readonly style="min-height:240px">${h(txt)}</textarea>`); }
  },
  export: () => exportBackup(),
  askNotif: async () => { await askNotif(); render(); },
  reset: async () => {
    if (!confirm('Cancellare TUTTO (storico compreso) e ripartire dalla scheda Notion? Fai prima un backup.')) return;
    localStorage.removeItem(KEY);
    await load();
    go('#/');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.field) {
    const f = el.dataset.field;
    if (f === 'coachMessage') db.coachMessage = el.value;
    else if (f === 'sessionNote') db.active.note = el.value;
    else if (f === 'note') db.active.entries[el.dataset.ex].note = el.value;
    else db.active.entries[el.dataset.ex].sets[+el.dataset.i][f] = num(el.value);
    save();
  } else if (el.dataset.pfield) {
    const d = findDay(el.dataset.pday);
    const f = el.dataset.pfield;
    if (f === 'name') d.name = el.value;
    else d.items[+el.dataset.i][f] = ['sets', 'rest', 'weight'].includes(f) ? num(el.value) ?? (f === 'weight' ? null : 1) : el.value;
    save();
  }
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'importFile' || !e.target.files[0]) return;
  try {
    const obj = JSON.parse(await e.target.files[0].text());
    if (obj.sessions && obj.program) {
      if (!confirm(`Sostituire tutti i dati con il backup (${obj.sessions.length} allenamenti)?`)) return;
      db = { ...db, ...obj, active: null, timer: null };
    } else if (obj.program) {
      if (!confirm('Caricare il nuovo programma? Lo storico resta.')) return;
      db.program = obj.program;
      db.exercises = { ...db.exercises, ...(obj.exercises || {}) };
      if (obj.coachMessage) db.coachMessage = obj.coachMessage;
    } else throw new Error('formato');
    save();
    toast('Importato');
    go('#/');
  } catch { toast('File non valido'); }
});

/* ---------- coach / backup ---------- */

function coachSummary() {
  const since = Date.now() - 60 * 864e5;
  const ss = db.sessions.filter(s => s.start >= since);
  const lines = [
    `Riepilogo palestra – ${dayKey(Date.now())}`,
    `Ultimi 60 giorni: ${ss.length} allenamenti (${(ss.length / (60 / 7)).toFixed(1)} a settimana).`,
    '',
  ];
  for (const s of ss) {
    lines.push(`${dayKey(s.start)} ${s.dayName} (${Math.round((s.end - s.start) / 60000)} min)`);
    for (const e of s.entries) {
      const ex = db.exercises[e.ex];
      lines.push(`- ${ex?.name || e.ex}${ex?.perSide ? ' [kg per lato]' : ''}: ${setsText(e, ex?.kind)}${e.outlook ? ' · ' + e.outlook : ''}${e.note ? ' · ' + e.note : ''}`);
    }
    if (s.note) lines.push(`  Note: ${s.note}`);
  }
  lines.push('', 'Programma attuale (JSON):', JSON.stringify({ exercises: db.exercises, program: db.program }));
  return lines.join('\n');
}

async function exportBackup() {
  const { active, timer, ...rest } = db;
  const name = `palestra-backup-${dayKey(Date.now())}.json`;
  const file = new File([JSON.stringify(rest, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- timer recupero ---------- */

let audio;
function unlockAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
}
function beep() {
  if (!audio) return;
  [0, 0.35, 0.7].forEach(t => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audio.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.5, audio.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.25);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + t);
    o.stop(audio.currentTime + t + 0.3);
  });
}

function startTimer(sec, label) {
  db.timer = { end: Date.now() + sec * 1000, total: sec, label };
  save();
  unlockAudio();
  showTimerNotif();
  tick();
}

function tick() {
  if (!db) return;
  const el = $('#elapsed');
  if (el && db.active) el.textContent = mmss(Math.floor((Date.now() - db.active.start) / 1000));
  const t = db.timer;
  const box = $('#timer');
  document.body.classList.toggle('has-timer', !!t);
  if (!t) { box.hidden = true; return; }
  const left = Math.ceil((t.end - Date.now()) / 1000);
  if (left <= 0) {
    db.timer = null;
    save();
    box.hidden = true;
    document.body.classList.remove('has-timer');
    if (left > -30) alarm(); // non suonare se l'app viene riaperta molto dopo
    return;
  }
  box.hidden = false;
  $('#t-left').textContent = mmss(left);
  $('#t-label').textContent = t.label;
  $('#t-end').textContent = `fine alle ${clock(t.end)}`;
  $('#t-bar').style.width = `${Math.min(100, (1 - left / t.total) * 100)}%`;
}

function alarm() {
  navigator.vibrate?.([400, 150, 400, 150, 400]);
  beep();
  notify('Recupero finito 🔔', 'Vai con la prossima serie', { vibrate: [400, 150, 400], requireInteraction: false });
}

/* ---------- notifiche e schermo acceso ---------- */

async function askNotif() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
}
async function notify(title, body, extra = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const opts = { body, tag: 'timer', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', ...extra };
    if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
  } catch {}
}
function showTimerNotif() {
  if (db.timer) notify(`Recupero ${mmss(db.timer.total)}`, `Finisce alle ${clock(db.timer.end)} · ${db.timer.label}`, { silent: true, renotify: false });
}
async function clearNotif() {
  try { (await navigator.serviceWorker?.ready)?.getNotifications({ tag: 'timer' }).then(ns => ns.forEach(n => n.close())); } catch {}
}

let wakeLock = null;
async function keepAwake() {
  const want = !!db?.active && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  } else if (!want && wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

/* ---------- avvio ---------- */

async function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  // Nessun dato personale nel codice pubblicato: il programma si importa da file al primo avvio.
  if (!db) {
    db = { version: 1, exercises: {}, program: { warmup: { id: 'warmup', name: 'Warm-up', items: [] }, days: [] }, coachMessage: '', sessions: [], active: null, timer: null };
    save();
  }
}

(async () => {
  await load();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => { keepAwake(); tick(); });
  render();
  setInterval(tick, 250);
})();
