// Botón «ojo» para mostrar u ocultar la contraseña en los formularios de ingreso.
// Se aplica a los campos de contraseña que ya están en la página al cargar.
(function () {
  const css = document.createElement('style');
  css.textContent = '.pw-wrap{position:relative;display:block}.pw-wrap>input{padding-right:52px!important;width:100%!important;box-sizing:border-box}' +
    '.pw-wrap>.pw-eye{all:unset!important;box-sizing:border-box!important;position:absolute!important;right:0!important;top:0!important;bottom:0!important;width:48px!important;min-height:0!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;color:inherit!important;background:none!important;border:0!important;box-shadow:none!important;opacity:.7!important}' +
    '.pw-wrap>.pw-eye:hover{opacity:1}.pw-wrap>.pw-eye:focus-visible{outline:3px solid #ffe14d!important;outline-offset:-3px;opacity:1}.pw-eye svg{width:24px;height:24px;pointer-events:none}.pw-eye .off{display:none}.pw-eye[aria-pressed=true] .on{display:none}.pw-eye[aria-pressed=true] .off{display:block}';
  document.head.append(css);
  const ico = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<g class="on"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></g>' +
    '<g class="off"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></g></svg>';
  document.querySelectorAll('input[type=password]').forEach(inp => {
    const wrap = document.createElement('span'); wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.append(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye'; b.tabIndex = 0;
    b.setAttribute('aria-label', 'Mostrar contraseña'); b.setAttribute('aria-pressed', 'false'); b.innerHTML = ico;
    b.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña'); inp.focus(); };
    wrap.append(b);
  });
})();
