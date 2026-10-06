const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala';
let students = [], logs = [];
const h = (t, p = {}, ...k) => { const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) a === 'onclick' ? e.onclick = v : e[a] = v;
  k.flat().forEach(x => e.append(x)); return e; };
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fD = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fT = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false }) : '—';
const show = (login, app) => { $('login').classList.toggle('hidden', !login); $('app').classList.toggle('hidden', !app); };

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(true, false);
  const r = await sb.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
  if (r.data?.role !== 'admin') { $('msg').textContent = 'Esta cuenta no tiene permisos de administrador.'; return show(true, false); }
  $('msg').textContent = ''; show(false, true); load();
}
async function load() {
  const [s, l] = await Promise.all([
    sb.from('students').select('*').order('full_name'),
    sb.from('daily_logs').select('*').order('practice_date', { ascending: false }).limit(5000)]);
  if (s.error || l.error) return $('msg').textContent = (s.error || l.error).message;
  students = s.data; logs = l.data; render();
}
function render() {
  const today = todayGT(), byId = Object.fromEntries(students.map(s => [s.id, s]));
  const k = [['Estudiantes activos', students.filter(s => s.active).length],
    ['Bitácoras de hoy', logs.filter(x => x.practice_date === today).length],
    ['Jornadas en curso', logs.filter(x => x.status === 'in_progress').length],
    ['Finalizadas hoy', logs.filter(x => x.practice_date === today && x.status === 'submitted').length],
    ['Incidentes (total)', logs.filter(x => x.has_incident).length]];
  $('kpis').replaceChildren(...k.map(([t, v]) => h('div', { className: 'fig' + (t.startsWith('Incid') && v ? ' alert' : '') }, h('b', { textContent: v }), h('span', { textContent: t }))));

  const days = [...Array(14)].map((_, i) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 13 + i); return d.toISOString().slice(0, 10); });
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
  const list = students.filter(s => (!sel.value || s.grade === sel.value) &&
    (`${s.full_name} ${s.practice_place} ${s.institution || ''} ${s.supervisor_name || ''}`).toLowerCase().includes(q));
  $('list').replaceChildren(...list.map(studentRow));
}
const dt = (k, v) => [h('dt', { textContent: k }), h('dd', { textContent: v || '—' })];
const mins = x => x.exit_at ? Math.max(0, Math.round((new Date(x.exit_at) - new Date(x.entry_at)) / 60000)) : 0;
const dur = m => m ? `${Math.floor(m / 60)} h ${m % 60} min` : 'en curso';
function studentRow(s) {
  const mine = logs.filter(x => x.student_id === s.id), inc = mine.filter(x => x.has_incident).length, n = mine.length;
  const ini = s.full_name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const today = todayGT(), tl = mine.find(x => x.practice_date === today), op = mine.find(x => x.status === 'in_progress');
  const led = tl?.status === 'submitted' ? h('div', { className: 'led done', textContent: `Jornada completada, salida ${fT(tl.exit_at)}` })
    : op ? h('div', { className: 'led on', textContent: op.practice_date === today ? `En jornada, entrada ${fT(op.entry_at)}` : `Jornada sin cerrar del ${fD(op.practice_date)}` }) : '';
  const fact = (k, v) => h('div', {}, h('small', { textContent: k }), h('span', { textContent: v || '—' }));
  return h('details', { className: 'stu' }, h('summary', {}, h('div', { className: 'mk', textContent: ini }),
    h('div', { className: 'who' }, h('b', { textContent: s.full_name + (s.active ? '' : ' (inactivo)') }), led,
      h('div', { className: 'facts' }, fact('Lugar de práctica', s.practice_place), fact('Empresa o institución', s.institution),
        fact('Supervisor', s.supervisor_name), fact('Contacto del supervisor', s.supervisor_contact),
        fact('Grado y sección', `${s.grade}, sección ${s.section}`))),
    h('div', { className: 'cnt' }, h('b', { textContent: n }), n === 1 ? ' bitácora' : ' bitácoras',
      inc ? h('em', { textContent: inc === 1 ? '1 incidente' : inc + ' incidentes' }) : ''),
    h('span', { className: 'sign' })),
    h('div', { className: 'inner' }, n ? h('div', { className: 'trace' }, mine.map(logRow))
      : h('p', { className: 'empty', textContent: 'Todavía no ha enviado bitácoras.' })));
}
function logRow(x) {
  const body = h('dl', { className: 'body' });
  const row = (k, v, c = '') => { if (!v) return; const d = h('dd', { textContent: v }); body.append(h('dt', { className: c, textContent: k }), d); };
  row('Actividades', x.activities); row('Actividad principal', x.main_activity); row('Aprendizaje', x.learning);
  row('Herramientas', x.tools_used);
  row('Supervisión', x.supervised == null ? '' : x.supervised ? 'Trabajó bajo supervisión del encargado' : 'Sin supervisión del encargado');
  if (x.has_incident) row('Incidente', `${x.incident_description} (${x.incident_reported ? 'Se informó' : 'No se informó'} al supervisor)`, 'bad');
  if (x.video_path) { const box = h('div', { className: 'vbox' });
    body.append(h('dt', { textContent: 'Video' }), h('dd', {}, h('button', { className: 'sec', textContent: 'Reproducir evidencia', onclick: async () => {
      const r = await sb.storage.from('practice-videos').createSignedUrl(x.video_path, 300);
      if (r.error) return box.textContent = 'No se pudo generar el enlace: ' + r.error.message;
      box.replaceChildren(h('video', { src: r.data.signedUrl, controls: true, playsInline: true }),
        h('a', { href: r.data.signedUrl, target: '_blank', textContent: 'Abrir o descargar (el enlace vence en 5 minutos)' })); } }), box)); }
  const d = new Date(x.practice_date + 'T12:00:00');
  return h('details', { className: 'log' + (x.has_incident ? ' inc' : '') }, h('summary', {},
    h('time', { textContent: d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' }) }),
    h('div', { className: 'who' }, h('b', { textContent: x.main_activity || 'Jornada en curso' }),
      h('span', { textContent: `Entrada ${fT(x.entry_at)}, salida ${fT(x.exit_at)} (${dur(mins(x))})` })),
    h('div', { className: 'marks' }, x.has_incident ? h('em', { textContent: 'Incidente' }) : '', x.video_path ? h('span', { textContent: 'Video' }) : ''),
    h('span', { className: 'sign' })), body);
}
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { await sb.auth.signOut(); $('msg').textContent = ''; show(true, false); };
$('re').onclick = load; $('q').oninput = $('g').onchange = render;
start();
