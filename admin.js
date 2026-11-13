const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala';
const sdlg = $('sdlg');
const ovRoot = () => document.querySelector('dialog[open]') || document.body;   // los avisos deben ir DENTRO del diálogo abierto o quedarían detrás
const unlock = () => { if (!sdlg.open && !document.querySelector('.vmodal,.dlg')) document.body.classList.remove('noscroll'); };
// Reincidente = REINC_N o más jornadas sin cerrar a tiempo en los últimos REINC_DIAS días (ajuste estos dos números a su criterio).
const REINC_N = 3, REINC_DIAS = 30;
const PROG = { practica: 'Práctica Supervisada', prepractica: 'Prepráctica' };
const progName = p => PROG[p] || 'Sin definir';
let schedVers = [], schedErr = '';
let students = [], logs = [], notes = [], rests = [], kf = 'active', avs = {};   // el panel abre con «Estudiantes activos» ya pulsado
let arch = [], archMap = {}, parch = [], pArchMap = {}, pinfo = [], archErr = '', pErr = '', vdBuilt = false, vdUi = {}, vd = { verified: [], failed: [], busy: false, ctrl: null, note: '', skipped: 0 }, vdTo = '';
let me = null, staffMap = {}, audit = [], accts = [], acErr = '', v4 = true, staffBuilt = false, staffUi = {}, lastCreated = null;   // v4 = ¿ya se ejecutó migracion_v4.sql?   // kf = filtro activo de los indicadores superiores
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
const show = (login, app) => { $('login').classList.toggle('hidden', !login); $('app').classList.toggle('hidden', !app); $('hact').classList.toggle('hidden', !app); $('mb').classList.toggle('hidden', !app); if (!app) closeMenu(); };

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
  MOTIVO_INVALIDO: 'El motivo debe tener entre 10 y 1000 caracteres.',
  NOTA_NO_ENCONTRADA: 'No se encontró la nota.',
  NO_ES_AMONESTACION: 'Solo se pueden eliminar amonestaciones, no observaciones.',
  YA_ANULADA: 'Esa amonestación ya estaba eliminada.',
  JORNADA_NO_ENCONTRADA: 'Esa jornada ya no existe. Actualice la lista.',
  SIN_CUENTAS: 'Seleccione al menos una cuenta.',
  DEMASIADAS_CUENTAS: 'Seleccione como máximo 200 cuentas a la vez.',
  CORREO_YA_EXISTE: 'Ya existe una cuenta con ese correo.',
  CORREO_INVALIDO: 'El correo no es válido.',
  NOMBRE_INVALIDO: 'El nombre debe tener entre 3 y 150 caracteres.',
  CONTRASENA_INVALIDA: 'La contraseña debe tener entre 8 y 72 caracteres.',
  NO_PUEDE_MODIFICARSE_A_SI_MISMO: 'No puede cambiar su propio rol ni su estado.',
  ES_ADMINISTRADOR: 'Un administrador no se modifica desde el panel.',
  ES_ESTUDIANTE: 'Esa cuenta pertenece a un estudiante y no puede ser supervisor.',
  NO_ES_PERSONAL: 'Esa cuenta no pertenece al personal.',
  FRASE_INVALIDA: 'La frase secreta debe tener entre 8 y 200 caracteres.',
  LISTA_VACIA: 'Escriba al menos un nombre.',
  LISTA_DEMASIADO_LARGA: 'La lista es demasiado larga para una sola vista previa (máximo 200).',
  USUARIO_NO_ENCONTRADO: 'No existe una cuenta con ese correo. Créela primero (por ejemplo con «Crear supervisor nuevo»).',
  YA_ES_SUPERVISOR: 'Esa cuenta ya es supervisor.',
  NO_ESTA_ABIERTA: 'Esa jornada ya no está abierta (quizá el estudiante la cerró). Se actualizará la lista.',
  AUN_ES_DEL_DIA: 'Solo se pueden cerrar jornadas de días anteriores.',
  MOTIVO_REQUERIDO: 'Escriba un motivo de al menos 5 caracteres.',
  BITACORA_NO_ENCONTRADA: 'No se encontró la bitácora.',
  DEMASIADOS_VIDEOS: 'Son demasiados videos para una sola operación.'
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
  $('mos').classList.toggle('hidden', role !== 'admin');   // el mosaico es solo del administrador
  $('dme').textContent = v4 ? `${me.name || 'Sin nombre'} · ${role === 'admin' ? 'Administrador' : 'Supervisor'}` : '';
  $('me').textContent = v4 ? `Sesión: ${me.name || 'sin nombre'} · ${role === 'admin' ? 'Administrador' : 'Supervisor'}` : '';
  $('msg').textContent = ''; show(false, true); load();
}
async function load() {
  const [s, l, n, rd, sd, au, ac, va, pa, pi, us] = await Promise.all([
    sb.from('students').select('*').order('full_name'),
    sb.from('daily_logs').select('*').order('practice_date', { ascending: false }).limit(5000),
    sb.from('admin_notes').select('*').order('created_at', { ascending: false }).limit(2000),
    sb.from('rest_days').select('*').order('rest_date', { ascending: false }).limit(3000),
    v4 ? sb.rpc('staff_directory') : Promise.resolve({ data: [] }),
    v4 && me?.role === 'admin' ? sb.from('staff_audit').select('*').order('at', { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    v4 && me?.role === 'admin' ? sb.rpc('admin_list_accounts') : Promise.resolve({ data: [] }),
    sb.from('video_archive').select('*').limit(5000),
    sb.from('photo_archive').select('*').limit(5000),
    v4 && me?.role === 'admin' ? sb.rpc('admin_inactive_photos') : Promise.resolve({ data: [] }),
    v4 && me?.role === 'admin' ? sb.rpc('admin_accounts_usage') : Promise.resolve({ data: [] })]);
  arch = va.error ? [] : va.data || []; archMap = Object.fromEntries(arch.map(a => [a.log_id, a]));
  parch = pa.error ? [] : pa.data || []; pArchMap = Object.fromEntries(parch.map(a => [a.log_id, a])); pinfo = pi.error ? [] : pi.data || [];
  { const pe = pa.error || pi.error; pErr = pe ? (/photo_archive|admin_inactive_photos|42P01|PGRST205|PGRST202|schema cache|Could not find/.test((pe.message || '') + (pe.code || '')) ? 'Falta ejecutar migracion_v10.sql en Supabase: hasta entonces las fotos de inicio no se archivan.' : errText(pe)) : ''; }
  archErr = va.error ? (/video_archive|42P01|PGRST205|schema cache/.test(va.error.message || va.error.code || '') ? 'Falta ejecutar migracion_v8.sql en Supabase.' : errText(va.error)) : '';
  staffMap = Object.fromEntries((sd.error ? [] : sd.data || []).map(x => [x.user_id, x])); audit = au.error ? [] : au.data || [];
  usage = us.error ? null : Object.fromEntries((us.data || []).map(x => [x.user_id, x]));   // null = falta migracion_v11.sql
  acSel.clear();
  accts = ac.error ? [] : ac.data || []; acErr = ac.error ? (/Could not find the function|PGRST202/.test(ac.error.message || '') ? 'Falta ejecutar migracion_v6.sql en Supabase.' : errText(ac.error)) : '';
  if (s.error || l.error) return $('msg').textContent = (s.error || l.error).message;
  students = s.data; logs = l.data; notes = n.error ? [] : n.data;
  rests = rd.error ? [] : (rd.data || []);
  try { const sv = await sb.from('schedule_versions').select('*').order('created_at', { ascending: false }).limit(3000);
    schedVers = sv.error ? [] : sv.data || []; schedErr = sv.error ? 'Falta ejecutar migracion_v14.sql en Supabase: hasta entonces no hay horarios ni revisiones.' : ''; } catch { schedVers = []; }
  await loadAvatars();
  $('msg').textContent = n.error || rd.error ? 'Algunas funciones no están disponibles (¿ya ejecutó migracion_v2.sql en Supabase?).'
    : v4 && sd.error ? 'No se pudo cargar el personal (¿ya ejecutó migracion_v4.sql en Supabase?).' : '';
  render(); sweepDeletedMedia();
  if (!hashDone) { hashDone = true; const id = hashId(); if (id) openStudent(id, { push: false }); else if (location.hash === '#mosaico' && me?.role === 'admin') setView('mos'); else if (location.hash === '#revisiones') setView('rev'); }
}
let hashDone = false, pushInit = false, pushSt = null, pushUsers = new Map();

// ---- Avisos (push): instalación, dispositivo propio y, para el administrador, los ajustes ----
const PD = [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['0', 'Dom']];
async function renderAvisos() {
  if (!pushInit) { pushInit = true; Push.init(sb, 'sw.js'); }
  Push.card($('push-card-a'), { title: 'Este dispositivo' });
  const box = $('avisos-body'); box.replaceChildren();
  const [{ data: ps }, cfg] = await Promise.all([sb.rpc('push_status'), Push.config()]);
  pushUsers = new Map((ps || []).map(r => [r.user_id, r.devices]));
  if (me?.role !== 'admin') return;
  const { data: s, error } = await sb.from('push_settings').select('*').eq('id', 1).maybeSingle();
  if (error || !s) return box.append(h('p', { className: 'empty', textContent: 'Falta ejecutar migracion_v15.sql en Supabase para usar los avisos.' }));
  pushSt = s;
  const act = students.filter(z => z.active !== false), sin = act.filter(z => !pushUsers.has(z.id));
  const f = h('form', { className: 'pform', onsubmit: async e => { e.preventDefault(); const btn = f.querySelector('[type=submit]'); btn.disabled = true; $('p-out').textContent = '';
      const days = PD.filter(([k]) => f.querySelector('#pd' + k).checked).map(([k]) => +k);
      const { error: er } = await sb.rpc('admin_save_push_settings', { p_enabled: f.pen.checked, p_interval: +f.pint.value, p_from: +f.pfrom.value, p_to: +f.pto.value, p_days: days,
        p_start: f.pst.checked, p_close: f.pcl.checked, p_staff: f.psf.checked, p_results: f.prs.checked, p_soff: +f.psoff.value, p_coff: +f.pcoff.value, p_vapid: f.pvap.value });
      btn.disabled = false; $('p-out').textContent = er ? ({ AJUSTES_INVALIDOS: 'Revise los valores: la hora final debe ser posterior a la inicial y debe haber al menos un día.', VAPID_INVALIDA: 'La clave pública VAPID no tiene el formato correcto.' }[(er.message.match(/[A-Z_]{8,}/) || [])[0]] || errText(er)) : 'Ajustes guardados.'; if (!er) { await renderAvisos(); $('p-out').textContent = 'Ajustes guardados.'; } } },
    h('h3', { textContent: 'Ajustes de los avisos' }),
    h('label', { className: 'ck' }, h('input', { type: 'checkbox', name: 'pen', checked: s.enabled }), 'Enviar avisos'),
    h('div', { className: 'pgrid' },
      h('div', {}, h('label', { textContent: 'Revisar cada' }), h('select', { name: 'pint' }, [5, 10, 15, 30, 60].map(v => h('option', { value: v, textContent: v + ' min', selected: v === s.interval_min })))),
      h('div', {}, h('label', { textContent: 'Desde las' }), h('select', { name: 'pfrom' }, Array.from({ length: 24 }, (_, i) => h('option', { value: i, textContent: i + ':00', selected: i === s.hour_from })))),
      h('div', {}, h('label', { textContent: 'Hasta las' }), h('select', { name: 'pto' }, Array.from({ length: 24 }, (_, i) => h('option', { value: i + 1, textContent: (i + 1) + ':00', selected: i + 1 === s.hour_to }))))),
    h('label', { textContent: 'Días' }), h('div', { className: 'pdays' }, PD.map(([k, n]) => h('label', { className: 'ck' }, h('input', { type: 'checkbox', id: 'pd' + k, checked: (s.days || []).includes(+k) }), n))),
    h('label', { textContent: 'Qué avisar' }),
    h('label', { className: 'ck' }, h('input', { type: 'checkbox', name: 'pst', checked: s.remind_start }), 'Estudiantes: recordar iniciar la jornada'),
    h('label', { className: 'ck' }, h('input', { type: 'checkbox', name: 'pcl', checked: s.remind_close }), 'Estudiantes: recordar cerrar la jornada'),
    h('label', { className: 'ck' }, h('input', { type: 'checkbox', name: 'prs', checked: s.notify_results }), 'Estudiantes: resultado de horarios y horas revisadas'),
    h('label', { className: 'ck' }, h('input', { type: 'checkbox', name: 'psf', checked: s.notify_staff }), 'Administradores y supervisores: revisiones pendientes'),
    h('div', { className: 'pgrid' },
      h('div', {}, h('label', { textContent: 'Aviso de inicio: minutos después de la entrada' }), h('input', { type: 'number', name: 'psoff', min: 0, max: 60, value: s.start_offset_min })),
      h('div', {}, h('label', { textContent: 'Aviso de cierre: minutos después de la salida' }), h('input', { type: 'number', name: 'pcoff', min: 0, max: 60, value: s.close_offset_min }))),
    h('label', { textContent: 'Clave pública VAPID', htmlFor: 'pvap' }), h('input', { id: 'pvap', name: 'pvap', value: s.vapid_public || '', autocomplete: 'off', spellcheck: false }),
    h('p', { className: 'sub', textContent: 'Se genera una sola vez (vea el README). La clave privada va en los secretos de la función, nunca aquí.' }),
    h('div', { className: 'pacts' }, h('button', { type: 'submit', textContent: 'Guardar ajustes' })), h('p', { id: 'p-out', className: 'info', role: 'status' }));
  const st = h('div', { className: 'pstat' }, h('h3', { textContent: 'Estado' }),
    cfg.configured ? '' : h('p', { className: 'banner', textContent: 'Falta enlazar la función de envío: complete la tabla push_private (README, sección v21).' }),
    h('p', { className: 'info', textContent: `Última revisión automática: ${s.last_run_at ? fDT(s.last_run_at) : 'todavía ninguna'}. Avisos enviados en esa tanda: ${s.last_sent}.` }),
    h('p', { className: 'info', textContent: `Estudiantes con avisos activados: ${act.length - sin.length} de ${act.length}.` }),
    sin.length ? h('details', {}, h('summary', { textContent: `Sin avisos (${sin.length})` }), h('p', { className: 'info', textContent: sin.map(z => z.full_name).join(', ') })) : '');
  box.append(st, f);
}


// ---- Revisiones: horarios por confirmar y horas declaradas por revisar (migracion_v14.sql) ----
async function decideSched(v, ok) {
  let note = null;
  if (!ok) { const r = await ask({ title: 'Rechazar horario', hint: 'El estudiante verá este motivo y podrá corregir su horario.', label: 'Motivo', ok: 'Rechazar' }); if (!r) return; note = r.note; }
  const { error } = await sb.rpc('staff_decide_schedule', { p_id: v.id, p_ok: ok, p_note: note });
  if (error) alert(errText(error));
  await load();
}
async function decideAdj(x, side, ok, newAt) {
  let note = null;
  if (!ok || newAt) { const r = await ask({ title: ok ? 'Aprobar con otra hora' : 'Rechazar hora declarada', hint: ok ? 'Explique por qué corrige la hora.' : 'La jornada no sumará horas hasta que el estudiante o el administrador lo resuelvan. El estudiante verá este motivo.', label: 'Motivo', ok: ok ? 'Aprobar' : 'Rechazar' }); if (!r) return; note = r.note; }
  const { error } = await sb.rpc('staff_decide_adjust', { p_log: x.id, p_side: side, p_ok: ok, p_note: note, p_new_at: newAt || null });
  if (error) { alert(errText(error)); return false; }
  return true;
}
function askTime(x, side) {   // otra hora (mismo día de la jornada)
  return new Promise(res => {
    const inp = h('input', { type: 'time', value: fT(x[side + '_adj_at']).slice(0, 5) }), err = h('div', { className: 'err' }); let dlg;
    const done = v => { dlg.remove(); unlock(); res(v); };
    const form = h('form', { className: 'dlgbox', onsubmit: e => { e.preventDefault(); if (!inp.value) { err.textContent = 'Indique la hora.'; return; }
        const iso = `${x.practice_date}T${inp.value}:00-06:00`; if (new Date(iso) > new Date()) { err.textContent = 'La hora no puede ser futura.'; return; } done(iso); } },
      h('h3', { textContent: 'Hora que aprueba' }), h('p', { className: 'sub', textContent: `Jornada del ${fD(x.practice_date)}, ${side === 'entry' ? 'entrada' : 'salida'}.` }), h('label', {}, 'Hora', inp), err,
      h('div', { className: 'dlgacts' }, h('button', { type: 'button', className: 'sec', textContent: 'Cancelar', onclick: () => done(null) }), h('button', { type: 'submit', textContent: 'Continuar' })));
    dlg = h('div', { className: 'dlg', role: 'dialog', ariaModal: 'true' }, form); ovRoot().append(dlg); document.body.classList.add('noscroll'); inp.focus(); });
}
function renderRev() {
  const body = $('rev-body'), pv = schedVers.filter(v => v.status === 'pending'), byId = Object.fromEntries(students.map(z => [z.id, z]));
  const items = []; logs.forEach(x => ['entry', 'exit'].forEach(side => { if (x[side + '_adj_status'] === 'pending') items.push({ x, side }); }));
  items.sort((a, b) => b.x.practice_date.localeCompare(a.x.practice_date));
  const n = pv.length + items.length;
  $('rev-sum').textContent = 'Revisiones' + (n ? ` (${n})` : '');
  const ban = $('revban'); ban.classList.toggle('hidden', !n);
  ban.replaceChildren(h('span', { textContent: `Hay ${n} ${n === 1 ? 'revisión pendiente' : 'revisiones pendientes'}: ${pv.length} de horario y ${items.length} de horas.` }), h('button', { type: 'button', className: 'sec small', textContent: 'Revisar', onclick: () => setView('rev') }));
  body.replaceChildren(schedErr ? h('p', { className: 'empty', textContent: schedErr }) : '');
  const nm = id => byId[id]?.full_name || 'Estudiante';
  body.append(h('h3', { textContent: `Horarios por confirmar (${pv.length})` }));
  if (!pv.length) body.append(h('p', { className: 'empty', textContent: 'No hay horarios pendientes.' }));
  pv.forEach(v => { const conf = schedVers.filter(z => z.student_id === v.student_id && z.status === 'confirmed')[0];
    body.append(h('div', { className: 'revc' }, h('b', { textContent: nm(v.student_id) }), h('span', { className: 'lj-meta', textContent: conf ? 'Cambio de horario' : 'Primer horario' }),
      ...[['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']].filter(([k]) => v.days[k]).map(([k, d]) => h('p', { className: 'rg', textContent: `${d}: ${a12(v.days[k].s)} a ${a12(v.days[k].e)}, almuerzo ${v.days[k].l} min` })),
      h('div', { className: 'revact' }, h('button', { type: 'button', textContent: 'Confirmar', onclick: () => decideSched(v, true) }), h('button', { type: 'button', className: 'sec', textContent: 'Rechazar', onclick: () => decideSched(v, false) })))); });
  body.append(h('h3', { textContent: `Horas por revisar (${items.length})` }));
  if (!items.length) body.append(h('p', { className: 'empty', textContent: 'No hay horas pendientes.' }));
  else body.append(h('div', { className: 'revact' }, h('button', { type: 'button', className: 'sec', textContent: `Aprobar las ${items.length} horas tal como las declararon`, onclick: async () => {
    if (!confirm(`¿Aprobar las ${items.length} horas declaradas tal como están?`)) return;
    for (const it of items) { const { error } = await sb.rpc('staff_decide_adjust', { p_log: it.x.id, p_side: it.side, p_ok: true, p_note: null, p_new_at: null }); if (error) { alert(errText(error)); break; } }
    await load(); } })));
  items.forEach(({ x, side }) => { const k = side === 'entry' ? 'Entrada' : 'Salida', sched = side === 'entry' ? x.sched_start : x.sched_end;
    const diff = sched ? Math.round((new Date(x[side + '_adj_at']) - new Date(`${x.practice_date}T${sched}:00-06:00`)) / 60000) : null;
    body.append(h('div', { className: 'revc' },
      h('b', { textContent: nm(x.student_id) }), h('span', { className: 'lj-meta', textContent: `${fD(x.practice_date)} · ${k}` }),
      h('p', { className: 'rg', textContent: `Horario: ${sched ? a12(sched) : '—'} · Registrado en la app: ${fT(x[side + '_at']).slice(0, 5)} · Declarada: ${fT(x[side + '_adj_at']).slice(0, 5)}` + (diff !== null ? ` (${diff >= 0 ? '+' : '−'}${Math.abs(diff)} min del horario)` : '') }),
      x[side + '_reason'] ? h('p', { className: 'rg', textContent: 'Motivo: ' + x[side + '_reason'] }) : '',
      h('div', { className: 'revact' },
        h('button', { type: 'button', textContent: 'Aprobar', onclick: async () => { if (await decideAdj(x, side, true, null)) await load(); } }),
        h('button', { type: 'button', className: 'sec', textContent: 'Aprobar con otra hora', onclick: async () => { const t = await askTime(x, side); if (t && await decideAdj(x, side, true, t)) await load(); } }),
        h('button', { type: 'button', className: 'sec', textContent: 'Rechazar', onclick: async () => { if (await decideAdj(x, side, false, null)) await load(); } }),
        h('button', { type: 'button', className: 'sec', textContent: 'Ver estudiante', onclick: () => openStudent(x.student_id) })))); });
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
function avatar(s, cls = 'mk', zoom = true) { const u = avUrl(s);
  if (!u) return h('div', { className: cls, textContent: ini(s) });
  if (!zoom) return h('div', { className: cls + ' pic', style: `background-image:url("${u}")` });
  const open = e => { e.preventDefault(); e.stopPropagation(); viewAvatar(s, u, e.currentTarget); };   // dentro de <summary>: no abrir ni cerrar la tarjeta
  return h('div', { className: cls + ' pic zoom', role: 'button', tabIndex: 0, title: 'Ver foto', ariaLabel: 'Ver foto de ' + s.full_name, style: `background-image:url("${u}")`,
    onclick: open, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') open(e); } }); }
function viewAvatar(s, url, from) {
  if (vm) return;
  const prev = from || document.activeElement;
  const close = () => { document.removeEventListener('keydown', onKey); vm.remove(); vm = null; unlock(); prev?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const x1 = h('button', { type: 'button', className: 'vclose', textContent: '✕ Cerrar', onclick: close });
  vm = h('div', { className: 'vmodal av', role: 'dialog', ariaModal: 'true', ariaLabel: 'Foto de ' + s.full_name, onclick: e => { if (e.target === vm) close(); } },
    h('div', { className: 'vbar' }, h('span', { textContent: s.full_name }), x1), h('img', { src: url, alt: 'Foto de perfil de ' + s.full_name }));
  ovRoot().append(vm); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey); x1.focus();
}
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
      unlock();
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
    ovRoot().append(dlg); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey); ta.focus();
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
// Elimina una jornada (iniciada por error, falsa, etc.). Solo administrador, con motivo. Requiere migracion_v13.sql.
// La base borra la bitácora y deja copia completa en la auditoría; aquí se borran de Storage su foto y su video.
const MEDIA_BUCKET = { video_path: 'practice-videos', photo_path: 'practice-photos' };
async function purgeMedia(files) {      // files: [{bucket, path}]; devuelve cuántos no se pudieron borrar
  let bad = 0;
  for (const bucket of [...new Set(files.map(f => f.bucket))]) {
    const paths = files.filter(f => f.bucket === bucket).map(f => f.path);
    try { const r = await sb.storage.from(bucket).remove(paths); if (r.error) bad += paths.length; } catch { bad += paths.length; }
  }
  if (files.length) { try { await sb.rpc('admin_media_gone', { p_paths: files.map(f => f.path) }); } catch { /* se reintenta al recargar */ } }
  return bad;
}
async function deleteLog(x, s) {
  const st = x.status === 'in_progress' ? 'jornada en curso' : x.status === 'unclosed' ? 'jornada no concluida' : 'bitácora enviada';
  const r = await ask({ title: 'Eliminar jornada',
    hint: `${s ? s.full_name + ' · ' : ''}${fD(x.practice_date)} · ${st}. Se borra la jornada junto con su foto de inicio y su video. Queda una copia completa del texto y el motivo en la actividad del personal. Las notas y amonestaciones sobre esta jornada se conservan. Si era la jornada de hoy, el estudiante podrá iniciar otra. No se puede deshacer.`,
    label: 'Motivo (obligatorio: inicio por error, bitácora falsa, etc.)', min: 10, ok: 'Eliminar jornada' });
  if (!r) return;
  const { data, error } = await sb.rpc('admin_delete_log', { p_log: x.id, p_reason: r.note });
  if (error) { alert(errText(error)); return await load(); }
  const row = Array.isArray(data) ? data[0] : data, files = [];
  if (row?.video_path) files.push({ bucket: MEDIA_BUCKET.video_path, path: row.video_path });
  if (row?.photo_path) files.push({ bucket: MEDIA_BUCKET.photo_path, path: row.photo_path });
  const bad = await purgeMedia(files);
  if (bad) alert('La jornada se eliminó, pero ' + (bad === 1 ? 'un archivo' : bad + ' archivos') + ' no se pudieron borrar de Supabase. Se reintentará al recargar el panel.');
  await load();
}
// Reintenta borrar de Storage lo que quedó pendiente (por ejemplo, si se cortó la red al eliminar).
let swept = false;
async function sweepDeletedMedia() {
  if (me?.role !== 'admin' || swept) return; swept = true;
  try { const r = await sb.from('deleted_media').select('path,bucket').is('removed_at', null).limit(200);
    if (r.error || !r.data?.length) return; await purgeMedia(r.data.map(f => ({ bucket: f.bucket, path: f.path }))); } catch { /* sin migracion_v13 */ }
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
  kf = ''; $('q').value = ''; $('g').value = ''; setView('est'); render();
  openStudent(id, { tab: 'jornadas' });
}

let vday = '';   // día consultado ('' = hoy)
const setDay = v => { vday = v; render(); };
const viewDay = () => vday || todayGT();
function render() {
  const today = todayGT(), D = viewDay(), isT = D === today, byId = Object.fromEntries(students.map(s => [s.id, s]));
  const mineOf = s => logs.filter(x => x.student_id === s.id);
  const FILT = { active: s => s.active, today: s => mineOf(s).some(x => x.practice_date === D),
    open: s => mineOf(s).some(x => x.status === 'in_progress' && x.practice_date === D),
    done: s => mineOf(s).some(x => x.practice_date === D && x.status === 'submitted'),
    unc: s => mineOf(s).some(x => isStale(x, today)),
    rei: s => missesOf(s.id, today).length >= REINC_N,
    inc: s => mineOf(s).some(x => x.has_incident) };
  const dl = isT ? 'hoy' : 'el ' + fD(D);
  const NAMES = { active: 'Estudiantes activos', today: 'Con bitácora ' + dl, open: 'Con jornada en curso ' + dl,
    done: 'Con jornada finalizada ' + dl, unc: 'Con jornada sin cerrar',
    rei: `Reincidentes (${REINC_N} o más sin cerrar a tiempo en ${REINC_DIAS} días)`, inc: 'Con incidentes' };
  const k = [['active', 'Estudiantes activos', students.filter(s => s.active).length],
    ['today', isT ? 'Bitácoras de hoy' : 'Bitácoras del día', logs.filter(x => x.practice_date === D).length],
    ['open', 'Jornadas en curso', logs.filter(x => x.status === 'in_progress' && x.practice_date === D).length],
    ['done', isT ? 'Finalizadas hoy' : 'Finalizadas ese día', logs.filter(x => x.practice_date === D && x.status === 'submitted').length],
    ['unc', 'Sin cerrar', logs.filter(x => isStale(x, today)).length],
    ['rei', 'Reincidentes', students.filter(FILT.rei).length],
    ['inc', 'Incidentes (total)', logs.filter(x => x.has_incident).length]];
  $('kpis').replaceChildren(...k.map(([key, t, v]) => h('button', { type: 'button', title: 'Filtrar la lista de estudiantes',
    ariaPressed: String(kf === key), className: 'fig' + (kf === key ? ' sel' : '') + (['inc', 'unc', 'rei'].includes(key) && v ? ' alert' : ''),
    onclick: () => { kf = kf === key ? '' : key; render(); } }, h('b', { textContent: v }), h('span', { textContent: t }))));

  const dIn = h('input', { type: 'date', id: 'dsel', value: D, max: today, ariaLabel: 'Día que desea ver',
    onchange: e => { const v = e.target.value; setDay(!v || v >= today ? '' : v); } });
  $('daybar').replaceChildren(h('div', { className: 'dlab' }, h('b', { textContent: isT ? 'Hoy' : 'Día consultado' }), h('span', { textContent: fD(D) })),
    h('div', { className: 'dctl' },
      h('button', { type: 'button', className: 'sec', ariaLabel: 'Día anterior', textContent: '‹', onclick: () => setDay(shiftDay(D, -1)) }),
      dIn,
      h('button', { type: 'button', className: 'sec', ariaLabel: 'Día siguiente', textContent: '›', disabled: isT, onclick: () => { const n = shiftDay(D, 1); setDay(n >= today ? '' : n); } }),
      isT ? '' : h('button', { type: 'button', textContent: 'Volver a hoy', onclick: () => setDay('') })));

  renderPending(today, byId);
  renderRest(today);
  renderRev(); renderAvisos(); renderStaff(); renderNewStu(); renderAccts(); renderVids();

  const days = [...Array(14)].map((_, i) => shiftDay(today, i - 13));
  const cnt = days.map(d => logs.filter(x => x.practice_date === d).length), mx = Math.max(1, ...cnt);
  $('c-days').replaceChildren(h('div', { className: 'cols' }, days.map((d, i) =>
    h('button', { type: 'button', className: 'col' + (d === today ? ' now' : '') + (d === D ? ' pick' : ''), title: fD(d) + ': ' + cnt[i], ariaLabel: fD(d) + ': ' + cnt[i] + (cnt[i] === 1 ? ' bitácora' : ' bitácoras'), ariaPressed: String(d === D),
      onclick: () => setDay(d >= today ? '' : d) }, String(cnt[i]), h('i', { style: `height:${cnt[i] / mx * 46}px` }), d.slice(8)))));
  const gr = {}; logs.forEach(x => { const g = byId[x.student_id]?.grade || '?'; gr[g] = (gr[g] || 0) + 1; });
  const gm = Math.max(1, ...Object.values(gr));
  $('c-grade').replaceChildren(...Object.entries(gr).map(([g, n]) =>
    h('div', { className: 'hrow' }, h('span', { textContent: g }), h('i', { style: `width:${n / gm * 55}%` }), String(n))));

  const grades = [...new Set(students.map(s => s.grade))].sort(), sel = $('g'), cur = sel.value;
  sel.replaceChildren(h('option', { value: '', textContent: 'Todos los grados' }), ...grades.map(g => h('option', { value: g, textContent: g })));
  sel.value = cur;
  const q = $('q').value.toLowerCase();
  const pf = $('pg').value, af = $('ac').value;
  const list = students.filter(s => (!sel.value || s.grade === sel.value) && (!pf || (pf === 'none' ? !s.program : s.program === pf)) && (!af || (af === 'on') === s.active) && (!kf || FILT[kf](s)) &&
    (`${s.full_name} ${s.practice_place} ${s.institution || ''} ${s.supervisor_name || ''} ${s.supervisor_contact || ''}`).toLowerCase().includes(q));
  const note = kf ? h('div', { className: 'fnote' }, `Filtro: ${NAMES[kf]}. ${list.length} ${list.length === 1 ? 'estudiante' : 'estudiantes'}.`,
    h('button', { type: 'button', className: 'sec', textContent: 'Quitar filtro', onclick: () => { kf = ''; render(); } })) : '';
  const M = new Map(list.map(x => [x.id, metrics(x)]));
  const sorted = [...list].sort((a, b) => { const va = SORTV[UI.sk](a, M.get(a.id)), vb = SORTV[UI.sk](b, M.get(b.id));
    const c = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb; return c ? c * UI.sd : a.full_name.localeCompare(b.full_name, 'es'); });
  curList = sorted.map(x => x.id);
  $('list').className = UI.view === 'table' ? 'tview' : 'cards';
  $('vc').setAttribute('aria-pressed', String(UI.view !== 'table')); $('vt').setAttribute('aria-pressed', String(UI.view === 'table'));
  const srt = $('srt'); if (!srt.options.length) srt.replaceChildren(...SORTS.map(([k, t]) => h('option', { value: k, textContent: 'Ordenar: ' + t }))); srt.value = UI.sk;
  $('list').replaceChildren(note, ...(!sorted.length ? [h('p', { className: 'empty', textContent: 'Ningún estudiante coincide con los filtros.' })]
    : UI.view === 'table' ? [studentTable(sorted, M)] : sorted.map(x => studentCard(x, M.get(x.id)))));
  renderMenu(); renderDetail();
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
const FIELD = { active: 'activo', program: 'tipo de práctica', full_name: 'nombre', grade: 'grado', section: 'sección', practice_place: 'dirección', institution: 'empresa', supervisor_name: 'encargado', supervisor_contact: 'contacto del encargado', rol: 'rol', activo: 'activo', nombre: 'nombre' };
const val2 = v => v === null || v === undefined ? '—' : v === true ? 'sí' : v === false ? 'no' : v === 'practica' ? 'Práctica Supervisada' : v === 'prepractica' ? 'Prepráctica' : v === 'student' ? 'sin rol' : v === 'supervisor' ? 'supervisor' : String(v);
function describe(a) {
  const stu = students.find(s => s.id === a.student_id), tgt = staffMap[a.target_user], d = a.detail || {};
  const ch = Object.entries(d).filter(([, v]) => v && typeof v === 'object' && 'a' in v).map(([k, v]) => `${FIELD[k] || k}: ${val2(v.de)} → ${val2(v.a)}`).join('; ');
  if (a.action === 'avisos_ajustes') return `Cambió los ajustes de avisos: ${d.activados ? 'activados' : 'desactivados'}, cada ${d.cada_min} min, de ${String(d.horas).replace('-', ' a ')} h`;
  if (a.action === 'horario_confirmado' || a.action === 'horario_rechazado') return `${a.action === 'horario_confirmado' ? 'Confirmó' : 'Rechazó'} el horario semanal de ${stu?.full_name || 'un estudiante'}${d.nota ? ' · ' + d.nota : ''}`;
  if (a.action === 'hora_aprobada' || a.action === 'hora_rechazada') return `${a.action === 'hora_aprobada' ? 'Aprobó' : 'Rechazó'} la hora de ${d.lado === 'entry' ? 'entrada' : 'salida'} del ${d.fecha ? fD(d.fecha) : '—'} de ${stu?.full_name || 'un estudiante'}${d.hora_final && d.hora_final !== d.hora_declarada ? ` (la dejó en ${fT(d.hora_final).slice(0, 5)})` : ''}${d.nota ? ' · ' + d.nota : ''}`;
  if (a.action === 'personal_creado') return `Creó la cuenta de supervisor ${d.nombre} (${d.correo})`;
  if (a.action === 'estudiantes_creados') return `Creó ${d.creados} ${d.creados === 1 ? 'cuenta' : 'cuentas'} de estudiantes${d.omitidos ? ` (${d.omitidos} ya existían)` : ''}`;
  if (a.action === 'videos_archivados') return `Archivó ${d.cantidad} ${d.cantidad === 1 ? 'video' : 'videos'} (${fSize(d.bytes)}) para eliminarlos de Supabase`;
  if (a.action === 'videos_restaurados') return `Restauró ${d.cantidad} ${d.cantidad === 1 ? 'video' : 'videos'} (${fSize(d.bytes)}) en Supabase desde la carpeta descargada`;
  if (a.action === 'fotos_archivadas') return `Archivó ${d.cantidad} ${d.cantidad === 1 ? 'foto de inicio' : 'fotos de inicio'} (${fSize(d.bytes)}) para eliminarlas de Supabase`;
  if (a.action === 'fotos_eliminadas') return `Eliminó de Supabase ${d.cantidad} ${d.cantidad === 1 ? 'foto de inicio' : 'fotos de inicio'} (${fSize(d.bytes)}) ya descargadas`;
  if (a.action === 'fotos_restauradas') return `Restauró ${d.cantidad} ${d.cantidad === 1 ? 'foto de inicio' : 'fotos de inicio'} (${fSize(d.bytes)}) en Supabase desde la carpeta descargada`;
  if (a.action === 'videos_eliminados') return `Eliminó de Supabase ${d.cantidad} ${d.cantidad === 1 ? 'video' : 'videos'} (${fSize(d.bytes)}) ya descargados`;
  if (a.action === 'jornada_eliminada') return `Eliminó la jornada del ${d.fecha ? fD(d.fecha) : '—'} de ${d.estudiante || stu?.full_name || 'un estudiante'} (${d.estado === 'in_progress' ? 'en curso' : d.estado === 'unclosed' ? 'no concluida' : 'enviada'}) · Motivo: ${d.motivo}`;
  if (a.action === 'amonestacion_anulada') return `Eliminó una amonestación de ${stu?.full_name || 'un estudiante'} · Motivo: ${d.motivo}`;
  if (a.action === 'cuenta_eliminada') return `Eliminó la cuenta de ${d.nombre || d.correo} (${d.correo})`;
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

// ---- Crear cuentas de estudiantes desde una lista (solo administrador) ----
// Misma regla que crear_usuarios.sql: correo nombre.apellido@inedsaac.com y contraseña Nombre + 4 dígitos (según la frase secreta) + «!».
// La frase secreta solo se usa en la llamada: no se guarda ni en el navegador ni en la base de datos.
let nsBuilt = false, nsUi = {}, nsRows = [];
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
function clearNewStu() { nsRows = []; if (nsUi.salt) nsUi.salt.value = ''; if (nsUi.list) { nsUi.list.value = ''; nsUi.grow?.(); } if (nsUi.res) nsUi.res.replaceChildren(); if (nsUi.err) nsUi.err.textContent = ''; }
const nsErr = e => /Could not find the function|PGRST202/.test(e.message || '') ? 'Falta ejecutar migracion_v5.sql en Supabase.' : errText(e);
function nsShow(rows, withPass) {
  nsRows = rows; const u = nsUi;
  if (!rows.length) return u.res.replaceChildren();
  const made = rows.filter(r => r.estado === 'creado').length;
  const tbl = h('table', { className: 'ns' }, h('thead', {}, h('tr', {}, ['Nombre', 'Correo', withPass ? 'Contraseña' : '', 'Estado'].filter((_, i) => withPass || i !== 2).map(t => h('th', { textContent: t })))),
    h('tbody', {}, rows.map(r => h('tr', { className: r.estado === 'creado' || r.estado === 'se creará' ? '' : 'skip' },
      h('td', { textContent: r.nombre }), h('td', { textContent: r.correo || '—' }), withPass ? h('td', { className: 'pw', textContent: r.contrasena || '—' }) : '', h('td', { textContent: r.estado })))));
  const tools = withPass && made ? h('div', { className: 'acts' },
    h('button', { type: 'button', className: 'sec', textContent: 'Copiar tabla', onclick: () => navigator.clipboard?.writeText(['Nombre\tCorreo\tContraseña'].concat(rows.filter(r => r.estado === 'creado').map(r => [r.nombre, r.correo, r.contrasena].join('\t'))).join('\n')) }),
    h('button', { type: 'button', className: 'sec', textContent: 'Descargar CSV', onclick: () => {
      const csv = '\uFEFF' + [['nombre', 'correo', 'contraseña', 'estado']].concat(rows.map(r => [r.nombre, r.correo, r.contrasena, r.estado])).map(r => r.map(csvCell).join(',')).join('\r\n');
      const link = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'usuarios-creados.csv' }); document.body.append(link); link.click(); link.remove(); } }),
    h('button', { type: 'button', className: 'sec', textContent: 'Ocultar contraseñas', onclick: () => { nsRows = []; u.res.replaceChildren(); } })) : '';
  u.res.replaceChildren(h('p', { className: withPass ? 'ok' : 'sub', textContent: withPass ? `Listo: ${made} ${made === 1 ? 'cuenta creada' : 'cuentas creadas'}${rows.length - made ? `, ${rows.length - made} omitidas` : ''}. Guarde las contraseñas ahora: no se vuelven a mostrar.`
      : `Vista previa: ${rows.filter(r => r.estado === 'se creará').length} se crearían. No se creó nada.` }), tools, h('div', { className: 'tbl' }, tbl));
}
function buildNewStu() {
  nsBuilt = true; const u = nsUi;
  u.list = h('textarea', { rows: 10, placeholder: 'Pegue aquí los nombres, uno por línea\nEj.: Bethancourt Torres Oscar René', spellcheck: false });
  const grow = () => { u.list.style.height = 'auto'; u.list.style.height = Math.min(u.list.scrollHeight + 2, Math.round(innerHeight * .7)) + 'px'; };   // crece con las líneas
  u.list.addEventListener('input', grow); u.grow = grow;
  u.salt = h('input', { type: 'password', autocomplete: 'off', maxLength: 200, placeholder: 'La misma frase que usó en el script' });
  u.err = h('div', { className: 'err' }); u.res = h('div');
  const lines = () => u.list.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const busy = (on) => u.form.querySelectorAll('button').forEach(b => b.disabled = on);
  const preview = async () => { u.err.textContent = ''; const l = lines(); if (!l.length) return u.err.textContent = 'Escriba al menos un nombre.';
    busy(true); const { data, error } = await sb.rpc('admin_create_students', { p_list: l.join('\n'), p_salt: u.salt.value, p_dry_run: true }); busy(false);
    if (error) return u.err.textContent = nsErr(error); nsShow(data || [], false); };
  const create = async () => { u.err.textContent = ''; const l = lines(); if (!l.length) return u.err.textContent = 'Escriba al menos un nombre.';
    if (u.salt.value.length < 8) return u.err.textContent = ERRS.FRASE_INVALIDA;
    if (!confirm(`Se intentará crear ${l.length} ${l.length === 1 ? 'cuenta' : 'cuentas'} de estudiantes. Quien ya exista se omite. ¿Continuar?`)) return;
    busy(true); const out = [];
    for (let i = 0; i < l.length; i += 25) {   // tandas de 25: cada tanda es todo-o-nada
      const { data, error } = await sb.rpc('admin_create_students', { p_list: l.slice(i, i + 25).join('\n'), p_salt: u.salt.value, p_dry_run: false });
      if (error) { u.err.textContent = `${nsErr(error)}${out.length ? ` Ya se habían creado ${out.filter(r => r.estado === 'creado').length}; vea abajo.` : ''}`; break; }
      out.push(...(data || [])); }
    busy(false); if (out.length) { nsShow(out, true); if (!u.err.textContent) { u.list.value = ''; u.grow(); u.salt.value = ''; } await load(); } };
  u.form = h('form', { className: 'nsform', onsubmit: e => { e.preventDefault(); create(); } },
    h('label', {}, 'Lista de estudiantes', h('span', { className: 'hint', textContent: ' · Apellido1 Apellido2 Nombre1 Nombre2' }), u.list),
    h('div', { className: 'nsrow' }, h('label', {}, 'Frase secreta (no se guarda)', u.salt),
      h('div', { className: 'acts' }, h('button', { type: 'button', className: 'sec', textContent: 'Vista previa', onclick: preview }), h('button', { type: 'submit', textContent: 'Crear cuentas' }))),
    u.err);
  $('newstu-body').replaceChildren(u.form, u.res);
}
function renderNewStu() {
  const card = $('newstu'); card.classList.toggle('hidden', !(v4 && me?.role === 'admin'));
  if (card.classList.contains('hidden')) return;
  if (!nsBuilt) buildNewStu();
}

// ---- Cuentas: todas las cuentas de acceso y su situación (solo administrador) ----
// Une auth.users con students y user_roles (función admin_list_accounts, migracion_v6.sql).
const TIPOS = { sin_perfil: 'Sin perfil', estudiante: 'Estudiante', supervisor: 'Supervisor', admin: 'Administrador', ex_personal: 'Ex personal' };
let acBuilt = false, acUi = {}, acFilter = 'sin_perfil', acQ = '', usage = null;
const acSel = new Set();
// Una cuenta se puede eliminar solo si no es administrador, no es la propia y no tiene historial (bitácoras, notas o registros hechos).
const whyKeep = a => { if (a.tipo === 'admin') return 'Administrador'; if (a.user_id === me?.id) return 'Su cuenta'; const u = usage?.[a.user_id]; if (!u) return '—';   // sin datos de uso no se puede verificar: no se ofrece eliminar
  const p = []; if (u.bitacoras) p.push(`${u.bitacoras} ${u.bitacoras === 1 ? 'bitácora' : 'bitácoras'}`); if (u.notas) p.push(`${u.notas} ${u.notas === 1 ? 'nota' : 'notas'}`); if (u.registros) p.push(`registró ${u.registros}`);
  return p.length ? 'Tiene ' + p.join(', ') + ': inactívela' : ''; };
const canDelete = a => usage !== null && whyKeep(a) === '';
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function renderAccts() {
  const card = $('accts'); card.classList.toggle('hidden', !(v4 && me?.role === 'admin'));
  if (card.classList.contains('hidden')) return;
  const u = acUi;
  if (!acBuilt) { acBuilt = true;
    u.chips = h('div', { className: 'chips' }); u.q = h('input', { type: 'search', placeholder: 'Buscar por nombre o correo', oninput: () => { acQ = u.q.value; renderAccts(); } });
    u.list = h('div', { className: 'tbl' }); u.note = h('p', { className: 'sub' }); u.err = h('div', { className: 'err' }); u.tools = h('div', { className: 'actools' });
    $('accts-body').replaceChildren(h('p', { className: 'sub', textContent: 'Todas las cuentas de acceso. «Sin perfil» son cuentas creadas que aún no han entrado a llenar su perfil: todavía no aparecen en la lista de estudiantes.' }), u.err, u.chips, u.q, u.tools, u.note, u.list); }
  const cnt = k => accts.filter(a => a.tipo === k).length;
  $('accts-sum').textContent = `Cuentas (${accts.length}${cnt('sin_perfil') ? ` · ${cnt('sin_perfil')} sin perfil` : ''})`;
  u.err.textContent = acErr;
  u.chips.replaceChildren(...[['todas', `Todas (${accts.length})`]].concat(Object.keys(TIPOS).filter(k => cnt(k) || k === 'sin_perfil').map(k => [k, `${TIPOS[k]} (${cnt(k)})`]))
    .map(([k, t]) => h('button', { type: 'button', className: 'chip' + (acFilter === k ? ' on' : ''), textContent: t, onclick: () => { acFilter = k; renderAccts(); } })));
  const q = norm(acQ).trim();
  const rows = accts.filter(a => (acFilter === 'todas' || a.tipo === acFilter) && (!q || norm(a.nombre + ' ' + a.correo).includes(q)));
  u.note.textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'cuenta' : 'cuentas'}` : (acErr ? '' : 'No hay cuentas con ese filtro.');
  const del = rows.filter(canDelete);
  [...acSel].forEach(id => { if (!accts.some(x => x.user_id === id && canDelete(x))) acSel.delete(id); });
  const nSel = acSel.size, allOn = del.length > 0 && del.every(x => acSel.has(x.user_id));
  u.tools.replaceChildren(
    usage === null && !acErr ? h('p', { className: 'sub', textContent: 'Para eliminar cuentas falta ejecutar migracion_v11.sql en Supabase.' })
      : h('p', { className: 'sub', textContent: 'Solo se pueden eliminar cuentas sin historial (por ejemplo, creadas por error o duplicadas). Las que ya tienen bitácoras o notas se inactivan.' }),
    usage !== null ? h('div', { className: 'acts' },
      h('button', { type: 'button', className: 'sec', textContent: allOn ? 'Quitar selección' : `Seleccionar eliminables (${del.length})`, disabled: !del.length,
        onclick: () => { if (allOn) del.forEach(x => acSel.delete(x.user_id)); else del.forEach(x => acSel.add(x.user_id)); renderAccts(); } }),
      h('button', { type: 'button', className: 'danger', textContent: nSel ? `Eliminar seleccionadas (${nSel})` : 'Eliminar seleccionadas', disabled: !nSel, onclick: deleteSelected })) : '');
  u.list.replaceChildren(rows.length ? h('table', { className: 'ns' }, h('thead', {}, h('tr', {}, [usage !== null ? '' : null, 'Nombre', 'Correo', 'Situación', 'Creada', 'Último ingreso', usage !== null ? 'Historial' : null].filter(t => t !== null).map(t => h('th', { textContent: t })))),
    h('tbody', {}, rows.map(a => h('tr', { className: a.activo ? '' : 'skip' },
      ...(usage !== null ? [h('td', { className: 'ck' }, canDelete(a) ? h('input', { type: 'checkbox', checked: acSel.has(a.user_id), ariaLabel: 'Seleccionar a ' + (a.nombre || a.correo),
        onchange: e => { if (e.target.checked) acSel.add(a.user_id); else acSel.delete(a.user_id); renderAccts(); } }) : '')] : []),
      h('td', { textContent: a.nombre || '—' }), h('td', { textContent: a.correo || '—' }),
      h('td', { textContent: TIPOS[a.tipo] + (a.activo ? '' : ' (inactivo)') }), h('td', { textContent: fDT(a.creada) }),
      h('td', { textContent: a.ultimo_ingreso ? fDT(a.ultimo_ingreso) : 'Nunca ha entrado' }),
      ...(usage !== null ? [h('td', { className: canDelete(a) ? '' : 'keep', textContent: canDelete(a) ? 'Sin historial' : whyKeep(a) })] : []))))) : '');
}
async function deleteSelected() {
  const ids = [...acSel], list = accts.filter(x => acSel.has(x.user_id));
  if (!ids.length) return;
  const names = list.slice(0, 8).map(x => '• ' + (x.nombre || x.correo)).join('\n') + (list.length > 8 ? `\n…y ${list.length - 8} más` : '');
  if (!confirm(`Se eliminarán ${list.length} ${list.length === 1 ? 'cuenta' : 'cuentas'} de forma permanente:\n\n${names}\n\nNo se puede deshacer.`)) return;
  const word = prompt('Para confirmar, escriba ELIMINAR'); if (word === null) return;
  if (word.trim().toUpperCase() !== 'ELIMINAR') return alert('No se eliminó nada: la palabra no coincide.');
  const { data, error } = await sb.rpc('admin_delete_accounts', { p_ids: ids });
  if (error) return alert(/Could not find the function|PGRST202/.test(error.message || '') ? 'Falta ejecutar migracion_v11.sql en Supabase.' : errText(error));
  const ok = (data || []).filter(x => x.eliminado), no = (data || []).filter(x => !x.eliminado);
  const av = ok.map(x => x.avatar_path).filter(Boolean);
  if (av.length) { try { await sb.storage.from('practice-photos').remove(av); } catch (e) { /* el avatar huérfano no afecta nada */ } }
  await load();
  alert((ok.length ? `Se eliminaron ${ok.length} ${ok.length === 1 ? 'cuenta' : 'cuentas'}.` : 'No se eliminó ninguna cuenta.')
    + (no.length ? `\n\nNo se eliminaron:\n${no.map(x => `• ${x.nombre || x.correo || 'cuenta'}: ${x.motivo}`).join('\n')}` : ''));
}

// ---- Videos, fotos y espacio: descargar a una carpeta, eliminar de Supabase y restaurar (solo administrador) ----
// Trabaja con dos tipos de archivo de estudiantes INACTIVOS: el video de cada jornada y su foto de inicio (el avatar nunca se toca).
// Flujo: 1) se baja cada archivo a una carpeta elegida y se comprueba que el tamaño coincida con el registrado;
// 2) solo los verificados se registran como archivados y se borran de Storage;
// 3) la base confirma cuáles ya no existen. Si algo falla, no se borra nada sin verificar.
// Restaurar: se vuelven a subir desde la carpeta a su ruta original y la base comprueba el tamaño antes de quitar el registro.
const fSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB';
const safeName = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'sin_nombre';
const sizeOf = x => Number(x.video_size) || 0;
const KIND = {
  video: { bucket: 'practice-videos', label: 'Video', arch: 'admin_archive_videos', gone: 'admin_confirm_videos_removed', back: 'admin_confirm_videos_restored',
    mime: { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }, ext: 'mp4' },
  photo: { bucket: 'practice-photos', label: 'Foto de inicio', arch: 'admin_archive_photos', gone: 'admin_confirm_photos_removed', back: 'admin_confirm_photos_restored',
    mime: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }, ext: 'jpg' } };
const KINDS = ['video', 'photo'];
const pp = p => String(p).split('/');   // usuario/fecha/archivo
const mkItem = (kind, id, path, size, sid, day) => ({ kind, id, path, size, sid: sid || pp(path)[0], day: day || pp(path)[1] });
const extOf = (p, k) => (String(p).split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || KIND[k].ext;
const fileName = it => `${it.day}_${String(it.id).slice(0, 8)}${it.kind === 'photo' ? '_inicio' : ''}.${extOf(it.path, it.kind)}`;
const countText = list => { const v = list.filter(x => x.kind === 'video').length, f = list.length - v;
  return [v ? `${v} ${v === 1 ? 'video' : 'videos'}` : '', f ? `${f} ${f === 1 ? 'foto de inicio' : 'fotos de inicio'}` : ''].filter(Boolean).join(' y ') || '0 archivos'; };
const gen = (list, m, f) => list.length && list.every(x => x.kind === 'photo') ? f : m;   // concordancia: foto es femenino
const vdInactive = id => students.find(z => z.id === id)?.active === false;   // solo estudiantes inactivos
const vdEligible = () => [
  ...logs.filter(x => x.status !== 'in_progress' && x.video_path && !archMap[x.id] && vdInactive(x.student_id) && (!vdTo || x.practice_date <= vdTo))
    .map(x => mkItem('video', x.id, x.video_path, sizeOf(x), x.student_id, x.practice_date)),
  ...pinfo.filter(p => !pArchMap[p.log_id] && vdInactive(pp(p.photo_path)[0]) && (!vdTo || pp(p.photo_path)[1] <= vdTo))
    .map(p => mkItem('photo', p.log_id, p.photo_path, Number(p.photo_size) || 0))];
const vdPending = () => [...arch.filter(a => !a.removed_at).map(a => mkItem('video', a.log_id, a.video_path, Number(a.video_size) || 0)),
  ...parch.filter(a => !a.removed_at).map(a => mkItem('photo', a.log_id, a.photo_path, Number(a.photo_size) || 0))];
const vdRestorable = () => [...arch.filter(a => a.removed_at).map(a => mkItem('video', a.log_id, a.video_path, Number(a.video_size) || 0)),
  ...parch.filter(a => a.removed_at).map(a => mkItem('photo', a.log_id, a.photo_path, Number(a.photo_size) || 0))];
const isArch = it => !!(it.kind === 'photo' ? pArchMap : archMap)[it.id];
const vdSetNote = t => { vd.note = t; if (vdUi.note) vdUi.note.textContent = t; };
const stuName = it => students.find(z => z.id === it.sid)?.full_name || '';
async function vdSaveOne(root, it) {
  const dh = await root.getDirectoryHandle(safeName(stuName(it) || it.sid), { create: true }), name = fileName(it), size = it.size;
  if (!size) throw new Error('el tamaño original no está registrado');
  try { const f = await (await dh.getFileHandle(name)).getFile(); if (f.size === size) return { dir: dh.name, name, reused: true }; } catch {}
  const r = await sb.storage.from(KIND[it.kind].bucket).createSignedUrl(it.path, 3600);
  if (r.error) throw new Error('no se pudo generar el enlace (' + r.error.message + ')');
  const res = await fetch(r.data.signedUrl, { signal: vd.ctrl.signal });
  if (!res.ok || !res.body) throw new Error('la descarga falló (' + res.status + ')');
  const fh = await dh.getFileHandle(name, { create: true }), w = await fh.createWritable(); let n = 0;
  try { const rd = res.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); n += value.length; }
    await w.close();
  } catch (e) { try { await w.abort(); } catch {} throw e; }
  const got = (await fh.getFile()).size;
  if (n !== size || got !== size) { try { await dh.removeEntry(name); } catch {} throw new Error(`el tamaño no coincide (${got} de ${size} bytes)`); }
  return { dir: dh.name, name, reused: false };
}
async function vdDownload() {
  if (vd.busy) return;
  if (!window.showDirectoryPicker) return vdSetNote('Este navegador no puede guardar en una carpeta. Use Chrome o Edge en una computadora.');
  const todo = vdEligible();
  if (!todo.length) return vdSetNote('No hay archivos pendientes con ese filtro.');
  let root; try { root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bitacora-videos' }); } catch { return; }   // cancelado
  vd.busy = true; vd.ctrl = new AbortController(); vd.verified = []; vd.failed = []; vd.skipped = 0; renderVids();
  const rows = [];
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    if (vd.ctrl.signal.aborted) break;
    vdSetNote(`Descargando ${i + 1} de ${todo.length}: ${stuName(it)} · ${it.day} · ${KIND[it.kind].label.toLowerCase()} (${fSize(it.size)})`);
    try { const f = await vdSaveOne(root, it); vd.verified.push(it); if (f.reused) vd.skipped++;
      rows.push([stuName(it), it.day, f.dir + '/' + f.name, it.size, it.id, KIND[it.kind].label, f.reused ? 'ya estaba en la carpeta' : 'descargado']);
    } catch (e) { if (vd.ctrl.signal.aborted) break; vd.failed.push({ x: it, why: e.message || String(e) }); }
  }
  const stopped = vd.ctrl.signal.aborted;
  if (rows.length) { try { const q = v => `"${String(v).replace(/"/g, '""')}"`, stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fh = await root.getFileHandle(`indice_videos_${stamp}.csv`, { create: true }), w = await fh.createWritable();
    await w.write('﻿' + [['estudiante', 'fecha', 'archivo', 'bytes', 'jornada_id', 'tipo', 'estado']].concat(rows).map(r => r.map(q).join(',')).join('\r\n')); await w.close(); } catch {} }
  vd.busy = false; vd.ctrl = null;
  const t = vd.verified.reduce((a, x) => a + x.size, 0);
  vdSetNote(`${stopped ? 'Detenido. ' : ''}Verificados en su carpeta: ${vd.verified.length} (${fSize(t)})${vd.skipped ? `, ${vd.skipped} ya estaban` : ''}.${vd.failed.length ? ` Con error: ${vd.failed.length} (no se eliminarán).` : ''}`);
  renderVids();
}
async function vdRemove(items) {   // items: { kind, id, path, size, archived }
  if (vd.busy || !items.length) return;
  const total = items.reduce((a, x) => a + (x.size || 0), 0);
  const word = prompt(`Se eliminarán de Supabase ${countText(items)} (${fSize(total)}) que ya están guardados en su carpeta.\n\nEsta acción NO se puede deshacer desde Supabase (solo restaurando desde su carpeta).\n\nPara confirmar escriba ELIMINAR`);
  if ((word || '').trim().toUpperCase() !== 'ELIMINAR') return vdSetNote('No se eliminó nada.');
  vd.busy = true; renderVids();
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  let confirmed = 0, problem = '', done = 0;
  for (const k of KINDS) {
    const its = items.filter(x => x.kind === k), K = KIND[k]; if (!its.length) continue;
    try {
      for (const c of chunk(its.filter(x => !x.archived), 200)) { vdSetNote('Registrando el archivo…');
        const r = await sb.rpc(K.arch, { p_log_ids: c.map(x => x.id) }); if (r.error) throw r.error; }
      for (const c of chunk(its, 50)) { vdSetNote(`Eliminando de Supabase… ${done} de ${items.length}`);
        const r = await sb.storage.from(K.bucket).remove(c.map(x => x.path)); if (r.error) { problem = r.error.message; break; } done += c.length; }
      for (const c of chunk(its, 200)) { const r = await sb.rpc(K.gone, { p_log_ids: c.map(x => x.id) }); if (r.error) throw r.error; confirmed += r.data || 0; }
    } catch (e) { problem = errText(e); }
  }
  vd.busy = false; vd.verified = []; vd.failed = [];
  await load();
  vdSetNote(`Eliminados de Supabase: ${confirmed} de ${items.length}.` + (confirmed < items.length ? ` ${items.length - confirmed} quedaron archivados con la eliminación pendiente${problem ? ' (' + problem + ')' : ''}; puede reintentarlo con el botón de abajo.` : ' Espacio liberado.'));
  renderVids();
}
async function* vdWalk(dir, depth = 0) {
  for await (const e of dir.values()) {
    if (e.kind === 'directory') { if (depth < 2) yield* vdWalk(e, depth + 1); } else if (e.kind === 'file') yield e;
  }
}
async function vdRestore() {
  if (vd.busy) return;
  if (!window.showDirectoryPicker) return vdSetNote('Este navegador no puede leer una carpeta. Use Chrome o Edge en una computadora.');
  const cand = vdRestorable();
  if (!cand.length) return vdSetNote('No hay archivos archivados y eliminados para restaurar.');
  let root; try { root = await window.showDirectoryPicker({ mode: 'read', id: 'bitacora-videos' }); } catch { return; }   // cancelado
  vd.busy = true; vd.ctrl = new AbortController(); vd.verified = []; vd.failed = []; renderVids(); vdSetNote('Buscando los archivos en la carpeta…');
  const byKey = new Map(cand.map(a => [`${a.kind}:${a.day}_${String(a.id).slice(0, 8)}`, a]));
  const found = new Map(); let dup = 0, other = 0;
  try {
    for await (const fh of vdWalk(root)) {
      const mv = /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8})\.(mp4|webm|mov)$/i.exec(fh.name), mp = /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8})_inicio\.(jpe?g|png|webp)$/i.exec(fh.name);
      const m = mv || mp, kind = mv ? 'video' : 'photo', a = m && byKey.get(`${kind}:${m[1]}_${m[2].toLowerCase()}`);
      if (!a) { other++; continue; }
      if (found.has(kind + ':' + a.id)) { dup++; continue; }
      found.set(kind + ':' + a.id, { a, fh, ext: m[3].toLowerCase() });
    }
  } catch (e) { vd.busy = false; vd.ctrl = null; vdSetNote('No se pudo leer la carpeta: ' + (e.message || e)); return renderVids(); }
  const list = [...found.values()], bytes = list.reduce((t, x) => t + x.a.size, 0);
  if (!list.length) { vd.busy = false; vd.ctrl = null; vdSetNote(`No se encontró en esa carpeta ningún archivo archivado (${other} archivos no coinciden). Elija la carpeta donde descargó los videos y fotos.`); return renderVids(); }
  if (!confirm(`Se encontraron ${list.length} de ${cand.length} archivos archivados (${countText(list.map(x => x.a))}; ${fSize(bytes)}). Se volverán a subir a Supabase y ocuparán espacio de almacenamiento.\n\n¿Restaurarlos ahora?`)) {
    vd.busy = false; vd.ctrl = null; vdSetNote('No se restauró nada.'); return renderVids(); }
  const ready = []; let done = 0;
  for (const it of list) {
    if (vd.ctrl.signal.aborted) break;
    vdSetNote(`Restaurando ${++done} de ${list.length}: ${stuName(it.a)} · ${it.a.day} · ${KIND[it.a.kind].label.toLowerCase()} (${fSize(it.a.size)})`);
    const why = m => vd.failed.push({ x: it.a, why: m });
    try {
      const file = await it.fh.getFile(), want = it.a.size;
      if (want && file.size !== want) { why(`el tamaño de la carpeta no coincide (${file.size} de ${want} bytes)`); continue; }
      const K = KIND[it.a.kind], up = await sb.storage.from(K.bucket).upload(it.a.path, file, { contentType: K.mime[it.ext], upsert: false });
      if (up.error && !/already exists|duplicate/i.test(up.error.message || '')) { why('no se pudo subir (' + up.error.message + ')'); continue; }
      ready.push(it);
    } catch (e) { why(e.message || String(e)); }
  }
  const stopped = vd.ctrl.signal.aborted; let confirmed = 0;
  try {
    for (const k of KINDS) { const rk = ready.filter(x => x.a.kind === k);
      for (let i = 0; i < rk.length; i += 200) { const c = rk.slice(i, i + 200);
        const r = await sb.rpc(KIND[k].back, { p_log_ids: c.map(x => x.a.id) }); if (r.error) throw r.error; confirmed += r.data || 0; } }
  } catch (e) { vd.failed.push({ x: { kind: 'video', sid: '', day: '' }, why: 'no se pudo confirmar en la base: ' + errText(e) }); }
  if (confirmed < ready.length) vd.failed.push({ x: { kind: 'video', sid: '', day: '' }, why: `${ready.length - confirmed} archivos se subieron pero la base no pudo verificar su tamaño; no se marcaron como restaurados` });
  vd.busy = false; vd.ctrl = null;
  const fails = vd.failed; await load(); vd.failed = fails;
  vdSetNote(`${stopped ? 'Detenido. ' : ''}Restaurados: ${confirmed} de ${list.length}.` + (cand.length - list.length ? ` No estaban en la carpeta: ${cand.length - list.length}.` : '') + (dup ? ` Repetidos ignorados: ${dup}.` : '') + (fails.length ? ` Con problema: ${fails.length}.` : confirmed ? ' Las bitácoras vuelven a mostrar su evidencia.' : ''));
  renderVids();
}
function renderVids() {
  const card = $('vids'); card.classList.toggle('hidden', !(v4 && me?.role === 'admin'));
  if (card.classList.contains('hidden')) return;
  const u = vdUi;
  if (!vdBuilt) { vdBuilt = true;
    u.stat = h('p', { className: 'sub' }); u.err = h('div', { className: 'err' }); u.note = h('p', { className: 'sub', ariaLive: 'polite' });
    u.to = h('input', { type: 'date', oninput: () => { vdTo = u.to.value; renderVids(); } });
    u.go = h('button', { type: 'button', textContent: 'Elegir carpeta y descargar', onclick: vdDownload });
    u.stop = h('button', { type: 'button', className: 'sec', textContent: 'Detener', onclick: () => vd.ctrl?.abort() });
    u.del = h('button', { type: 'button', className: 'danger', onclick: () => vdRemove(vd.verified.map(x => ({ ...x, archived: isArch(x) }))) });
    u.retry = h('button', { type: 'button', className: 'danger', onclick: () => vdRemove(vdPending().map(x => ({ ...x, archived: true }))) });
    u.fail = h('div', { className: 'tbl' }); u.by = h('div', { className: 'tbl' }); u.warn = h('p', { className: 'err' });
    u.rtxt = h('p', { className: 'sub' }); u.rbtn = h('button', { type: 'button', className: 'sec', textContent: 'Elegir carpeta y restaurar', onclick: vdRestore });
    u.rest = h('div', { className: 'vdrest' }, h('h3', { textContent: 'Restaurar videos y fotos archivados' }), u.rtxt, h('div', { className: 'acts' }, u.rbtn));
    $('vids-body').replaceChildren(
      h('p', { className: 'sub', textContent: 'Para liberar espacio: descargue a una carpeta de esta computadora los videos y las fotos de inicio de jornada de los estudiantes INACTIVOS (los de estudiantes activos y las fotos de perfil nunca se tocan) y, cuando estén verificados, elimínelos de Supabase. Las bitácoras (fechas, actividades, notas) se conservan; solo se quita el archivo, y el panel lo indicará como «archivado». Las jornadas en curso no se tocan.' }),
      u.err, u.stat, u.by, h('label', { className: 'vdlab' }, 'Hasta el día (inclusive; vacío = todos los pendientes) ', u.to),
      h('div', { className: 'acts' }, u.go, u.stop), u.warn, u.note, u.fail, h('div', { className: 'acts' }, u.del), h('div', { className: 'acts' }, u.retry), u.rest); }
  const el = vdEligible(), tot = el.reduce((a, x) => a + x.size, 0), pend = vdPending(), gone = [...arch, ...parch].filter(a => a.removed_at);
  $('vids-sum').textContent = `Videos, fotos y espacio (${el.length} por archivar · ${fSize(tot)})`;
  u.err.textContent = [archErr, pErr].filter(Boolean).join(' ');
  const per = new Map(); el.forEach(x => { const r = per.get(x.sid) || { v: 0, f: 0, b: 0 }; x.kind === 'video' ? r.v++ : r.f++; r.b += x.size; per.set(x.sid, r); });
  u.by.replaceChildren(per.size ? h('table', { className: 'ns' }, h('thead', {}, h('tr', {}, ['Estudiante inactivo', 'Videos', 'Fotos de inicio', 'Tamaño'].map(t => h('th', { textContent: t })))),
    h('tbody', {}, [...per].map(([id, r]) => h('tr', {}, h('td', { textContent: students.find(z => z.id === id)?.full_name || '' }), h('td', { textContent: String(r.v) }), h('td', { textContent: String(r.f) }), h('td', { textContent: fSize(r.b) }))))) : '');
  u.stat.textContent = `Con el filtro actual: ${countText(el)} (${fSize(tot)}) por descargar de estudiantes inactivos. Ya archivados y eliminados: ${gone.length}.`;
  u.warn.textContent = window.showDirectoryPicker ? '' : 'Este navegador no puede guardar en una carpeta. Para descargar y eliminar archivos use Chrome o Edge en una computadora.';
  u.go.disabled = vd.busy || !el.length || !!archErr; u.stop.classList.toggle('hidden', !vd.busy); u.to.disabled = vd.busy;
  const vt = vd.verified.reduce((a, x) => a + x.size, 0);
  u.del.classList.toggle('hidden', vd.busy || !vd.verified.length);
  u.del.textContent = `Eliminar de Supabase: ${countText(vd.verified)} ${vd.verified.length === 1 ? gen(vd.verified, 'verificado', 'verificada') : gen(vd.verified, 'verificados', 'verificadas')} (${fSize(vt)})`;
  const rr = vdRestorable(), rb = rr.reduce((t, a) => t + a.size, 0);
  u.rest.classList.toggle('hidden', !rr.length);
  u.rtxt.textContent = `Archivados y eliminados de Supabase: ${rr.length} (${fSize(rb)}). Si necesita alguno de vuelta, elija la carpeta donde los descargó: el panel los reconoce por su nombre, comprueba el tamaño y los sube a su lugar original; la bitácora vuelve a mostrar su evidencia. Al restaurar vuelven a ocupar espacio de Supabase.`;
  u.rbtn.disabled = vd.busy || !!archErr || !window.showDirectoryPicker;
  u.retry.classList.toggle('hidden', vd.busy || !pend.length);
  u.retry.textContent = `Reintentar la eliminación de ${countText(pend)} ${pend.length === 1 ? gen(pend, 'archivado pendiente', 'archivada pendiente') : gen(pend, 'archivados pendientes', 'archivadas pendientes')}`;
  u.fail.replaceChildren(vd.failed.length ? h('table', { className: 'ns' }, h('thead', {}, h('tr', {}, ['Estudiante', 'Día', 'Archivo', 'Problema'].map(t => h('th', { textContent: t })))),
    h('tbody', {}, vd.failed.map(f => h('tr', {}, h('td', { textContent: students.find(z => z.id === f.x.sid)?.full_name || '' }), h('td', { textContent: f.x.day }), h('td', { textContent: f.x.sid || f.x.day ? KIND[f.x.kind].label : '' }), h('td', { textContent: f.why }))))) : '');
}

const mins = x => x.exit_at ? Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000)) : 0;
const dur = m => m ? `${Math.floor(m / 60)} h ${m % 60} min` : 'en curso';
async function annulNote(n) {
  const r = await ask({ title: 'Eliminar amonestación',
    hint: `«${n.note.length > 140 ? n.note.slice(0, 140) + '…' : n.note}» El estudiante dejará de verla. Para auditoría, el personal la seguirá viendo tachada, con el motivo y quién la eliminó. No se puede deshacer.`,
    label: 'Motivo (obligatorio)', min: 10, ok: 'Eliminar amonestación' });
  if (!r) return;
  const { error } = await sb.rpc('admin_annul_note', { p_note: n.id, p_reason: r.note });
  if (error) alert(errText(error));
  await load();
}
function noteRow(n) {
  const lg = n.log_id ? logs.find(x => x.id === n.log_id) : null, anu = !!n.annulled_at;
  const can = me?.role === 'admin' && n.kind === 'amonestacion' && !anu && 'annulled_at' in n;   // 'annulled_at' existe solo con migracion_v12
  return h('div', { className: 'note ' + n.kind + (anu ? ' annulled' : '') },
    h('b', { textContent: anu ? 'Amonestación eliminada' : n.kind === 'amonestacion' ? 'Amonestación' : 'Observación' }),
    h('span', { className: 'd', textContent: fDT(n.created_at) + (v4 ? ` · por ${by(n.created_by)}` : '') + (lg ? ` · sobre la jornada del ${fD(lg.practice_date)}` : '') + (anu ? ' · el estudiante ya no la ve' : n.kind === 'amonestacion' ? ' · la ve el estudiante' : ' · privada') }),
    h('p', { className: 'tx', textContent: n.note }),
    anu ? h('p', { className: 'anu', textContent: `Eliminada el ${fDT(n.annulled_at)} por ${by(n.annulled_by)}. Motivo: ${n.annul_reason}` }) : '',
    can ? h('button', { type: 'button', className: 'sec small', textContent: 'Eliminar amonestación', onclick: () => annulNote(n) }) : '');
}
// ================= Panel de estudiantes: tarjetas, tabla y ficha en diálogo =================
let UI = { view: 'cards', sk: 'name', sd: 1 };
try { Object.assign(UI, JSON.parse(localStorage.getItem('bitacora.admin.ui') || '{}')); } catch {}
const saveUI = () => { try { localStorage.setItem('bitacora.admin.ui', JSON.stringify(UI)); } catch {} };
let curList = [];
const SORTS = [['name', 'Nombre'], ['grade', 'Grado'], ['state', 'Estado del día'], ['dayh', 'Horas del día'], ['tot', 'Horas totales'], ['over', 'Horas extra'], ['n', 'Bitácoras'], ['inc', 'Incidentes'], ['last', 'Última jornada']];
const SORTV = {
  name: s => s.full_name, grade: s => `${s.grade} ${s.section}`, state: (s, M) => M.st.rank, dayh: (s, M) => M.dm ?? -1,
  tot: (s, M) => M.hs.total || 0, over: (s, M) => M.hs.over || 0, n: (s, M) => M.n, inc: (s, M) => M.inc, last: (s, M) => M.last ? Number(M.last.replace(/-/g, '')) : 0 };
const TEXTKEYS = ['name', 'grade'];
const defDir = k => TEXTKEYS.includes(k) || k === 'state' ? 1 : -1;
function setSort(k) { if (UI.sk === k) UI.sd = -UI.sd; else { UI.sk = k; UI.sd = defDir(k); } saveUI(); render(); }

// Estado del día de un estudiante (texto, color y orden para ordenar la tabla)
function dayState(s, mine) {
  const today = todayGT(), D = viewDay(), isT = D === today;
  const tl = mine.find(x => x.practice_date === D), stale = mine.find(x => isStale(x, today));
  const wd = new Date(D + 'T12:00:00Z').getUTCDay(), when = isT ? '' : ' ese día', rd = restFor(s.id, D);
  const r = (cls, text, rank) => ({ cls, text, rank });
  return !isT && tl?.status === 'in_progress' ? r('late', `Sin cerrar, entrada ${fT(tl.entry_at).slice(0, 5)}`, 0)
    : stale && isT ? r('late', `Sin cerrar desde hace ${dias(dayDiff(stale.practice_date, today))}`, 0)
    : tl?.status === 'submitted' ? r('done', `Completada${when}, salida ${fT(tl.exit_at).slice(0, 5)}`, 2)
    : tl?.status === 'unclosed' ? r('late', 'Jornada no concluida', 0)
    : tl?.status === 'in_progress' ? r('on', `En jornada desde ${fT(tl.entry_at).slice(0, 5)}`, 1)
    : rd ? r('rest', `Día de descanso${isT ? ' hoy' : ''}` + (rd.reason ? ': ' + rd.reason : ''), 3)
    : !isT && s.active && wd !== 0 && wd !== 6 ? r('none', 'Sin bitácora ese día', 4) : r('', '', 5);
}
function metrics(s) {
  const today = todayGT(), mine = logs.filter(x => x.student_id === s.id), m = missesOf(s.id, today);
  const tl = mine.find(x => x.practice_date === viewDay());
  return { mine, n: mine.length, inc: mine.filter(x => x.has_incident).length, m, rei: m.length >= REINC_N, tl,
    hs: Horas.summarize(mine), dm: Horas.minutes(tl), st: dayState(s, mine), last: mine.reduce((a, x) => x.practice_date > a ? x.practice_date : a, '') };
}
const ledEl = st => st.text ? h('div', { className: 'led ' + st.cls, textContent: st.text }) : '';
function hrsEl(M) {
  const isT = viewDay() === todayGT();
  return (M.dm !== null || M.hs.over) ? h('div', { className: 'hrs' },
    M.dm !== null ? h('span', { className: 'hc ' + (M.dm >= Horas.jornada(viewDay()) ? 'ok' : 'low'), title: M.dm >= Horas.jornada(viewDay()) ? 'Jornada completa' : 'Jornada menor a las horas del día',
      textContent: Horas.fHM(M.dm) + (isT ? ' hoy' : ' ese día') }) : '',
    M.hs.over ? h('span', { className: 'hc xtra', title: 'Horas extra acumuladas: lo trabajado después de las 8 horas de cada día (4 los sábados)', textContent: '+' + Horas.fHM(M.hs.over) + ' extra' }) : '') : '';
}
const badgesEl = s => h('span', { className: 'badges' }, h('span', { className: 'pg ' + (s.program || 'none'), textContent: progName(s.program) }), s.active ? '' : h('span', { className: 'pg off', textContent: 'Inactivo' }));
const cntEl = M => h('div', { className: 'cnt' }, h('b', { textContent: M.n }), h('small', { textContent: M.n === 1 ? 'bitácora' : 'bitácoras' }),
  M.inc ? h('em', { textContent: M.inc === 1 ? '1 incidente' : M.inc + ' incidentes' }) : '',
  M.m.length ? h('em', { className: M.rei ? 'rei' : 'warn', textContent: M.rei ? 'Reincidente' : `${M.m.length} sin cerrar` }) : '');

function studentCard(s, M) {
  const open = () => openStudent(s.id, { from: card });
  const card = h('div', { className: 'scard ' + M.st.cls + (s.active ? '' : ' off'), id: 'stu-' + s.id, tabIndex: 0, role: 'button', ariaLabel: 'Abrir la ficha de ' + s.full_name,
    onclick: open, onkeydown: e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } } },
    avatar(s, 'mk', false),
    h('div', { className: 'who' }, h('b', { textContent: s.full_name }), h('span', { className: 'gr', textContent: `${s.grade} ${s.section}` }), badgesEl(s), ledEl(M.st), hrsEl(M)),
    cntEl(M));
  return card;
}
function studentTable(list, M) {
  const COLS = [['name', 'Estudiante'], ['grade', 'Grado'], ['prog', 'Tipo'], ['state', 'Estado del día'], ['dayh', 'Horas del día'], ['tot', 'Horas totales'], ['over', 'Extras'], ['n', 'Bitácoras'], ['inc', 'Incidentes'], ['last', 'Última jornada']];
  const th = ([k, t]) => { const sortable = k !== 'prog', on = UI.sk === k;
    return h('th', { scope: 'col', ariaSort: on ? (UI.sd === 1 ? 'ascending' : 'descending') : 'none', className: 'c-' + k },
      sortable ? h('button', { type: 'button', className: 'thb', onclick: () => setSort(k) }, t, h('i', { textContent: on ? (UI.sd === 1 ? ' ▲' : ' ▼') : '' })) : t); };
  const hm = v => v ? Horas.fHM(v) : '—';
  const rows = list.map(s => { const m = M.get(s.id), open = () => openStudent(s.id, { from: tr });
    const tr = h('tr', { className: 'trow ' + m.st.cls + (s.active ? '' : ' off'), id: 'stu-' + s.id, tabIndex: 0, ariaLabel: 'Abrir la ficha de ' + s.full_name, onclick: open,
      onkeydown: e => { if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } } },
      h('th', { scope: 'row', className: 'c-name' }, h('div', { className: 'tn' }, avatar(s, 'mk sm', false), h('b', { textContent: s.full_name }), s.active ? '' : h('span', { className: 'pg off', textContent: 'Inactivo' }))),
      h('td', { textContent: `${s.grade} ${s.section}` }),
      h('td', {}, h('span', { className: 'pg ' + (s.program || 'none'), textContent: progName(s.program) })),
      h('td', {}, m.st.text ? h('span', { className: 'led ' + m.st.cls, textContent: m.st.text }) : '—'),
      h('td', { className: 'num' }, m.dm !== null ? h('span', { className: 'hc ' + (m.dm >= Horas.jornada(viewDay()) ? 'ok' : 'low'), textContent: Horas.fHM(m.dm) }) : '—'),
      h('td', { className: 'num', textContent: hm(m.hs.total) }),
      h('td', { className: 'num' }, m.hs.over ? h('span', { className: 'hc xtra', textContent: '+' + Horas.fHM(m.hs.over) }) : '—'),
      h('td', { className: 'num', textContent: m.n }),
      h('td', { className: 'num' + (m.inc ? ' red' : ''), textContent: m.inc || '—' }),
      h('td', { textContent: m.last ? fD(m.last) : '—' }));
    return tr; });
  return h('div', { className: 'tblwrap' }, h('table', { className: 'stbl' }, h('thead', {}, h('tr', {}, COLS.map(th))), h('tbody', {}, rows)));
}

// ---- Ficha del estudiante (diálogo) ----
let openStu = null, pushed = false, sdOpener = null, escHad = false, lastKey = '';
const hashId = () => (location.hash.match(/^#estudiante=(.+)$/) || [])[1] || '';
function openStudent(id, o = {}) {
  if (!students.some(z => z.id === id)) return;
  const first = !sdlg.open;
  openStu = { id, tab: o.tab || (first ? 'resumen' : openStu?.tab || 'resumen'), logId: null };
  if (first) {
    sdOpener = o.from || document.activeElement; sdlg.showModal(); document.body.classList.add('noscroll');
    if (o.push === false) pushed = !!history.state?.stu; else { history.pushState({ stu: id }, '', '#estudiante=' + id); pushed = true; }
  } else if (o.nav) history.replaceState({ stu: id }, '', '#estudiante=' + id);
  renderDetail(true);
}
function closeStudent() { if (pushed) history.back(); else sdlg.close(); }
sdlg.addEventListener('close', () => {
  sdlg.querySelectorAll('.vmodal,.dlg').forEach(n => n.remove()); vm = null;
  if (!pushed && hashId()) history.replaceState(null, '', location.pathname + location.search);
  pushed = false; openStu = null; lastKey = ''; $('spanel').replaceChildren(); unlock(); sdOpener?.focus?.();
});
window.addEventListener('popstate', () => {
  const id = hashId();
  if (id && students.some(z => z.id === id)) { if (!sdlg.open || openStu?.id !== id) openStudent(id, { push: false }); }
  else if (sdlg.open) { pushed = false; sdlg.close(); }
});
sdlg.addEventListener('cancel', e => { e.preventDefault(); if (escHad) { escHad = false; return; } closeStudent(); });
let mdown = false;
sdlg.addEventListener('mousedown', e => { mdown = e.target === sdlg; });
sdlg.addEventListener('click', e => { if (mdown && e.target === sdlg && !sdlg.querySelector('.vmodal,.dlg')) closeStudent(); mdown = false; });
const stuNav = d => { const i = curList.indexOf(openStu?.id), j = i + d; if (i < 0 || j < 0 || j >= curList.length) return; openStudent(curList[j], { nav: true }); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { escHad = !!document.querySelector('.vmodal,.dlg'); if ($('drawer').classList.contains('open')) closeMenu(); }
  if (sdlg.open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey && !sdlg.querySelector('.vmodal,.dlg')
    && !/^(INPUT|TEXTAREA|SELECT|VIDEO|IFRAME)$/.test(document.activeElement?.tagName || '')) stuNav(e.key === 'ArrowLeft' ? -1 : 1);
}, true);
matchMedia('(min-width:900px)').addEventListener?.('change', () => renderDetail());

const TABS = [['resumen', 'Resumen'], ['jornadas', 'Jornadas'], ['notas', 'Notas'], ['informe', 'Informe']];
function renderDetail(force) {
  if (!openStu) return;
  const s = students.find(z => z.id === openStu.id);
  if (!s) return closeStudent();
  const M = metrics(s), sNotes = notes.filter(x => x.student_id === s.id), i = curList.indexOf(s.id), tab = openStu.tab;
  $('shead').replaceChildren(avatar(s, 'mk lg'),
    h('div', { className: 'who' }, h('b', { id: 'sname', textContent: s.full_name }), h('span', { className: 'gr', textContent: `${s.grade}, sección ${s.section}` }), badgesEl(s), ledEl(M.st), hrsEl(M)),
    h('div', { className: 'snav' },
      h('button', { type: 'button', className: 'sec', ariaLabel: 'Estudiante anterior', title: 'Anterior (←)', textContent: '‹', disabled: i <= 0, onclick: () => stuNav(-1) }),
      h('span', { className: 'pos', textContent: i < 0 ? '' : `${i + 1} de ${curList.length}` }),
      h('button', { type: 'button', className: 'sec', ariaLabel: 'Estudiante siguiente', title: 'Siguiente (→)', textContent: '›', disabled: i < 0 || i >= curList.length - 1, onclick: () => stuNav(1) }),
      h('button', { type: 'button', className: 'sec sclose', textContent: '✕ Cerrar', onclick: closeStudent })));
  const label = { resumen: 'Resumen', jornadas: `Jornadas (${M.n})`, notas: `Notas (${sNotes.length})`, informe: 'Informe' };
  $('stabs').replaceChildren(...TABS.map(([k]) => h('button', { type: 'button', role: 'tab', className: 'tab' + (k === tab ? ' on' : ''), ariaSelected: String(k === tab), textContent: label[k],
    onclick: () => { openStu.tab = k; renderDetail(true); } })));
  const panel = $('spanel'), key = s.id + '|' + tab;
  if (tab === 'informe' && lastKey === key && !force) return;   // no recargar el informe cada vez que se actualizan los datos
  const top = lastKey === key ? panel.scrollTop : 0, jl = panel.querySelector('.jlist'), jtop = jl ? jl.scrollTop : 0;
  panel.dataset.k = lastKey = key;
  panel.replaceChildren(tab === 'resumen' ? tabResumen(s, M) : tab === 'jornadas' ? tabJornadas(s, M) : tab === 'notas' ? tabNotas(s, sNotes) : tabInforme(s));
  panel.scrollTop = top; const jl2 = panel.querySelector('.jlist'); if (jl2) jl2.scrollTop = jtop;
}
function tabResumen(s, M) {
  const fact = (k, v) => h('div', {}, h('small', { textContent: k }), h('span', { textContent: v || '—' })), tel = (s.supervisor_contact || '').replace(/[^\d+]/g, ''), hs = M.hs;
  const left = h('div', { className: 'rleft' },
    h('div', { className: 'facts' }, fact('Tipo de práctica', progName(s.program)), fact('Empresa o institución', s.institution), fact('Dirección de la empresa', s.practice_place),
      fact('Encargado de la práctica', s.supervisor_name || 'Sin registrar'),
      fact('Avisos en el celular', pushUsers.has(s.id) ? `Activados (${pushUsers.get(s.id)} ${pushUsers.get(s.id) === 1 ? 'dispositivo' : 'dispositivos'})` : 'No activados'),
      h('div', {}, h('small', { textContent: 'Contacto del encargado' }), s.supervisor_contact && tel ? h('a', { className: 'tel', href: 'tel:' + tel, textContent: s.supervisor_contact }) : h('span', { textContent: '—' })),
      fact('Grado y sección', `${s.grade}, sección ${s.section}`),
      h('div', { className: 'hsum' }, h('small', { textContent: 'Horas acumuladas del período de práctica' }),
        h('span', { textContent: hs.days ? `${Horas.fHM(hs.total)} en ${dias(hs.days)}` + (hs.over ? ` (${Horas.fHM(hs.over)} son extra)` : '') : 'Sin jornadas completadas todavía' }))),
    h('div', { className: 'tools' },
      h('a', { className: 'btn sec', href: 'informe.html?s=' + s.id, target: '_blank', rel: 'noopener', textContent: 'Informe en PDF (carta)' }),
      h('button', { type: 'button', className: 'sec', textContent: 'Registrar nota o amonestación', onclick: () => addNote(s) }),
      h('button', { type: 'button', className: s.active ? 'sec' : '', textContent: s.active ? 'Inactivar estudiante' : 'Activar estudiante', onclick: () => setActive(s) }),
      s.program ? h('button', { type: 'button', className: 'sec', textContent: `Pasar a ${progName(s.program === 'prepractica' ? 'practica' : 'prepractica')}`, onclick: () => setProgram(s) })
        : h('button', { type: 'button', className: 'sec', textContent: 'Asignar Práctica Supervisada', onclick: () => setProgramFirst(s, 'practica') }),
      !s.program ? h('button', { type: 'button', className: 'sec', textContent: 'Asignar Prepráctica', onclick: () => setProgramFirst(s, 'prepractica') }) : ''));
  return h('div', { className: 'inner' },
    M.rei ? h('div', { className: 'banner', textContent: `Reincidente: ${M.m.length} jornadas sin cerrar a tiempo en los últimos ${REINC_DIAS} días. Considere registrar una amonestación.` }) : '',
    h('div', { className: 'rsum' }, left, lastJornada(s, M)), schedBlock(s));
}
// Horario semanal del estudiante (confirmado y, si existe, el pendiente)
function schedBlock(s) {
  const mine = schedVers.filter(v => v.student_id === s.id), conf = mine.filter(v => v.status === 'confirmed').sort((a, b) => (b.decided_at || '').localeCompare(a.decided_at || ''))[0], pend = mine.find(v => v.status === 'pending');
  const tbl = days => h('dl', { className: 'sched' }, ...[['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']].flatMap(([k, n]) => {
    const d = days?.[k]; return d ? [h('dt', { textContent: n }), h('dd', { textContent: `${a12(d.s)} a ${a12(d.e)}, almuerzo ${d.l} min` })] : []; }));
  const box = h('section', { className: 'lastj schedj' }, h('h3', { textContent: 'Horario semanal' }));
  if (!conf && !pend) return box.append(h('p', { className: 'empty', textContent: schedErr || 'El estudiante todavía no ha registrado su horario. Mientras tanto se aplican las reglas anteriores (sin margen ni preguntas).' })), box;
  if (conf) box.append(h('p', { className: 'lj-meta', textContent: `Confirmado el ${fDT(conf.decided_at)}${conf.decided_by ? ' por ' + by(conf.decided_by) : ''}` }), tbl(conf.days));
  if (pend) box.append(h('p', { className: 'banner', textContent: 'Hay un horario nuevo pendiente de confirmación.' }), tbl(pend.days),
    h('div', { className: 'revact' }, h('button', { type: 'button', textContent: 'Confirmar', onclick: () => decideSched(pend, true) }), h('button', { type: 'button', className: 'sec', textContent: 'Rechazar', onclick: () => decideSched(pend, false) })));
  return box;
}
// Enlaces firmados de fotos y videos, reutilizados mientras siguen vigentes (50 de 60 min)
const mUrl = {};
async function signedMedia(bucket, path) {
  const k = bucket + '/' + path, c = mUrl[k]; if (c && c.t > Date.now()) return c.u;
  const r = await sb.storage.from(bucket).createSignedUrl(path, 3600); if (r.error) throw r.error;
  mUrl[k] = { u: r.data.signedUrl, t: Date.now() + 50 * 60e3 }; return r.data.signedUrl;
}
// Última jornada (finalizada o iniciada) con su foto de inicio y su video, a la vista en el Resumen
function lastJornada(s, M) {
  const D = viewDay(), byDay = D !== todayGT();   // con una fecha elegida se muestra esa jornada, no la última
  const x = byDay ? M.mine.find(y => y.practice_date === D)
    : M.mine.reduce((a, y) => !a || y.practice_date > a.practice_date || (y.practice_date === a.practice_date && (y.entry_at || '') > (a.entry_at || '')) ? y : a, null);
  const title = byDay ? 'Jornada del ' + fD(D) : 'Última jornada';
  const card = h('section', { className: 'lastj', ariaLabel: title }, h('h3', { textContent: title }));
  if (!x) { const rd = byDay ? restFor(s.id, D) : null;
    return card.append(h('p', { className: 'empty', textContent: !byDay ? 'Todavía no ha iniciado ninguna jornada.' : rd ? 'Día de descanso' + (rd.reason ? ': ' + rd.reason : '') + '. No hay bitácora.' : 'No hay bitácora de este estudiante en esa fecha.' })) || card; }
  const today = todayGT(), stale = isStale(x, today), min = Horas.minutes(x);
  const st = stale ? ['late', `Sin cerrar desde hace ${dias(dayDiff(x.practice_date, today))}`] : x.status === 'in_progress' ? ['on', `En jornada desde ${fT(x.entry_at).slice(0, 5)}`]
    : x.status === 'unclosed' ? ['late', 'Jornada no concluida'] : ['done', 'Completada'];
  card.append(h('div', { className: 'lj-head' }, h('b', { textContent: fD(x.practice_date) }), h('div', { className: 'led ' + st[0], textContent: st[1] })),
    h('p', { className: 'lj-meta', textContent: `Entrada ${fT(Horas.times(x)?.entry || x.entry_at).slice(0, 5)}` + (x.exit_at ? ` · Salida ${fT(Horas.times(x)?.exit || x.exit_at).slice(0, 5)}` : '') + (min !== null ? ` · ${Horas.fHM(min)} netas` : '') }));
  if (x.main_activity) card.append(h('p', { className: 'lj-act', textContent: x.main_activity }));
  const fig = (label, node) => h('figure', { className: 'lj-fig' }, node, h('figcaption', { textContent: label }));
  const none = t => h('p', { className: 'lj-none', textContent: t });
  const media = h('div', { className: 'lj-media' });
  if (x.start_photo_path) { const pa = pArchMap[x.id];
    if (pa?.removed_at) media.append(fig('Foto de inicio', none('Archivada y eliminada de Supabase.')));
    else { const img = h('img', { alt: 'Foto de inicio de jornada' }), b = h('button', { type: 'button', className: 'ljb', title: 'Ampliar la foto', onclick: e => openPhoto(x, e.currentTarget) }, img); b.disabled = true;
      signedMedia('practice-photos', x.start_photo_path).then(u => { img.src = u; b.disabled = false; }).catch(() => b.replaceWith(none('No se pudo cargar la foto.')));
      media.append(fig('Foto de inicio', b)); } }
  else media.append(fig('Foto de inicio', none(x.status === 'unclosed' ? 'Sin foto.' : 'Sin foto de inicio.')));
  if (x.video_path) { const ar = archMap[x.id];
    if (ar?.removed_at) media.append(fig('Video de evidencia', none('Archivado y eliminado de Supabase.')));
    else { const v = h('video', { controls: true, playsInline: true, preload: 'metadata' });
      signedMedia('practice-videos', x.video_path).then(u => { v.src = u + '#t=0.1'; }).catch(() => v.replaceWith(none('No se pudo cargar el video.')));
      media.append(fig('Video de evidencia', v)); } }
  else media.append(fig('Video de evidencia', none(x.status === 'in_progress' ? 'Todavía no hay video.' : 'Sin video.')));
  card.append(media, h('button', { type: 'button', className: 'sec', textContent: 'Ver jornada completa', onclick: () => { openStu.tab = 'jornadas'; openStu.logId = x.id; renderDetail(true); } }));
  return card;
}
function tabJornadas(s, M) {
  if (!M.n) return h('p', { className: 'empty pad', textContent: 'Todavía no ha enviado bitácoras.' });
  const D = viewDay(), isT = D === todayGT(), wide = matchMedia('(min-width:900px)').matches;
  let sel = M.mine.find(x => x.id === openStu.logId);
  if (!sel && wide) sel = (!isT && M.mine.find(x => x.practice_date === D)) || M.mine[0];
  openStu.logId = sel?.id || null;
  const list = h('div', { className: 'jlist' }, M.mine.map(x => { const p = logHead(x, s);
    return h('button', { type: 'button', className: 'jrow' + (x === sel ? ' sel' : '') + (p.inc ? ' inc' : '') + (!isT && x.practice_date === D ? ' pick' : ''), ariaCurrent: String(x === sel),
      onclick: () => { openStu.logId = x.id; renderDetail(true); } },
      h('time', { textContent: p.date }), h('div', { className: 'who' }, h('b', { textContent: p.title }), h('span', { textContent: p.sub }), p.marks)); }));
  const det = h('div', { className: 'jdet' }, sel ? [
    h('button', { type: 'button', className: 'sec jback', textContent: '‹ Todas las jornadas', onclick: () => { openStu.logId = null; renderDetail(true); } }),
    h('h3', { textContent: logHead(sel, s).full }), logBody(sel, s)] : '');
  return h('div', { className: 'jsplit' + (sel ? ' hasdet' : '') }, list, det);
}
function tabNotas(s, sNotes) {
  return h('div', { className: 'inner' },
    h('div', { className: 'tools' }, h('button', { type: 'button', textContent: 'Registrar nota o amonestación', onclick: () => addNote(s) })),
    sNotes.length ? h('div', { className: 'notes' }, sNotes.map(noteRow)) : h('p', { className: 'empty', textContent: 'No hay notas ni amonestaciones para este estudiante.' }));
}
function tabInforme(s) {
  return h('div', { className: 'ifw' },
    h('div', { className: 'ifbar' }, h('span', { className: 'sub', textContent: 'Vista previa del informe. Para imprimirlo o guardarlo como PDF ábralo en su propia pestaña.' }),
      h('a', { className: 'btn sec', href: 'informe.html?s=' + s.id, target: '_blank', rel: 'noopener', textContent: 'Abrir para imprimir' })),
    h('iframe', { className: 'ifr', src: 'informe.html?s=' + s.id + '&embed=1', title: 'Informe de ' + s.full_name }));
}

// ---- Menú de secciones (hamburguesa) ----
const VSEC = { est: 'v-est', rev: 'rev', avisos: 'avisos', rest: 'rest', staff: 'staff', newstu: 'newstu', accts: 'accts', vids: 'vids', mos: 'mos' };
let curView = 'est';
const viewLabel = v => v === 'mos' ? 'Mosaico de videos' : v === 'est' ? 'Estudiantes' : ($(VSEC[v] + '-sum') || $(VSEC[v]).querySelector('h2'))?.textContent || v;
function setView(v) {
  if (!VSEC[v] || $(VSEC[v]).classList.contains('hidden')) v = 'est';
  curView = v; Object.entries(VSEC).forEach(([k, id]) => $(id).classList.toggle('on', k === v));
  $('vname').textContent = viewLabel(v); renderMenu(); closeMenu(); window.scrollTo?.(0, 0);
  if (v === 'mos') Mos.enter(); else Mos.leave();
  // la dirección solo lleva #mosaico mientras se está en el mosaico; en cualquier otra sección se limpia
  try { if (v === 'mos') { if (location.hash !== '#mosaico') history.replaceState(history.state, '', '#mosaico'); }
    else if (location.hash === '#mosaico') history.replaceState(history.state, '', location.pathname + location.search); } catch {}
}
function renderMenu() {
  if ($(VSEC[curView]).classList.contains('hidden')) { curView = 'est'; Object.entries(VSEC).forEach(([k, id]) => $(id).classList.toggle('on', k === 'est')); }
  $('vname').textContent = viewLabel(curView);
  const items = Object.keys(VSEC).filter(v => !$(VSEC[v]).classList.contains('hidden')).map(v => h('button', { type: 'button', className: 'mi' + (v === curView ? ' on' : ''), ariaCurrent: v === curView ? 'page' : 'false',
    textContent: viewLabel(v), onclick: () => setView(v) }));
  $('dmenu').replaceChildren(...items);
}
function openMenu() { $('drawer').hidden = false; $('scrim').classList.remove('hidden'); requestAnimationFrame(() => $('drawer').classList.add('open'));
  $('mb').setAttribute('aria-expanded', 'true'); document.body.classList.add('noscroll'); setTimeout(() => $('dmenu').querySelector('.mi.on, .mi')?.focus(), 0); }
function closeMenu() { const d = $('drawer'); if (d.hidden) return; d.classList.remove('open'); d.hidden = true; $('scrim').classList.add('hidden');
  $('mb').setAttribute('aria-expanded', 'false'); unlock(); }
$('mb').onclick = () => $('drawer').hidden ? openMenu() : closeMenu();
$('dclose').onclick = () => { closeMenu(); $('mb').focus(); };
$('scrim').onclick = closeMenu;
$('vc').onclick = () => { UI.view = 'cards'; saveUI(); render(); };
$('vt').onclick = () => { UI.view = 'table'; saveUI(); render(); };
$('srt').onchange = e => { UI.sk = e.target.value; UI.sd = defDir(UI.sk); saveUI(); render(); };
$('chartbox').open = matchMedia('(min-width:900px)').matches;
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
    document.removeEventListener('keydown', onKey);
    vm.remove(); vm = null; unlock(); prev?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const x1 = h('button', { type: 'button', className: 'vclose', textContent: '✕ Cerrar', onclick: close });
  vm = h('div', { className: 'vmodal', role: 'dialog', ariaModal: 'true', ariaLabel: photo ? 'Foto de inicio' : 'Video de evidencia' },
    h('div', { className: 'vbar' }, h('span', { textContent: (photo ? 'Foto de inicio · ' : '') + fD(x.practice_date) }),
      h('a', { href: url, target: '_blank', rel: 'noopener', textContent: 'Abrir o descargar' }), x1), v);
  ovRoot().append(vm); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey);
  x1.focus();
  if (vm.requestFullscreen) vm.requestFullscreen().catch(() => {});   // pantalla completa real si el navegador lo permite
  vm.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && vm) close(); });
}
const lp0 = (x, s) => x.program || s?.program || '';
const a12 = t => { const [a, b] = t.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'a. m.' : 'p. m.'}`; };
const AADJ = { pending: 'en revisión', approved: 'aprobada', auto: 'aprobada automáticamente (dentro del margen)', rejected: 'rechazada' };
const AKIND = { extra_antes: 'Entrada anticipada: tiempo extra', anticipado: 'Anticipada', tardio: 'Registro tardío', declarada: 'Hora declarada', extra_despues: 'Salida con tiempo extra', cierre_tardio: 'Hora de salida declarada' };
function adjRows(x) {
  const out = [];
  [['entry', 'Entrada'], ['exit', 'Salida']].forEach(([k, n]) => { const kind = x[k + '_kind']; if (!kind) return;
    const st = x[k + '_adj_status'], adj = x[k + '_adj_at'], bad = st === 'pending' || st === 'rejected' ? 'bad' : '';
    let t = kind === 'anticipado' ? (k === 'entry' ? `Llegó antes y no es tiempo extra: se cuenta desde ${a12(x.sched_start)}` : 'Salió antes de su horario') : AKIND[kind] || kind;
    if (adj && kind !== 'anticipado') t += `: ${fT(adj).slice(0, 5)} (real del registro ${fT(x[k + '_at']).slice(0, 5)}) · ${AADJ[st] || ''}`;
    out.push([n, t, bad]); if (x[k + '_reason']) out.push(['Motivo', x[k + '_reason'], bad]);
    if (x[k + '_note']) out.push(['Respuesta del equipo', x[k + '_note'] + (x[k + '_decided_by'] ? ' · ' + by(x[k + '_decided_by']) : ''), '']); });
  return out;
}
function logBody(x, s) {
  const today = todayGT(), stale = isStale(x, today), un = x.status === 'unclosed', late = x.closed_late === true;
  const body = h('dl', { className: 'body' });
  const row = (k, v, c = '') => { if (!v) return; const d = h('dd', { textContent: v }); body.append(h('dt', { className: c, textContent: k }), d); };
  if (stale) row('Estado', `El estudiante inició la jornada y no la cerró. No hay hora de salida (hace ${dias(dayDiff(x.practice_date, today))}).`, 'bad');
  if (un) { row('Estado', 'Cerrada por el administrador como no concluida', 'bad'); row('Motivo del cierre', x.admin_note, 'bad'); row('Cerrada el', fDT(x.resolved_at) + (v4 && x.resolved_by ? ` · por ${by(x.resolved_by)}` : '')); }
  if (late) { row('Cierre tardío', `Enviada el ${fDT(x.exit_at)}, ${dias(dayDiff(x.practice_date, dateGT(x.exit_at)))} después de la jornada. La hora de salida no corresponde al fin real de la práctica.`, 'bad');
    row('Motivo del retraso', x.late_reason); }
  if (x.sched_start) row('Horario de ese día', `${a12(x.sched_start)} a ${a12(x.sched_end)}, almuerzo ${x.sched_lunch ?? 0} min`);
  adjRows(x).forEach(r => row(r[0], r[1], r[2]));
  row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
  row('Herramientas', x.tools_used);
  row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
  if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
  const lp = x.program || s?.program;
  if (lp) row('Tipo de práctica', progName(lp));
  if (x.start_photo_path) { const pa = pArchMap[x.id];
    body.append(h('dt', { textContent: 'Foto de inicio' }), h('dd', {}, pa?.removed_at
      ? `Archivada: descargada y eliminada de Supabase el ${fDT(pa.removed_at)}.`
      : [h('button', { type: 'button', className: 'sec', textContent: 'Ver foto de inicio', onclick: ev => openPhoto(x, ev.currentTarget) }),
         pa ? ' Archivada; la eliminación de Supabase está pendiente.' : ''])); }
  else if (x.status !== 'unclosed') row('Foto de inicio', 'Sin foto (jornada anterior a esta función)');
  if (x.video_path) { const ar = archMap[x.id];
    body.append(h('dt', { textContent: 'Video' }), h('dd', {}, ar?.removed_at
      ? `Archivado: descargado y eliminado de Supabase el ${fDT(ar.removed_at)}.`
      : [h('button', { type: 'button', className: 'sec', textContent: 'Reproducir evidencia', onclick: ev => openVideo(x, ev.currentTarget) }),
         ar ? ' Archivado; la eliminación de Supabase está pendiente.' : ''])); }
  const ln = notes.filter(n => n.log_id === x.id);
  if (ln.length) body.append(h('dt', { textContent: 'Notas del administrador' }), h('dd', { className: 'notes' }, ln.map(noteRow)));
  const canDel = me?.role === 'admin' && !!s;
  if (s && (stale || un || late || canDel)) body.append(h('dt', { textContent: 'Acciones' }), h('dd', { className: 'acts' },
    stale ? h('button', { type: 'button', textContent: 'Cerrar como no concluida', onclick: () => closeUnclosed(x, s.full_name) }) : '',
    (stale || un || late) ? h('button', { type: 'button', className: 'sec', textContent: 'Nota o amonestación sobre esta jornada', onclick: () => addNote(s, x) }) : '',
    canDel ? h('button', { type: 'button', className: 'sec delbtn', textContent: 'Eliminar jornada', onclick: () => deleteLog(x, s) }) : ''));
  return body;
}
function logHead(x, s) {
  const today = todayGT(), stale = isStale(x, today), un = x.status === 'unclosed', late = x.closed_late === true;
  const d = new Date(x.practice_date + 'T12:00:00');
  const title = x.main_activity || (un ? 'Jornada no concluida' : stale ? 'Jornada sin cerrar' : 'Jornada en curso');
  const sub = un ? `Entrada ${fT(x.entry_at)}, sin hora de salida`
    : stale ? `Entrada ${fT(x.entry_at)}, sin hora de salida (hace ${dias(dayDiff(x.practice_date, today))})`
    : late ? `Entrada ${fT(x.entry_at)}, enviada con retraso`
    : `Entrada ${fT(x.entry_at)}, salida ${fT(x.exit_at)} (${Horas.minutes(x) !== null ? Horas.fHM(Horas.minutes(x)) + ' sin almuerzo' : dur(mins(x))})`;
  const d0 = d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
  const marks = h('div', { className: 'marks2' }, stale ? h('em', { textContent: 'Sin cerrar' }) : '', un ? h('em', { textContent: 'No concluida' }) : '',
    late ? h('em', { className: 'warn', textContent: 'Cierre tardío' }) : '',
    x.has_incident ? h('em', { textContent: 'Incidente' }) : '', x.start_photo_path ? h('span', { textContent: pArchMap[x.id]?.removed_at ? 'Foto archivada' : 'Foto' }) : '', x.video_path ? h('span', { textContent: archMap[x.id]?.removed_at ? 'Video archivado' : 'Video' }) : '');
  return { date: d0, full: fD(x.practice_date), title, sub, marks, inc: !!(x.has_incident || stale || un) };
}
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { Mos.wipe(); for (const k in mUrl) delete mUrl[k]; swept = false; hashDone = false; if (sdlg.open) { pushed = false; sdlg.close(); } closeMenu(); setView('est'); await sb.auth.signOut(); $('msg').textContent = ''; me = null; kf = 'active'; usage = null; acSel.clear(); staffMap = {}; audit = []; accts = []; acErr = ''; acBuilt = false; arch = []; archMap = {}; archErr = ''; vdBuilt = false; vdTo = ''; vd = { verified: [], failed: [], busy: false, ctrl: null, note: '', skipped: 0 }; acFilter = 'sin_perfil'; acQ = ''; lastCreated = null; staffBuilt = false; clearNewStu(); nsBuilt = false; show(true, false); };
$('out-top').onclick = () => $('out').onclick();
$('re').onclick = load;
$('q').oninput = $('g').onchange = $('pg').onchange = $('ac').onchange = render;
// ================= Mosaico de videos (solo administrador) =================
// Antes era mosaico.html. Usa la misma sesión, la lista de estudiantes y los avatares del panel.
const Mos = (() => {
  const MAX_TILES = 60, TTL = 3600, M = id => $('m' + id);
  const ls = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const fTm = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
  let S = {}, mlogs = [], urls = {}, paused = false, io, big, seed = 1, loaded = false, rr, rz, active = false;
  const ratio = {};
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // Formas [columnas, filas, peso] según la proporción real del video (la celda mide ~2:1).
  const POOLS = [[1.6, 99, [[1, 1, 40], [2, 2, 35], [3, 3, 25]]], [1.15, 1.6, [[2, 3, 60], [3, 4, 40]]], [0.85, 1.15, [[1, 2, 55], [2, 4, 45]]],
    [0.6, 0.85, [[1, 3, 55], [2, 5, 45]]], [0, 0.6, [[1, 4, 55], [2, 7, 45]]]];
  const pick = (r, ar, cols) => { const pool = ar ? POOLS.find(p => ar >= p[0] && ar < p[1])[2] : [[1, 2, 100]];
    const ok = pool.filter(p => p[0] <= cols), use = ok.length ? ok : [[1, 1, 100]], tot = use.reduce((a, p) => a + p[2], 0);
    let n = r() * tot; for (const [w, hh, p] of use) if ((n -= p) < 0) return [w, hh]; return [use[0][0], use[0][1]]; };
  const msg = t => { M('msg').textContent = t; };
  const expired = e => /JWT|expired|not authenticated/i.test(e?.message || '');
  const dead = e => { msg(expired(e) ? 'Su sesión venció. Salga y vuelva a entrar.' : (e.message || String(e))); };

  function wipe() {
    loaded = false; active = false; io?.disconnect(); big?.querySelector('button')?.click();
    document.querySelectorAll('#mgrid video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    M('grid').replaceChildren(); S = {}; mlogs = []; urls = {}; M('info').textContent = ''; msg('');
  }
  function leave() { active = false; document.querySelectorAll('#mgrid video').forEach(v => v.pause()); }
  async function enter() {
    active = true;
    $('msz').value = ls('mosSz') || 150; $('mmode').value = ls('mosLay') === 'grid' ? 'grid' : 'collage'; $('mfit').value = ls('mosFit') === 'contain' ? 'contain' : 'fill';
    if (loaded) return render();
    loaded = true;
    const last = await sb.from('daily_logs').select('practice_date').not('video_path', 'is', null).order('practice_date', { ascending: false }).limit(1);
    if (!loaded) return;
    $('md').value = last.data?.[0]?.practice_date || todayGT();   // la bitácora con video más reciente
    load();
  }
  function fillGrades() {
    const gr = [...new Set(students.map(x => x.grade))].sort(), cur = M('g').value;
    M('g').replaceChildren(h('option', { value: '', textContent: 'Todos los grados' }), ...gr.map(g => h('option', { value: g, textContent: g }))); M('g').value = cur;
  }
  async function load() {
    if (!loaded) return;
    S = Object.fromEntries(students.map(x => [x.id, x])); fillGrades();
    msg(''); M('grid').replaceChildren(h('p', { className: 'empty', textContent: 'Cargando…' }));
    const l = await sb.from('daily_logs').select('id,student_id,practice_date,entry_at,exit_at,status,closed_late,video_path,main_activity,program')
      .eq('practice_date', M('d').value).not('video_path', 'is', null).order('entry_at').limit(500);
    if (l.error) return dead(l.error);
    if (!loaded) return;
    let gone = new Set();   // videos ya archivados y eliminados de Supabase (migracion_v8): no se pueden reproducir
    try { const ar = await sb.from('video_archive').select('log_id').like('video_path', '%/' + M('d').value + '/%').not('removed_at', 'is', null).limit(1000);
      if (!ar.error) gone = new Set((ar.data || []).map(a => a.log_id)); } catch {}
    mlogs = l.data.filter(x => !gone.has(x.id)); urls = {};
    if (gone.size) msg(`${gone.size} ${gone.size === 1 ? 'video de este día ya fue archivado' : 'videos de este día ya fueron archivados'} y no se muestra${gone.size === 1 ? '' : 'n'}.`);
    if (!loaded) return;
    render();
  }
  async function ensureUrls() {
    const need = visible().slice(0, MAX_TILES).map(x => x.video_path).filter(p => !urls[p]);
    if (!need.length) return true;
    const r = await sb.storage.from('practice-videos').createSignedUrls(need, TTL);
    if (r.error) { dead(r.error); return false; }
    r.data.forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); return true;
  }
  const visible = () => { const q = M('q').value.toLowerCase(), g = M('g').value, pf = M('pg').value;
    return mlogs.filter(x => { const s = S[x.student_id], lp = x.program || s?.program || '';
      return s && (!g || s.grade === g) && (!pf || (pf === 'none' ? !lp : lp === pf)) && (`${s.full_name} ${s.institution || ''} ${s.practice_place}`).toLowerCase().includes(q); }); };
  async function render() {
    if (!loaded || !active || !await ensureUrls() || !loaded || !active) return;
    io?.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!paused) v.play().catch(() => {}); } else v.pause(); }), { rootMargin: '150px' });
    $('mos').classList.toggle('contain', M('fit').value === 'contain');
    const sz = +M('sz').value, collage = M('mode').value === 'collage', gd = M('grid');
    $('mos').style.setProperty('--sz', sz + 'px');
    const cols = Math.max(2, Math.floor((gd.clientWidth || innerWidth - 16) / (sz + 4)));
    gd.style.setProperty('--cols', cols); gd.className = (collage ? 'collage' : '') + (sz < 150 ? ' sm' : '');
    M('sh').classList.toggle('hidden', !collage);
    const all = visible(), list = all.slice(0, MAX_TILES);
    M('info').textContent = `${all.length} ${all.length === 1 ? 'video' : 'videos'}` + (all.length > MAX_TILES ? ` (se muestran ${MAX_TILES}; filtre por grado o nombre)` : '');
    if (!list.length) return gd.replaceChildren(h('p', { className: 'empty', textContent: 'No hay videos para esa fecha y filtros.' }));
    gd.replaceChildren(...list.map(x => {
      const s = S[x.student_id], u = urls[x.video_path], av = avUrl(s), lp = x.program || s.program;
      const tile = (c, ...k) => { const t = h('div', { className: c }, ...k); t._p = x.video_path; return t; };
      const cap = h('div', { className: 'cap' + (av ? ' wav' : '') }, av ? h('i', { className: 'av', style: `background-image:url("${av}")` }) : '',
        h('b', { textContent: s.full_name }),
        h('span', { textContent: `${PROG[lp] ? PROG[lp] + ' · ' : ''}${s.grade} · ${s.institution || s.practice_place} · ${fTm(x.entry_at)}${x.exit_at ? '–' + fTm(x.exit_at) : ''}` }));
      if (!u) return tile('tile bad', 'Video no disponible', cap);
      const v = h('video', { src: u, muted: true, loop: true, playsInline: true, preload: 'auto' });
      v.muted = true; v.setAttribute('muted', '');
      v.onloadedmetadata = () => { if (!v.videoWidth || !v.videoHeight) return;
        const first = !ratio[x.video_path]; ratio[x.video_path] = v.videoWidth / v.videoHeight;
        if (first) { clearTimeout(rr); rr = setTimeout(() => loaded && active && applyShapes(), 120); } };
      io.observe(v);
      const t = tile('tile', v, cap, x.closed_late ? h('div', { className: 'tag', textContent: 'Cierre tardío' }) : '');
      t.title = 'Clic para ver en grande con sonido'; t.onclick = () => openBig(x, s, u); return t;
    }));
    applyShapes();
  }
  function applyShapes() {
    const gd = M('grid'), cols = +gd.style.getPropertyValue('--cols') || 2, collage = gd.classList.contains('collage'), rnd = rng(seed);
    gd.querySelectorAll('.tile').forEach(t => { const [w, hh] = pick(rnd, ratio[t._p], cols);
      t.className = t.className.replace(/\s*k\d+\d/g, '');
      if (collage) { t.style.setProperty('--w', w); t.style.setProperty('--h', hh); t.classList.add(`k${w}${hh}`); }
      else { t.style.removeProperty('--w'); t.style.removeProperty('--h'); } });
  }
  function openBig(x, s, u) {
    if (big) return;
    const prev = document.activeElement, v = h('video', { src: u, controls: true, autoplay: true, playsInline: true });
    const close = () => { v.pause(); v.removeAttribute('src'); v.load(); document.removeEventListener('keydown', k); big.remove(); big = null; unlock(); prev?.focus?.(); };
    const k = e => { if (e.key === 'Escape') close(); };
    const b = h('button', { type: 'button', textContent: '✕ Cerrar', onclick: close });
    big = h('div', { className: 'mbig', role: 'dialog', ariaModal: 'true' }, h('div', { className: 'mt' },
      h('span', { textContent: `${s.full_name} · ${PROG[x.program || s.program] ? PROG[x.program || s.program] + ' · ' : ''}${x.practice_date}${x.main_activity ? ' · ' + x.main_activity : ''}` }), b), v);
    document.body.append(big); document.body.classList.add('noscroll'); document.addEventListener('keydown', k); b.focus();
  }
  M('pp').onclick = () => { paused = !paused; M('pp').textContent = paused ? 'Reanudar todo' : 'Pausar todo';
    document.querySelectorAll('#mgrid video').forEach(v => paused ? v.pause() : v.play().catch(() => {})); };
  M('d').onchange = M('re').onclick = load;
  M('g').onchange = M('pg').onchange = M('q').oninput = render;
  M('sz').oninput = () => { lset('mosSz', M('sz').value); render(); };
  M('fit').onchange = () => { lset('mosFit', M('fit').value); render(); };
  M('mode').onchange = () => { lset('mosLay', M('mode').value); render(); };
  M('sh').onclick = () => { seed = (seed * 7919 + 13) % 100003; render(); };
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => loaded && active && render(), 200); });
  { const mq = matchMedia('(min-width:900px)'), sync = () => { if (mq.matches) M('opts').open = true; }; sync(); mq.addEventListener?.('change', sync); }
  return { enter, leave, wipe };
})();

start();
