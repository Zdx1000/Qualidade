(function () {
  if (window.AppTabela) return; // evita montar duas vezes
  window.AppTabela = { bound: new WeakSet() };

  // 1) Confirmação e prevenção de duplo submit nos formulários de exclusão
  const deleteForms = Array.from(document.querySelectorAll('form.js-delete-form'));
  deleteForms.forEach((form) => {
    if (window.AppTabela.bound.has(form)) return;
    window.AppTabela.bound.add(form);

    form.addEventListener(
      'submit',
      (e) => {
        // Evita reenvio
        if (form.dataset.submitted === '1') {
          e.preventDefault();
          return;
        }

        const message = form.dataset.confirmMessage || '⚠️ Confirma excluir este registro?';
        if (!window.confirm(message)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return false;
        }

        // Confirmado: desabilita botão e mostra overlay
        const btn = form.querySelector('button[type="submit"], .btn');
        if (btn) {
          btn.disabled = true;
          btn.classList.add('disabled');
        }
        form.dataset.submitted = '1';

        // Mostra overlay (se disponível)
        if (window.AppLoading && typeof window.AppLoading.show === 'function') {
          setTimeout(() => window.AppLoading.show(), 0);
        }
      },
      { capture: true }
    );
  });

  // 2) Foco no primeiro campo de filtro vazio (qualquer input simples)
  const filterForm = document.querySelector('form[method="get"]');
  if (filterForm && (!document.activeElement || document.activeElement === document.body)) {
    const candidates = filterForm.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]');
    for (const el of candidates) {
      if (!el.value) {
        try { el.focus(); } catch (_) {}
        break;
      }
    }
  }

  // 3) Ao clicar em "Exportar XLSX" mostrar overlay para feedback
  const exportLink = document.querySelector('a.btn.btn-success');
  if (exportLink && window.AppLoading && typeof window.AppLoading.show === 'function') {
    exportLink.addEventListener('click', () => {
      setTimeout(() => window.AppLoading.show(), 0);
    }, { once: false });
  }
})();
