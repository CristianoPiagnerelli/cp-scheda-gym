'use strict';

const KEY = 'cp-scheda-gym.v2';
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const OUTLOOKS = ['Easy', 'Doable', 'Barely', 'Collapse'];
const normOutlook = o => (/^barely\s*\/\s*doable$/i.test(String(o || '').trim()) ? 'Doable' : o || null);

const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { if (v === '' || v == null) return null; const n = +String(v).replace(',', '.'); return isNaN(n) ? null : n; };
const slug = s => String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtKg = v => (v == null ? '' : String(v).replace('.', ','));
const pad = n => String(n).padStart(2, '0');
const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const mmss = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const restLabel = s => (s >= 60 ? `${Math.floor(s / 60)}'${s % 60 ? pad(s % 60) : ''}` : `${s}"`);
const dateIt = t => new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const range = reps => { const m = String(reps).match(/(\d+)(?:\s*-\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : [null, null]; };

let db;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const exName = id => db.exercises[id]?.name || id;
const allDays = () => [db.program.warmup, ...db.program.days];
const findDay = id => allDays().find(d => d.id === id);
// warm-up del giorno (scheda Programma, Fase = Warm-up); altrimenti quello comune
const warmupOf = day => (day.warmup?.length ? day.warmup : db.program.warmup.items);

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

// Ripetizioni mancate rispetto al minimo del range (serve per leggere i Collapse).
const itemOf = exId => db.program.days.flatMap(d => d.items).find(i => i.ex === exId);
function missedReps(e) {
  const [lo] = range(itemOf(e.ex)?.reps ?? '');
  return lo == null ? 0 : e.sets.reduce((n, s) => n + Math.max(0, lo - (s.reps ?? lo)), 0);
}
const outlookText = e => (e.outlook ? e.outlook + (e.outlook === 'Collapse' && missedReps(e) ? ` (−${missedReps(e)} reps)` : '') : '');

function setsText(e, kind) {
  return e.sets.map(s => {
    if (kind === 'weight') return `${fmtKg(s.kg)}×${s.reps ?? '?'}`;
    if (kind === 'time') return `${s.reps ?? '?'}"`;
    if (kind === 'cardio') return `${s.reps ?? '?'}'`;
    return `${s.reps ?? '?'}`;
  }).join(', ');
}

// Carico suggerito. Priorità al coach (colonna "Kg suggeriti" del foglio) finché non è stato usato;
// poi regola automatica: doppia progressione sull'outlook + riduzione se c'è stata una pausa.
const stepFor = kg => (kg >= 30 ? 2.5 : kg > 10 ? 2 : 1);
const roundTo = (kg, step) => Math.round(kg / step) * step;

function suggest(item) {
  const ex = db.exercises[item.ex];
  if (ex?.kind !== 'weight') return null;
  const last = lastEntry(item.ex);
  if (item.coachKg != null && (!last || !item.coachAt || last.s.start < item.coachAt))
    return { kg: item.coachKg, by: 'coach', why: 'calcolato dal coach' };
  if (!last) return item.weight != null ? { kg: item.weight, by: 'auto', why: 'dal programma' } : null;
  const [lo, hi] = range(item.reps);
  const sets = last.e.sets;
  let kg = Math.max(...sets.map(s => s.kg || 0));
  if (!kg) return null;
  const why = [];
  const allTop = hi != null && sets.length >= item.sets && sets.every(s => (s.reps ?? 0) >= hi);
  const st = stepFor(kg);
  const below = lo == null ? [] : sets.map((s, i) => ((s.reps ?? 0) < lo ? i : -1)).filter(i => i >= 0);
  const missed = missedReps(last.e);
  // Cedimento voluto: la prima serie è nel range e mancano poche reps in tutto -> stesso carico.
  const firstOk = !below.includes(0);
  if (last.e.outlook === 'Collapse' && firstOk && missed <= 5) why.push(`cedimento dalle ultime serie (−${missed}): stesso carico`);
  else if (last.e.outlook === 'Collapse') { kg -= st; why.push(`Collapse${missed ? ` (−${missed} reps)` : ''}: un passo indietro`); }
  else if (below.length) why.push('chiudi prima tutte le serie nel range');
  else if (allTop && last.e.outlook !== 'Barely') { kg += st; why.push(`chiuso tutto a ${hi}: +${fmtKg(st)} kg`); }
  else why.push('stesso carico, punta a più ripetizioni');
  const days = (Date.now() - last.s.start) / 864e5;
  const f = days >= 84 ? 0.7 : days >= 42 ? 0.8 : days >= 21 ? 0.9 : 1;
  if (f < 1) { kg *= f; why.push(`${Math.round(days / 7)} settimane di pausa: −${Math.round((1 - f) * 100)}%`); }
  return { kg: roundTo(kg, stepFor(kg)), by: 'auto', why: why.join(' · ') };
}

function nextDay() {
  const days = db.program.days;
  // scelto dal coach (scheda Coach del foglio), finché non fai un allenamento dopo quella data
  const forced = db.next?.day && days.find(d => d.name === db.next.day);
  if (forced && !db.sessions.some(s => s.start > (db.next.at || 0))) return forced;
  const last = [...db.sessions].reverse().find(s => days.some(d => d.id === s.dayId));
  if (!last) return days[0];
  const i = days.findIndex(d => d.id === last.dayId);
  return days[(i + 1) % days.length];
}

/* ---------- viste ---------- */

function home() {
  if (!db.link) return `<h1>Palestra</h1>
    <div class="card accent">
      <h3>Collega il tuo Foglio Google</h3>
      <p class="muted">Programma e allenamenti stanno nel foglio <b>cp-scheda-gym</b> sul tuo Drive. Apri il link di collegamento che ti sei mandato, oppure incollalo qui.</p>
      ${linkForm()}
    </div>`;
  if (!db.program.days.length) return `<h1>Palestra</h1>
    <div class="card">${db.syncError ? `<p class="tip">Errore: ${h(db.syncError)}</p>` : '<p class="muted">Sto leggendo il foglio…</p>'}
      <button class="full" data-act="syncNow">Riprova</button></div>`;
  const a = db.active;
  const week = db.sessions.filter(s => s.start > Date.now() - 7 * 864e5).length;
  const month = db.sessions.filter(s => s.start > Date.now() - 28 * 864e5).length;
  const nd = nextDay();
  return `
    <h1>Palestra</h1>
    ${db.coachMessage ? `<div class="card accent"><div class="muted small">Nota del coach</div><p>${h(db.coachMessage).replace(/\n/g, '<br>')}</p></div>` : ''}
    ${a ? `<div class="card accent"><div class="row between"><div><h3>Allenamento in corso</h3><div class="muted">${h(findDay(a.dayId)?.name)} · iniziato alle ${clock(a.start).slice(0, 5)}</div></div><a class="btn primary" href="#/session">Riprendi</a></div></div>` : ''}
    <p class="muted small">${db.syncError ? `⚠ Foglio non raggiungibile: ${h(db.syncError)}` : db.lastSync ? `Foglio sincronizzato alle ${clock(db.lastSync).slice(0, 5)}` : ''}${db.outbox.length ? ` · ${db.outbox.length} da inviare` : ''}</p>
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
  const wu = warmupOf(day);
  const wuDone = wu.filter(i => a.warmup[i.ex]).length;
  return `
    <div class="row between"><h1>${h(day.name)}</h1><span class="muted" id="elapsed"></span></div>
    ${wu.length ? `<details class="card" ${wuDone < wu.length ? 'open' : ''}>
      <summary class="row between"><h3>Warm-up</h3><span class="muted">${wuDone}/${wu.length}</span></summary>
      ${wu.map(i => `<div class="wu"><input type="checkbox" data-act="wu" data-ex="${i.ex}" ${a.warmup[i.ex] ? 'checked' : ''}>
        <a class="grow" href="#/ex/${i.ex}">${h(exName(i.ex))}${i.note ? `<div class="muted small">${h(i.note)}</div>` : ''}</a>
        <span class="muted">${i.sets > 1 ? i.sets + '×' : ''}${h(i.reps)}${db.exercises[i.ex]?.kind === 'cardio' ? "'" : ''}</span></div>`).join('')}
      <textarea data-field="warmupNote" placeholder="Note sul warm-up" style="margin-top:10px">${h(a.warmupNote || '')}</textarea>
    </details>` : ''}
    ${day.items.filter(item => a.entries[item.ex]).map(item => exerciseCard(item, a.entries[item.ex])).join('')}
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
  const sug = suggest(item);
  const lastTxt = last
    ? `Ultima volta (${dateIt(last.s.start)}): <b>${setsText(last.e, ex.kind)}</b>${last.e.outlook ? ' · ' + h(outlookText(last.e)) : ''}`
    : item.weight != null ? `Ultimo carico registrato: <b>${fmtKg(item.weight)} kg</b>` : '';
  return `<div class="card ex ${done >= entry.sets.length ? 'done' : ''}">
    <div class="row between"><h3><a href="#/ex/${item.ex}" style="color:inherit">${h(ex.name)}</a></h3><span class="muted">${done}/${entry.sets.length}</span></div>
    <div class="muted small">${item.sets} × ${h(item.reps)} ${unit}${ex.kind !== 'cardio' ? ' · ' + restButton(db.active.dayId, item) : ''}${ex.perSide ? ' · kg per lato' : ''}${item.note ? ' · ' + h(item.note) : ''}</div>
    ${restPicker(db.active.dayId, item)}
    ${lastTxt ? `<div class="hint">${lastTxt}</div>` : ''}
    ${sug ? `<div class="sugg">${sug.by === 'coach' ? 'Suggerito dal coach' : 'Suggerito'}: <b>${fmtKg(sug.kg)} kg${ex.perSide ? '/lato' : ''}</b> × ${h(item.reps)}<div class="muted small">${h(sug.why)}</div></div>` : ''}
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
    ${ex.kind === 'weight' ? `<div class="chips">${OUTLOOKS.map(o => `<button class="chip ${entry.outlook === o ? 'on' : ''}" data-act="outlook" data-ex="${item.ex}" data-v="${o}">${o}</button>`).join('')}</div>
      ${entry.outlook === 'Collapse' ? '<div class="muted small" style="margin-top:6px">Segna nelle serie le reps fatte davvero: quelle mancanti le calcolo io.</div>' : ''}` : ''}
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
      <table>${s.entries.map(e => `<tr><td>${h(exName(e.ex))}</td><td>${setsText(e, db.exercises[e.ex]?.kind)}${e.outlook ? `<div class="muted small">${h(outlookText(e))}</div>` : ''}${e.note ? `<div class="muted small">${h(e.note)}</div>` : ''}</td></tr>`).join('')}</table>
      ${s.note ? `<p class="muted">${h(s.note)}</p>` : ''}
      ${db.outbox.some(o => o.id === s.id) ? '<p class="tip">Non ancora salvato nel foglio: lo invio appena c\'è connessione.</p>' : ''}
    </details>`).join('')}
    <p class="muted small">Per correggere o eliminare un allenamento modifica le righe nella scheda Allenamenti del foglio.</p>`;
}

function exercisePage(id) {
  const ex = db.exercises[id];
  const rows = db.sessions.map(s => ({ s, e: s.entries.find(e => e.ex === id) })).filter(r => r.e);
  const pts = rows.map(r => ({ t: r.s.start, v: Math.max(...r.e.sets.map(x => (ex?.kind === 'weight' ? x.kg : x.reps) || 0)) }));
  const g = db.guide?.[id];
  const list = txt => String(txt || '').split('|').map(x => x.trim()).filter(Boolean);
  const imgs = list(g?.immagini?.replace(/,/g, '|')).flatMap(x => (/^https?:/.test(x) ? [x] : [0, 1].map(n => `${IMG_BASE}${x}/${n}.jpg`)));
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent((g?.video || ex?.name || id) + ' esecuzione')}`;
  return `<p><a href="javascript:history.back()">‹ Indietro</a></p>
    <h1>${h(ex?.name || id)}</h1>
    ${imgs.length ? `<div class="gallery">${imgs.map(u => `<img src="${h(u)}" alt="" loading="lazy" onerror="this.remove()">`).join('')}</div>` : ''}
    ${g ? `<div class="card">
      ${g.muscoli ? `<p><span class="muted small">Muscoli</span><br>${h(g.muscoli)}</p>` : ''}
      ${list(g.esecuzione).length ? `<h3 style="margin-top:12px">Come si fa</h3><ol class="steps">${list(g.esecuzione).map(x => `<li>${h(x)}</li>`).join('')}</ol>` : ''}
      ${list(g.consigli).length ? `<h3>Consigli</h3><ul class="steps">${list(g.consigli).map(x => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
    </div>` : '<p class="muted">Guida non ancora disponibile per questo esercizio.</p>'}
    <a class="btn full" href="${video}" target="_blank" rel="noopener">▶ Guarda un video</a>
    ${rows.length ? `<h2>I tuoi progressi</h2>
    <p class="muted">${ex?.kind === 'weight' ? 'Carico massimo per allenamento (kg)' : 'Massimo per allenamento'}</p>
    ${pts.length > 1 ? chart(pts) : '<p class="muted">Servono almeno due allenamenti per il grafico.</p>'}
    <table><tr><th>Data</th><th>Serie</th><th></th></tr>
      ${rows.reverse().map(r => `<tr><td>${dateIt(r.s.start)}</td><td>${setsText(r.e, ex?.kind)}</td><td class="muted">${h(outlookText(r.e))}</td></tr>`).join('')}
    </table>` : ''}
    ${g?.immagini ? '<p class="muted small">Foto: Free Exercise DB (pubblico dominio).</p>' : ''}`;
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
  return `<h1>Programma</h1>
    <div class="card">
      <p class="muted">Il programma si modifica nel Foglio Google (scheda <b>Programma</b>): una riga per esercizio, come in Notion. Le modifiche arrivano qui alla prossima sincronizzazione.</p>
      <div class="row wrap">
        ${db.sheetUrl ? `<a class="btn primary grow" href="${h(db.sheetUrl)}" target="_blank" rel="noopener">Apri il foglio</a>` : ''}
        <button class="grow" data-act="syncNow" ${db.active ? 'disabled' : ''}>Aggiorna dal foglio</button>
      </div>
    </div>
    ${allDays().filter(d => d.items.length && (d.id !== 'warmup' || db.program.days.some(x => !x.warmup?.length))).map(d => `<div class="card">
      <h3>${h(d.name)}</h3>
      ${d.warmup?.length ? `<p class="muted small" style="margin-top:8px">Warm-up: ${d.warmup.map(i => `<a href="#/ex/${i.ex}">${h(exName(i.ex))}</a>`).join(' · ')}</p>` : ''}
      <table>${d.items.map(it => {
        const ex = db.exercises[it.ex];
        return `<tr><td><a href="#/ex/${it.ex}" style="color:inherit">${h(ex?.name || it.ex)}</a>${it.note ? `<div class="muted small">${h(it.note)}</div>` : ''}</td>
          <td>${it.sets}×${h(it.reps)}${ex?.kind === 'time' ? '"' : ex?.kind === 'cardio' ? "'" : ''}</td>
          <td>${it.weight != null ? fmtKg(it.weight) + ' kg' + (ex?.perSide ? '/lato' : '') : ''}${(s => (s && s.kg !== it.weight ? `<div class="sugg-inline">→ ${fmtKg(s.kg)}</div>` : ''))(d.id === 'warmup' ? null : suggest(it))}</td>
          <td>${d.id === 'warmup' || ex?.kind === 'cardio' ? '' : restButton(d.id, it)}</td></tr>
          ${restEdit === `${d.id}|${it.ex}` ? `<tr><td colspan="4">${restPicker(d.id, it)}</td></tr>` : ''}`;
      }).join('')}</table>
    </div>`).join('')}`;
}

function linkForm() {
  return `<input type="url" id="linkInput" class="full" placeholder="Link di collegamento" value="">
    <button class="primary full" style="margin-top:8px" data-act="linkSave">Collega</button>`;
}

function data() {
  const pending = db.outbox.length;
  return `<h1>Foglio e impostazioni</h1>
    <div class="card">
      <h3>Foglio Google</h3>
      ${db.link ? `<p class="muted">Collegato. Ultima sincronizzazione: ${db.lastSync ? dateIt(db.lastSync) + ' ' + clock(db.lastSync).slice(0, 5) : 'mai'}.</p>
        ${pending ? `<p class="tip">${pending} allenamenti in attesa di invio.</p>` : ''}
        ${db.pending.length ? `<p class="tip">${db.pending.length} modifiche al programma in attesa di invio.</p>` : ''}
        ${db.syncError ? `<p class="tip">Ultimo errore: ${h(db.syncError)}</p>` : ''}
        <div class="row wrap">
          ${db.sheetUrl ? `<a class="btn grow" href="${h(db.sheetUrl)}" target="_blank" rel="noopener">Apri il foglio</a>` : ''}
          <button class="primary grow" data-act="syncNow">Sincronizza ora</button>
        </div>
        <details style="margin-top:12px"><summary class="muted small">Cambia collegamento</summary>${linkForm()}
          <button class="danger full" style="margin-top:8px" data-act="unlink">Scollega questo telefono</button></details>`
      : linkForm()}
    </div>
    <div class="card">
      <h3>Coach</h3>
      <p class="muted">Claude legge direttamente il foglio: chiedigli un'analisi quando vuoi. I suoi consigli compaiono nella home (scheda <b>Coach</b> del foglio).</p>
    </div>
    <div class="card">
      <h3>Notifiche e schermo</h3>
      <p class="muted">Durante l'allenamento lo schermo resta acceso. A fine recupero il telefono vibra e suona; con le notifiche attive l'avviso arriva anche a schermo bloccato.</p>
      <button class="full" data-act="testSound" style="margin-bottom:8px">🔔 Prova il suono di fine recupero</button>
      <p class="muted small">Provalo con gli auricolari e un podcast acceso: il beep deve sentirsi sopra il podcast senza fermarlo.</p>
      <button class="full" data-act="askNotif">Attiva notifiche (${'Notification' in window ? Notification.permission : 'non supportate'})</button>
    </div>`;
}

/* ---------- render ---------- */

function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (route === 'collega' && arg) return setLink(decodeURIComponent(arg));
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
const onSessionPage = () => location.hash.startsWith('#/session');

/* ---------- azioni ---------- */

function startSession(dayId) {
  const day = findDay(dayId);
  const entries = {};
  for (const item of day.items) {
    const last = lastEntry(item.ex);
    const sug = suggest(item);
    const [lo] = range(item.reps);
    entries[item.ex] = {
      sets: Array.from({ length: item.sets }, (_, i) => {
        const ls = last?.e.sets[i] || last?.e.sets[last.e.sets.length - 1];
        return { kg: sug?.kg ?? ls?.kg ?? item.weight ?? null, reps: sug ? lo : ls?.reps ?? lo, done: false };
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

// auto = chiusura automatica: niente conferme, fine = ultima interazione
function finishSession(auto = false) {
  const a = db.active;
  const day = findDay(a.dayId);
  if (!day) { db.active = null; save(); return go('#/'); } // giorno tolto dal foglio nel frattempo
  const entries = day.items
    .map(item => ({ item, en: a.entries[item.ex] }))
    .filter(({ en }) => en && en.sets.some(s => s.done))
    .map(({ item, en }) => ({ ex: item.ex, sets: en.sets.filter(s => s.done).map(({ kg, reps }) => ({ kg, reps })), outlook: en.outlook, note: en.note }));
  if (!entries.length) {
    if (!auto && !confirm('Nessuna serie segnata come fatta. Scartare l\'allenamento?')) return;
  } else {
    const note = [a.warmupNote && `Warm-up: ${a.warmupNote}`, a.note].filter(Boolean).join(' · ');
    const end = auto ? a.lastAt || a.start + Math.max(30, entries.reduce((n, e) => n + e.sets.length, 0) * 3) * 60000 : Date.now();
    const s = { id: a.id, dayId: a.dayId, dayName: day.name, start: a.start, end, entries, note: [note, auto && 'chiuso in automatico'].filter(Boolean).join(' · ') };
    db.sessions.push(s);
    db.outbox.push(s);
    // il peso usato diventa il nuovo "Kg" del programma (lo fa anche il foglio)
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
  toast(auto ? (entries.length ? 'Allenamento dimenticato aperto: chiuso e salvato' : 'Allenamento vuoto dimenticato aperto: scartato')
    : entries.length ? 'Allenamento salvato 💪' : 'Allenamento scartato');
  go(entries.length && !auto ? '#/history' : '#/');
  sync();
}

function setLink(link) {
  try {
    const u = new URL(link.trim());
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u.href) || !u.searchParams.get('k')) throw new Error();
    db.link = u.href;
    db.syncError = null;
    save();
    toast('Foglio collegato');
    history.replaceState(null, '', location.pathname + '#/');
    render();
    sync();
  } catch {
    toast('Link non valido');
    history.replaceState(null, '', location.pathname + '#/data');
    render();
  }
}

/* ---------- tempi di recupero modificabili dall'app ---------- */

const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180];
let restEdit = null; // "giorno|esercizio" del selettore aperto

const restButton = (dayId, item) =>
  `<button class="restbtn" data-act="restOpen" data-day="${dayId}" data-ex="${item.ex}">rec ${restLabel(item.rest)} ✎</button>`;

function restPicker(dayId, item) {
  if (restEdit !== `${dayId}|${item.ex}`) return '';
  return `<div class="chips">${REST_OPTIONS.map(s => `<button class="chip ${s === item.rest ? 'on' : ''}" data-v="rest" data-act="restSet" data-day="${dayId}" data-ex="${item.ex}" data-sec="${s}">${restLabel(s)}</button>`).join('')}
    <button class="chip" data-act="restSet" data-day="${dayId}" data-ex="${item.ex}" data-sec="altro">altro…</button></div>`;
}

function setRest(dayId, exId, sec) {
  const day = findDay(dayId);
  const item = day.items.find(i => i.ex === exId);
  item.rest = sec;
  // una sola modifica in coda per esercizio: vale l'ultima
  db.pending = db.pending.filter(p => !(p.action === 'setRest' && p.dayName === day.name && p.name === exName(exId)));
  db.pending.push({ action: 'setRest', dayName: day.name, name: exName(exId), rest: sec });
  save();
  toast(`Recupero ${exName(exId)}: ${restLabel(sec)}`);
}

const actions = {
  restOpen: el => { const k = `${el.dataset.day}|${el.dataset.ex}`; restEdit = restEdit === k ? null : k; render(); },
  restSet: el => {
    let sec = el.dataset.sec;
    if (sec === 'altro') {
      sec = prompt('Recupero in secondi', findDay(el.dataset.day).items.find(i => i.ex === el.dataset.ex).rest);
      if (sec == null) return;
    }
    sec = Math.round(num(sec));
    if (!(sec > 0 && sec <= 900)) return toast('Valore non valido');
    setRest(el.dataset.day, el.dataset.ex, sec);
    restEdit = null;
    render();
    sync();
  },
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
  askNotif: async () => { await askNotif(); render(); },
  testSound: () => { unlockAudio(); setTimeout(() => { beep(); navigator.vibrate?.([400, 150, 400]); }, 150); },
  linkSave: () => setLink($('#linkInput').value),
  syncNow: () => sync(true),
  unlink: () => {
    if (db.outbox.length && !confirm(`Ci sono ${db.outbox.length} allenamenti non ancora inviati al foglio: andranno persi. Continuare?`)) return;
    if (!db.outbox.length && !confirm('Scollegare questo telefono dal foglio?')) return;
    localStorage.removeItem(KEY);
    load();
    go('#/');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
  if (el && db.active) { db.active.lastAt = Date.now(); save(); }
});

// Allenamento dimenticato aperto: dopo 3 ore senza interazioni si chiude da solo.
const IDLE_CLOSE = 3 * 3600e3;
function autoClose() {
  const a = db?.active;
  if (a && Date.now() - (a.lastAt || a.start) > IDLE_CLOSE) finishSession(true);
}

document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.field || !db.active) return;
  const f = el.dataset.field;
  if (f === 'sessionNote') db.active.note = el.value;
  else if (f === 'warmupNote') db.active.warmupNote = el.value;
  else if (f === 'note') db.active.entries[el.dataset.ex].note = el.value;
  else db.active.entries[el.dataset.ex].sets[+el.dataset.i][f] = num(el.value);
  db.active.lastAt = Date.now();
  save();
});

/* ---------- sincronizzazione con il Foglio Google ---------- */

const KIND_CODE = { 'pesi': 'weight', 'corpo libero': 'reps', 'a tempo (sec)': 'time', 'cardio (min)': 'cardio' };
const dayIdOf = name => (/^warm/i.test(String(name).trim()) ? 'warmup' : slug(name));

async function api(body) {
  const k = new URL(db.link).searchParams.get('k');
  const res = await fetch(db.link, body
    ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, k }) }
    : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || 'errore del foglio');
  return out;
}

function fromSheet(res) {
  const exercises = {};
  const warmup = { id: 'warmup', name: 'Warm-up', items: [] };
  const days = [];
  for (const r of res.program) {
    const name = String(r.esercizio ?? '').trim();
    const dname = String(r.giorno ?? '').trim();
    if (!name || !dname) continue;
    const id = slug(name);
    const kind = KIND_CODE[String(r.tipo ?? '').trim().toLowerCase()] || (num(r.kg) != null ? 'weight' : 'reps');
    exercises[id] = { name, kind, perSide: /^s[iì]/i.test(String(r['per lato'] ?? '')) };
    const did = dayIdOf(dname);
    let d = did === 'warmup' ? warmup : days.find(x => x.id === did);
    if (!d) days.push(d = { id: did, name: dname, items: [], warmup: [] });
    if (did === 'warmup') d.name = dname;
    const lo = num(r['reps min']);
    const hi = num(r['reps max']) ?? lo;
    (did !== 'warmup' && /^warm/i.test(String(r.fase ?? '').trim()) ? d.warmup : d.items).push({
      ex: id, order: num(r.ordine) ?? 99, sets: num(r.serie) || 1,
      reps: lo == null ? '' : hi !== lo ? `${lo}-${hi}` : `${lo}`,
      weight: num(r.kg), coachKg: num(r['kg suggeriti']),
      coachAt: typeof r['suggerito il'] === 'number' ? r['suggerito il'] : Date.parse(r['suggerito il']) || null, rest: num(r['recupero (s)']) ?? (kind === 'weight' ? 90 : 60), note: String(r.note ?? ''),
    });
  }
  [warmup, ...days].forEach(d => [d.items, d.warmup || []].forEach(l => l.sort((a, b) => a.order - b.order)));
  const guide = {};
  for (const r of res.guide || []) {
    const name = String(r.esercizio ?? '').trim();
    if (name) guide[slug(name)] = { immagini: String(r.immagini ?? ''), muscoli: String(r.muscoli ?? ''), esecuzione: String(r.esecuzione ?? ''), consigli: String(r.consigli ?? ''), video: String(r.video ?? '') };
  }

  const byId = new Map();
  for (const r of res.sessions) {
    if (!r.id || !r.esercizio) continue;
    let s = byId.get(String(r.id));
    if (!s) {
      const start = typeof r.inizio === 'number' ? r.inizio : Date.parse(r.inizio);
      s = { id: String(r.id), dayId: dayIdOf(r.giorno), dayName: String(r.giorno), start, end: start + (num(r['durata (min)']) || 0) * 60000, entries: [], note: String(r['nota allenamento'] ?? '') };
      byId.set(s.id, s);
    }
    const exId = slug(r.esercizio);
    if (!exercises[exId]) exercises[exId] = { name: String(r.esercizio).trim(), kind: num(r.kg) != null ? 'weight' : 'reps', perSide: false };
    let en = s.entries.find(e => e.ex === exId);
    if (!en) s.entries.push(en = { ex: exId, sets: [], outlook: normOutlook(r.outlook), note: String(r['nota esercizio'] ?? '') });
    en.sets.push({ kg: num(r.kg), reps: num(r.reps) });
  }
  const sessions = [...byId.values()].filter(s => !isNaN(s.start)).sort((a, b) => a.start - b.start);
  return { next: res.next || null, exercises, program: { warmup, days }, guide, sessions, coachMessage: res.coach || '', sheetUrl: res.url };
}

const toSheet = s => ({ ...s, entries: s.entries.map(e => ({ ...e, name: exName(e.ex) })) });

let syncing = false;
async function sync(manual = false) {
  if (!db.link || syncing) return;
  if (!navigator.onLine) { if (manual) toast('Sei offline: sincronizzo appena torna la rete'); return; }
  syncing = true;
  try {
    while (db.pending.length) {
      await api(db.pending[0]);
      db.pending.shift();
      save();
    }
    while (db.outbox.length) {
      await api({ action: 'saveSession', session: toSheet(db.outbox[0]) });
      db.outbox.shift();
      save();
    }
    // anche durante un allenamento: quello in corso resta com'è, si aggiorna solo il resto
    Object.assign(db, fromSheet(await api()));
    db.lastSync = Date.now();
    db.syncError = null;
    if (manual) toast('Sincronizzato');
  } catch (err) {
    db.syncError = String(err.message || err);
    if (manual) toast('Errore: ' + db.syncError);
  } finally {
    syncing = false;
    save();
    if (!onSessionPage()) render();
  }
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

// Beep (auricolari se collegati, altrimenti cassa) + notifica con il suono di sistema: a Cristiano piacciono entrambi.
function alarm() {
  navigator.vibrate?.([400, 150, 400, 150, 400]);
  if (document.visibilityState === 'visible') beep();
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

function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  // Nessun dato personale nel codice pubblicato: tutto arriva dal Foglio Google collegato.
  db = {
    link: null, sheetUrl: null, exercises: {}, program: { warmup: { id: 'warmup', name: 'Warm-up', items: [] }, days: [] },
    coachMessage: '', guide: {}, sessions: [], outbox: [], pending: [], active: null, timer: null, lastSync: null, syncError: null,
    ...(db || {}),
  };
  save();
}

load();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
addEventListener('hashchange', render);
addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => {
  autoClose();
  keepAwake();
  tick();
  if (document.visibilityState === 'visible' && Date.now() - (db.lastSync || 0) > 5 * 60000) sync();
});
autoClose();
render();
sync();
setInterval(tick, 250);
setInterval(autoClose, 60000);
