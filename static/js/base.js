// JS global do layout base: toasts e menu mobile
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    // Auto-dismiss de toasts depois de alguns segundos
    try {
      const toasts = document.querySelectorAll('.toast.show');
      toasts.forEach((el) => {
        const isDanger = el.classList.contains('text-bg-danger');
        const isSuccess = el.classList.contains('text-bg-success');
        const delay = isDanger ? 7000 : isSuccess ? 3500 : 5000; // mais tempo para erros
        // Garante instância do Bootstrap Toast
        const inst = bootstrap && bootstrap.Toast ? bootstrap.Toast.getOrCreateInstance(el, { autohide: true, delay }) : null;
        // Se não houver bootstrap, fallback simples
        if (inst) {
          // Se já não estiver visível pelo controle do Bootstrap, mostra e deixa autohide agir
          try { inst.show(); } catch(_) {}
        } else {
          setTimeout(() => { el.classList.remove('show'); el.classList.add('hide'); }, delay);
        }
      });
    } catch(_) { /* ignora */ }

    // Fechar menu mobile ao clicar em um link
    try {
      const mobileNav = document.getElementById('mobileNav');
      if (mobileNav) {
        mobileNav.addEventListener('click', (ev) => {
          const a = ev.target.closest('a');
          if (!a) return;
          // Fecha collapse
          if (window.bootstrap && bootstrap.Collapse) {
            const collapse = bootstrap.Collapse.getOrCreateInstance(mobileNav, { toggle: false });
            collapse.hide();
          } else {
            // Fallback: remove classe 'show' do collapse do Bootstrap
            mobileNav.classList.remove('show');
          }
        });
      }
    } catch(_) { /* ignora */ }
  });
})();

// Troca de tema (modes) com persistência
(function(){
  function applyTheme(themeName, bsTheme){
    try {
      const link = document.getElementById('theme-css');
      if (link) {
        // 'styles' volta para o arquivo base styles.css
        const href = themeName === 'styles' ? '/static/css/styles.css' : `/static/css/${themeName}.css`;
        link.href = href;
      }
      // Ajusta data-bs-theme para componentes Bootstrap que respeitam tema
      if (bsTheme) document.documentElement.setAttribute('data-bs-theme', bsTheme);
      // Guarda preferência
      try { localStorage.setItem('app.theme', themeName); } catch(_) {}
      try { localStorage.setItem('app.bsTheme', bsTheme || 'light'); } catch(_) {}

      // Atualiza UI do botão (nome e bolinha de cor)
      const NAME_MAP = { 'styles': 'Padrão', 'styles-2': 'Azul', 'styles-3': 'Vermelho', 'styles-4': 'Verde' };
      const DOT_MAP = { 'styles': '#6c757d', 'styles-2': '#1d9bf0', 'styles-3': '#ef4444', 'styles-4': '#22c55e' };
      const nameEl = document.getElementById('current-theme-name');
      const dotEl = document.getElementById('current-theme-dot');
      if (nameEl) nameEl.textContent = NAME_MAP[themeName] || 'Padrão';
      if (dotEl) dotEl.style.background = DOT_MAP[themeName] || '#6c757d';
    } catch(_) {}
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Restaurar tema salvo
    try {
      const saved = localStorage.getItem('app.theme');
      const savedBs = localStorage.getItem('app.bsTheme');
      // Se 'styles-1' (Dark) estiver salvo, faz fallback para 'styles' (Padrão)
      const effective = (saved === 'styles-1') ? 'styles' : saved;
      if (effective) applyTheme(effective, (effective === 'styles') ? 'light' : (savedBs || 'light'));
    } catch(_) {}

    // Bind nos itens de seleção de tema
    document.querySelectorAll('.theme-select').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const theme = el.getAttribute('data-theme');
        const bsTheme = el.getAttribute('data-bs-theme') || 'light';
        if (!theme) return;
        applyTheme(theme, bsTheme);
      });
    });
  });
})();
