// Alimentação de Dados - melhorias leves de UX e validação
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.querySelector('form[action=""], form:not([action])') || document.querySelector('form');
    if(!form) return;

    const matricula = form.querySelector('input[name="matricula"]');
    const nome = form.querySelector('input[name="nome"]');
    const supervisor = form.querySelector('input[name="supervisor"]');
    const data = form.querySelector('input[name="data"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    // 1) Supervisor sempre maiúsculas durante digitação
    supervisor?.addEventListener('input', () => {
      const pos = supervisor.selectionStart;
      supervisor.value = supervisor.value.toUpperCase();
      // Restaura posição do cursor
      try { supervisor.setSelectionRange(pos, pos); } catch(_) {}
    });

    // 2) Matrícula: somente números, remove sinais e espaços
    matricula?.addEventListener('input', () => {
      const cleaned = (matricula.value || '').replace(/\D+/g, '');
      if (cleaned !== matricula.value) matricula.value = cleaned;
    });

    // 3) Data padrão: hoje (se vazio)
    if (data && !data.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      data.value = `${yyyy}-${mm}-${dd}`;
    }

    // 4) Evita duplo submit e respeita overlay de loading do base
    form.addEventListener('submit', (ev) => {
      // Se o navegador já acusar inválido, não desabilita
      if (!form.checkValidity()) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('disabled');
      }
      // Mostra overlay rápido para feedback
      if (window.AppLoading && AppLoading.show) {
        setTimeout(() => AppLoading.show(), 0);
      }
    }, true);
  });
})();
