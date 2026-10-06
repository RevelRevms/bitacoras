const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const TZ = 'America/Guatemala', MAX = 10 * 1024 * 1024;
const SCREENS = ['s-login','s-profile','s-home','s-form','s-done'];
let user, student, log, myLogs = [], video = null; // video = {blob, type, name}

const ERR = {
  JORNADA_YA_INICIADA: 'Ya inició una jornada hoy.',
  JORNADA_ANTERIOR_SIN_CERRAR: 'Tiene una jornada anterior sin cerrar.',
  PERFIL_INEXISTENTE_O_INACTIVO: 'Su perfil no existe o está inactivo.',
  SIN_JORNADA_ABIERTA: 'No hay una jornada abierta.',
  CAMPOS_OBLIGATORIOS_VACIOS: 'Complete los campos obligatorios.',
  INCIDENTE_INCOMPLETO: 'Describa el incidente e indique si se informó al supervisor.',
  VIDEO_NO_ENCONTRADO_EN_STORAGE: 'El video no se subió correctamente.',
  VIDEO_FUERA_DE_LIMITE: 'El video excede el tamaño permitido.'
};
const msg = t => { $('msg').textContent = t || ''; };
const fail = e => { const m = e?.message || String(e);
  msg(Object.entries(ERR).find(([k]) => m.includes(k))?.[1] || 'Error: ' + m); };
const show = id => { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  const hv = id === 's-home' || id === 's-done'; $('hist').classList.toggle('hidden', !hv); if (hv) renderHist(); };
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
  const r1 = await sb.from('students').select('*').eq('id', user.id).maybeSingle();
  if (r1.error) return fail(r1.error);
  student = r1.data;
  if (!student) return show('s-profile');
  const r2 = await sb.from('daily_logs').select('*').eq('student_id', user.id).order('practice_date', { ascending: false }).limit(400);
  if (r2.error) return fail(r2.error);
  myLogs = r2.data; log = myLogs[0];
  const info = `${student.full_name} · ${student.grade} ${student.section} · ${student.practice_place}` +
    (student.institution ? ` · ${student.institution}` : '') + (student.supervisor_name ? ` · Supervisor: ${student.supervisor_name}` : '');
  $('who').textContent = $('who2').textContent = info;
  if (log?.status === 'in_progress') {
    $('started').textContent = `Jornada iniciada a las ${fmtTime(log.entry_at)} (${fmtDate(log.practice_date)})`;
    return show('s-form');
  }
  if (log?.practice_date === todayGT()) return showReceipt();
  $('today').textContent = fmtDate(todayGT());
  show('s-home');
}

function showReceipt() {
  const rows = [['Estudiante', student.full_name], ['Fecha', fmtDate(log.practice_date)],
    ['Entrada', fmtTime(log.entry_at)], ['Salida', fmtTime(log.exit_at)], ['Lugar', log.practice_place],
    ['Actividad principal', log.main_activity], ['Evidencia', 'Video cargado correctamente']];
  const dl = $('receipt'); dl.replaceChildren();
  rows.forEach(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; dl.append(dt, dd); });
  show('s-done');
}

// ---- Historial (solo lectura) ----
const el = (t, p = {}, ...k) => { const e = document.createElement(t);
  Object.entries(p).forEach(([a, v]) => a === 'onclick' ? e.onclick = v : e[a] = v); k.flat().forEach(x => e.append(x)); return e; };
function renderHist() {
  const box = $('hist-list'); box.replaceChildren();
  if (!myLogs.length) return box.append(el('p', { className: 'info', textContent: 'Aún no tiene bitácoras registradas.' }));
  myLogs.forEach(x => {
    const body = el('dl'), row = (k, v, c = '') => { if (v) body.append(el('dt', { className: c, textContent: k }), el('dd', { className: c, textContent: v })); };
    row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
    row('Herramientas', x.tools_used);
    row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
    if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
    if (x.video_path) { const vb = el('div');
      body.append(el('dt', { textContent: 'Video de evidencia' }), el('dd', {}, el('button', { type: 'button', className: 'sec', textContent: 'Ver mi video',
        onclick: async () => { const r = await sb.storage.from('practice-videos').createSignedUrl(x.video_path, 300);
          if (r.error) return vb.textContent = 'No se pudo cargar el video.';
          vb.replaceChildren(el('video', { src: r.data.signedUrl, controls: true, playsInline: true })); } }), vb)); }
    const d = new Date(x.practice_date + 'T12:00:00');
    box.append(el('details', { className: 'hl' }, el('summary', {},
      el('div', { className: 'hd', textContent: d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }) }),
      el('div', { className: 'hm' }, el('b', { textContent: x.main_activity || 'Jornada en curso' }),
        el('span', { textContent: `Entrada ${fmtTime(x.entry_at)}, salida ${x.exit_at ? fmtTime(x.exit_at) : '—'}` }),
        x.has_incident ? el('span', { className: 'tg', textContent: 'Con incidente' }) : '')), body));
  });
}

$('f-login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: val('l-email'), password: $('l-pass').value });
  if (error) return msg('Correo o contraseña incorrectos.'); route(); };
$('b-out').onclick = async () => { await sb.auth.signOut(); route(); };

$('f-profile').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.from('students').insert({ id: user.id, full_name: val('p-name'),
    grade: val('p-grade'), section: val('p-section'), practice_place: val('p-place'),
    institution: val('p-inst') || null, supervisor_name: val('p-sup') || null,
    supervisor_contact: val('p-supc') || null });
  if (error) return fail(error); route(); };

$('b-start').onclick = async () => { $('b-start').disabled = true;
  const { error } = await sb.rpc('start_workday'); $('b-start').disabled = false;
  if (error) return fail(error); route(); };

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
  $('v-info').textContent = `Tamaño: ${mb} MB`;
}
$('v-file').onchange = e => { const f = e.target.files[0]; if (!f) return;
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
    msg(''); $('b-rec').textContent = 'Volver a grabar';
    setVideo(blob, type, 'grabacion.' + (type === 'video/mp4' ? 'mp4' : 'webm')); };
  $('rec-start').disabled = $('rec-flip').disabled = $('rec-cam').disabled = $('rec-mic').disabled = true;
  const tick = () => { $('rec-start').textContent = `Grabando… ${left} s`; if (left-- <= 0) rec.stop(); };
  tick(); tm = setInterval(tick, 1000); rec.start();
};

// ---- Enviar ----
$('f-log').onsubmit = async e => { e.preventDefault(); msg('');
  const inc = radio('inc') === '1';
  if (!video) return msg('Debe grabar o seleccionar un video.');
  if (inc && (!val('i-desc') || !radio('rep'))) return msg(ERR.INCIDENTE_INCOMPLETO);
  const btn = $('b-send'); btn.disabled = true; btn.textContent = 'Subiendo video…';
  const ext = video.type === 'video/mp4' ? 'mp4' : video.type === 'video/quicktime' ? 'mov' : 'webm';
  const path = `${user.id}/${log.practice_date}/${crypto.randomUUID()}.${ext}`;
  try {
    const up = await sb.storage.from('practice-videos').upload(path, video.blob,
      { contentType: video.type, upsert: false });
    if (up.error) throw up.error;               // si falla la subida NO se crea la bitácora
    btn.textContent = 'Registrando bitácora…';
    const { data, error } = await sb.rpc('submit_workday', {
      p_activities: val('a-act'), p_main_activity: val('a-main'), p_learning: val('a-learn'),
      p_tools_used: val('a-tools') || null, p_supervised: radio('sup') === '1',
      p_has_incident: inc, p_incident_description: inc ? val('i-desc') : null,
      p_incident_reported: inc ? radio('rep') === '1' : null,
      p_video_path: path, p_video_original_name: video.name });
    if (error) { await sb.storage.from('practice-videos').remove([path]); throw error; } // limpia huérfano
    log = data; myLogs = [data, ...myLogs.filter(x => x.id !== data.id)]; showReceipt();
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = 'FINALIZAR Y ENVIAR BITÁCORA'; }
};

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') route(); });
route();
