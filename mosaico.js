const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id), TZ = 'America/Guatemala', MAX_TILES = 60, TTL = 3600;
const h = (t, p = {}, ...k) => { const e = document.createElement(t);
  for (const [a, v] of Object.entries(p)) a === 'onclick' ? e.onclick = v : e[a] = v; k.flat().forEach(x => e.append(x)); return e; };
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fT = d => d ? new Date(d).toLocaleTimeString('es-GT', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
const ls = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let students = {}, logs = [], urls = {}, paused = false, io, big, seed = 1, ready = false;
$('sz').value = ls('mosSz') || 150; $('mode').value = ls('mosLay') === 'grid' ? 'grid' : 'collage';

const show = (l, a) => { $('boot').classList.add('hidden'); $('login').classList.toggle('hidden', !l); $('app').classList.toggle('hidden', !a); };
// Cierra todo: detiene y suelta los videos y borra datos y enlaces de la memoria (nada queda detrás del login).
function wipe() {
  ready = false; io?.disconnect(); big?.querySelector('.t button')?.click();
  document.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  $('grid').replaceChildren(); students = {}; logs = []; urls = {}; $('info').textContent = ''; $('msg2').textContent = '';
}
const gate = (msg = '') => { wipe(); $('msg').textContent = msg; show(true, false); };
const expired = e => /JWT|expired|not authenticated/i.test(e?.message || '');
// Disposición del collage: PRNG con semilla, estable hasta pulsar «Mezclar».
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const SHAPES = [[1, 2, 35], [1, 1, 25], [2, 2, 15], [1, 3, 10], [2, 3, 15]];   // [columnas, filas, peso]: cuadros y rectángulos
const pick = r => { let n = r() * 100; for (const [w, hh, p] of SHAPES) if ((n -= p) < 0) return [w, hh]; return [1, 2]; };

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return gate();
  const r = await sb.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
  if (r.data?.role !== 'admin') return gate('Esta cuenta no tiene permisos de administrador.');
  show(false, true); ready = true;
  const s = await sb.from('students').select('id,full_name,grade,practice_place,institution');
  if (s.error) return expired(s.error) ? gate('Su sesión venció. Entre de nuevo.') : $('msg2').textContent = s.error.message;
  if (!ready) return;
  students = Object.fromEntries(s.data.map(x => [x.id, x]));
  const gr = [...new Set(s.data.map(x => x.grade))].sort();
  $('g').replaceChildren(h('option', { value: '', textContent: 'Todos los grados' }), ...gr.map(g => h('option', { value: g, textContent: g })));
  const last = await sb.from('daily_logs').select('practice_date').not('video_path', 'is', null).order('practice_date', { ascending: false }).limit(1);
  $('d').value = last.data?.[0]?.practice_date || todayGT();   // la bitácora con video más reciente
  load();
}
async function load() {
  if (!ready) return;
  $('msg2').textContent = ''; $('grid').replaceChildren(h('p', { className: 'empty', textContent: 'Cargando…' }));
  const l = await sb.from('daily_logs').select('id,student_id,practice_date,entry_at,exit_at,status,closed_late,video_path,main_activity')
    .eq('practice_date', $('d').value).not('video_path', 'is', null).order('entry_at').limit(500);
  if (l.error) return expired(l.error) ? gate('Su sesión venció. Entre de nuevo.') : $('msg2').textContent = l.error.message;
  if (!ready) return;
  logs = l.data; urls = {};
  render();
}
async function ensureUrls() {   // firma de una sola vez los videos que se van a mostrar y aún no tienen enlace
  const need = visible().slice(0, MAX_TILES).map(x => x.video_path).filter(p => !urls[p]);
  if (!need.length) return true;
  const r = await sb.storage.from('practice-videos').createSignedUrls(need, TTL);
  if (r.error) { if (expired(r.error)) gate('Su sesión venció. Entre de nuevo.'); else $('msg2').textContent = 'No se pudieron generar los enlaces: ' + r.error.message; return false; }
  r.data.forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); return true;
}
const visible = () => { const q = $('q').value.toLowerCase(), g = $('g').value;
  return logs.filter(x => { const s = students[x.student_id]; return s && (!g || s.grade === g) && (`${s.full_name} ${s.practice_place}`).toLowerCase().includes(q); }); };
async function render() {
  if (!ready || !await ensureUrls() || !ready) return;
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { const v = e.target;
    if (e.isIntersecting) { if (!paused) v.play().catch(() => {}); } else v.pause(); }), { rootMargin: '150px' });
  const sz = +$('sz').value, collage = $('mode').value === 'collage', gd = $('grid');
  document.documentElement.style.setProperty('--sz', sz + 'px');
  const cols = Math.max(2, Math.floor((gd.clientWidth || innerWidth - 16) / (sz + 4)));
  gd.style.setProperty('--cols', cols); gd.className = (collage ? 'collage' : '') + (sz < 150 ? ' sm' : '');
  $('sh').classList.toggle('hidden', !collage);
  const all = visible(), list = all.slice(0, MAX_TILES), rnd = rng(seed);
  $('info').textContent = `${all.length} ${all.length === 1 ? 'video' : 'videos'}` + (all.length > MAX_TILES ? ` (se muestran ${MAX_TILES}; filtre por grado o nombre)` : '');
  if (!list.length) return gd.replaceChildren(h('p', { className: 'empty', textContent: 'No hay videos para esa fecha y filtros.' }));
  gd.replaceChildren(...list.map(x => {
    const [w0, hh] = pick(rnd), w = Math.min(w0, cols), s = students[x.student_id], u = urls[x.video_path];
    const tile = (c, ...k) => { const t = h('div', { className: c + (collage ? ` k${w}${hh}` : '') }, ...k);
      if (collage) { t.style.setProperty('--w', w); t.style.setProperty('--h', hh); } return t; };
    const cap = h('div', { className: 'cap' }, h('b', { textContent: s.full_name }),
      h('span', { textContent: `${s.grade} · ${s.practice_place} · ${fT(x.entry_at)}${x.exit_at ? '–' + fT(x.exit_at) : ''}` }));
    if (!u) return tile('tile bad', 'Video no disponible', cap);
    const v = h('video', { src: u, muted: true, loop: true, playsInline: true, preload: 'auto' });
    v.muted = true; v.setAttribute('muted', ''); v.onerror = () => v.replaceWith(h('div', { className: 'bad' }, 'No se pudo cargar'));
    io.observe(v);
    const t = tile('tile', v, cap, x.closed_late ? h('div', { className: 'tag', textContent: 'Cierre tardío' }) : '');
    t.title = 'Clic para ver en grande con sonido'; t.onclick = () => open(x, s, u); return t;
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
$('g').onchange = $('q').oninput = render;
$('sz').oninput = () => { lset('mosSz', $('sz').value); render(); };   // cambia en vivo al arrastrar
$('mode').onchange = () => { lset('mosLay', $('mode').value); render(); };
$('sh').onclick = () => { seed = (seed * 7919 + 13) % 100003; render(); };
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ready && render(), 200); });
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') gate(); });
$('login').onsubmit = async e => { e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value, password: $('pw').value });
  if (error) return $('msg').textContent = 'Credenciales incorrectas.'; start(); };
$('out').onclick = async () => { await sb.auth.signOut(); gate(); };
start();
