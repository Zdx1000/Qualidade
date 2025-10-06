// Input*Dados - JS exclusivo da página para validação leve do upload
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.querySelector('form[data-loading="true"][action*="/input-dados"]') || document.querySelector('form[action*="/input-dados"]');
    if(!form) return;

    const fileInput = form.querySelector('#file');
    const submitBtn = form.querySelector('button[type="submit"]');
    const feedback = document.getElementById('fileFeedback');
    const allowedExtensions = ['.xlsx', '.xls', '.xlsb'];

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
      const files = Array.from(fileInput?.files || []);
      if(!files.length){ return false; }
      const invalidFile = files.find((file) => {
        const name = file.name.toLowerCase();
        return !allowedExtensions.some((ext) => name.endsWith(ext));
      });
      if(invalidFile){
        if(fileInput){
          fileInput.setCustomValidity('Selecione arquivos com extensões .xlsx, .xls ou .xlsb');
          // exibe UI nativa do navegador
          fileInput.reportValidity();
        }
        if(feedback){
          feedback.textContent = `Formato inválido: ${invalidFile.name}. Aceitos: .xlsx, .xls, .xlsb`;
          feedback.classList.add('text-danger');
        }
        return false;
      }
      if(feedback){
        if(files.length === 1){
          const single = files[0];
          feedback.textContent = `${single.name} ${humanSize(single.size) ? '('+humanSize(single.size)+')' : ''}`;
        } else {
          const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
          const names = files.map((f) => f.name).join(', ');
          feedback.textContent = `${files.length} arquivos selecionados (${humanSize(totalSize)}) - ${names}`;
        }
      }
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
