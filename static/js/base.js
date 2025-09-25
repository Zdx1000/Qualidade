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
