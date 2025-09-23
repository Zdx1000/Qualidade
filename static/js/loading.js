(function(){
  const overlay = document.getElementById('loadingOverlay');
  if(!overlay){ return; }

  function show(){ overlay.classList.add('active'); }
  function hide(){ overlay.classList.remove('active'); }

  // Expor para outras integrações, se necessário
  window.AppLoading = { show, hide };

  // Ativa em forms com data-loading="true"
  document.addEventListener('submit', function(ev){
    const form = ev.target;
    if(!(form instanceof HTMLFormElement)) return;
    if(form.dataset.loading !== 'true') return;

    // Só mostrar loading se tiver input file com arquivo selecionado
    const fileInputs = form.querySelectorAll('input[type="file"]');
    let hasFile = false;
    fileInputs.forEach(inp => { if(inp.files && inp.files.length > 0) hasFile = true; });

    if(hasFile){
      // Dá chance do navegador começar o submit e já mostra o overlay
      // Evita trabalho pesado no handler
      setTimeout(show, 0);
    }
  }, true);

  // Também ativar via clique do botão submit (melhor timing para uploads grandes)
  document.addEventListener('click', function(ev){
    const btn = ev.target;
    if(!(btn instanceof HTMLElement)) return;
    if(btn.tagName !== 'BUTTON') return;
    const form = btn.closest('form');
    if(!form) return;
    if(form.dataset.loading !== 'true') return;

    const type = (btn.getAttribute('type') || 'submit').toLowerCase();
    if(type !== 'submit') return;

    const fileInputs = form.querySelectorAll('input[type="file"]');
    let hasFile = false;
    fileInputs.forEach(inp => { if(inp.files && inp.files.length > 0) hasFile = true; });
    if(hasFile){ setTimeout(show, 0); }
  }, true);
})();
