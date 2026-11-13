const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const TZ = 'America/Guatemala', MAX = 10 * 1024 * 1024;
const SCREENS = ['s-login','s-profile','s-extra','s-sched','s-home','s-form','s-done','s-staff'];
let pushInit = false;
let mySched = { conf: null, pend: null, rej: null, any: false }, schedSkip = false;
let user, student, log, myLogs = [], myNotes = [], myRests = [], video = null, myArch = {}, myPArch = {}; // video = {blob, type, name} (solo para la vista previa local)

const ERR = {
  JORNADA_YA_INICIADA: 'Ya inició una jornada hoy.',
  JORNADA_ANTERIOR_SIN_CERRAR: 'Tiene una jornada anterior sin cerrar.',
  PERFIL_INEXISTENTE_O_INACTIVO: 'Su perfil no existe o está inactivo.',
  SIN_JORNADA_ABIERTA: 'No hay una jornada abierta.',
  CAMPOS_OBLIGATORIOS_VACIOS: 'Complete los campos obligatorios.',
  INCIDENTE_INCOMPLETO: 'Describa el incidente e indique si se informó al supervisor.',
  VIDEO_NO_ENCONTRADO_EN_STORAGE: 'El video no se subió correctamente.',
  VIDEO_FUERA_DE_LIMITE: 'El video excede el tamaño permitido.',
  DIA_DE_DESCANSO: 'Hoy es día de descanso: no se inicia jornada.',
  PROGRAMA_PENDIENTE: 'Primero indique su tipo de práctica.',
  PROGRAMA_YA_DEFINIDO: 'El tipo de práctica ya está definido. Solo el administrador puede cambiarlo.',
  PROGRAMA_INVALIDO: 'Elija el tipo de práctica.',
  AVATAR_REQUERIDO: 'La foto de perfil es obligatoria.',
  CARRERA_INVALIDA: 'Bachillerato no está disponible en Sexto.',
  VIDEO_REQUERIDO: 'Falta el video de evidencia: grábelo o súbalo en «Evidencias de la jornada» antes de cerrar.',
  RUTA_VIDEO_INVALIDA: 'El video no corresponde a esta jornada. Revise la fecha y hora de su dispositivo.',
  FOTO_INICIO_REQUERIDA: 'Tome la foto de inicio antes de iniciar la jornada.',
  RUTA_FOTO_INVALIDA: 'La foto no corresponde al día de hoy. Revise la fecha y hora de su dispositivo.',
  RUTA_AVATAR_INVALIDA: 'La foto de perfil no es válida.',
  FOTO_NO_ENCONTRADA_EN_STORAGE: 'La foto no se subió correctamente. Inténtelo de nuevo.',
  FOTO_FUERA_DE_LIMITE: 'La foto es demasiado grande.',
  FOTO_INVALIDA: 'El archivo no es una imagen válida.',
  'row-level security': 'No se pudo subir el archivo. Revise la fecha y hora de su dispositivo e inténtelo de nuevo.',
  MOTIVO_TARDIO_REQUERIDO: 'Explique por qué no cerró la jornada ese día (mínimo 10 caracteres).',
  TEXTO_DEMASIADO_LARGO: 'Uno de los textos es demasiado largo.',
  ENCARGADO_REQUERIDO: 'Escriba el nombre del encargado de su práctica.',
  DATO_YA_REGISTRADO: 'Ese dato ya está registrado y no se puede cambiar desde aquí. Si hay un error, avise a su supervisor de práctica.',
  NADA_QUE_COMPLETAR: 'Escriba el dato que falta.',
  HORARIO_INVALIDO: 'El horario no es válido: revise las horas y el almuerzo de cada día.',
  HORARIO_VACIO: 'Marque al menos un día de trabajo.',
  HORARIO_SIN_CAMBIOS: 'Ese horario es igual al que ya tiene confirmado.',
  ENTRADA_ANTICIPADA_PREGUNTA: 'Llegó antes de su horario. Indique si es tiempo extra.',
  EXTRA_MOTIVO_REQUERIDO: 'Explique el tiempo extra (mínimo 10 caracteres).',
  ENTRADA_TARDIA_MOTIVO_REQUERIDO: 'Explique por qué registra tarde (mínimo 10 caracteres).',
  HORA_DECLARADA_INVALIDA: 'La hora indicada no es válida: debe ser de ese mismo día, posterior a la entrada y no futura.',
  SALIDA_TARDIA_PREGUNTA: 'Cierra después de su horario. Indique si fue tiempo extra.',
  SALIDA_DECLARADA_REQUERIDA: 'Indique a qué hora terminó realmente.',
  SALIDA_DECLARADA_MOTIVO_REQUERIDO: 'Explique por qué no cerró a tiempo (mínimo 10 caracteres).',
  SALIDA_ANTICIPADA_MOTIVO_REQUERIDO: 'Explique por qué sale antes de su horario (mínimo 10 caracteres).'
};
const msg = t => { $('msg').textContent = t || ''; };
const errMsg = e => { const m = e?.message || String(e);
  return Object.entries(ERR).find(([k]) => m.includes(k))?.[1] || 'Error: ' + m; };
const fail = e => msg(errMsg(e));
const show = id => { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  const hv = id === 's-home' || id === 's-done'; $('hist').classList.toggle('hidden', !hv);
  $('warns').classList.toggle('hidden', !hv || !myNotes.length);
  $('rests').classList.toggle('hidden', !hv || !futureRests().length); if (hv) { renderSup(); renderWarns(); renderRests(); renderHist(); } else $('sup-card').classList.add('hidden'); };
const fmtTime = d => new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false });
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT',
  { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const val = id => $(id).value.trim();
const radio = n => document.querySelector(`input[name=${n}]:checked`)?.value;

// Título de la cabecera según el tipo de práctica del estudiante (sin sesión o sin tipo: práctica supervisada)
const TTL = { prepractica: 'prepráctica' };
function setTitle(p) { const t = 'de ' + (TTL[p] || 'práctica supervisada'); $('ttl-sub').textContent = t; document.title = 'Bitácora ' + t; }
async function route() {
  msg('');
  const { data: { session } } = await sb.auth.getSession();
  $('b-out').classList.toggle('hidden', !session);
  if (!session) { user = null; setTitle(); return show('s-login'); }
  user = session.user;
  const rr = await sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();   // cuentas del personal no son estudiantes
  if (!rr.error && ['admin', 'supervisor'].includes(rr.data?.role)) { setTitle(); return show('s-staff'); }
  const r1 = await sb.from('students').select('*').eq('id', user.id).maybeSingle();
  if (r1.error) return fail(r1.error);
  student = r1.data;
  if (!student) return show('s-profile');
  if (student.active !== false && (!student.program || !student.avatar_path)) {   // estudiantes anteriores: completan lo que falta una sola vez
    $('x-prog').classList.toggle('hidden', !!student.program); $('x-avb').classList.toggle('hidden', !!student.avatar_path);
    $('x-av').required = !student.avatar_path;
    return show('s-extra'); }
  const [r2, r3, r4] = await Promise.all([
    sb.from('daily_logs').select('*').eq('student_id', user.id).order('practice_date', { ascending: false }).limit(400),
    sb.from('admin_notes').select('*').eq('student_id', user.id).order('created_at', { ascending: false }),
    sb.from('rest_days').select('*').gte('rest_date', todayGT()).order('rest_date').limit(60)]);   // propios y generales (RLS)
  if (r2.error) return fail(r2.error);
  myLogs = r2.data; log = myLogs[0]; myNotes = r3.error ? [] : (r3.data || []).filter(n => !n.annulled_at);
  myRests = r4.error ? [] : dedupRests(r4.data || []);
  try { const ar = await sb.from('video_archive').select('log_id,removed_at').limit(2000);   // videos archivados (migracion_v8): ya no están en el servidor
    myArch = Object.fromEntries((ar.error ? [] : ar.data || []).filter(a => a.removed_at).map(a => [a.log_id, true])); } catch { myArch = {}; }
  try { const pr = await sb.from('photo_archive').select('log_id,removed_at').limit(2000);   // fotos de inicio archivadas (migracion_v10)
    myPArch = Object.fromEntries((pr.error ? [] : pr.data || []).filter(a => a.removed_at).map(a => [a.log_id, true])); } catch { myPArch = {}; }
  try { const sr = await sb.from('schedule_versions').select('*').eq('student_id', user.id).order('created_at', { ascending: false }).limit(30);
    mySched = schedState(sr.error ? [] : sr.data || []); } catch { mySched = schedState([]); }   // migracion_v14: si aún no existe, rige la regla anterior
  setWho(); setTitle(student.program);
  showAvatars();
  if (log?.status === 'in_progress') {
    const late = log.practice_date < todayGT();
    $('late-box').classList.toggle('hidden', !late); $('late-date').textContent = fmtDate(log.practice_date);
    $('started').textContent = `Jornada iniciada a las ${fmtTime(log.entry_at)} (${fmtDate(log.practice_date)})` + (log.sched_start ? `. Su horario de ese día: ${f12(log.sched_start)} a ${f12(log.sched_end)}.` : '');
    renderEvidence();
    return show('s-form');
  }
  if (log?.practice_date === todayGT()) return showReceipt();
  if (!mySched.any && !schedSkip && student.active !== false) return openSched();
  renderSchedCard();
  if (!pushInit) { pushInit = true; Push.init(sb); }
  Push.card($('push-card'), { compact: true });
  $('today').textContent = fmtDate(todayGT());
  const rt = myRests.find(r => r.rest_date === todayGT());   // el servidor también lo impide (DIA_DE_DESCANSO)
  $('b-start').classList.toggle('hidden', !!rt); $('start-box').classList.toggle('hidden', !!rt);
  $('rest-today').classList.toggle('hidden', !rt); updateStart();
  if (student.active === false) { $('b-start').classList.add('hidden'); $('start-box').classList.add('hidden'); }
  $('inactive-note').classList.toggle('hidden', student.active !== false);
  $('rest-today').textContent = rt ? 'Hoy es día de descanso' + (rt.reason ? ': ' + rt.reason : '') + '. No necesita iniciar jornada.' : '';
  show('s-home');
}

function showReceipt() {
  const rows = [['Estudiante', student.full_name], ['Fecha', fmtDate(log.practice_date)],
    ['Entrada', fmtTime(log.entry_at)], ['Salida', fmtTime(log.exit_at)], ['Dirección de la empresa', log.practice_place],
    ['Actividad principal', log.main_activity],
    ['Evidencia', log.start_photo_path ? 'Foto de inicio y video cargados correctamente' : 'Video cargado correctamente']];
  const hm = Horas.minutes(log); if (hm !== null) rows.splice(4, 0, ['Horas de hoy', Horas.fHM(hm) + (hm > Horas.jornada(log.practice_date) ? ` (+${Horas.fHM(hm - Horas.jornada(log.practice_date))} extra)` : '') + ', sin almuerzo']);
  if (log.closed_late) rows.splice(4, 0, ['Cierre', 'Tardío (jornada de un día anterior)']);
  kindRows(log).forEach(r => rows.push(r));
  const dl = $('receipt'); dl.replaceChildren();
  rows.forEach(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; dl.append(dt, dd); });
  show('s-done');
}

// ---- Fotos: reducción en el navegador, avatar y visor ----
const PH = 'practice-photos', PROG = { practica: 'Práctica Supervisada', prepractica: 'Prepráctica' };
const urlCache = {};
async function photoUrl(path) {   // URL firmada (1 h) de una foto privada; se reutiliza mientras la página siga abierta
  if (!path) return '';
  if (urlCache[path]) return urlCache[path];
  const r = await sb.storage.from(PH).createSignedUrl(path, 3600);
  return r.error ? '' : (urlCache[path] = r.data.signedUrl);
}
// Reduce la imagen antes de subirla (ahorra datos y espacio en Supabase). square = recorte cuadrado centrado (avatar).
async function shrink(file, max, square, q) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }   // respeta la rotación de la cámara
  catch { bmp = await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(file);
    i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => no(new Error('No se pudo leer la imagen.')); i.src = u; }); }
  const w = bmp.width, hh = bmp.height;
  let sx = 0, sy = 0, sw = w, sh = hh, dw, dh;
  if (square) { const s = Math.min(w, hh); sx = (w - s) / 2; sy = (hh - s) / 2; sw = sh = s; dw = dh = Math.min(max, s); }
  else { const k = Math.min(1, max / Math.max(w, hh)); dw = Math.round(w * k); dh = Math.round(hh * k); }
  const c = document.createElement('canvas'); c.width = dw; c.height = dh;
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh); bmp.close?.();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
}
const initials = n => (n || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function setAvatar(e, url) { e.style.backgroundImage = url ? `url("${url}")` : ''; e.textContent = url ? '' : initials(student?.full_name); }
async function showAvatars() {
  const ids = ['me-av', 'me-av2', 'me-av3']; ids.forEach(i => setAvatar($(i), ''));
  const u = await photoUrl(student?.avatar_path); if (u) ids.forEach(i => setAvatar($(i), u));
}
async function uploadAvatar(blob) {
  const path = `${user.id}/avatar/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from(PH).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error; return path;
}
let imgPrev;
// Visor a pantalla completa para la foto de inicio y el video (mismo contenedor).
function openViewer(kind, url, title) {
  imgPrev = document.activeElement; $('img-title').textContent = title || '';
  const im = $('img-big'), vd = $('vid-big');
  im.classList.toggle('hidden', kind !== 'img'); vd.classList.toggle('hidden', kind !== 'vid');
  if (kind === 'img') { im.src = url; im.alt = title || 'Foto'; } else { vd.src = url; }
  $('img-modal').classList.remove('hidden'); document.body.classList.add('noscroll'); $('img-close').focus();
}
async function viewPhoto(path, title) {
  const u = await photoUrl(path); if (!u) return msg('No se pudo cargar la foto.');
  openViewer('img', u, title);
}
async function viewVideo(path, title) {
  const r = await sb.storage.from('practice-videos').createSignedUrl(path, 300);
  if (r.error || !r.data) return msg('No se pudo cargar el video.');
  openViewer('vid', r.data.signedUrl, title || 'Video de evidencia');
}
const closeImg = () => { $('img-modal').classList.add('hidden'); document.body.classList.remove('noscroll');
  $('img-big').removeAttribute('src'); const v = $('vid-big'); try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.load?.(); imgPrev?.focus?.(); };
$('img-close').onclick = closeImg; $('img-modal').onclick = e => { if (e.target === $('img-modal')) closeImg(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('img-modal').classList.contains('hidden')) closeImg(); });

// vista previa del avatar elegido (alta de perfil y pantalla "falta un dato")
let pAv = null, xAv = null;
const pickAvatar = (prevId, set) => async e => {
  const f = e.target.files[0], pv = $(prevId); set(null); pv.classList.add('hidden'); pv.style.backgroundImage = '';
  if (!f) return;
  try { const b = await shrink(f, 320, true, .85); set(b); pv.style.backgroundImage = `url("${URL.createObjectURL(b)}")`; pv.classList.remove('hidden'); msg(''); }
  catch (err) { e.target.value = ''; msg(err.message); } };
$('p-av').onchange = pickAvatar('p-av-prev', b => pAv = b);
$('x-av').onchange = pickAvatar('x-av-prev', b => xAv = b);
// Grado y carrera: Bachillerato no se ofrece en Sexto (las opciones incompatibles se desactivan)
const syncCareer = () => { const g = $('p-gr').value, c = $('p-car').value;
  [...$('p-car').options].forEach(o => o.disabled = o.value === 'Bachillerato' && g === 'Sexto');
  [...$('p-gr').options].forEach(o => o.disabled = o.value === 'Sexto' && c === 'Bachillerato'); };
$('p-gr').onchange = $('p-car').onchange = syncCareer;

$('sp-prev').onclick = () => $('sp-prev').src && openViewer('img', $('sp-prev').src, 'Foto de inicio de jornada');
// ---- Evidencias de la jornada abierta ----
function renderEvidence() {
  const p = $('ev-photo'); p.replaceChildren();
  if (log.start_photo_path) p.append('Foto de inicio guardada. ', el('button', { type: 'button', className: 'sec small', textContent: 'Ver foto de inicio',
    onclick: () => viewPhoto(log.start_photo_path, 'Foto de inicio de la jornada') }));
  else p.textContent = 'Esta jornada se inició sin foto de inicio.';
  const has = !!log.video_path;
  $('b-rec').textContent = has ? 'Volver a grabar' : 'Grabar video (10 s)';
  $('v-view').classList.toggle('hidden', !has || !!video);
  $('v-need').classList.toggle('hidden', has);
  $('v-state').textContent = has ? `Video guardado${log.video_size ? ' (' + (log.video_size / 1048576).toFixed(1) + ' MB)' : ''}. Puede reemplazarlo hasta cerrar la jornada.` : '';
  if (!video) { $('v-prev').classList.add('hidden'); $('v-info').textContent = ''; }
}
$('v-view').onclick = () => viewVideo(log.video_path, 'Video guardado de hoy');
const busy = (on, t) => { ['b-rec', 'v-file', 'b-send'].forEach(i => $(i).disabled = on); if (t != null) $('v-state').textContent = t; };
// Sube el video y lo asocia a la jornada abierta AL INSTANTE (en cualquier momento de la jornada).
async function saveVideo(blob, type, name) {
  const ext = type === 'video/mp4' ? 'mp4' : type === 'video/quicktime' ? 'mov' : 'webm';
  const path = `${user.id}/${log.practice_date}/${crypto.randomUUID()}.${ext}`, old = log.video_path;
  busy(true, 'Subiendo video…');
  try {
    const up = await sb.storage.from('practice-videos').upload(path, blob, { contentType: type, upsert: false });
    if (up.error) throw up.error;
    const { data, error } = await sb.rpc('attach_video', { p_video_path: path, p_video_original_name: name });
    if (error) { await sb.storage.from('practice-videos').remove([path]); throw error; }   // limpia el huérfano
    log = data; myLogs = [data, ...myLogs.filter(x => x.id !== data.id)];
    if (old && old !== path) sb.storage.from('practice-videos').remove([old]);              // el reemplazado queda huérfano
    busy(false); renderEvidence(); msg('');
    $('v-state').textContent = `Video guardado a las ${fmtTime(new Date())}. Puede reemplazarlo hasta cerrar la jornada.`;
  } catch (err) { busy(false, ''); video = null; renderEvidence(); fail(err); }
}

// ---- Historial (solo lectura) ----
const el = (t, p = {}, ...k) => { const e = document.createElement(t);
  Object.entries(p).forEach(([a, v]) => a === 'onclick' ? e.onclick = v : e[a] = v); k.flat().forEach(x => e.append(x)); return e; };
// ---- Días de descanso (solo lectura) ----
const dedupRests = rows => { const m = new Map();   // un descanso por fecha; el individual manda sobre el general
  rows.forEach(r => { const p = m.get(r.rest_date); if (!p || (!p.student_id && r.student_id)) m.set(r.rest_date, r); });
  return [...m.values()].sort((a, b) => a.rest_date < b.rest_date ? -1 : 1); };
const futureRests = () => myRests.filter(r => r.rest_date > todayGT());
function renderRests() {
  const box = $('rests'); box.replaceChildren();
  const f = futureRests(); if (!f.length) return;
  box.append(el('h2', { textContent: 'Próximos días de descanso' }));
  f.slice(0, 10).forEach(r => box.append(el('div', { className: 'rest' },
    el('b', { textContent: fmtDate(r.rest_date) }), r.reason ? el('span', { textContent: r.reason }) : '')));
}
// ---- Amonestaciones (solo lectura) ----
function renderWarns() {
  const box = $('warns'); box.replaceChildren();
  if (!myNotes.length) return;
  box.append(el('h2', { textContent: myNotes.length === 1 ? 'Tiene una amonestación registrada' : `Tiene ${myNotes.length} amonestaciones registradas` }));
  myNotes.forEach(n => { const lg = n.log_id ? myLogs.find(x => x.id === n.log_id) : null;
    box.append(el('div', { className: 'amon' },
      el('div', { className: 'wd', textContent: new Date(n.created_at).toLocaleDateString('es-GT', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }) +
        (lg ? ` · sobre la jornada del ${fmtDate(lg.practice_date)}` : '') }),
      el('p', { textContent: n.note }))); });
}
const chips = x => { const m = Horas.minutes(x); if (m === null) { const rv = Horas.review(x); return rv ? el('span', { className: 'hrs' }, el('i', { className: 'hc ' + (rv === 'pending' ? 'rev' : 'rej'), textContent: rv === 'pending' ? 'Hora en revisión' : 'Hora rechazada' })) : ''; }
  return el('span', { className: 'hrs' }, el('i', { className: 'hc ' + (m >= Horas.jornada(x.practice_date) ? 'ok' : 'low'), textContent: Horas.fHM(m) }),
    m > Horas.jornada(x.practice_date) ? el('i', { className: 'hc xtra', textContent: '+' + Horas.fHM(m - Horas.jornada(x.practice_date)) + ' extra' }) : ''); };
function renderHours() {
  const box = $('hrs-card'); box.replaceChildren(); const hs = Horas.summarize(myLogs);
  if (!myLogs.length) return;
  const f = (v, k, c) => el('div', { className: 'hf ' + c }, el('b', { textContent: v }), el('span', { textContent: k }));
  box.append(el('h3', { textContent: 'Mis horas' }),
    el('div', { className: 'hfs' }, f(Horas.fHM(hs.total), 'horas acumuladas', 'hfg'), f(hs.over ? '+' + Horas.fHM(hs.over) : '0 h', 'horas extra acumuladas', 'hfb'), f(String(hs.days), 'jornadas contadas', '')),
    el('p', { className: 'info', textContent: 'Cada jornada se cuenta sin la hora de almuerzo. Es hora extra lo que pasa de 8 horas en un día (4 horas los sábados), antes o después de su horario. No suman las jornadas sin cerrar, no concluidas o cerradas tarde.' }),
    el('a', { className: 'btn sec', href: 'informe.html?s=' + user.id, target: '_blank', rel: 'noopener', textContent: 'Ver mi informe (carta)' }));
}
function renderHist() {
  const box = $('hist-list'); box.replaceChildren(); renderHours();
  if (!myLogs.length) return box.append(el('p', { className: 'info', textContent: 'Aún no tiene bitácoras registradas.' }));
  myLogs.forEach(x => {
    const body = el('dl'), row = (k, v, c = '') => { if (v) body.append(el('dt', { className: c, textContent: k }), el('dd', { className: c, textContent: v })); };
    row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
    row('Herramientas', x.tools_used);
    row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
    if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
    row('Tipo de práctica', PROG[x.program]);
    if (x.start_photo_path && myPArch[x.id]) row('Foto de inicio', 'Archivada por la institución; ya no se puede ver desde aquí.');
    else if (x.start_photo_path) body.append(el('dt', { textContent: 'Foto de inicio' }), el('dd', {}, el('button', { type: 'button', className: 'sec',
      textContent: 'Ver foto de inicio', onclick: () => viewPhoto(x.start_photo_path, 'Foto de inicio') })));
    const un = x.status === 'unclosed';
    if (un) { row('Estado', 'Jornada no concluida: la cerró el administrador', 'bad'); row('Motivo', x.admin_note, 'bad'); }
    kindRows(x).forEach(r => row(r[0], r[1], r[2]));
    if (x.closed_late) { row('Cierre tardío', 'Se cerró después del día de la práctica'); row('Motivo del retraso', x.late_reason); }
    if (x.video_path && myArch[x.id]) row('Video de evidencia', 'Archivado por la institución; ya no se puede ver desde aquí.');
    else if (x.video_path) body.append(el('dt', { textContent: 'Video de evidencia' }), el('dd', {}, el('button', { type: 'button', className: 'sec',
      textContent: 'Ver mi video', onclick: () => viewVideo(x.video_path, 'Mi video · ' + fmtDate(x.practice_date)) })));
    const d = new Date(x.practice_date + 'T12:00:00');
    box.append(el('details', { className: 'hl' }, el('summary', {},
      el('div', { className: 'hd', textContent: d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }) }),
      el('div', { className: 'hm' }, el('b', { textContent: x.main_activity || (un ? 'Jornada no concluida' : 'Jornada en curso') }),
        el('span', { textContent: `Entrada ${fmtTime(Horas.times(x)?.entry || x.entry_at)}, salida ${x.exit_at ? fmtTime(Horas.times(x)?.exit || x.exit_at) : '—'}` }),
        chips(x),
        un ? el('span', { className: 'tg', textContent: 'No concluida' }) : '',
        x.closed_late ? el('span', { className: 'tg2', textContent: 'Cierre tardío' }) : '',
        x.has_incident ? el('span', { className: 'tg', textContent: 'Con incidente' }) : '')), body));
  });
}

$('f-login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: val('l-email'), password: $('l-pass').value });
  if (error) return msg('Correo o contraseña incorrectos.'); route(); };
$('b-out').onclick = async () => { await sb.auth.signOut(); route(); };

$('f-profile').onsubmit = async e => { e.preventDefault(); msg('');
  const prog = radio('prog'); if (!prog) return msg(ERR.PROGRAMA_INVALIDO);
  const gr = $('p-gr').value, car = $('p-car').value;
  if (!gr || !car) return msg('Elija su grado y su carrera.');
  if (gr === 'Sexto' && car === 'Bachillerato') return msg(ERR.CARRERA_INVALIDA);
  if (!pAv) return msg(ERR.AVATAR_REQUERIDO);
  const btn = e.submitter || e.target.querySelector('button'); btn.disabled = true;
  let avPath = null;
  try {
    if (pAv) avPath = await uploadAvatar(pAv);
    const { error } = await sb.from('students').insert({ id: user.id, full_name: val('p-name'),
      grade: `${gr} ${car}`, section: val('p-section'), practice_place: val('p-place'),
      institution: val('p-inst'), supervisor_name: val('p-sup') || null,
      supervisor_contact: val('p-supc') || null, program: prog, avatar_path: avPath });
    if (error) { if (avPath) await sb.storage.from(PH).remove([avPath]); throw error; }
  } catch (err) { btn.disabled = false; return fail(err); }
  btn.disabled = false; pAv = null; route(); };

// Estudiantes que ya tenían perfil: definen una sola vez el tipo de práctica y la foto de perfil que les falten.
$('f-extra').onsubmit = async e => { e.preventDefault(); msg('');
  const needProg = !student.program, needAv = !student.avatar_path;
  const prog = needProg ? radio('prog2') : null; if (needProg && !prog) return msg(ERR.PROGRAMA_INVALIDO);
  if (needAv && !xAv) return msg(ERR.AVATAR_REQUERIDO);
  const btn = e.target.querySelector('button'); btn.disabled = true;
  let avPath = null;
  try {
    if (needAv) avPath = await uploadAvatar(xAv);
    const { error } = await sb.rpc('update_my_profile', { p_program: prog, p_avatar_path: avPath });
    if (error) { if (avPath) await sb.storage.from(PH).remove([avPath]); throw error; }
  } catch (err) { btn.disabled = false; return fail(err); }
  btn.disabled = false; xAv = null; route(); };

const setWho = () => { [$('who'), $('who2')].forEach(w => { w.replaceChildren(el('b', { textContent: student.full_name }),
  el('span', { textContent: `${PROG[student.program] || 'Tipo sin definir'} · ${student.grade} ${student.section}` }),
  ...(student.institution ? [el('span', { textContent: student.institution })] : []),
  el('span', { textContent: student.practice_place }),
  ...(student.supervisor_name ? [el('span', { textContent: `Encargado: ${student.supervisor_name}` })] : [])); }); };
// Encargado de la práctica (quien está a cargo del estudiante en la empresa): el estudiante solo puede
// COMPLETAR lo que dejó vacío; lo ya registrado queda de solo lectura (lo corrige el personal).
function renderSup() {
  const ok = !!student && student.active !== false, c = $('sup-card'); c.classList.toggle('hidden', !ok); if (!ok) return;
  const n = (student.supervisor_name || '').trim(), t = (student.supervisor_contact || '').trim(), f = $('f-sup');
  $('sup-n').value = n; $('sup-c').value = t; $('sup-n').readOnly = !!n; $('sup-c').readOnly = !!t; $('sup-ok').textContent = '';
  $('sup-n').required = !n; $('sup-n').classList.toggle('locked', !!n); $('sup-c').classList.toggle('locked', !!t);
  const falta = !n || !t; f.querySelector('button').classList.toggle('hidden', !falta);
  $('sup-info').textContent = falta ? 'Persona que está a cargo de usted en la empresa. Complete el dato que falta: el personal lo usa para ubicar a su encargado durante las visitas. Una vez guardado ya no se puede cambiar desde aquí.'
    : 'Datos de su encargado. Si hay un error, avise a su supervisor de práctica para que lo corrija.';
  $('sup-sum').textContent = falta ? 'Encargado de mi práctica: falta completar' : 'Encargado de mi práctica';
  c.open = falta; }
$('f-sup').onsubmit = async e => { e.preventDefault(); msg(''); $('sup-ok').textContent = '';
  const b = $('f-sup').querySelector('button'); b.disabled = true;
  try {
    const { data, error } = await sb.rpc('update_my_supervisor', { p_name: $('sup-n').value, p_contact: $('sup-c').value });
    if (error) throw error;
    student = data; setWho(); setTitle(student.program); renderSup(); $('sup-ok').textContent = 'Datos del encargado guardados.';
  } catch (err) { fail(err); } finally { b.disabled = false; } };

// Cambiar la foto de perfil cuando quiera
document.querySelectorAll('.chg-av').forEach(b => b.onclick = () => $('av-chg').click());
$('av-chg').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; msg('');
  let path;
  try {
    const b = await shrink(f, 320, true, .85); path = await uploadAvatar(b);
    const { data, error } = await sb.rpc('update_my_profile', { p_avatar_path: path });
    if (error) { await sb.storage.from(PH).remove([path]); throw error; }
    const old = student.avatar_path; student = data;
    if (old && old !== path) sb.storage.from(PH).remove([old]);   // el anterior queda sin uso
    showAvatars();
  } catch (err) { fail(err); } };

let startPhoto = null;   // Blob JPEG ya reducido
const updateStart = () => { $('b-start').disabled = !startPhoto; };
function setStartPhoto(blob) {
  startPhoto = blob; msg(''); const p = $('sp-prev'); p.src = URL.createObjectURL(blob); p.classList.remove('hidden');
  $('sp-info').textContent = `Foto lista (${Math.round(blob.size / 1024)} KB). Puede cambiarla si quiere.`; updateStart(); }
$('sp-file').onchange = async e => { const f = e.target.files[0]; startPhoto = null; $('sp-prev').classList.add('hidden'); updateStart();
  if (!f) return;
  try { setStartPhoto(await shrink(f, 1280, false, .8)); }
  catch (err) { e.target.value = ''; return msg(err.message); } };

// ---- Cámara de la app para la foto de inicio (igual que la del video, sin micrófono) ----
let pst, pFacing = 'environment', picId = '';
try { picId = localStorage.getItem('picId') || ''; } catch {}
const savePicId = v => { picId = v; try { v ? localStorage.setItem('picId', v) : localStorage.removeItem('picId'); } catch {} };
const closePic = () => { pst?.getTracks().forEach(t => t.stop()); pst = null; $('pic-live').srcObject = null; $('pic-modal').classList.add('hidden'); };
const getPic = () => navigator.mediaDevices.getUserMedia({ audio: false,
  video: { ...(picId ? { deviceId: { exact: picId } } : { facingMode: pFacing }), width: { ideal: 1280 }, height: { ideal: 720 } } });
async function openPic() {
  pst?.getTracks().forEach(t => t.stop()); $('pic-shot').disabled = true;
  try { pst = await getPic(); }
  catch (e) { if (!picId) throw e; savePicId(''); pst = await getPic(); }   // la cámara guardada ya no existe: usa la predeterminada
  const vt = pst.getVideoTracks()[0];
  if (!vt || vt.readyState !== 'live') throw new Error('No se obtuvo la cámara.');
  $('pic-live').srcObject = pst; $('pic-live').play().catch(() => {});
  const st = () => $('pic-status').textContent = `Cámara: ${vt.label || 'sin nombre'}${vt.muted ? ' (SIN SEÑAL)' : ''}.`;
  vt.onmute = vt.onunmute = st; st();
  const fm = vt.getSettings().facingMode;   // espejo solo para la cámara frontal (la foto guardada no se voltea)
  $('pic-live').classList.toggle('mirror', fm ? fm === 'user' : !/back|rear|trasera|environment/i.test(vt.label));
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'), sel = $('pic-cam');
  sel.replaceChildren(...devs.map((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Cámara ${i + 1}`; return o; }));
  sel.value = vt.getSettings().deviceId || '';
  $('pic-shot').disabled = false;
}
// Foto de inicio solo con cámara en vivo. Para volver a mostrar «elija una imagen de su galería», ponga GALERIA_FOTO = true.
const GALERIA_FOTO = false;
if (!GALERIA_FOTO) { $('sp-file').classList.add('hidden'); $('sp-file').previousElementSibling?.classList.add('hidden'); }
const OPC_GAL = GALERIA_FOTO ? ' Use el selector de imagen.' : '';
$('b-pic').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    if (!GALERIA_FOTO) return $('sp-file').click();   // el selector oculto abre la cámara del teléfono (capture)
    return msg('Este navegador no permite usar la cámara. Use el selector de imagen.'); }
  msg(''); $('pic-modal').classList.remove('hidden');
  try { await openPic(); } catch (err) { closePic();
    msg('No se pudo usar la cámara: ' + err.message + ' Permita el acceso a la cámara.' + OPC_GAL); }
};
const rePic = async () => { try { await openPic(); } catch (err) { $('pic-status').textContent = 'No se pudo cambiar de cámara: ' + err.message; } };
$('pic-flip').onclick = () => { pFacing = pFacing === 'user' ? 'environment' : 'user'; savePicId(''); rePic(); };
$('pic-cam').onchange = e => { savePicId(e.target.value); rePic(); };
$('pic-cancel').onclick = closePic;
$('pic-shot').onclick = async () => {
  const v = $('pic-live'); if (!v.videoWidth || !v.videoHeight) return $('pic-status').textContent = 'La cámara aún no está lista. Espere un momento.';
  $('pic-shot').disabled = true;
  const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
  if (!blob) { $('pic-shot').disabled = false; return $('pic-status').textContent = 'No se pudo tomar la foto. Intente de nuevo.'; }
  closePic(); $('sp-file').value = ''; setStartPhoto(blob); };
$('b-start').onclick = async () => {
  if (!startPhoto) return msg('Tome la foto de inicio antes de iniciar la jornada.');
  const btn = $('b-start'); btn.disabled = true; msg('');
  try {
    let force = null, error;
    for (let k = 0; k < 2; k++) {
      const q = await askStart(force); if (!q) return;   // canceló: no se sube nada
      btn.textContent = 'Subiendo foto…';
      const path = `${user.id}/${todayGT()}/start-${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(PH).upload(path, startPhoto, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;                    // si falla la subida NO se inicia la jornada
      ({ error } = await sb.rpc('start_workday', { p_photo_path: path, ...q }));
      if (!error) break;
      await sb.storage.from(PH).remove([path]);   // limpia el huérfano
      const m = error.message || '';   // el reloj del dispositivo no coincide con el del servidor: se pregunta otra vez
      if (k === 0 && /ENTRADA_ANTICIPADA_PREGUNTA|EXTRA_MOTIVO_REQUERIDO/.test(m)) force = 'early';
      else if (k === 0 && /ENTRADA_TARDIA_MOTIVO_REQUERIDO/.test(m)) force = 'late';
      else throw error;
    }
    startPhoto = null; $('sp-file').value = ''; $('sp-prev').classList.add('hidden');
    $('sp-info').textContent = 'Tome una foto en su lugar de práctica para poder iniciar la jornada.';
    route();
  } catch (err) { fail(err); }
  finally { btn.textContent = 'Iniciar jornada'; updateStart(); } };

document.querySelectorAll('input[name=inc]').forEach(r => r.onchange = () =>
  $('inc-box').classList.toggle('hidden', radio('inc') !== '1'));

// ---- Video ----
function setVideo(blob, type, name) {
  video = { blob, type, name };
  const p = $('v-prev'); p.src = URL.createObjectURL(blob); p.classList.remove('hidden');
  const mb = (blob.size / 1048576).toFixed(1);
  p.onloadedmetadata = () => { const d = p.duration;
    $('v-info').textContent = `Tamaño: ${mb} MB` + (isFinite(d) ? ` · Duración: ${Math.round(d)} s` : '') +
      (isFinite(d) && (d < 5 || d > 20) ? ' · Aviso: la duración esperada es de unos 10 s.' : ''); };
  $('v-info').textContent = `Tamaño: ${mb} MB`; $('v-view').classList.add('hidden');
  saveVideo(blob, type, name);   // se guarda ya: no hace falta esperar al cierre de la jornada
}
// Video solo grabado con la cámara de la app. Para volver a mostrar «elija un archivo», ponga GALERIA_VIDEO = true.
const GALERIA_VIDEO = false;
if (!GALERIA_VIDEO) { $('v-file').classList.add('hidden'); $('v-file').previousElementSibling?.classList.add('hidden');
  $('v-intro').innerHTML = 'Grábelo <b>en cualquier momento de la jornada</b>: se guarda al instante. Al final solo cierra la jornada con el formulario.'; }
$('v-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!f.type.startsWith('video/')) { video = null; return msg('El archivo debe ser un video.'); }
  if (f.size > MAX) { video = null; return msg('El video pesa más de 10 MB. Grábelo desde el botón de la app.'); }
  msg(''); setVideo(f, f.type.split(';')[0], f.name); };

let facing = 'user', stream, ac, raf, rec, tm, heard = false, cancelled = false;
const closeCam = () => { cancelAnimationFrame(raf); clearInterval(tm); stream?.getTracks().forEach(t => t.stop());
  ac?.close(); stream = ac = null; $('rec-modal').classList.add('hidden'); };
const ls = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lset = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
let camId = ls('camId'), micId = ls('micId');
const getStream = () => navigator.mediaDevices.getUserMedia({
  audio: { ...(micId && { deviceId: { exact: micId } }), echoCancellation: true, noiseSuppression: true },
  video: { ...(camId ? { deviceId: { exact: camId } } : { facingMode: facing }), width: { ideal: 640 }, height: { ideal: 360 } } });
async function openCam() {
  cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop());
  $('rec-start').disabled = true; heard = false;
  try { stream = await getStream(); }
  catch (e) { if (!camId && !micId) throw e; camId = micId = ''; lset('camId', ''); lset('micId', ''); stream = await getStream(); }
  const live = t => stream.getTracks().some(x => x.kind === t && x.readyState === 'live');
  if (!live('video') || !live('audio')) throw new Error('No se obtuvo cámara y micrófono a la vez.');
  $('rec-live').srcObject = stream;
  await ac.resume().catch(() => {});
  const an = ac.createAnalyser(), data = new Uint8Array(an.fftSize);
  ac.createMediaStreamSource(stream).connect(an);
  const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
  const st = () => $('rec-status').textContent =
    `Cámara: ${vt.label || 'sin nombre'}${vt.muted ? ' (SIN SEÑAL)' : ''} · Micrófono: ${at.label || 'sin nombre'}${at.muted ? ' (SIN SEÑAL)' : ''}. Diga algo: la barra verde debe moverse.`;
  [vt, at].forEach(t => { t.onmute = t.onunmute = st; }); st();
  $('rec-live').play().catch(() => {});
  const fm = vt.getSettings().facingMode;   // espejo solo para la cámara frontal
  $('rec-live').classList.toggle('mirror', fm ? fm === 'user' : !/back|rear|trasera|environment/i.test(vt.label));
  const devs = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, cur) => { sel.replaceChildren(...devs.filter(d => d.kind === kind).map((d, i) => {
    const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `${kind} ${i + 1}`; return o; })); sel.value = cur; };
  fill($('rec-cam'), 'videoinput', vt.getSettings().deviceId); fill($('rec-mic'), 'audioinput', at.getSettings().deviceId);
  $('rec-start').disabled = false;
  const loop = () => { an.getByteTimeDomainData(data);
    const peak = Math.max(...data.map(v => Math.abs(v - 128))) / 128;
    $('rec-level').style.width = Math.min(100, peak * 300) + '%';
    if (peak > 0.015) heard = true;
    raf = requestAnimationFrame(loop); };
  loop();
}
$('b-rec').onclick = async () => {
  if (!window.MediaRecorder) { if (!GALERIA_VIDEO) return $('v-file').click(); return msg('Este navegador no permite grabar. Use el selector de archivo.'); }
  msg(''); $('rec-modal').classList.remove('hidden'); $('rec-start').textContent = 'Iniciar grabación';
  $('rec-flip').disabled = $('rec-cam').disabled = $('rec-mic').disabled = false; rec = null;
  ac?.close(); ac = new AudioContext();
  try { await openCam(); } catch (err) { closeCam();
    msg('No se pudo usar cámara y micrófono: ' + err.message + ' Permita el acceso' + (GALERIA_VIDEO ? ' o use el selector de archivo.' : '.')); }
};
const reopen = async () => { ac?.close(); ac = new AudioContext();
  try { await openCam(); } catch (err) { $('rec-status').textContent = 'No se pudo cambiar el dispositivo: ' + err.message; } };
$('rec-flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; camId = ''; lset('camId', ''); reopen(); };
$('rec-cam').onchange = e => { camId = e.target.value; lset('camId', camId); reopen(); };
$('rec-mic').onchange = e => { micId = e.target.value; lset('micId', micId); reopen(); };
$('rec-cancel').onclick = () => { cancelled = true; if (rec?.state === 'recording') rec.stop(); else closeCam(); rec = null; };
$('rec-start').onclick = () => {
  const mime = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const chunks = []; let left = 10; cancelled = false; heard = false;
  rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const ok = !cancelled, gotAudio = heard || ac?.state !== 'running'; closeCam(); rec = null;
    if (!ok) return;
    const type = mime.split(';')[0], blob = new Blob(chunks, { type });
    if (!gotAudio) { video = null; return msg('No se detectó audio en la grabación. Revise el micrófono y vuelva a grabar.'); }
    if (blob.size > MAX) { video = null; return msg('El video superó 10 MB. Intente de nuevo.'); }
    msg(''); setVideo(blob, type, 'grabacion.' + (type === 'video/mp4' ? 'mp4' : 'webm')); };
  $('rec-start').disabled = $('rec-flip').disabled = $('rec-cam').disabled = $('rec-mic').disabled = true;
  const tick = () => { $('rec-start').textContent = `Grabando… ${left} s`; if (left-- <= 0) rec.stop(); };
  tick(); tm = setInterval(tick, 1000); rec.start();
};

// ---- Cerrar la jornada (el video ya está guardado) ----
$('f-log').onsubmit = async e => { e.preventDefault(); msg('');
  const inc = radio('inc') === '1';
  const late = log.practice_date < todayGT();   // jornada de un día anterior: el servidor exige el motivo
  if (late && val('a-late').length < 10) { $('a-late').focus(); return msg(ERR.MOTIVO_TARDIO_REQUERIDO); }
  if (!log.video_path) { $('ev-card').scrollIntoView?.({ behavior: 'smooth', block: 'start' }); return msg(ERR.VIDEO_REQUERIDO); }
  if (inc && (!val('i-desc') || !radio('rep'))) return msg(ERR.INCIDENTE_INCOMPLETO);
  const btn = $('b-send'); btn.disabled = true;
  try {
    let force = null, data, error, q;
    for (let k = 0; k < 2; k++) {
      q = await askClose(force); if (!q) return;   // canceló
      btn.textContent = 'Registrando bitácora…';
      ({ data, error } = await sb.rpc('submit_workday', {
      p_activities: val('a-act'), p_main_activity: val('a-main'), p_learning: val('a-learn'),
      p_tools_used: val('a-tools') || null, p_supervised: radio('sup') === '1',
      p_has_incident: inc, p_incident_description: inc ? val('i-desc') : null,
      p_incident_reported: inc ? radio('rep') === '1' : null,
      p_video_path: null, p_video_original_name: null, p_late_reason: late ? val('a-late') : null, ...q }));
      if (!error) break;
      const m = error.message || '';
      if (k === 0 && /SALIDA_TARDIA_PREGUNTA|EXTRA_MOTIVO_REQUERIDO/.test(m)) force = 'after';
      else if (k === 0 && /SALIDA_ANTICIPADA_MOTIVO_REQUERIDO/.test(m)) force = 'before';
      else if (k === 0 && /SALIDA_DECLARADA/.test(m)) force = 'declare';
      else throw error;
    }
    if (error) throw error;
    log = data; myLogs = [data, ...myLogs.filter(x => x.id !== data.id)]; video = null; showReceipt();
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = 'Finalizar y enviar bitácora'; }
};

// ---- Horario semanal, margen de 20 minutos y tiempo extra (migracion_v14) ----
const DIAS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
const minOf = t => { const [a, b] = t.split(':'); return +a * 60 + +b; };
const f12 = t => { const [a, b] = t.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'a. m.' : 'p. m.'}`; };
const gtNowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date()).split(':'); return (+p[0] % 24) * 60 + +p[1]; };
const gtAt = (date, hhmm) => `${date}T${hhmm}:00-06:00`;   // Guatemala es UTC−6 todo el año
const schedState = rows => {
  const conf = rows.filter(r => r.status === 'confirmed').sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0] || null;
  return { conf, pend: rows.find(r => r.status === 'pending') || null, rej: rows[0]?.status === 'rejected' ? rows[0] : null, any: rows.length > 0 };
};
const schedDay = date => mySched.conf?.days?.[String(new Date(date + 'T12:00:00Z').getUTCDay())] || null;
const netMin = d => minOf(d.e) - minOf(d.s) - (+d.l || 0);

function schedTable(days) {
  const dl = el('dl', { className: 'sdone' });
  DIAS.forEach(([k, n]) => { const d = days?.[k]; if (d) dl.append(el('b', { textContent: n }), el('span', { textContent: `${f12(d.s)} a ${f12(d.e)}, almuerzo ${d.l} min (${Horas.fHM(netMin(d))} netas)` })); });
  return dl;
}
function renderSchedCard() {
  const c = $('sched-card'); c.replaceChildren();
  const { conf, pend, rej } = mySched;
  c.append(el('b', { textContent: 'Mi horario semanal' }));
  if (conf) c.append(schedTable(conf.days));
  if (pend) c.append(el('p', { className: 'info', textContent: 'Tiene un horario nuevo pendiente de confirmación. Mientras tanto rige el anterior.' }));
  else if (rej) c.append(el('p', { className: 'info', textContent: 'Su último horario fue rechazado: ' + (rej.decision_note || 'sin motivo') + '. Corríjalo y envíelo de nuevo.' }));
  else if (!conf) c.append(el('p', { className: 'info', textContent: 'Aún no ha definido su horario.' }));
  else if (conf && !pend) c.append(el('p', { className: 'info', textContent: 'Confirmado por el equipo de supervisión.' }));
  c.append(el('button', { type: 'button', className: 'sec small', textContent: conf || pend ? 'Cambiar mi horario' : 'Definir mi horario', onclick: openSched }));
  c.classList.remove('hidden');
}
function openSched() {
  const base = mySched.pend?.days || mySched.conf?.days || {};
  const box = $('sc-rows'); box.replaceChildren();
  DIAS.forEach(([k, n]) => {
    const d = base[k], on = !!d;
    const cb = el('input', { type: 'checkbox', id: 'sc-on' + k, checked: on });
    const s = el('input', { type: 'time', id: 'sc-s' + k, value: d?.s || '07:00' });
    const e = el('input', { type: 'time', id: 'sc-e' + k, value: d?.e || (k === '6' ? '12:00' : '17:00') });
    const l = el('select', { id: 'sc-l' + k }, [0, 30, 45, 60, 90, 120].map(v => el('option', { value: v, textContent: v ? v + ' min' : 'Sin almuerzo', selected: v === (d ? +d.l : (k === '6' ? 0 : 60)) })));
    const note = el('p', { className: 'sdn', id: 'sc-n' + k });
    const f = el('div', { className: 'sdf' }, el('div', {}, el('label', { textContent: 'Entrada' }), s), el('div', {}, el('label', { textContent: 'Salida' }), e), el('div', {}, el('label', { textContent: 'Almuerzo' }), l));
    const upd = () => { f.classList.toggle('hidden', !cb.checked); note.classList.toggle('hidden', !cb.checked);
      const bad = !s.value || !e.value || minOf(e.value) - minOf(s.value) - +l.value < 60;
      note.textContent = !s.value || !e.value ? '' : bad ? 'La jornada neta debe ser de al menos 1 hora, dentro del mismo día.' : 'Jornada neta: ' + Horas.fHM(minOf(e.value) - minOf(s.value) - +l.value);
      note.classList.toggle('bad', bad && cb.checked); totals(); };
    [cb, s, e, l].forEach(x => x.oninput = x.onchange = upd);
    box.append(el('div', { className: 'sd', id: 'sd' + k }, el('label', {}, cb, el('span', { textContent: n })), f, note)); upd();
  });
  function totals() { let t = 0, n = 0; DIAS.forEach(([k]) => { if ($('sc-on' + k)?.checked && $('sc-s' + k).value && $('sc-e' + k).value) { t += Math.max(0, minOf($('sc-e' + k).value) - minOf($('sc-s' + k).value) - +$('sc-l' + k).value); n++; } });
    $('sc-note').textContent = n ? `${n} día${n > 1 ? 's' : ''} por semana, ${Horas.fHM(t)} netas en total.` : 'Marque los días que trabaja.'; }
  totals();
  $('sc-skip').textContent = mySched.any ? 'Cancelar' : 'Ahora no';
  show('s-sched');
}
$('sc-copy').onclick = () => { ['2', '3', '4', '5'].forEach(k => { $('sc-on' + k).checked = $('sc-on1').checked;
  $('sc-s' + k).value = $('sc-s1').value; $('sc-e' + k).value = $('sc-e1').value; $('sc-l' + k).value = $('sc-l1').value; $('sc-on' + k).dispatchEvent(new Event('change')); }); };
$('sc-skip').onclick = () => { schedSkip = true; route(); };
$('f-sched').onsubmit = async e => { e.preventDefault(); msg('');
  const days = {};
  for (const [k, n] of DIAS) { if (!$('sc-on' + k).checked) continue;
    const d = { s: $('sc-s' + k).value, e: $('sc-e' + k).value, l: +$('sc-l' + k).value };
    if (!d.s || !d.e || netMin(d) < 60) { $('sd' + k).scrollIntoView?.({ block: 'center' }); return msg(`${n}: la jornada neta debe ser de al menos 1 hora y terminar el mismo día.`); }
    days[k] = d; }
  if (!Object.keys(days).length) return msg(ERR.HORARIO_VACIO);
  const btn = $('sc-send'); btn.disabled = true;
  const { error } = await sb.rpc('save_my_schedule', { p_days: days });
  btn.disabled = false; if (error) return fail(error);
  await route(); msg('Horario enviado. Lo confirmará el equipo de supervisión.'); };

// Pregunta en una ventana: nodes = contenido; validate() devuelve el resultado o { error }
function ask(title, nodes, validate) {
  return new Promise(res => {
    const err = el('p', { className: 'mer hidden' }), d = el('dialog', { className: 'mdlg' });
    const f = el('form', {}, el('h3', { textContent: title }), ...nodes, err,
      el('div', { className: 'macts' }, el('button', { type: 'button', className: 'sec', textContent: 'Cancelar', onclick: () => d.close() }), el('button', { textContent: 'Continuar' })));
    f.onsubmit = ev => { ev.preventDefault(); const r = validate();
      if (r?.error) { err.textContent = r.error; err.classList.remove('hidden'); return; }
      d.close(); res(r); };
    d.addEventListener('close', () => { d.remove(); res(null); });
    d.append(f); document.body.append(d); d.showModal(); });
}
const area = (id, lab) => [el('label', { textContent: lab, htmlFor: id }), el('textarea', { id, maxLength: 1000 })];
const yesNo = (name, a, b, onchg) => { const w = el('div', { className: 'opts' },
  el('label', {}, el('input', { type: 'radio', name, value: '1' }), a), el('label', {}, el('input', { type: 'radio', name, value: '0' }), b));
  w.onchange = onchg; return w; };
const rv = name => document.querySelector(`.mdlg input[name=${name}]:checked`)?.value;
const mins = n => n >= 60 ? Horas.fHM(n) : n + ' min';

// Antes de iniciar: ¿llega dentro de ±20 min de su horario? Devuelve los parámetros del servidor, {} si no hay nada que preguntar, o null si cancela.
async function askStart(force) {
  const d = schedDay(todayGT()); if (!d) return {};
  const diff = gtNowMin() - minOf(d.s), mode = force || (Math.abs(diff) <= Horas.TOL_MIN ? 'ok' : diff < 0 ? 'early' : 'late');
  if (mode === 'ok') return {};
  if (mode === 'early') {
    const [lbl, ta] = area('mx-r', 'Explique qué hará en ese tiempo extra'); const box = el('div', { className: 'hidden' }, lbl, ta);
    const nb = el('p', { className: 'info hidden', textContent: `Su jornada se contará desde las ${f12(d.s)}, la hora de su horario.` });
    const yn = yesNo('mx', 'Sí, es tiempo extra', 'No, solo llegué temprano', () => { box.classList.toggle('hidden', rv('mx') !== '1'); nb.classList.toggle('hidden', rv('mx') !== '0'); });
    return ask('Llegó antes de su horario', [el('p', { className: 'info', textContent: `Su horario de hoy empieza a las ${f12(d.s)} ¿Va a trabajar este tiempo extra?` }), yn, box, nb], () => {
      const x = rv('mx'); if (!x) return { error: 'Elija una opción.' };
      if (x === '0') return { p_extra: false };
      if (ta.value.trim().length < 10) return { error: 'Explique el tiempo extra (mínimo 10 caracteres).' };
      return { p_extra: true, p_reason: ta.value.trim() }; });
  }
  const [lbl, ta] = area('mx-r', '¿Por qué registra tarde?'), tm = el('input', { type: 'time', id: 'mx-t' });
  const ck = el('input', { type: 'checkbox' }), tb = el('div', { className: 'hidden' }, el('label', { textContent: '¿A qué hora llegó realmente?', htmlFor: 'mx-t' }), tm,
    el('p', { className: 'info', textContent: 'Esta hora la revisa el equipo de supervisión.' }));
  ck.onchange = () => tb.classList.toggle('hidden', !ck.checked);
  return ask('Registro fuera de su horario', [el('p', { className: 'info', textContent: `Su horario de hoy empezaba a las ${f12(d.s)} y ya pasaron ${mins(diff)}.` }), ...[lbl, ta],
    el('label', { className: 'ck' }, ck, 'Llegué a tiempo y olvidé registrarme'), tb], () => {
    if (ta.value.trim().length < 10) return { error: 'Explique el motivo (mínimo 10 caracteres).' };
    const r = { p_extra: null, p_reason: ta.value.trim() };
    if (ck.checked) { if (!tm.value) return { error: 'Indique la hora real de llegada.' };
      if (minOf(tm.value) > gtNowMin()) return { error: 'La hora de llegada no puede ser futura.' };
      r.p_declared_at = gtAt(todayGT(), tm.value); }
    return r; });
}

// Antes de cerrar: salida dentro de ±20 min del horario de esa jornada, tardía (otro día) o anticipada.
async function askClose(force) {
  const sEnd = log.sched_end; if (!sEnd) return {};
  const lateDay = log.practice_date < todayGT(), diff = gtNowMin() - minOf(sEnd);
  const mode = lateDay ? 'declare' : force || (Math.abs(diff) <= Horas.TOL_MIN ? 'ok' : diff > 0 ? 'after' : 'before');
  if (mode === 'ok') return {};
  const ent = new Date(log.entry_adj_at || log.entry_at);
  const when = lateDay ? log.practice_date : todayGT();
  const realExit = (tm, needReason, ta) => { if (!tm.value) return { error: 'Indique la hora real de salida.' };
    const at = new Date(gtAt(when, tm.value));
    if (!(at > ent)) return { error: 'La salida debe ser posterior a la entrada.' };
    if (at > new Date()) return { error: 'La hora de salida no puede ser futura.' };
    if (at - ent > 16 * 3600e3) return { error: 'La jornada no puede durar más de 16 horas.' };
    if (needReason && ta.value.trim().length < 10) return { error: 'Explique el motivo (mínimo 10 caracteres).' };
    const r = { p_extra: null, p_declared_at: gtAt(when, tm.value) }; if (needReason) { r.p_extra = false; r.p_reason = ta.value.trim(); } return r; };
  if (mode === 'declare') {
    const tm = el('input', { type: 'time', id: 'mx-t', value: sEnd }), [lbl, ta] = area('mx-r', 'Motivo de no haber cerrado a tiempo');
    const need = !lateDay;
    return ask(lateDay ? 'Hora real de salida' : 'Cierre fuera de su horario', [el('p', { className: 'info', textContent: lateDay ? `Esta jornada era del ${fmtDate(log.practice_date)} y su horario terminaba a las ${f12(sEnd)} Indique a qué hora terminó realmente; la revisa el equipo de supervisión si se aleja de su horario.` : `Su horario terminaba a las ${f12(sEnd)} Indique a qué hora terminó realmente.` }),
      el('label', { textContent: '¿A qué hora terminó?', htmlFor: 'mx-t' }), tm, ...(need ? [lbl, ta] : [])], () => realExit(tm, need, ta));
  }
  if (mode === 'before') {
    const [lbl, ta] = area('mx-r', `¿Por qué sale antes de las ${f12(sEnd)}?`);
    return ask('Sale antes de su horario', [el('p', { className: 'info', textContent: `Su horario terminaba a las ${f12(sEnd)}` }), lbl, ta], () =>
      ta.value.trim().length < 10 ? { error: 'Explique el motivo (mínimo 10 caracteres).' } : { p_reason: ta.value.trim() });
  }
  const [l1, t1] = area('mx-r', 'Explique qué hizo en ese tiempo extra'), box = el('div', { className: 'hidden' }, l1, t1);
  const tm = el('input', { type: 'time', id: 'mx-t' }), [l2, t2] = area('mx-r2', 'Motivo de no haber cerrado a tiempo');
  const box2 = el('div', { className: 'hidden' }, el('label', { textContent: '¿A qué hora terminó realmente?', htmlFor: 'mx-t' }), tm, l2, t2);
  const yn = yesNo('mx', 'Sí, trabajé tiempo extra', 'No, olvidé cerrar', () => { box.classList.toggle('hidden', rv('mx') !== '1'); box2.classList.toggle('hidden', rv('mx') !== '0'); });
  return ask('Cierra después de su horario', [el('p', { className: 'info', textContent: `Su horario terminaba a las ${f12(sEnd)} ¿Trabajó tiempo extra?` }), yn, box, box2], () => {
    const x = rv('mx'); if (!x) return { error: 'Elija una opción.' };
    if (x === '1') return t1.value.trim().length < 10 ? { error: 'Explique el tiempo extra (mínimo 10 caracteres).' } : { p_extra: true, p_reason: t1.value.trim() };
    return realExit(tm, true, t2); });
}

// Textos de cómo se registró la entrada y la salida (recibo e historial)
const ADJ = { pending: 'en revisión', approved: 'aprobada', auto: 'aprobada', rejected: 'rechazada' };
function kindRows(x) {
  const out = [];
  if (x.sched_start) out.push(['Horario de ese día', `${f12(x.sched_start)} a ${f12(x.sched_end)}, almuerzo ${x.sched_lunch ?? 0} min`]);
  const side = (kind, reason, adj, st, note, n) => {
    if (!kind) return;
    const bad = st === 'rejected' ? 'bad' : '';
    const t = { extra_antes: `${n} anticipada: tiempo extra`, anticipado: n === 'Entrada' ? `Entrada anticipada: se cuenta desde las ${f12(x.sched_start)}` : 'Salida anticipada',
      tardio: n === 'Entrada' ? 'Entrada registrada tarde' : 'Cierre fuera de horario', declarada: `${n} declarada: ${adj ? fmtTime(adj) : ''} (${ADJ[st] || ''})`,
      extra_despues: 'Salida con tiempo extra', cierre_tardio: `Salida declarada: ${adj ? fmtTime(adj) : ''} (${ADJ[st] || ''})` }[kind];
    const lb = n === 'Entrada' ? 'Registro de entrada' : 'Registro de salida';
    if (kind === 'tardio' && n === 'Salida' && adj) out.push([lb, `Salida declarada: ${fmtTime(adj)} (${ADJ[st] || ''})`, bad]); else if (t) out.push([lb, t, bad]);
    if (reason) out.push(['Motivo', reason, bad]); if (st === 'rejected' && note) out.push(['Respuesta del equipo', note, 'bad']); };
  side(x.entry_kind, x.entry_reason, x.entry_adj_at, x.entry_adj_status, x.entry_note, 'Entrada');
  side(x.exit_kind, x.exit_reason, x.exit_adj_at, x.exit_adj_status, x.exit_note, 'Salida');
  return out;
}

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') route(); });
route();
