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

## Empacotar com auto-py-to-exe (PyInstaller)
O projeto está preparado para rodar empacotado (detecta ambiente frozen e resolve templates/static e instance corretamente).

Passos (Windows):
1) Instalar a ferramenta
```
pip install auto-py-to-exe
```
2) Abrir o utilitário
```
auto-py-to-exe
```
3) Configurar:
- Script: `servidor.py`
- Onefile: marcado (recomendado)
- Console: sua escolha (Console para logs; Windowed para ocultar console)
- Add Files (Additional Files): adicione as pastas `templates` e `static` como dados:
	- Source: `templates`  | Destination: `templates`
	- Source: `static`     | Destination: `static`
- Advanced > `--collect-all` não é necessário.

4) Build e executar o .exe gerado. O banco ficará em uma pasta `instance` criada ao lado do executável.

Observações:
- Ao rodar o .exe, a app sobe em `http://127.0.0.1:5000` (padrão). Ajuste a porta em `servidor.py` caso precise.
- Para logs, prefira deixar com Console ligado na primeira execução.
