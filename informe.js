// Informe por estudiante, diseñado para papel Carta. Solo personal autorizado: la lectura la controla RLS.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala', NS = 'http://www.w3.org/2000/svg';
const PROG = { practica: 'Práctica Supervisada', prepractica: 'Prepráctica' };
const h = (t, p = {}, ...k) => { const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) e[a] = v; k.flat().forEach(x => e.append(x)); return e; };
const sv = (t, a = {}, ...k) => { const e = document.createElementNS(NS, t);
  for (const [n, v] of Object.entries(a)) e.setAttribute(n, v); k.flat().forEach(x => e.append(x)); return e; };
const fD = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
const fDw = d => new Date(d + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
const fT = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }) : '—';
const fDT = d => new Date(d).toLocaleString('es-GT', { timeZone: TZ, hour12: false, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const mon = d => new Date(d.slice(0, 7) + '-15T12:00:00').toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
const jd = Horas.jornada, fHM = Horas.fHM;
// Marcas de horario de una jornada: tiempo extra, llegadas o salidas fuera del horario, horas regularizadas
const KE = { extra_antes: 'Tiempo extra al entrar', anticipado: 'Llegó antes del horario', tardio: 'Llegada tardía', declarada: 'Entrada regularizada' };
const KX = { extra_despues: 'Tiempo extra al salir', anticipado: 'Salida anticipada', tardio: 'Salida regularizada', cierre_tardio: 'Hora de salida declarada' };
const SV = { approved: ' (aprobada)', auto: '', pending: ' (en revisión)', rejected: ' (rechazada)' };
const regs = x => [x.entry_kind && KE[x.entry_kind] + (x.entry_kind === 'anticipado' ? '' : SV[x.entry_adj_status] || '') + (x.entry_reason ? ': ' + x.entry_reason : ''),
  x.exit_kind && KX[x.exit_kind] + (SV[x.exit_adj_status] || '') + (x.exit_reason ? ': ' + x.exit_reason : '')].filter(Boolean);
// «Volver» cierra esta pestaña (el panel sigue abierto en la otra). Si el navegador no deja cerrarla, abre el panel aquí.
let HOME = 'admin.html', STUDENT = false;
if (new URLSearchParams(location.search).get('embed')) document.documentElement.classList.add('embed');
$('back').onclick = e => { e.preventDefault(); window.close(); setTimeout(() => { location.href = HOME; }, 250); };
let AV = '', S = null, L = [], N = [], from = '', to = '', withText = true;

async function start() {
  const id = new URLSearchParams(location.search).get('s');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return $('msg').textContent = 'Inicie sesión en el panel administrativo y vuelva a abrir el informe.';
  if (session.user.id === id) { HOME = 'index.html'; STUDENT = true; $('back').href = 'index.html'; $('back').textContent = '← Cerrar y volver a mi bitácora'; }
  if (!id) return $('msg').textContent = 'Falta indicar el estudiante. Abra el informe desde su tarjeta en el panel.';
  const [s, l, n] = await Promise.all([
    sb.from('students').select('*').eq('id', id).maybeSingle(),
    sb.from('daily_logs').select('*').eq('student_id', id).order('practice_date', { ascending: true }).limit(2000),
    sb.from('admin_notes').select('*').eq('student_id', id).order('created_at', { ascending: true }).limit(500)]);
  if (s.error || l.error) return $('msg').textContent = 'No se pudo cargar: ' + (s.error || l.error).message;
  if (!s.data) return $('msg').textContent = 'No se encontró al estudiante o su cuenta no tiene permiso.';
  S = s.data; L = l.data || []; N = n.error ? [] : n.data || [];
  if (S.avatar_path) { try { const r = await sb.storage.from('practice-photos').createSignedUrl(S.avatar_path, 3600);
    if (r.data?.signedUrl) { const im = new Image(); im.src = r.data.signedUrl; await im.decode(); AV = im.src; } } catch { AV = ''; } }
  from = L[0]?.practice_date || ''; to = L.at(-1)?.practice_date || '';
  $('print').disabled = false; $('print').onclick = () => print(); draw();
}

function filtros() {
  const d = (v, set) => { const i = h('input', { type: 'date', value: v }); i.onchange = () => { set(i.value); draw(); }; return i; };
  const c = h('input', { type: 'checkbox', checked: withText }); c.onchange = () => { withText = c.checked; draw(); };
  return h('div', { className: 'noprint opts' },
    h('label', {}, 'Desde ', d(from, v => from = v)), h('label', {}, 'Hasta ', d(to, v => to = v)),
    h('label', { className: 'chk' }, c, ' Incluir actividades y aprendizaje de cada día'));
}

function chart(rows) {
  const W = 720, H = 190, pl = 34, pr = 6, pt = 10, pb = 26, w = W - pl - pr, ht = H - pt - pb;
  const mx = Math.max(10, Math.ceil(Math.max(0, ...rows.map(r => r.m || 0)) / 60) + 1);
  const y = hh => pt + ht - (hh / mx) * ht, svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Horas trabajadas por jornada' });
  for (let t = 0; t <= mx; t += mx > 12 ? 4 : 2) { svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(t), y2: y(t), class: 'gl' }),
    sv('text', { x: pl - 6, y: y(t) + 3.5, class: 'ax', 'text-anchor': 'end' }, `${t}`)); }
  const bw = Math.min(22, w / Math.max(rows.length, 1) * .72), step = w / Math.max(rows.length, 1);
  rows.forEach((r, i) => { const cx = pl + step * i + step / 2, x = cx - bw / 2;
    if (r.m === null) { svg.append(sv('rect', { x, y: y(1), width: bw, height: y(0) - y(1), class: 'miss' })); return; }
    const J = jd(r.d), base = Math.min(r.m, J) / 60, ex = Math.max(0, r.m - J) / 60;
    svg.append(sv('rect', { x, y: y(base), width: bw, height: y(0) - y(base), class: r.m >= J ? 'ok' : 'low' }));
    if (ex) svg.append(sv('rect', { x, y: y(base + ex), width: bw, height: y(base) - y(base + ex), class: 'xt' })); });
  svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(8), y2: y(8), class: 'ref' }), sv('text', { x: W - pr, y: y(8) - 4, class: 'ax', 'text-anchor': 'end' }, 'Jornada de 8 h (4 h los sábados)'));
  const every = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((r, i) => { if (i % every === 0) svg.append(sv('text', { x: pl + step * i + step / 2, y: H - 8, class: 'ax', 'text-anchor': 'middle' },
    new Date(r.d + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'short' }))); });
  svg.append(sv('text', { x: 0, y: 8, class: 'ax' }, 'h'));
  return svg;
}

function draw() {
  const A = L.filter(x => (!from || x.practice_date >= from) && (!to || x.practice_date <= to));
  const hs = Horas.summarize(A), inc = A.filter(x => x.has_incident), un = A.filter(x => x.status === 'unclosed' || (x.status === 'in_progress' && x.practice_date < todayGT())),
    late = A.filter(x => x.closed_late), nn = N.filter(n => !n.annulled_at && (!STUDENT || n.kind === 'amonestacion') && (!from || n.created_at.slice(0, 10) >= from) && (!to || n.created_at.slice(0, 10) <= to));
  const rows = A.filter(x => x.status !== 'in_progress' || x.practice_date < todayGT()).map(x => ({ d: x.practice_date, m: Horas.minutes(x) }));
  const kp = (v, k, c = '') => h('div', { className: 'kp ' + c }, h('b', { textContent: v }), h('span', { textContent: k }));
  const lp = S.program, root = $('rep'); root.replaceChildren();
  const bymonth = {}; A.forEach(x => { const k = x.practice_date.slice(0, 7), m = Horas.minutes(x), o = bymonth[k] ||= { n: 0, t: 0, e: 0, i: 0, f: 0 };
    if (m !== null) { o.n++; o.t += m; o.e += Math.max(0, m - jd(x.practice_date)); } if (x.has_incident) o.i++; if (x.status === 'unclosed' || x.closed_late) o.f++; });

  root.append(filtros(),
    h('section', { className: 'page' },
      h('header', { className: 'rh' }, h('div', {}, h('h1', { textContent: 'Informe de ' + (lp === 'prepractica' ? 'prepráctica' : 'práctica supervisada') }),
        h('p', { className: 'per', textContent: A.length ? `Periodo: ${fD(A[0].practice_date)} al ${fD(A.at(-1).practice_date)}` : 'Sin bitácoras en el periodo' })),
        h('div', { className: 'gen', textContent: 'Emitido el ' + fDT(new Date()) })),
      h('div', { className: 'id' },
        AV ? h('img', { className: 'ph', src: AV, alt: 'Foto de ' + S.full_name }) : h('div', { className: 'ph ini', textContent: S.full_name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() }),
        h('div', { className: 'idt' }, h('h2', { textContent: S.full_name }),
        h('dl', {}, ...[['Grado y sección', `${S.grade}, sección ${S.section}`], ['Tipo de práctica', PROG[lp] || 'Sin definir'], ['Estado de la cuenta', S.active ? 'Activo' : 'Inactivo'],
          ['Empresa o institución', S.institution || '—'], ['Dirección', S.practice_place], ['Encargado', [S.supervisor_name, S.supervisor_contact].filter(Boolean).join(' · ') || 'Sin registrar']]
          .flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })])))),
      h('div', { className: 'kps' },
        kp(fHM(hs.total), 'horas trabajadas', 'ok'), kp(hs.days, 'jornadas completadas'), kp(hs.days ? fHM(hs.avg) : '—', 'promedio por jornada'),
        kp(hs.over ? '+' + fHM(hs.over) : '0 h', 'horas extra acumuladas', 'xt'), kp(hs.short, 'jornadas de menos de 8 h', hs.short ? 'low' : ''),
        kp(inc.length, 'incidentes', inc.length ? 'bad' : ''), kp(un.length + late.length, 'sin cerrar o con cierre tardío', un.length + late.length ? 'bad' : ''), kp(nn.filter(n => n.kind === 'amonestacion').length, 'amonestaciones', nn.some(n => n.kind === 'amonestacion') ? 'bad' : '')),
      h('div', { className: 'unit' }, h('h3', { textContent: 'Horas por jornada' }),
      rows.length ? h('figure', {}, chart(rows), h('figcaption', {}, h('i', { className: 'sw ok' }), 'hasta 8 h  ', h('i', { className: 'sw low' }), 'menos de 8 h  ', h('i', { className: 'sw xt' }), 'horas extra  ', h('i', { className: 'sw miss' }), 'sin horas confiables (sin cerrar, no concluida o cierre tardío)'))
        : h('p', { className: 'none', textContent: 'No hay jornadas en este periodo.' })),
      h('div', { className: 'unit' }, h('h3', { textContent: 'Resumen por mes' }),
      Object.keys(bymonth).length ? h('table', { className: 'tb' }, h('thead', {}, h('tr', {}, ...['Mes', 'Jornadas', 'Horas', 'Extras', 'Incidentes', 'Incumplimientos'].map((t, i) => h('th', { textContent: t, className: i ? 'r' : '' })))),
        h('tbody', {}, Object.entries(bymonth).map(([k, o]) => h('tr', {}, h('td', { textContent: mon(k + '-01') }), ...[o.n, fHM(o.t), o.e ? '+' + fHM(o.e) : '—', o.i || '—', o.f || '—'].map(v => h('td', { className: 'r', textContent: v })))))) : ''),
      h('p', { className: 'fine', textContent: 'Las horas se calculan con la hora de entrada y de salida de cada jornada enviada a tiempo, sin contar la hora de almuerzo. Las jornadas sin cerrar, no concluidas o con cierre tardío no tienen hora de salida real y no suman horas. Hora extra es lo que pasa de 8 horas en un mismo día.' })),
    nn.length ? h('section', { className: 'blk' }, h('h3', { textContent: nn.every(n => n.kind === 'amonestacion') ? 'Amonestaciones' : 'Observaciones y amonestaciones' }),
      nn.map(n => h('div', { className: 'nt ' + n.kind }, h('b', { textContent: (n.kind === 'amonestacion' ? 'Amonestación' : 'Observación') + ' · ' + fDT(n.created_at) }), h('p', { textContent: n.note })))) : '',
    h('section', { className: 'blk' }, h('h3', { textContent: 'Registro diario' }),
      A.length ? h('table', { className: 'tb day' }, h('thead', {}, h('tr', {}, ...['Fecha', 'Entrada', 'Salida', 'Horas netas', 'Extra', 'Detalle'].map((t, i) => h('th', { textContent: t, className: i > 0 && i < 5 ? 'r' : '' })))),
        h('tbody', {}, A.map(x => { const J = jd(x.practice_date), m = Horas.minutes(x), tm = Horas.times(x), rv = Horas.review(x), rg = regs(x), st = x.status === 'unclosed' ? 'No concluida (cerrada por la administración)' : x.status === 'in_progress' ? (x.practice_date < todayGT() ? 'Sin cerrar' : 'En curso') : x.closed_late ? 'Cierre tardío' : rv === 'pending' ? 'Hora declarada en revisión (no suma horas todavía)' : rv === 'rejected' ? 'Hora declarada rechazada (no suma horas)' : '';
          return h('tr', { className: x.has_incident || st ? 'flag' : '' },
            h('td', { textContent: fDw(x.practice_date) }), h('td', { className: 'r', textContent: fT(tm ? tm.entry : x.entry_at) }),
            h('td', { className: 'r', textContent: m === null ? '—' : fT(tm.exit) }),
            h('td', { className: 'r ' + (m === null ? '' : m >= J ? 'g' : 'a'), textContent: m === null ? '—' : fHM(m) }),
            h('td', { className: 'r b', textContent: m !== null && m > J ? '+' + fHM(m - J) : '' }),
            h('td', {}, st ? h('div', { className: 'st', textContent: st + (x.late_reason ? ': ' + x.late_reason : '') + (x.admin_note ? ': ' + x.admin_note : '') }) : '',
              rg.length ? h('div', { className: 'rg', textContent: rg.join(' · ') }) : '',
              h('div', { className: 'ma', textContent: x.main_activity || '' }),
              withText && x.activities ? h('div', { className: 'tx' }, h('i', { textContent: 'Actividades: ' }), x.activities) : '',
              withText && x.learning ? h('div', { className: 'tx' }, h('i', { textContent: 'Aprendió: ' }), x.learning) : '',
              x.has_incident ? h('div', { className: 'st', textContent: `Incidente: ${x.incident_description} (${x.incident_reported ? 'se informó' : 'no se informó'} al supervisor)` }) : '')); }))) : h('p', { className: 'none', textContent: 'Sin bitácoras.' })),
    h('section', { className: 'sigs' }, ...['Encargado de la práctica', 'Docente o supervisor', 'Dirección o administración'].map(t => h('div', {}, h('i'), h('span', { textContent: t })))));
}
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
start();
