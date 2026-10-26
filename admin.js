const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala';
// Reincidente = REINC_N o más jornadas sin cerrar a tiempo en los últimos REINC_DIAS días (ajuste estos dos números a su criterio).
const REINC_N = 3, REINC_DIAS = 30;
const PROG = { practica: 'Práctica Supervisada', prepractica: 'Prepráctica' };
const progName = p => PROG[p] || 'Sin definir';
let students = [], logs = [], notes = [], rests = [], kf = '', avs = {};
let me = null, staffMap = {}, audit = [], v4 = true, staffBuilt = false, staffUi = {}, lastCreated = null;   // v4 = ¿ya se ejecutó migracion_v4.sql?   // kf = filtro activo de los indicadores superiores
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

// ---- Quién hizo cada cosa ----
const roleName = r => r === 'admin' ? 'Administrador' : r === 'supervisor' ? 'Supervisor' : 'Sin rol';
const by = id => !id ? 'personal' : id === me?.id ? 'usted' : staffMap[id]?.full_name || 'personal anterior';

// ---- Jornadas sin cerrar ----
// sin cerrar = iniciada y no enviada, de un día anterior a hoy.
const isStale = (x, today) => x.status === 'in_progress' && x.practice_date < today;
// incumplimiento de cierre = sin cerrar, cerrada por el admin como no concluida, o enviada con retraso.
const isMiss = (x, today) => isStale(x, today) || x.status === 'unclosed' || x.closed_late === true;
const missesOf = (id, today) => { const from = shiftDay(today, -REINC_DIAS);
  return logs.filter(x => x.student_id === id && x.practice_date >= from && isMiss(x, today)); };

const ERRS = {
  NO_AUTORIZADO: 'Esta cuenta no tiene permiso para esta acción (o está inactiva).',
  CORREO_YA_EXISTE: 'Ya existe una cuenta con ese correo.',
  CORREO_INVALIDO: 'El correo no es válido.',
  NOMBRE_INVALIDO: 'El nombre debe tener entre 3 y 150 caracteres.',
  CONTRASENA_INVALIDA: 'La contraseña debe tener entre 8 y 72 caracteres.',
  NO_PUEDE_MODIFICARSE_A_SI_MISMO: 'No puede cambiar su propio rol ni su estado.',
  ES_ADMINISTRADOR: 'Un administrador no se modifica desde el panel.',
  ES_ESTUDIANTE: 'Esa cuenta pertenece a un estudiante y no puede ser supervisor.',
  NO_ES_PERSONAL: 'Esa cuenta no pertenece al personal.',
  USUARIO_NO_ENCONTRADO: 'No existe una cuenta con ese correo. Créela primero (por ejemplo con «Crear supervisor nuevo»).',
  YA_ES_SUPERVISOR: 'Esa cuenta ya es supervisor.',
  NO_ESTA_ABIERTA: 'Esa jornada ya no está abierta (quizá el estudiante la cerró). Se actualizará la lista.',
  AUN_ES_DEL_DIA: 'Solo se pueden cerrar jornadas de días anteriores.',
  MOTIVO_REQUERIDO: 'Escriba un motivo de al menos 5 caracteres.',
  BITACORA_NO_ENCONTRADA: 'No se encontró la bitácora.'
};
const errText = e => Object.entries(ERRS).find(([k]) => (e.message || '').includes(k))?.[1] || 'No se pudo completar la acción: ' + (e.message || e);

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(true, false);
  let r = await sb.from('user_roles').select('role,active,full_name').eq('user_id', session.user.id).maybeSingle();
  if (r.error) { v4 = false; r = await sb.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle(); }   // base sin migracion_v4
  const role = r.data?.role;
  if (role !== 'admin' && !(v4 && role === 'supervisor')) { $('msg').textContent = 'Esta cuenta no tiene permisos de administrador ni de supervisor.'; return show(true, false); }
  if (r.data.active === false) { $('msg').textContent = 'Su cuenta de personal está inactiva. Hable con el administrador.'; return show(true, false); }
  me = { id: session.user.id, role, name: r.data.full_name || '' };
  $('me').textContent = v4 ? `Sesión: ${me.name || 'sin nombre'} · ${role === 'admin' ? 'Administrador' : 'Supervisor'}` : '';
  $('msg').textContent = ''; show(false, true); load();
}
async function load() {
  const [s, l, n, rd, sd, au] = await Promise.all([
    sb.from('students').select('*').order('full_name'),
    sb.from('daily_logs').select('*').order('practice_date', { ascending: false }).limit(5000),
    sb.from('admin_notes').select('*').order('created_at', { ascending: false }).limit(2000),
    sb.from('rest_days').select('*').order('rest_date', { ascending: false }).limit(3000),
    v4 ? sb.rpc('staff_directory') : Promise.resolve({ data: [] }),
    v4 && me?.role === 'admin' ? sb.from('staff_audit').select('*').order('at', { ascending: false }).limit(300) : Promise.resolve({ data: [] })]);
  staffMap = Object.fromEntries((sd.error ? [] : sd.data || []).map(x => [x.user_id, x])); audit = au.error ? [] : au.data || [];
  if (s.error || l.error) return $('msg').textContent = (s.error || l.error).message;
  students = s.data; logs = l.data; notes = n.error ? [] : n.data;
  rests = rd.error ? [] : (rd.data || []);
  await loadAvatars();
  $('msg').textContent = n.error || rd.error ? 'Algunas funciones no están disponibles (¿ya ejecutó migracion_v2.sql en Supabase?).'
    : v4 && sd.error ? 'No se pudo cargar el personal (¿ya ejecutó migracion_v4.sql en Supabase?).' : '';
  render();
}

// ---- Avatares: enlaces firmados en un solo lote; se reutilizan mientras no estén por vencer ----
async function loadAvatars() {
  const now = Date.now(), need = students.map(s => s.avatar_path).filter(p => p && !(avs[p] && avs[p].t > now));
  if (!need.length) return;
  try { const r = await sb.storage.from('practice-photos').createSignedUrls(need, 3600);
    if (r.error) return;
    r.data.forEach(x => { if (x.signedUrl) avs[x.path] = { u: x.signedUrl, t: now + 3000e3 }; }); } catch {}
}
const avUrl = s => s.avatar_path && avs[s.avatar_path]?.u || '';
const ini = s => s.full_name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function avatar(s, cls = 'mk') { const u = avUrl(s);
  return u ? h('div', { className: cls + ' pic', role: 'img', ariaLabel: s.full_name, style: `background-image:url("${u}")` }) : h('div', { className: cls, textContent: ini(s) }); }
async function setActive(s) {
  const on = !s.active;
  const hasOpen = logs.some(x => x.student_id === s.id && x.status === 'in_progress');
  const txt = on ? `¿Activar a ${s.full_name}? Podrá iniciar jornadas de nuevo.`
    : `¿Inactivar a ${s.full_name}? No podrá iniciar nuevas jornadas ni cambiar su perfil. Podrá entrar y ver su historial. Sus bitácoras se conservan.` +
      (hasOpen ? '\n\nTiene una jornada abierta: podrá cerrarla, o puede cerrarla usted como no concluida.' : '');
  if (!confirm(txt)) return;
  const { error } = await sb.from('students').update({ active: on }).eq('id', s.id);
  if (error) alert(errText(error));
  await load();
}
async function setProgram(s) {
  const to = s.program === 'prepractica' ? 'practica' : 'prepractica';
  if (!confirm(`¿Cambiar a ${s.full_name} de ${progName(s.program)} a ${progName(to)}? Las bitácoras anteriores conservan el tipo con que se hicieron.`)) return;
  const { error } = await sb.from('students').update({ program: to }).eq('id', s.id);
  if (error) alert(errText(error));
  await load();
}
async function setProgramFirst(s, to) {
  if (!confirm(`¿Asignar «${progName(to)}» a ${s.full_name}?`)) return;
  const { error } = await sb.from('students').update({ program: to }).eq('id', s.id);
  if (error) alert(errText(error));
  await load();
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
  renderStaff();

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
  const pf = $('pg').value, af = $('ac').value;
  const list = students.filter(s => (!sel.value || s.grade === sel.value) && (!pf || (pf === 'none' ? !s.program : s.program === pf)) && (!af || (af === 'on') === s.active) && (!kf || FILT[kf](s)) &&
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
        s ? avatar(s, 'mk sm') : '',
        h('div', { className: 'who' }, h('b', { textContent: s ? s.full_name : 'Estudiante' }),
          h('span', { textContent: `${fD(x.practice_date)} · hace ${dias(dayDiff(x.practice_date, today))} · entrada ${fT(x.entry_at)}` }),
          h('span', { textContent: s ? [s.institution, s.practice_place].filter(Boolean).join(', ') : '' }),
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
  const groups = new Map();   // cada grupo recuerda quién lo registró
  rests.forEach(r => { const k = [r.rest_date, r.student_id ? 'i' : 'a', r.reason || ''].join('|');
    if (!groups.has(k)) groups.set(k, { date: r.rest_date, all: !r.student_id, reason: r.reason, by: r.created_by, ids: [], names: [] });
    const g = groups.get(k); g.ids.push(r.id); if (r.student_id) g.names.push(byId[r.student_id]?.full_name || 'Estudiante'); });
  const gs = [...groups.values()], up = gs.filter(g => g.date >= today).sort((a, b) => a.date < b.date ? -1 : 1),
    past = gs.filter(g => g.date < today).sort((a, b) => a.date < b.date ? 1 : -1);
  const item = g => h('div', { className: 'ritem' }, h('div', { className: 'who' }, h('b', { textContent: fD(g.date) + (g.date === today ? ' (hoy)' : '') }),
    h('span', { textContent: (g.all ? 'Todos los estudiantes' : g.names.length > 3 ? `${g.names.length} estudiantes: ${g.names.slice(0, 3).join(', ')}…` : g.names.join(', ')) + (g.reason ? ' · ' + g.reason : '') + (v4 && g.by ? ' · registró ' + by(g.by) : '') })),
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

// ---- Personal y actividad (solo administrador) ----
const genPass = () => { const al = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint32Array(12));
  return [...b].map(n => al[n % al.length]).join(''); };
async function staffCall(p, okMsg) {
  const { error } = await sb.rpc('admin_set_staff', p);
  if (error) { alert(errText(error)); return false; }
  await load(); return true;
}
function staffRow(u) {
  const self = u.user_id === me.id, adm = u.role === 'admin', former = u.role === 'student';
  const acts = h('div', { className: 'acts' });
  const b = (t, f, cls = 'sec') => acts.append(h('button', { type: 'button', className: cls, textContent: t, onclick: f }));
  b('Cambiar nombre', async () => { const n = prompt('Nombre completo:', u.full_name); if (n !== null && n.trim() && n.trim() !== u.full_name) await staffCall({ p_user_id: u.user_id, p_full_name: n }); });
  if (!self && !adm) {
    if (former) b('Volver a asignar supervisor', () => confirm(`¿Asignar de nuevo el rol de supervisor a ${u.full_name}?`) && staffCall({ p_user_id: u.user_id, p_role: 'supervisor', p_active: true }), '');
    else {
      b(u.active ? 'Inactivar' : 'Activar', () => confirm(u.active ? `¿Inactivar a ${u.full_name}? Perderá el acceso al panel de inmediato; se conserva todo lo que registró.` : `¿Activar a ${u.full_name}?`) && staffCall({ p_user_id: u.user_id, p_active: !u.active }), u.active ? 'sec' : '');
      b('Quitar rol de supervisor', () => confirm(`¿Quitar el rol de supervisor a ${u.full_name}? Lo que registró se conserva.`) && staffCall({ p_user_id: u.user_id, p_role: 'student' }));
    } }
  return h('div', { className: 'ritem' + (former || !u.active ? ' off' : '') }, h('div', { className: 'who' },
    h('b', { textContent: u.full_name + (self ? ' (usted)' : '') }),
    h('span', { textContent: `${former ? 'Antes supervisor (sin rol)' : roleName(u.role)}${!former && !u.active ? ' · INACTIVO' : ''} · ${u.email || ''}` }),
    adm && !self ? h('span', { textContent: 'Los administradores se asignan con SQL; no se modifican desde el panel.' }) : ''), acts);
}
const FIELD = { active: 'activo', program: 'tipo de práctica', full_name: 'nombre', grade: 'grado', section: 'sección', practice_place: 'dirección', institution: 'empresa', supervisor_name: 'supervisor', supervisor_contact: 'contacto del supervisor', rol: 'rol', activo: 'activo', nombre: 'nombre' };
const val2 = v => v === null || v === undefined ? '—' : v === true ? 'sí' : v === false ? 'no' : v === 'practica' ? 'Práctica Supervisada' : v === 'prepractica' ? 'Prepráctica' : v === 'student' ? 'sin rol' : v === 'supervisor' ? 'supervisor' : String(v);
function describe(a) {
  const stu = students.find(s => s.id === a.student_id), tgt = staffMap[a.target_user], d = a.detail || {};
  const ch = Object.entries(d).filter(([, v]) => v && typeof v === 'object' && 'a' in v).map(([k, v]) => `${FIELD[k] || k}: ${val2(v.de)} → ${val2(v.a)}`).join('; ');
  if (a.action === 'personal_creado') return `Creó la cuenta de supervisor ${d.nombre} (${d.correo})`;
  if (a.action === 'personal_asignado') return `Asignó el rol de supervisor a ${d.nombre} (${d.correo})`;
  if (a.action === 'personal_modificado') return `Modificó a ${tgt?.full_name || 'personal'}: ${ch}`;
  if (a.action === 'estudiante_modificado') return `Modificó a ${stu?.full_name || 'un estudiante'}: ${ch}`;
  if (a.action === 'descanso_quitado') return `Quitó el descanso del ${d.fecha}${stu ? ' de ' + stu.full_name : ' (general)'}${d.motivo ? ' · ' + d.motivo : ''}`;
  return a.action;
}
function buildStaff() {
  staffBuilt = true; const u = staffUi;
  u.name = h('input', { type: 'text', required: true, minLength: 3, maxLength: 150, placeholder: 'Nombre completo' });
  u.email = h('input', { type: 'email', required: true, placeholder: 'correo@inedsaac.com', autocomplete: 'off' });
  u.pass = h('input', { type: 'text', required: true, minLength: 8, maxLength: 72, autocomplete: 'off', value: genPass() });
  u.err = h('div', { className: 'err' }); u.res = h('div', { className: 'fnote hidden' }); u.list = h('div'); u.log = h('div');
  const form = h('form', { className: 'rform', onsubmit: async e => { e.preventDefault(); u.err.textContent = '';
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      const p = { p_email: u.email.value.trim(), p_full_name: u.name.value.trim(), p_password: u.pass.value };
      const { error } = await sb.rpc('admin_create_staff', p); btn.disabled = false;
      if (error) return u.err.textContent = errText(error);
      lastCreated = p; u.name.value = u.email.value = ''; u.pass.value = genPass(); await load(); } },
    h('label', {}, 'Nombre completo', u.name), h('label', {}, 'Correo', u.email),
    h('label', {}, 'Contraseña inicial (cópiela y entréguela; no se vuelve a mostrar)', u.pass,
      h('button', { type: 'button', className: 'sec', textContent: 'Generar otra', onclick: () => u.pass.value = genPass() })),
    u.err, h('button', { type: 'submit', textContent: 'Crear supervisor' }));
  u.aName = h('input', { type: 'text', required: true, minLength: 3, maxLength: 150, placeholder: 'Nombre completo' });
  u.aEmail = h('input', { type: 'email', required: true, placeholder: 'correo de la cuenta existente', autocomplete: 'off' });
  u.aErr = h('div', { className: 'err' }); u.aOk = h('div', { className: 'ok' });
  const form2 = h('form', { className: 'rform', onsubmit: async e => { e.preventDefault(); u.aErr.textContent = ''; u.aOk.textContent = '';
      const btn = form2.querySelector('button[type=submit]'); btn.disabled = true;
      const email = u.aEmail.value.trim();
      const { error } = await sb.rpc('admin_assign_supervisor', { p_email: email, p_full_name: u.aName.value.trim() }); btn.disabled = false;
      if (error) return u.aErr.textContent = errText(error);
      u.aName.value = u.aEmail.value = ''; await load(); u.aOk.textContent = `Listo: ${email} ahora es supervisor.`; } },
    h('label', {}, 'Nombre completo', u.aName), h('label', {}, 'Correo de la cuenta', u.aEmail),
    u.aErr, h('button', { type: 'submit', textContent: 'Asignar rol de supervisor' }), u.aOk);
  $('staff-body').replaceChildren(h('h3', { textContent: 'Agregar supervisor' }),
    h('p', { className: 'sub', textContent: 'El supervisor puede hacer todo lo operativo del panel (bitácoras, notas, descansos, estudiantes) pero no gestiona al personal ni ve el registro de actividad.' }),
    h('h4', { textContent: 'Crear supervisor nuevo (cuenta y rol)' }), form, u.res,
    h('h4', { textContent: 'Asignar a una cuenta que ya existe (no puede ser de un estudiante)' }), form2,
    h('h3', { textContent: 'Personal' }), u.list, h('h3', { textContent: 'Actividad reciente del personal' }), u.log);
}
function renderStaff() {
  const card = $('staff'); card.classList.toggle('hidden', !(v4 && me?.role === 'admin'));
  if (card.classList.contains('hidden')) return;
  if (!staffBuilt) buildStaff();
  const u = staffUi, all = Object.values(staffMap);
  $('staff-sum').textContent = `Personal y actividad (${all.filter(x => x.role !== 'student' && x.active).length} activos)`;
  u.res.classList.toggle('hidden', !lastCreated);
  if (lastCreated) u.res.replaceChildren(h('span', { textContent: `Cuenta creada. Entregue: correo ${lastCreated.p_email} · contraseña ${lastCreated.p_password}` }),
    h('button', { type: 'button', className: 'sec', textContent: 'Copiar', onclick: () => navigator.clipboard?.writeText(`Correo: ${lastCreated.p_email}\nContraseña: ${lastCreated.p_password}`) }),
    h('button', { type: 'button', className: 'sec', textContent: 'Ocultar', onclick: () => { lastCreated = null; renderStaff(); } }));
  u.list.replaceChildren(...all.map(staffRow));
  u.log.replaceChildren(...(audit.length ? audit.slice(0, 100).map(x => h('div', { className: 'ritem' }, h('div', { className: 'who' },
      h('b', { textContent: describe(x) }), h('span', { textContent: `${fDT(x.at)} · por ${by(x.actor)}` })))) : [h('p', { className: 'sub', textContent: 'Aún no hay actividad registrada.' })]));
}

const mins = x => x.exit_at ? Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000)) : 0;
const dur = m => m ? `${Math.floor(m / 60)} h ${m % 60} min` : 'en curso';
function noteRow(n) {
  const lg = n.log_id ? logs.find(x => x.id === n.log_id) : null;
  return h('div', { className: 'note ' + n.kind },
    h('b', { textContent: n.kind === 'amonestacion' ? 'Amonestación' : 'Observación' }),
    h('span', { className: 'd', textContent: fDT(n.created_at) + (v4 ? ` · por ${by(n.created_by)}` : '') + (lg ? ` · sobre la jornada del ${fD(lg.practice_date)}` : '') + (n.kind === 'amonestacion' ? ' · la ve el estudiante' : ' · privada') }),
    h('p', { textContent: n.note }));
}
function studentRow(s) {
  const today = todayGT();
  const mine = logs.filter(x => x.student_id === s.id), inc = mine.filter(x => x.has_incident).length, n = mine.length;
  const m = missesOf(s.id, today), rei = m.length >= REINC_N, sNotes = notes.filter(x => x.student_id === s.id);
  const tl = mine.find(x => x.practice_date === today), stale = mine.find(x => isStale(x, today));
  const led = stale ? h('div', { className: 'led late', textContent: `Sin cerrar desde el ${fD(stale.practice_date)} (hace ${dias(dayDiff(stale.practice_date, today))})` })
    : tl?.status === 'submitted' ? h('div', { className: 'led done', textContent: `Jornada completada, salida ${fT(tl.exit_at)}` })
    : tl?.status === 'in_progress' ? h('div', { className: 'led on', textContent: `En jornada, entrada ${fT(tl.entry_at)}` })
    : restFor(s.id, today) ? h('div', { className: 'led rest', textContent: 'Día de descanso hoy' + (restFor(s.id, today).reason ? ': ' + restFor(s.id, today).reason : '') }) : '';
  const fact = (k, v) => h('div', {}, h('small', { textContent: k }), h('span', { textContent: v || '—' }));
  const tools = h('div', { className: 'tools' },
    rei ? h('div', { className: 'banner', textContent: `Reincidente: ${m.length} jornadas sin cerrar a tiempo en los últimos ${REINC_DIAS} días. Considere registrar una amonestación.` }) : '',
    h('button', { type: 'button', className: 'sec', textContent: 'Registrar nota o amonestación', onclick: () => addNote(s) }),
    h('button', { type: 'button', className: s.active ? 'sec' : '', textContent: s.active ? 'Inactivar estudiante' : 'Activar estudiante', onclick: () => setActive(s) }),
    s.program ? h('button', { type: 'button', className: 'sec', textContent: `Pasar a ${progName(s.program === 'prepractica' ? 'practica' : 'prepractica')}`, onclick: () => setProgram(s) })
      : h('button', { type: 'button', className: 'sec', textContent: 'Asignar Práctica Supervisada', onclick: () => setProgramFirst(s, 'practica') }),
    !s.program ? h('button', { type: 'button', className: 'sec', textContent: 'Asignar Prepráctica', onclick: () => setProgramFirst(s, 'prepractica') }) : '');
  return h('details', { className: 'stu' + (s.active ? '' : ' off'), id: 'stu-' + s.id }, h('summary', {}, avatar(s),
    h('div', { className: 'who' }, h('b', { textContent: s.full_name + (s.active ? '' : ' (inactivo)') }), s.active ? '' : h('span', { className: 'pg off', textContent: 'Inactivo' }), h('span', { className: 'pg ' + (s.program || 'none'), textContent: progName(s.program) }), led,
      h('div', { className: 'facts' }, fact('Tipo de práctica', progName(s.program)), fact('Empresa o institución', s.institution), fact('Dirección de la empresa', s.practice_place),
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
const openVideo = (x, btn) => openMedia(x, btn, 'video');
const openPhoto = (x, btn) => openMedia(x, btn, 'photo');
async function openMedia(x, btn, kind) {
  if (vm) return;
  const photo = kind === 'photo';
  btn.disabled = true;
  const r = await sb.storage.from(photo ? 'practice-photos' : 'practice-videos').createSignedUrl(photo ? x.start_photo_path : x.video_path, 300);
  btn.disabled = false;
  if (r.error) return alert('No se pudo generar el enlace: ' + r.error.message);
  const url = r.data.signedUrl, prev = document.activeElement;
  const v = photo ? h('img', { src: url, alt: 'Foto de inicio de jornada' }) : h('video', { src: url, controls: true, autoplay: true, playsInline: true });
  const close = () => { if (!photo) { v.pause(); v.removeAttribute('src'); v.load(); } else v.removeAttribute('src');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll');
    vm.remove(); vm = null; prev?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const x1 = h('button', { type: 'button', className: 'vclose', textContent: '✕ Cerrar', onclick: close });
  vm = h('div', { className: 'vmodal', role: 'dialog', ariaModal: 'true', ariaLabel: photo ? 'Foto de inicio' : 'Video de evidencia' },
    h('div', { className: 'vbar' }, h('span', { textContent: (photo ? 'Foto de inicio · ' : '') + fD(x.practice_date) }),
      h('a', { href: url, target: '_blank', rel: 'noopener', textContent: 'Abrir o descargar' }), x1), v);
  document.body.append(vm); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey);
  x1.focus();
  if (vm.requestFullscreen) vm.requestFullscreen().catch(() => {});   // pantalla completa real si el navegador lo permite
  vm.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vm) close(); });
}
const lp0 = (x, s) => x.program || s?.program || '';
function logRow(x, s) {
  const today = todayGT(), stale = isStale(x, today), un = x.status === 'unclosed', late = x.closed_late === true;
  const body = h('dl', { className: 'body' });
  const row = (k, v, c = '') => { if (!v) return; const d = h('dd', { textContent: v }); body.append(h('dt', { className: c, textContent: k }), d); };
  if (stale) row('Estado', `El estudiante inició la jornada y no la cerró. No hay hora de salida (hace ${dias(dayDiff(x.practice_date, today))}).`, 'bad');
  if (un) { row('Estado', 'Cerrada por el administrador como no concluida', 'bad'); row('Motivo del cierre', x.admin_note, 'bad'); row('Cerrada el', fDT(x.resolved_at) + (v4 && x.resolved_by ? ` · por ${by(x.resolved_by)}` : '')); }
  if (late) { row('Cierre tardío', `Enviada el ${fDT(x.exit_at)}, ${dias(dayDiff(x.practice_date, dateGT(x.exit_at)))} después de la jornada. La hora de salida no corresponde al fin real de la práctica.`, 'bad');
    row('Motivo del retraso', x.late_reason); }
  row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
  row('Herramientas', x.tools_used);
  row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
  if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
  const lp = x.program || s?.program;
  if (lp) row('Tipo de práctica', progName(lp));
  if (x.start_photo_path) body.append(h('dt', { textContent: 'Foto de inicio' }), h('dd', {},
    h('button', { type: 'button', className: 'sec', textContent: 'Ver foto de inicio', onclick: ev => openPhoto(x, ev.currentTarget) })));
  else if (x.status !== 'unclosed') row('Foto de inicio', 'Sin foto (jornada anterior a esta función)');
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
      x.has_incident ? h('em', { textContent: 'Incidente' }) : '', x.start_photo_path ? h('span', { textContent: 'Foto' }) : '', x.video_path ? h('span', { textContent: 'Video' }) : '',
      lp0(x, s) ? h('span', { className: 'pg ' + lp0(x, s), textContent: progName(lp0(x, s)) }) : ''),
    h('span', { className: 'sign' })), body);
}
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { await sb.auth.signOut(); $('msg').textContent = ''; me = null; staffMap = {}; audit = []; lastCreated = null; staffBuilt = false; show(true, false); };
$('re').onclick = load;
$('q').oninput = $('g').onchange = $('pg').onchange = $('ac').onchange = render;
start();
