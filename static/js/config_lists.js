// Configuração de Listas - JS extraído do template
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    async function api(nome, method='GET', body){
      const res = await fetch(`/api/lists/${nome}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res;
    }

    // Adicionar
    document.querySelectorAll('[data-btn-add]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const nome = btn.getAttribute('data-btn-add');
        const input = document.querySelector(`[data-input-novo="${nome}"]`);
        const valor = (input.value || '').trim();
        if (!valor) return;
        const res = await api(nome, 'POST', { valor });
        if (res.ok) location.reload(); else alert('Erro ao adicionar');
      });
    });

    // Editar
    document.querySelectorAll('[data-btn-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nome = btn.getAttribute('data-nome');
        const old = btn.getAttribute('data-valor');
        const novo = prompt('Novo valor:', old);
        if (!novo || novo === old) return;
        const res = await api(nome, 'PUT', { old, new: novo });
        if (res.ok) location.reload(); else alert('Erro ao editar');
      });
    });

    // Remover
    document.querySelectorAll('[data-btn-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nome = btn.getAttribute('data-nome');
        const valor = btn.getAttribute('data-valor');
        if (!confirm(`Remover "${valor}"?`)) return;
        const res = await api(nome, 'DELETE', { valor });
        if (res.ok) location.reload(); else alert('Erro ao remover');
      });
    });
  });
})();
