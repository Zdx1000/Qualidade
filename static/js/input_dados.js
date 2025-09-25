// Input*Dados - JS exclusivo da página para validação leve do upload
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.querySelector('form[data-loading="true"][action*="/input-dados"]') || document.querySelector('form[action*="/input-dados"]');
    if(!form) return;

    const fileInput = form.querySelector('#file');
    const submitBtn = form.querySelector('button[type="submit"]');
    const feedback = document.getElementById('fileFeedback');

    function clearFeedback(){
      if(feedback){ feedback.textContent = ''; feedback.classList.remove('text-danger'); }
      if(fileInput){ fileInput.setCustomValidity(''); }
    }

    function humanSize(bytes){
      if (bytes === 0 || isNaN(bytes)) return '';
      const mb = bytes / (1024*1024);
      return `${mb.toFixed(2)} MB`;
    }

    function validate(){
      clearFeedback();
      const f = fileInput?.files && fileInput.files[0];
      if(!f){ return false; }
      const valid = f.name.toLowerCase().endsWith('.xlsx');
      if(!valid){
        if(fileInput){
          fileInput.setCustomValidity('Selecione um arquivo com extensão .xlsx');
          // exibe UI nativa do navegador
          fileInput.reportValidity();
        }
        if(feedback){
          feedback.textContent = 'Formato inválido. Envie um arquivo .xlsx';
          feedback.classList.add('text-danger');
        }
        return false;
      }
      if(feedback){ feedback.textContent = `${f.name} ${humanSize(f.size) ? '('+humanSize(f.size)+')' : ''}`; }
      return true;
    }

    fileInput?.addEventListener('change', validate);

    form.addEventListener('submit', function(ev){
      // valida de novo no submit
      if(!validate()){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return false;
      }
      // evita duplo submit
      if(submitBtn){ submitBtn.disabled = true; submitBtn.classList.add('disabled'); }
      return true;
    }, true);
  });
})();
