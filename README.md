# QUALIDADE INTEGRAÇÂO

Aplicação web Flask com SQLite para alimentar e consultar dados de colaboradores, com listas configuráveis.

## Requisitos
- Python 3.11+
- Windows PowerShell (comandos abaixo funcionam)

## Instalação
1. (Opcional) criar e ativar venv
2. Instalar dependências
3. Executar servidor

## Comandos
```
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; $env:FLASK_APP="servidor.py"; python servidor.py
```

Após executar, acesse: http://127.0.0.1:5000/

## Funcionalidades
- Alimentação: formulário com campos requeridos e validações básicas; Supervisor salvo em MAIÚSCULO; botão "Config Lists" em cada select.
- Tabela: exibe registros com filtros por Data mínima e máxima; paginação; exportação para XLSX preservando filtros.
- Config Lists: gerenciamento (adicionar/editar/remover) das listas Tipo, Setor, Área, Turno, Integração.

## Notas
- O banco SQLite é criado em `instance/qualidade.db`. Os valores padrão das listas são semeados automaticamente no primeiro start.
- Para alterar a SECRET_KEY em produção, configure variável de ambiente ou ajuste em `app/__init__.py`.
