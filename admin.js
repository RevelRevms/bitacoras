const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala';
// Reincidente = REINC_N o más jornadas sin cerrar a tiempo en los últimos REINC_DIAS días (ajuste estos dos números a su criterio).
const REINC_N = 3, REINC_DIAS = 30;
let students = [], logs = [], notes = [], rests = [], kf = '';   // kf = filtro activo de los indicadores superiores
const h = (t, p = {}, ...k) => { const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) a === 'onclick' ? e.onclick = v : e[a] = v;
  k.flat().forEach(x => e.append(x)); return e; };
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const dateGT = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
const shiftDay = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const dias = n => `${n} ${n === 1 ? 'día' : 'días'}`;
const fD = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fT = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false }) : '—';
const fDT = d => d ? new Date(d).toLocaleString('es-GT', { timeZone: TZ, hour12: false, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const show = (login, app) => { $('login').classList.toggle('hidden', !login); $('app').classList.toggle('hidden', !app); };

// ---- Jornadas sin cerrar ----
// sin cerrar = iniciada y no enviada, de un día anterior a hoy.
const isStale = (x, today) => x.status === 'in_progress' && x.practice_date < today;
// incumplimiento de cierre = sin cerrar, cerrada por el admin como no concluida, o enviada con retraso.
const isMiss = (x, today) => isStale(x, today) || x.status === 'unclosed' || x.closed_late === true;
const missesOf = (id, today) => { const from = shiftDay(today, -REINC_DIAS);
  return logs.filter(x => x.student_id === id && x.practice_date >= from && isMiss(x, today)); };

const ERRS = {
  NO_AUTORIZADO: 'Esta cuenta no tiene permisos de administrador.',
  NO_ESTA_ABIERTA: 'Esa jornada ya no está abierta (quizá el estudiante la cerró). Se actualizará la lista.',
  AUN_ES_DEL_DIA: 'Solo se pueden cerrar jornadas de días anteriores.',
  MOTIVO_REQUERIDO: 'Escriba un motivo de al menos 5 caracteres.',
  BITACORA_NO_ENCONTRADA: 'No se encontró la bitácora.'
};
const errText = e => Object.entries(ERRS).find(([k]) => (e.message || '').includes(k))?.[1] || 'No se pudo completar la acción: ' + (e.message || e);

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(true, false);
  const r = await sb.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
  if (r.data?.role !== 'admin') { $('msg').textContent = 'Esta cuenta no tiene permisos de administrador.'; return show(true, false); }
  $('msg').textContent = ''; show(false, true); load();
}
async function load() {
  const [s, l, n, rd] = await Promise.all([
    sb.from('students').select('*').order('full_name'),
    sb.from('daily_logs').select('*').order('practice_date', { ascending: false }).limit(5000),
    sb.from('admin_notes').select('*').order('created_at', { ascending: false }).limit(2000),
    sb.from('rest_days').select('*').order('rest_date', { ascending: false }).limit(3000)]);
  if (s.error || l.error) return $('msg').textContent = (s.error || l.error).message;
  students = s.data; logs = l.data; notes = n.error ? [] : n.data;
  rests = rd.error ? [] : (rd.data || []);
  $('msg').textContent = n.error || rd.error ? 'Algunas funciones no están disponibles (¿ya ejecutó migracion_v2.sql en Supabase?).' : '';
  render();
}

// ---- Cuadro de diálogo para pedir un motivo o nota ----
function ask({ title, hint, label, kinds, min = 5, ok = 'Guardar' }) {
  return new Promise(res => {
    const prev = document.activeElement;
    const ta = h('textarea', { rows: 4, maxLength: 1000 });
    const kind = kinds ? h('select', {}, ...kinds.map(([v, t]) => h('option', { value: v, textContent: t }))) : null;
    const err = h('div', { className: 'err' });
    let dlg;
    const onKey = e => { if (e.key === 'Escape') done(null); };
    const done = v => { document.removeEventListener('keydown', onKey); dlg.remove();
      if (!document.querySelector('.vmodal')) document.body.classList.remove('noscroll');
      prev?.focus?.(); res(v); };
    const form = h('form', { className: 'dlgbox', onsubmit: e => { e.preventDefault();
        const note = ta.value.trim();
        if (note.length < min) { err.textContent = `Escriba al menos ${min} caracteres.`; return ta.focus(); }
        done({ note, kind: kind?.value }); } },
      h('h3', { textContent: title }), hint ? h('p', { className: 'sub', textContent: hint }) : '',
      kind ? h('label', {}, 'Tipo', kind) : '', h('label', {}, label, ta), err,
      h('div', { className: 'dlgacts' }, h('button', { type: 'button', className: 'sec', textContent: 'Cancelar', onclick: () => done(null) }),
        h('button', { type: 'submit', textContent: ok })));
    dlg = h('div', { className: 'dlg', role: 'dialog', ariaModal: 'true', ariaLabel: title }, form);
    document.body.append(dlg); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey); ta.focus();
  });
}
async function closeUnclosed(x, who) {
  const r = await ask({ title: 'Cerrar como no concluida',
    hint: `Jornada del ${fD(x.practice_date)}${who ? ' de ' + who : ''}. No se registrará hora de salida. El estudiante verá este motivo en su historial y podrá iniciar nuevas jornadas.`,
    label: 'Motivo del cierre', ok: 'Cerrar como no concluida' });
  if (!r) return;
  const { error } = await sb.rpc('admin_close_unclosed', { p_log_id: x.id, p_note: r.note });
  if (error) alert(errText(error));
  await load();
}
async function addNote(s, x) {
  const r = await ask({ title: 'Registrar nota',
    hint: `Estudiante: ${s.full_name}${x ? ' · Jornada del ' + fD(x.practice_date) : ''}. Una observación solo la ven los administradores. Una amonestación también la verá el estudiante en su historial. No se puede editar ni borrar.`,
    kinds: [['observacion', 'Observación (privada)'], ['amonestacion', 'Amonestación (la verá el estudiante)']], label: 'Detalle', ok: 'Guardar nota' });
  if (!r) return;
  const { error } = await sb.from('admin_notes').insert({ student_id: s.id, log_id: x?.id ?? null, kind: r.kind, note: r.note });
  if (error) alert(errText(error));
  await load();
}
function focusStudent(id) {
  kf = ''; $('q').value = ''; $('g').value = ''; render();
  const d = $('stu-' + id);
  if (d) { d.open = true; d.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
}

function render() {
  const today = todayGT(), byId = Object.fromEntries(students.map(s => [s.id, s]));
  const mineOf = s => logs.filter(x => x.student_id === s.id);
  const FILT = { active: s => s.active, today: s => mineOf(s).some(x => x.practice_date === today),
    open: s => mineOf(s).some(x => x.status === 'in_progress' && x.practice_date === today),
    done: s => mineOf(s).some(x => x.practice_date === today && x.status === 'submitted'),
    unc: s => mineOf(s).some(x => isStale(x, today)),
    rei: s => missesOf(s.id, today).length >= REINC_N,
    inc: s => mineOf(s).some(x => x.has_incident) };
  const NAMES = { active: 'Estudiantes activos', today: 'Con bitácora hoy', open: 'Con jornada en curso hoy',
    done: 'Con jornada finalizada hoy', unc: 'Con jornada sin cerrar',
    rei: `Reincidentes (${REINC_N} o más sin cerrar a tiempo en ${REINC_DIAS} días)`, inc: 'Con incidentes' };
  const k = [['active', 'Estudiantes activos', students.filter(s => s.active).length],
    ['today', 'Bitácoras de hoy', logs.filter(x => x.practice_date === today).length],
    ['open', 'Jornadas en curso', logs.filter(x => x.status === 'in_progress' && x.practice_date === today).length],
    ['done', 'Finalizadas hoy', logs.filter(x => x.practice_date === today && x.status === 'submitted').length],
    ['unc', 'Sin cerrar', logs.filter(x => isStale(x, today)).length],
    ['rei', 'Reincidentes', students.filter(FILT.rei).length],
    ['inc', 'Incidentes (total)', logs.filter(x => x.has_incident).length]];
  $('kpis').replaceChildren(...k.map(([key, t, v]) => h('button', { type: 'button', title: 'Filtrar la lista de estudiantes',
    ariaPressed: String(kf === key), className: 'fig' + (kf === key ? ' sel' : '') + (['inc', 'unc', 'rei'].includes(key) && v ? ' alert' : ''),
    onclick: () => { kf = kf === key ? '' : key; render(); } }, h('b', { textContent: v }), h('span', { textContent: t }))));

  renderPending(today, byId);
  renderRest(today);

  const days = [...Array(14)].map((_, i) => shiftDay(today, i - 13));
  const cnt = days.map(d => logs.filter(x => x.practice_date === d).length), mx = Math.max(1, ...cnt);
  $('c-days').replaceChildren(h('div', { className: 'cols' }, days.map((d, i) =>
    h('div', { className: 'col' + (d === today ? ' now' : ''), title: d + ': ' + cnt[i] }, String(cnt[i]), h('i', { style: `height:${cnt[i] / mx * 90}px` }), d.slice(8)))));
  const gr = {}; logs.forEach(x => { const g = byId[x.student_id]?.grade || '?'; gr[g] = (gr[g] || 0) + 1; });
  const gm = Math.max(1, ...Object.values(gr));
  $('c-grade').replaceChildren(...Object.entries(gr).map(([g, n]) =>
    h('div', { className: 'hrow' }, h('span', { textContent: g }), h('i', { style: `width:${n / gm * 60}%` }), String(n))));

  const grades = [...new Set(students.map(s => s.grade))].sort(), sel = $('g'), cur = sel.value;
  sel.replaceChildren(h('option', { value: '', textContent: 'Todos los grados' }), ...grades.map(g => h('option', { value: g, textContent: g })));
  sel.value = cur;
  const q = $('q').value.toLowerCase();
  const list = students.filter(s => (!sel.value || s.grade === sel.value) && (!kf || FILT[kf](s)) &&
    (`${s.full_name} ${s.practice_place} ${s.institution || ''} ${s.supervisor_name || ''}`).toLowerCase().includes(q));
  const openIds = new Set([...document.querySelectorAll('#list details[open]')].map(d => d.id));   // conserva lo expandido
  const note = kf ? h('div', { className: 'fnote' }, `Filtro: ${NAMES[kf]}. ${list.length} ${list.length === 1 ? 'estudiante' : 'estudiantes'}.`,
    h('button', { type: 'button', className: 'sec', textContent: 'Quitar filtro', onclick: () => { kf = ''; render(); } })) : '';
  $('list').replaceChildren(note, ...(list.length ? list.map(studentRow) : [h('p', { className: 'empty', textContent: 'Ningún estudiante coincide con los filtros.' })]));
  $('list').querySelectorAll('details').forEach(d => { if (openIds.has(d.id)) d.open = true; });
}

// ---- Tarjeta de pendientes: jornadas iniciadas y no cerradas ----
function renderPending(today, byId) {
  const box = $('pend'), st = logs.filter(x => isStale(x, today)).sort((a, b) => a.practice_date < b.practice_date ? -1 : 1);
  box.classList.toggle('hidden', !st.length);
  if (!st.length) return box.replaceChildren();
  box.replaceChildren(h('h2', { textContent: `Jornadas sin cerrar (${st.length})` }),
    h('p', { className: 'sub', textContent: 'El estudiante inició la jornada y no la cerró ese día. No puede iniciar otra hasta que la cierre él (explicando el motivo) o usted la cierre como no concluida.' }),
    ...st.map(x => {
      const s = byId[x.student_id], m = missesOf(x.student_id, today).length;
      return h('div', { className: 'prow' },
        h('div', { className: 'who' }, h('b', { textContent: s ? s.full_name : 'Estudiante' }),
          h('span', { textContent: `${fD(x.practice_date)} · hace ${dias(dayDiff(x.practice_date, today))} · entrada ${fT(x.entry_at)}` }),
          h('span', { textContent: s ? [s.practice_place, s.institution].filter(Boolean).join(', ') : '' }),
          m >= REINC_N ? h('span', { className: 'tg', textContent: `Reincidente: ${m} sin cerrar a tiempo en ${REINC_DIAS} días` })
            : m > 1 ? h('span', { className: 'tg soft', textContent: `${m} sin cerrar a tiempo en ${REINC_DIAS} días` }) : ''),
        h('div', { className: 'acts' },
          h('button', { type: 'button', className: 'sec', textContent: 'Ver bitácoras', onclick: () => focusStudent(x.student_id) }),
          h('button', { type: 'button', textContent: 'Cerrar como no concluida', onclick: () => closeUnclosed(x, s?.full_name) }),
          s ? h('button', { type: 'button', className: 'sec', textContent: 'Nota o amonestación', onclick: () => addNote(s, x) }) : ''));
    }));
}

// ---- Días de descanso ----
const restFor = (sid, date) => rests.find(r => r.rest_date === date && (!r.student_id || r.student_id === sid));
const isWeekend = d => [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
let restBuilt = false, restUi = {};
function buildRest() {
  restBuilt = true;
  const t = todayGT(), u = restUi;
  u.from = h('input', { type: 'date', required: true, value: t, min: t });
  u.to = h('input', { type: 'date', min: t });
  u.we = h('input', { type: 'checkbox' });
  u.reason = h('input', { type: 'text', maxLength: 200, placeholder: 'Motivo (opcional): feriado, suspensión, vacaciones…' });
  u.all = h('input', { type: 'radio', name: 'rscope', value: 'all', checked: true });
  u.some = h('input', { type: 'radio', name: 'rscope', value: 'some' });
  u.list = h('div', { className: 'rchecks hidden' });
  u.err = h('div', { className: 'err' });
  const syncScope = () => u.list.classList.toggle('hidden', !u.some.checked);
  u.all.onchange = u.some.onchange = syncScope;
  const form = h('form', { className: 'rform', onsubmit: saveRest },
    h('div', { className: 'rdates' }, h('label', {}, 'Desde', u.from), h('label', {}, 'Hasta (opcional, para varios días)', u.to)),
    h('label', { className: 'chk' }, u.we, ' Incluir sábados y domingos si el rango los abarca'),
    h('div', { className: 'rscope' }, h('label', { className: 'chk' }, u.all, ' Todos los estudiantes'),
      h('label', { className: 'chk' }, u.some, ' Solo estudiantes seleccionados')),
    u.list, h('label', {}, 'Motivo', u.reason), u.err,
    h('button', { type: 'submit', textContent: 'Registrar descanso' }));
  restUi.form = form; restUi.syncScope = syncScope;
  $('rest-form').replaceChildren(form);
}
async function saveRest(e) {
  e.preventDefault(); const u = restUi; u.err.textContent = '';
  const from = u.from.value, to = u.to.value || from, reason = u.reason.value.trim() || null;
  if (!from || to < from) return u.err.textContent = 'Revise las fechas: «Hasta» no puede ser anterior a «Desde».';
  if (from < todayGT()) return u.err.textContent = 'Solo se pueden registrar descansos desde hoy en adelante.';
  const days = []; for (let d = from; d <= to && days.length <= 120; d = shiftDay(d, 1)) if (u.we.checked || !isWeekend(d)) days.push(d);
  if (days.length > 120) return u.err.textContent = 'El rango es demasiado largo (máximo 120 días).';
  if (!days.length) return u.err.textContent = 'El rango solo contiene sábados y domingos. Marque «Incluir sábados y domingos» si es lo que desea.';
  const some = u.some.checked, ids = some ? [...u.list.querySelectorAll('input:checked')].map(i => i.value) : [null];
  if (some && !ids.length) return u.err.textContent = 'Seleccione al menos un estudiante.';
  const have = new Set(rests.map(r => r.rest_date + '|' + (r.student_id || '')));
  const rows = []; let skipped = 0;
  days.forEach(d => ids.forEach(id => {
    if (have.has(d + '|' + (id || '')) || (id && have.has(d + '|'))) skipped++;   // ya existe (individual o general)
    else rows.push({ rest_date: d, student_id: id, reason }); }));
  if (!rows.length) return u.err.textContent = 'Esos días ya estaban registrados como descanso.';
  if (rows.length > 1500) return u.err.textContent = 'Son demasiados registros a la vez. Reduzca el rango o los estudiantes.';
  const clash = logs.filter(x => days.includes(x.practice_date) && (!some || ids.includes(x.student_id)));
  if (clash.length && !confirm(`Ya existen ${clash.length} bitácora(s) en esos días. Se conservarán, pero esos días quedarán marcados como descanso. ¿Continuar?`)) return;
  const btn = u.form.querySelector('button[type=submit]'); btn.disabled = true;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('rest_days').insert(rows.slice(i, i + 500));
    if (error) { btn.disabled = false; u.err.textContent = 'No se pudo guardar: ' + (error.message || error); await load(); return; } }
  btn.disabled = false; u.to.value = ''; u.reason.value = '';
  u.err.textContent = ''; await load();
  if (skipped) $('msg').textContent = `Se registraron ${rows.length}; ${skipped} ya existían y se omitieron.`;
}
async function delRest(ids) {
  if (!confirm('¿Quitar este día de descanso? El estudiante podrá iniciar jornada ese día.')) return;
  const { error } = await sb.from('rest_days').delete().in('id', ids);
  if (error) alert(errText(error));
  await load();
}
function renderRest(today) {
  if (!restBuilt) buildRest();
  // checklist de estudiantes (se reconstruye conservando la selección)
  const sel = new Set([...restUi.list.querySelectorAll('input:checked')].map(i => i.value));
  restUi.list.replaceChildren(...students.filter(s => s.active).map(s => h('label', { className: 'chk' },
    h('input', { type: 'checkbox', value: s.id, checked: sel.has(s.id) }), ' ' + s.full_name)));
  const byId = Object.fromEntries(students.map(s => [s.id, s]));
  const groups = new Map();
  rests.forEach(r => { const k = [r.rest_date, r.student_id ? 'i' : 'a', r.reason || ''].join('|');
    if (!groups.has(k)) groups.set(k, { date: r.rest_date, all: !r.student_id, reason: r.reason, ids: [], names: [] });
    const g = groups.get(k); g.ids.push(r.id); if (r.student_id) g.names.push(byId[r.student_id]?.full_name || 'Estudiante'); });
  const gs = [...groups.values()], up = gs.filter(g => g.date >= today).sort((a, b) => a.date < b.date ? -1 : 1),
    past = gs.filter(g => g.date < today).sort((a, b) => a.date < b.date ? 1 : -1);
  const item = g => h('div', { className: 'ritem' }, h('div', { className: 'who' }, h('b', { textContent: fD(g.date) + (g.date === today ? ' (hoy)' : '') }),
    h('span', { textContent: (g.all ? 'Todos los estudiantes' : g.names.length > 3 ? `${g.names.length} estudiantes: ${g.names.slice(0, 3).join(', ')}…` : g.names.join(', ')) + (g.reason ? ' · ' + g.reason : '') })),
    h('button', { type: 'button', className: 'sec', textContent: 'Quitar', onclick: () => delRest(g.ids) }));
  $('rest-sum').textContent = `Días de descanso${up.length ? ` (${up.length} próximos)` : ''}`;
  $('rest-list').replaceChildren(...(up.length ? up.map(item) : [h('p', { className: 'sub', textContent: 'No hay días de descanso próximos.' })]),
    past.length ? h('details', { className: 'rpast' }, h('summary', { textContent: `Anteriores (${past.length})` }), past.slice(0, 60).map(item)) : '');
  // aviso de hoy
  const bar = $('restbar'), tr = rests.filter(r => r.rest_date === today), gl = tr.find(r => !r.student_id);
  bar.classList.toggle('hidden', !tr.length);
  bar.textContent = !tr.length ? '' : gl ? `Hoy es día de descanso para todos${gl.reason ? ': ' + gl.reason : ''}. Los estudiantes no pueden iniciar jornada.`
    : `Hoy hay descanso para ${tr.length} ${tr.length === 1 ? 'estudiante' : 'estudiantes'}: ${tr.slice(0, 4).map(r => byId[r.student_id]?.full_name || '?').join(', ')}${tr.length > 4 ? '…' : ''}.`;
}

const mins = x => x.exit_at ? Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000)) : 0;
const dur = m => m ? `${Math.floor(m / 60)} h ${m % 60} min` : 'en curso';
function noteRow(n) {
  const lg = n.log_id ? logs.find(x => x.id === n.log_id) : null;
  return h('div', { className: 'note ' + n.kind },
    h('b', { textContent: n.kind === 'amonestacion' ? 'Amonestación' : 'Observación' }),
    h('span', { className: 'd', textContent: fDT(n.created_at) + (lg ? ` · sobre la jornada del ${fD(lg.practice_date)}` : '') + (n.kind === 'amonestacion' ? ' · la ve el estudiante' : ' · privada') }),
    h('p', { textContent: n.note }));
}
function studentRow(s) {
  const today = todayGT();
  const mine = logs.filter(x => x.student_id === s.id), inc = mine.filter(x => x.has_incident).length, n = mine.length;
  const m = missesOf(s.id, today), rei = m.length >= REINC_N, sNotes = notes.filter(x => x.student_id === s.id);
  const ini = s.full_name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tl = mine.find(x => x.practice_date === today), stale = mine.find(x => isStale(x, today));
  const led = stale ? h('div', { className: 'led late', textContent: `Sin cerrar desde el ${fD(stale.practice_date)} (hace ${dias(dayDiff(stale.practice_date, today))})` })
    : tl?.status === 'submitted' ? h('div', { className: 'led done', textContent: `Jornada completada, salida ${fT(tl.exit_at)}` })
    : tl?.status === 'in_progress' ? h('div', { className: 'led on', textContent: `En jornada, entrada ${fT(tl.entry_at)}` })
    : restFor(s.id, today) ? h('div', { className: 'led rest', textContent: 'Día de descanso hoy' + (restFor(s.id, today).reason ? ': ' + restFor(s.id, today).reason : '') }) : '';
  const fact = (k, v) => h('div', {}, h('small', { textContent: k }), h('span', { textContent: v || '—' }));
  const tools = h('div', { className: 'tools' },
    rei ? h('div', { className: 'banner', textContent: `Reincidente: ${m.length} jornadas sin cerrar a tiempo en los últimos ${REINC_DIAS} días. Considere registrar una amonestación.` }) : '',
    h('button', { type: 'button', className: 'sec', textContent: 'Registrar nota o amonestación', onclick: () => addNote(s) }));
  return h('details', { className: 'stu', id: 'stu-' + s.id }, h('summary', {}, h('div', { className: 'mk', textContent: ini }),
    h('div', { className: 'who' }, h('b', { textContent: s.full_name + (s.active ? '' : ' (inactivo)') }), led,
      h('div', { className: 'facts' }, fact('Lugar de práctica', s.practice_place), fact('Empresa o institución', s.institution),
        fact('Supervisor', s.supervisor_name), fact('Contacto del supervisor', s.supervisor_contact),
        fact('Grado y sección', `${s.grade}, sección ${s.section}`))),
    h('div', { className: 'cnt' }, h('b', { textContent: n }), n === 1 ? ' bitácora' : ' bitácoras',
      inc ? h('em', { textContent: inc === 1 ? '1 incidente' : inc + ' incidentes' }) : '',
      m.length ? h('em', { className: rei ? 'rei' : 'warn', textContent: rei ? `Reincidente (${m.length} en ${REINC_DIAS} d)` : `${m.length} sin cerrar a tiempo` }) : ''),
    h('span', { className: 'sign' })),
    h('div', { className: 'inner' }, tools,
      sNotes.length ? h('div', { className: 'notes' }, h('h4', { textContent: 'Notas del administrador' }), sNotes.map(noteRow)) : '',
      n ? h('div', { className: 'trace' }, mine.map(x => logRow(x, s)))
        : h('p', { className: 'empty', textContent: 'Todavía no ha enviado bitácoras.' })));
}
// ---- Visor de video a pantalla completa ----
let vm;
async function openVideo(x, btn) {
  if (vm) return;
  btn.disabled = true;
  const r = await sb.storage.from('practice-videos').createSignedUrl(x.video_path, 300);
  btn.disabled = false;
  if (r.error) return alert('No se pudo generar el enlace: ' + r.error.message);
  const url = r.data.signedUrl, prev = document.activeElement;
  const v = h('video', { src: url, controls: true, autoplay: true, playsInline: true });
  const close = () => { v.pause(); v.removeAttribute('src'); v.load();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll');
    vm.remove(); vm = null; prev?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const x1 = h('button', { type: 'button', className: 'vclose', textContent: '✕ Cerrar', onclick: close });
  vm = h('div', { className: 'vmodal', role: 'dialog', ariaModal: 'true', ariaLabel: 'Video de evidencia' },
    h('div', { className: 'vbar' }, h('span', { textContent: fD(x.practice_date) }),
      h('a', { href: url, target: '_blank', rel: 'noopener', textContent: 'Abrir o descargar' }), x1), v);
  document.body.append(vm); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey);
  x1.focus();
  if (vm.requestFullscreen) vm.requestFullscreen().catch(() => {});   // pantalla completa real si el navegador lo permite
  vm.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vm) close(); });
}
function logRow(x, s) {
  const today = todayGT(), stale = isStale(x, today), un = x.status === 'unclosed', late = x.closed_late === true;
  const body = h('dl', { className: 'body' });
  const row = (k, v, c = '') => { if (!v) return; const d = h('dd', { textContent: v }); body.append(h('dt', { className: c, textContent: k }), d); };
  if (stale) row('Estado', `El estudiante inició la jornada y no la cerró. No hay hora de salida (hace ${dias(dayDiff(x.practice_date, today))}).`, 'bad');
  if (un) { row('Estado', 'Cerrada por el administrador como no concluida', 'bad'); row('Motivo del cierre', x.admin_note, 'bad'); row('Cerrada el', fDT(x.resolved_at)); }
  if (late) { row('Cierre tardío', `Enviada el ${fDT(x.exit_at)}, ${dias(dayDiff(x.practice_date, dateGT(x.exit_at)))} después de la jornada. La hora de salida no corresponde al fin real de la práctica.`, 'bad');
    row('Motivo del retraso', x.late_reason); }
  row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
  row('Herramientas', x.tools_used);
  row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
  if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
  if (x.video_path) body.append(h('dt', { textContent: 'Video' }), h('dd', {},
    h('button', { type: 'button', className: 'sec', textContent: 'Reproducir evidencia', onclick: ev => openVideo(x, ev.currentTarget) })));
  const ln = notes.filter(n => n.log_id === x.id);
  if (ln.length) body.append(h('dt', { textContent: 'Notas del administrador' }), h('dd', { className: 'notes' }, ln.map(noteRow)));
  if (s && (stale || un || late)) body.append(h('dt', { textContent: 'Acciones' }), h('dd', { className: 'acts' },
    stale ? h('button', { type: 'button', textContent: 'Cerrar como no concluida', onclick: () => closeUnclosed(x, s.full_name) }) : '',
    h('button', { type: 'button', className: 'sec', textContent: 'Nota o amonestación sobre esta jornada', onclick: () => addNote(s, x) })));
  const d = new Date(x.practice_date + 'T12:00:00');
  const title = x.main_activity || (un ? 'Jornada no concluida' : stale ? 'Jornada sin cerrar' : 'Jornada en curso');
  const sub = un ? `Entrada ${fT(x.entry_at)}, sin hora de salida`
    : stale ? `Entrada ${fT(x.entry_at)}, sin hora de salida (hace ${dias(dayDiff(x.practice_date, today))})`
    : late ? `Entrada ${fT(x.entry_at)}, enviada con retraso`
    : `Entrada ${fT(x.entry_at)}, salida ${fT(x.exit_at)} (${dur(mins(x))})`;
  return h('details', { className: 'log' + (x.has_incident || stale || un ? ' inc' : ''), id: 'log-' + x.id }, h('summary', {},
    h('time', { textContent: d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }) }),
    h('div', { className: 'who' }, h('b', { textContent: title }), h('span', { textContent: sub })),
    h('div', { className: 'marks' }, stale ? h('em', { textContent: 'Sin cerrar' }) : '', un ? h('em', { textContent: 'No concluida' }) : '',
      late ? h('em', { className: 'warn', textContent: 'Cierre tardío' }) : '',
      x.has_incident ? h('em', { textContent: 'Incidente' }) : '', x.video_path ? h('span', { textContent: 'Video' }) : ''),
    h('span', { className: 'sign' })), body);
}
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { await sb.auth.signOut(); $('msg').textContent = ''; show(true, false); };
$('re').onclick = load;
$('q').oninput = $('g').onchange = render;
start();
