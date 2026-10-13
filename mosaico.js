const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala', MAX_TILES = 60, TTL = 3600;
const h = (t, p = {}, ...k) => { const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) a === 'onclick' ? e.onclick = v : e[a] = v; k.flat().forEach(x => e.append(x)); return e; };
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fT = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
let students = {}, logs = [], urls = {}, paused = false, io, big;
const show = (l, a) => { $('login').classList.toggle('hidden', !l); $('app').classList.toggle('hidden', !a); };

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(true, false);
  const r = await sb.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
  if (r.data?.role !== 'admin') { $('msg').textContent = 'Esta cuenta no tiene permisos de administrador.'; return show(true, false); }
  show(false, true);
  const s = await sb.from('students').select('id,full_name,grade,practice_place,institution');
  if (s.error) return $('msg2').textContent = s.error.message;
  students = Object.fromEntries(s.data.map(x => [x.id, x]));
  const gr = [...new Set(s.data.map(x => x.grade))].sort();
  $('g').replaceChildren(h('option', { value: '', textContent: 'Todos los grados' }), ...gr.map(g => h('option', { value: g, textContent: g })));
  // fecha inicial: la bitácora con video más reciente
  const last = await sb.from('daily_logs').select('practice_date').not('video_path', 'is', null).order('practice_date', { ascending: false }).limit(1);
  $('d').value = last.data?.[0]?.practice_date || todayGT();
  load();
}
async function load() {
  $('msg2').textContent = ''; $('grid').replaceChildren(h('p', { className: 'empty', textContent: 'Cargando…' }));
  const l = await sb.from('daily_logs').select('id,student_id,practice_date,entry_at,exit_at,status,closed_late,video_path,main_activity')
    .eq('practice_date', $('d').value).not('video_path', 'is', null).order('entry_at').limit(500);
  if (l.error) return $('msg2').textContent = l.error.message;
  logs = l.data; urls = {};
  if (!await ensureUrls()) return;
  render();
}
async function ensureUrls() {   // firma de una sola vez los videos que se van a mostrar y aún no tienen enlace
  const need = visible().slice(0, MAX_TILES).map(x => x.video_path).filter(p => !urls[p]);
  if (!need.length) return true;
  const r = await sb.storage.from('practice-videos').createSignedUrls(need, TTL);
  if (r.error) { $('msg2').textContent = 'No se pudieron generar los enlaces: ' + r.error.message; return false; }
  r.data.forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); return true;
}
const visible = () => { const q = $('q').value.toLowerCase(), g = $('g').value;
  return logs.filter(x => { const s = students[x.student_id]; return s && (!g || s.grade === g) && (`${s.full_name} ${s.practice_place}`).toLowerCase().includes(q); }); };
async function render() {
  if (!await ensureUrls()) return;
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { const v = e.target;
    if (e.isIntersecting) { if (!paused) v.play().catch(() => {}); } else v.pause(); }), { rootMargin: '150px' });
  document.documentElement.style.setProperty('--sz', $('sz').value + 'px');
  const all = visible(), list = all.slice(0, MAX_TILES);
  $('info').textContent = `${all.length} ${all.length === 1 ? 'video' : 'videos'}` + (all.length > MAX_TILES ? ` (se muestran ${MAX_TILES}; filtre por grado o nombre)` : '');
  if (!list.length) return $('grid').replaceChildren(h('p', { className: 'empty', textContent: 'No hay videos para esa fecha y filtros.' }));
  $('grid').replaceChildren(...list.map(x => {
    const s = students[x.student_id], u = urls[x.video_path];
    const cap = h('div', { className: 'cap' }, h('b', { textContent: s.full_name }),
      h('span', { textContent: `${s.grade} · ${s.practice_place} · ${fT(x.entry_at)}${x.exit_at ? '–' + fT(x.exit_at) : ''}` }));
    if (!u) return h('div', { className: 'tile bad' }, 'Video no disponible', cap);
    const v = h('video', { src: u, muted: true, loop: true, playsInline: true, preload: 'auto' });
    v.muted = true; v.setAttribute('muted', ''); v.onerror = () => v.replaceWith(h('div', { className: 'bad' }, 'No se pudo cargar'));
    io.observe(v);
    return h('div', { className: 'tile', title: 'Clic para ver en grande con sonido', onclick: () => open(x, s, u) }, v, cap,
      x.closed_late ? h('div', { className: 'tag', textContent: 'Cierre tardío' }) : '');
  }));
}
function open(x, s, u) {
  if (big) return;
  const prev = document.activeElement, v = h('video', { src: u, controls: true, autoplay: true, playsInline: true });
  const close = () => { v.pause(); v.removeAttribute('src'); v.load(); document.removeEventListener('keydown', k);
    document.body.classList.remove('noscroll'); big.remove(); big = null; prev?.focus?.(); };
  const k = e => { if (e.key === 'Escape') close(); };
  const b = h('button', { type: 'button', textContent: '✕ Cerrar', onclick: close });
  big = h('div', { className: 'big', role: 'dialog', ariaModal: 'true' }, h('div', { className: 't' },
    h('span', { textContent: `${s.full_name} · ${x.practice_date}${x.main_activity ? ' · ' + x.main_activity : ''}` }), b), v);
  document.body.append(big); document.body.classList.add('noscroll'); document.addEventListener('keydown', k); b.focus();
}
$('pp').onclick = () => { paused = !paused; $('pp').textContent = paused ? 'Reanudar todo' : 'Pausar todo';
  document.querySelectorAll('#grid video').forEach(v => paused ? v.pause() : v.play().catch(() => {})); };
$('d').onchange = $('re').onclick = load;
$('g').onchange = $('q').oninput = $('sz').onchange = render;
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { await sb.auth.signOut(); show(true, false); };
start();
