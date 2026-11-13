// Instalación como app y avisos (notificaciones push). Lo usan index.html y admin.html.
// Requiere: migracion_v15.sql, la Edge Function «push-send» y la clave pública VAPID guardada en el panel > Avisos.
const Push = (() => {
  let sb = null, reg = null, deferred = null;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
  const capable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const msgs = {
    AVISOS_NO_CONFIGURADOS: 'Los avisos todavía no están configurados por el administrador.',
    PERMISO_DENEGADO: 'No se dio permiso para los avisos. Puede activarlo en los ajustes del navegador o de la app.',
    SIN_DISPOSITIVO: 'Active primero los avisos en este dispositivo.',
    ESPERE_UN_MINUTO: 'Espere un minuto antes de pedir otro aviso de prueba.'
  };
  const text = e => msgs[e?.message] || msgs[(e?.message || '').match(/[A-Z_]{6,}/)?.[0]] || 'No se pudo completar la acción. Intente de nuevo.';
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('push-state')); });
  window.addEventListener('appinstalled', () => { deferred = null; document.dispatchEvent(new Event('push-state')); });

  const key = b64 => { const p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function init(client, path = 'sw.js') {
    sb = client;
    if (!('serviceWorker' in navigator)) return;
    try { reg = await navigator.serviceWorker.register(path); } catch { return; }
    if (capable() && Notification.permission === 'granted') {   // mantiene al día la suscripción de este dispositivo
      try { const s = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (s) await save(s); } catch {}
    }
  }
  async function save(s) {
    const j = s.toJSON();
    const { error } = await sb.rpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: ua.slice(0, 280) });
    if (error) throw error;
  }
  async function current() { try { return capable() ? await (await navigator.serviceWorker.ready).pushManager.getSubscription() : null; } catch { return null; } }
  async function config() { const { data } = await sb.rpc('push_config'); return data || {}; }

  async function enable() {
    const cfg = await config();
    if (!cfg.vapid_public) throw new Error('AVISOS_NO_CONFIGURADOS');
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('PERMISO_DENEGADO');
    const r = await navigator.serviceWorker.ready;
    let s = await r.pushManager.getSubscription();
    if (s && s.options?.applicationServerKey && b64url(s.options.applicationServerKey) !== cfg.vapid_public) { await s.unsubscribe(); s = null; }   // cambió la clave
    s = s || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(cfg.vapid_public) });
    await save(s);
  }
  async function disable() {
    const s = await current();
    if (s) { await sb.rpc('delete_push_subscription', { p_endpoint: s.endpoint }); await s.unsubscribe(); }
  }
  async function test() { const { error } = await sb.rpc('push_test'); if (error) throw error; }
  async function install() { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; document.dispatchEvent(new Event('push-state')); }

  const mk = (tag, a, ...kids) => { const n = document.createElement(tag); Object.assign(n, a || {}); kids.flat().forEach(k => n.append(k)); return n; };

  // Dibuja la tarjeta «App y avisos» dentro de box.
  async function card(box, opts = {}) {
    if (!sb) return;
    const st = { capable: capable(), standalone: standalone(), perm: capable() ? Notification.permission : 'unsupported', sub: await current(), cfg: await config() };
    const out = mk('p', { className: 'info', role: 'status' });
    const btn = (label, fn, sec = true) => mk('button', { type: 'button', className: (sec ? 'sec ' : '') + 'small', textContent: label, onclick: async e => {
      const b = e.currentTarget; b.disabled = true; out.textContent = '';
      try { await fn(); } catch (err) { out.textContent = text(err); } finally { b.disabled = false; } } });
    const rows = [mk('b', { textContent: opts.title || 'App y avisos' })];
    const acts = mk('div', { className: 'pacts' });
    const subscribed = !!st.sub && st.perm === 'granted';
    if (!st.standalone && ios) {
      rows.push(mk('p', { className: 'info', textContent: 'Instale la app en su iPhone para recibir avisos y entrar más rápido:' }),
        mk('ol', { className: 'pst' }, mk('li', { textContent: 'Abra esta página en Safari.' }), mk('li', { textContent: 'Toque el botón Compartir (el cuadro con una flecha hacia arriba).' }),
          mk('li', { textContent: 'Elija «Añadir a pantalla de inicio» y toque Añadir.' }), mk('li', { textContent: 'Abra la app desde su ícono nuevo y entre con su cuenta (una sola vez).' })));
    } else if (!st.standalone && deferred) {
      rows.push(mk('p', { className: 'info', textContent: 'Instálela para abrirla como una app y recibir avisos.' })); acts.append(btn('Instalar la app', install, false));
    }
    if (st.capable && !(ios && !st.standalone)) {
      if (!st.cfg.vapid_public) rows.push(mk('p', { className: 'info', textContent: 'Los avisos aún no están habilitados por el administrador.' }));
      else if (st.perm === 'denied') rows.push(mk('p', { className: 'info', textContent: 'Los avisos están bloqueados en este dispositivo. Actívelos en los ajustes del navegador o de la app y vuelva aquí.' }));
      else if (subscribed) {
        rows.push(mk('p', { className: 'info ok', textContent: 'Avisos activados en este dispositivo.' }));
        acts.append(btn('Enviar aviso de prueba', async () => { await test(); out.textContent = 'Enviado: debería llegar en unos segundos.'; }), btn('Desactivar', async () => { await disable(); await card(box, opts); }));
      } else acts.append(btn('Activar avisos', async () => { await enable(); await card(box, opts); }, false));
    } else if (!ios && !st.capable) rows.push(mk('p', { className: 'info', textContent: 'Este navegador no admite avisos. Puede seguir usando la bitácora con normalidad.' }));
    if (opts.compact && st.standalone && subscribed) { rows.length = 1; rows.push(mk('p', { className: 'info ok', textContent: 'Avisos activados.' })); }
    box.replaceChildren(...rows, acts, out); box.classList.remove('hidden');
    if (!box._pl) { box._pl = true; document.addEventListener('push-state', () => card(box, opts)); }
  }
  return { init, card, enable, disable, test, standalone, ios, capable, config, text };
})();
