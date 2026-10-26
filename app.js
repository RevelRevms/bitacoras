const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const TZ = 'America/Guatemala', MAX = 10 * 1024 * 1024;
const SCREENS = ['s-login','s-profile','s-extra','s-home','s-form','s-done','s-staff'];
let user, student, log, myLogs = [], myNotes = [], myRests = [], video = null; // video = {blob, type, name} (solo para la vista previa local)

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
  TEXTO_DEMASIADO_LARGO: 'Uno de los textos es demasiado largo.'
};
const msg = t => { $('msg').textContent = t || ''; };
const fail = e => { const m = e?.message || String(e);
  msg(Object.entries(ERR).find(([k]) => m.includes(k))?.[1] || 'Error: ' + m); };
const show = id => { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  const hv = id === 's-home' || id === 's-done'; $('hist').classList.toggle('hidden', !hv);
  $('warns').classList.toggle('hidden', !hv || !myNotes.length);
  $('rests').classList.toggle('hidden', !hv || !futureRests().length); if (hv) { renderWarns(); renderRests(); renderHist(); } };
const fmtTime = d => new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false });
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT',
  { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const val = id => $(id).value.trim();
const radio = n => document.querySelector(`input[name=${n}]:checked`)?.value;

async function route() {
  msg('');
  const { data: { session } } = await sb.auth.getSession();
  $('b-out').classList.toggle('hidden', !session);
  if (!session) { user = null; return show('s-login'); }
  user = session.user;
  const rr = await sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();   // cuentas del personal no son estudiantes
  if (!rr.error && ['admin', 'supervisor'].includes(rr.data?.role)) return show('s-staff');
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
  myLogs = r2.data; log = myLogs[0]; myNotes = r3.error ? [] : (r3.data || []);
  myRests = r4.error ? [] : dedupRests(r4.data || []);
  const info = `${student.full_name} · ${PROG[student.program] || 'Tipo sin definir'} · ${student.grade} ${student.section}` +
    (student.institution ? ` · ${student.institution}` : '') + ` · ${student.practice_place}` + (student.supervisor_name ? ` · Supervisor: ${student.supervisor_name}` : '');
  $('who').textContent = $('who2').textContent = info;
  showAvatars();
  if (log?.status === 'in_progress') {
    const late = log.practice_date < todayGT();
    $('late-box').classList.toggle('hidden', !late); $('late-date').textContent = fmtDate(log.practice_date);
    $('started').textContent = `Jornada iniciada a las ${fmtTime(log.entry_at)} (${fmtDate(log.practice_date)})`;
    renderEvidence();
    return show('s-form');
  }
  if (log?.practice_date === todayGT()) return showReceipt();
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
  if (log.closed_late) rows.splice(4, 0, ['Cierre', 'Tardío (jornada de un día anterior)']);
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
async function viewPhoto(path, title) {
  const u = await photoUrl(path); if (!u) return msg('No se pudo cargar la foto.');
  imgPrev = document.activeElement; $('img-big').src = u; $('img-big').alt = title || 'Foto';
  $('img-modal').classList.remove('hidden'); $('img-close').focus();
}
const closeImg = () => { $('img-modal').classList.add('hidden'); $('img-big').removeAttribute('src'); imgPrev?.focus?.(); };
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
$('v-view').onclick = async () => { const r = await sb.storage.from('practice-videos').createSignedUrl(log.video_path, 300);
  if (r.error) return msg('No se pudo cargar el video.');
  const p = $('v-prev'); p.src = r.data.signedUrl; p.classList.remove('hidden'); $('v-view').classList.add('hidden'); };
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
function renderHist() {
  const box = $('hist-list'); box.replaceChildren();
  if (!myLogs.length) return box.append(el('p', { className: 'info', textContent: 'Aún no tiene bitácoras registradas.' }));
  myLogs.forEach(x => {
    const body = el('dl'), row = (k, v, c = '') => { if (v) body.append(el('dt', { className: c, textContent: k }), el('dd', { className: c, textContent: v })); };
    row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
    row('Herramientas', x.tools_used);
    row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
    if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
    row('Tipo de práctica', PROG[x.program]);
    if (x.start_photo_path) body.append(el('dt', { textContent: 'Foto de inicio' }), el('dd', {}, el('button', { type: 'button', className: 'sec',
      textContent: 'Ver foto de inicio', onclick: () => viewPhoto(x.start_photo_path, 'Foto de inicio') })));
    const un = x.status === 'unclosed';
    if (un) { row('Estado', 'Jornada no concluida: la cerró el administrador', 'bad'); row('Motivo', x.admin_note, 'bad'); }
    if (x.closed_late) { row('Cierre tardío', 'Se cerró después del día de la práctica'); row('Motivo del retraso', x.late_reason); }
    if (x.video_path) { const vb = el('div');
      body.append(el('dt', { textContent: 'Video de evidencia' }), el('dd', {}, el('button', { type: 'button', className: 'sec', textContent: 'Ver mi video',
        onclick: async () => { const r = await sb.storage.from('practice-videos').createSignedUrl(x.video_path, 300);
          if (r.error) return vb.textContent = 'No se pudo cargar el video.';
          vb.replaceChildren(el('video', { src: r.data.signedUrl, controls: true, playsInline: true })); } }), vb)); }
    const d = new Date(x.practice_date + 'T12:00:00');
    box.append(el('details', { className: 'hl' }, el('summary', {},
      el('div', { className: 'hd', textContent: d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }) }),
      el('div', { className: 'hm' }, el('b', { textContent: x.main_activity || (un ? 'Jornada no concluida' : 'Jornada en curso') }),
        el('span', { textContent: `Entrada ${fmtTime(x.entry_at)}, salida ${x.exit_at ? fmtTime(x.exit_at) : '—'}` }),
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

// Cambiar la foto de perfil cuando quiera
$('b-avchg').onclick = () => $('av-chg').click();
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
$('b-pic').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return msg('Este navegador no permite usar la cámara. Use el selector de imagen.');
  msg(''); $('pic-modal').classList.remove('hidden');
  try { await openPic(); } catch (err) { closePic();
    msg('No se pudo usar la cámara: ' + err.message + ' Permita el acceso o use el selector de imagen.'); }
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
  const btn = $('b-start'); btn.disabled = true; btn.textContent = 'Subiendo foto…'; msg('');
  const path = `${user.id}/${todayGT()}/start-${crypto.randomUUID()}.jpg`;
  try {
    const up = await sb.storage.from(PH).upload(path, startPhoto, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;                    // si falla la subida NO se inicia la jornada
    const { error } = await sb.rpc('start_workday', { p_photo_path: path });
    if (error) { await sb.storage.from(PH).remove([path]); throw error; }   // limpia el huérfano
    startPhoto = null; $('sp-file').value = ''; $('sp-prev').classList.add('hidden');
    $('sp-info').textContent = 'Tome una foto en su lugar de práctica para poder iniciar la jornada.';
    route();
  } catch (err) { fail(err); }
  finally { btn.textContent = 'INICIAR JORNADA'; updateStart(); } };

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
  if (!window.MediaRecorder) return msg('Este navegador no permite grabar. Use el selector de archivo.');
  msg(''); $('rec-modal').classList.remove('hidden'); $('rec-start').textContent = 'Iniciar grabación';
  $('rec-flip').disabled = $('rec-cam').disabled = $('rec-mic').disabled = false; rec = null;
  ac?.close(); ac = new AudioContext();
  try { await openCam(); } catch (err) { closeCam();
    msg('No se pudo usar cámara y micrófono: ' + err.message + ' Permita el acceso o use el selector de archivo.'); }
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
  const btn = $('b-send'); btn.disabled = true; btn.textContent = 'Registrando bitácora…';
  try {
    const { data, error } = await sb.rpc('submit_workday', {
      p_activities: val('a-act'), p_main_activity: val('a-main'), p_learning: val('a-learn'),
      p_tools_used: val('a-tools') || null, p_supervised: radio('sup') === '1',
      p_has_incident: inc, p_incident_description: inc ? val('i-desc') : null,
      p_incident_reported: inc ? radio('rep') === '1' : null,
      p_video_path: null, p_video_original_name: null, p_late_reason: late ? val('a-late') : null });
    if (error) throw error;
    log = data; myLogs = [data, ...myLogs.filter(x => x.id !== data.id)]; video = null; showReceipt();
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = 'FINALIZAR Y ENVIAR BITÁCORA'; }
};

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') route(); });
route();
