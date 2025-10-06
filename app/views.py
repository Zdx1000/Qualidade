import importlib
import math
import re
import unicodedata
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file, current_app
from sqlalchemy import and_, func, select
from . import db
from .models import ConfigList, Colaborador

bp = Blueprint('main', __name__)


last_planilha = None
last_planilha_hc = None


# Helpers


def normalize_matricula(value):
    if value is None:
        return None
    try:
        text = str(value).strip()
        if not text:
            return None
        lowered = text.lower()
        if lowered in {'nan', 'none', 'null'}:
            return None
        numeric = int(float(text))
        if numeric <= 0:
            return None
        return numeric
    except (ValueError, TypeError):
        return None

def manipular_dados(df):
    """Prepara o DF da planilha e faz merge com o banco (apenas tipo TALKMAN) por Matrícula.

    - Gera coluna "Matrícula" a partir de "Funcionário" se necessário.
    - Deduplica por "Matrícula" na planilha.
    - Busca do SQLite (tabela Colaborador) apenas registros com tipo == 'TALKMAN'.
    - Faz merge inner em "Matrícula" e retorna o DF resultante.
    """
    import pandas as pd
    from sqlalchemy import select

    # 1) Preparar DataFrame da planilha
    try:
        database = df.copy()


        database["Funcionário"] = database["Funcionário"].astype(int)
        # Deduplicar por matrícula
        database = database.drop_duplicates(subset=["Funcionário"]).reset_index(drop=True)
    except Exception as e:
        current_app.logger.exception("Falha preparando DataFrame para merge: %s", e)
        flash(f'Falha preparando planilha para merge: {e}', 'danger')
        return None

    try:
        bind = db.session.get_bind()
        stmt = select(
            Colaborador.matricula.label("Matrícula"),
            Colaborador.nome.label("Nome_DB"),
            Colaborador.tipo.label("Tipo"),
            Colaborador.setor.label("Setor"),
            Colaborador.area.label("Área"),
            Colaborador.turno.label("Turno"),
            Colaborador.supervisor.label("Supervisor"),
            Colaborador.integracao.label("Integração"),
            Colaborador.data.label("Data_DB"),
        ).where(Colaborador.tipo == 'TALKMAN')
        df_db = pd.read_sql(stmt, bind)
    except Exception as e:
        current_app.logger.exception("Falha ao ler dados do banco para merge: %s", e)
        flash(f'Falha ao carregar dados do banco: {e}', 'danger')
        return None

    try:
        merged = pd.merge(database, df_db, left_on="Funcionário", right_on="Matrícula", how="left")


    except Exception as e:
        current_app.logger.exception("Falha no merge dos dados: %s", e)
        flash(f'Falha ao mesclar dados: {e}', 'danger')
        return None

    current_app.logger.info("Merge TALKMAN concluído: %s linhas x %s colunas", merged.shape[0], merged.shape[1])
    return merged, database, df_db



def get_list(nome: str) -> list[str]:
    rows = ConfigList.query.filter_by(nome_lista=nome).order_by(ConfigList.valor.asc()).all()
    return [r.valor for r in rows]


@bp.route('/')
def home():
    return redirect(url_for('main.alimentacao'))


@bp.route('/alimentacao', methods=['GET', 'POST'])
def alimentacao():
    lists = {
        'tipo': get_list('tipo'),
        'setor': get_list('setor'),
        'area': get_list('area'),
        'turno': get_list('turno'),
        'integracao': get_list('integracao'),
    }

    if request.method == 'POST':
        try:
            matricula = int(request.form.get('matricula', '').strip())
        except ValueError:
            flash('Matrícula inválida.', 'danger')
            return render_template('alimentacao.html', lists=lists)

        nome = request.form.get('nome', '').strip()
        tipo = request.form.get('tipo', '')
        setor = request.form.get('setor', '')
        area = request.form.get('area', '')
        turno = request.form.get('turno', '')
        supervisor = request.form.get('supervisor', '').strip().upper()
        integracao = request.form.get('integracao', '')
        data_str = request.form.get('data', '')
        observacao = request.form.get('observacao', '').strip()

        # Basic validations
        errors = []
        if not nome:
            errors.append('Nome é obrigatório.')
        if tipo not in lists['tipo']:
            errors.append('Tipo inválido.')
        if setor not in lists['setor']:
            errors.append('Setor inválido.')
        if area not in lists['area']:
            errors.append('Área inválida.')
        if turno not in lists['turno']:
            errors.append('Turno inválido.')
        if integracao not in lists['integracao']:
            errors.append('Integração inválida.')

        try:
            data = datetime.strptime(data_str, '%Y-%m-%d').date()
        except ValueError:
            errors.append('Data inválida.')
            data = None

        if errors:
            for e in errors:
                flash(e, 'danger')
            return render_template('alimentacao.html', lists=lists, form=request.form)

        col = Colaborador(
            matricula=matricula,
            nome=nome,
            tipo=tipo,
            setor=setor,
            area=area,
            turno=turno,
            supervisor=supervisor,
            integracao=integracao,
            data=data,
            observacao=observacao or None,
        )
        db.session.add(col)
        db.session.commit()
        flash('Registro salvo com sucesso.', 'success')
        return redirect(url_for('main.alimentacao'))

    return render_template('alimentacao.html', lists=lists)


@bp.route('/tabela')
def tabela():
    # Período padrão: últimos 30 dias incluindo hoje
    today = datetime.today().date()
    default_min = (today - timedelta(days=29)).strftime('%Y-%m-%d')
    default_max = today.strftime('%Y-%m-%d')
    min_date_str = request.args.get('min_data') or default_min
    max_date_str = request.args.get('max_data') or default_max

    q_nome = (request.args.get('q_nome') or '').strip()
    q_supervisor = (request.args.get('q_supervisor') or '').strip()
    q_matricula_raw = (request.args.get('q_matricula') or '').strip()

    q = Colaborador.query
    if min_date_str:
        try:
            min_date = datetime.strptime(min_date_str, '%Y-%m-%d').date()
            q = q.filter(Colaborador.data >= min_date)
        except ValueError:
            flash('Data mínima inválida.', 'warning')
    if max_date_str:
        try:
            max_date = datetime.strptime(max_date_str, '%Y-%m-%d').date()
            q = q.filter(Colaborador.data <= max_date)
        except ValueError:
            flash('Data máxima inválida.', 'warning')

    # Filtros de texto
    if q_nome:
        q = q.filter(Colaborador.nome.ilike(f"%{q_nome}%"))
    if q_supervisor:
        q = q.filter(Colaborador.supervisor.ilike(f"%{q_supervisor}%"))
    if q_matricula_raw:
        try:
            q_matricula = int(q_matricula_raw)
            q = q.filter(Colaborador.matricula == q_matricula)
        except ValueError:
            flash('Matrícula para filtro deve ser numérica.', 'warning')

    # Paginação
    page = max(1, request.args.get('page', default=1, type=int) or 1)
    # Limita per_page entre 5 e 100
    per_page = request.args.get('per_page', default=25, type=int) or 25
    per_page = max(5, min(per_page, 100))
    q = q.order_by(Colaborador.data.desc(), Colaborador.created_at.desc())
    pagination = db.paginate(q, page=page, per_page=per_page, error_out=False)

    # Janela de páginas para paginação (evita usar max/min em Jinja)
    try:
        total_pages = int(pagination.pages or 1)
    except Exception:
        total_pages = 1
    window = 2
    start_page = max(1, page - window)
    end_page = min(total_pages, page + window)

    return render_template(
        'tabela.html',
        rows=pagination.items,
        min_data=min_date_str,
        max_data=max_date_str,
        q_nome=q_nome,
        q_supervisor=q_supervisor,
        q_matricula=q_matricula_raw,
        pagination=pagination,
        page=page,
        per_page=per_page,
        start_page=start_page,
        end_page=end_page,
    )


@bp.route('/tabela/<int:item_id>/editar', methods=['GET', 'POST'])
def editar_colaborador(item_id: int):
    col = Colaborador.query.get_or_404(item_id)

    lists = {
        'tipo': get_list('tipo'),
        'setor': get_list('setor'),
        'area': get_list('area'),
        'turno': get_list('turno'),
        'integracao': get_list('integracao'),
    }

    for key in ('tipo', 'setor', 'area', 'turno', 'integracao'):
        current_value = getattr(col, key, None)
        if current_value and current_value not in lists[key]:
            lists[key] = [current_value] + lists[key]

    filters_raw = {
        'min_data': request.args.get('min_data'),
        'max_data': request.args.get('max_data'),
        'q_nome': request.args.get('q_nome'),
        'q_matricula': request.args.get('q_matricula'),
        'q_supervisor': request.args.get('q_supervisor'),
        'page': request.args.get('page', type=int),
        'per_page': request.args.get('per_page', type=int),
    }
    filters = {k: v for k, v in filters_raw.items() if v not in (None, '')}
    return_url = url_for('main.tabela', **filters) if filters else url_for('main.tabela')
    form_action = url_for('main.editar_colaborador', item_id=col.id, **filters) if filters else url_for('main.editar_colaborador', item_id=col.id)

    if request.method == 'POST':
        errors = []
        try:
            matricula_raw = request.form.get('matricula', '').strip()
            matricula = int(matricula_raw)
        except ValueError:
            errors.append('Matrícula inválida.')
            matricula = None

        nome = request.form.get('nome', '').strip()
        if not nome:
            errors.append('Nome é obrigatório.')

        tipo = request.form.get('tipo', '')
        setor = request.form.get('setor', '')
        area = request.form.get('area', '')
        turno = request.form.get('turno', '')
        supervisor = request.form.get('supervisor', '').strip().upper()
        integracao = request.form.get('integracao', '')
        data_str = request.form.get('data', '')
        observacao = request.form.get('observacao', '').strip()

        if tipo not in lists['tipo']:
            errors.append('Tipo inválido.')
        if setor not in lists['setor']:
            errors.append('Setor inválido.')
        if area not in lists['area']:
            errors.append('Área inválida.')
        if turno not in lists['turno']:
            errors.append('Turno inválido.')
        if integracao not in lists['integracao']:
            errors.append('Integração inválida.')

        try:
            data = datetime.strptime(data_str, '%Y-%m-%d').date()
        except ValueError:
            errors.append('Data inválida.')
            data = None

        if errors:
            for e in errors:
                flash(e, 'danger')
            return render_template(
                'editar_colaborador.html',
                col=col,
                lists=lists,
                form=request.form,
                form_action=form_action,
                return_url=return_url,
            )

        if matricula is not None:
            col.matricula = matricula
        col.nome = nome
        col.tipo = tipo
        col.setor = setor
        col.area = area
        col.turno = turno
        col.supervisor = supervisor
        col.integracao = integracao
        if data:
            col.data = data
        col.observacao = observacao or None

        db.session.commit()
        flash('Registro atualizado com sucesso.', 'success')
        return redirect(return_url)

    form_data = {
        'matricula': col.matricula,
        'nome': col.nome,
        'tipo': col.tipo,
        'setor': col.setor,
        'area': col.area,
        'turno': col.turno,
        'supervisor': col.supervisor,
        'integracao': col.integracao,
        'data': col.data.strftime('%Y-%m-%d') if col.data else '',
        'observacao': col.observacao or '',
    }

    return render_template(
        'editar_colaborador.html',
        col=col,
        lists=lists,
        form=form_data,
        form_action=form_action,
        return_url=return_url,
    )





@bp.route('/excluir/<int:item_id>', methods=['POST'])
def excluir(item_id: int):
    item = Colaborador.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    flash('Registro excluído com sucesso.', 'success')

    # Preserva filtros/paginação vindos por query string
    min_data = request.args.get('min_data')
    max_data = request.args.get('max_data')
    q_nome = request.args.get('q_nome')
    q_matricula = request.args.get('q_matricula')
    q_supervisor = request.args.get('q_supervisor')
    page = request.args.get('page', type=int)
    per_page = request.args.get('per_page', type=int)
    args = {k: v for k, v in {
        'min_data': min_data,
        'max_data': max_data,
        'q_nome': q_nome,
        'q_matricula': q_matricula,
        'q_supervisor': q_supervisor,
        'page': page,
        'per_page': per_page,
    }.items() if v}
    return redirect(url_for('main.tabela', **args))


@bp.route('/tabela/export')
def tabela_export():
    """Exporta os dados filtrados para XLSX."""
    from io import BytesIO
    try:
        import openpyxl
        from openpyxl.utils import get_column_letter
    except Exception:
        return jsonify({
            'error': 'Dependência openpyxl não encontrada. Instale com: pip install openpyxl'
        }), 500

    # Período padrão: últimos 30 dias incluindo hoje
    today = datetime.today().date()
    default_min = (today - timedelta(days=29)).strftime('%Y-%m-%d')
    default_max = today.strftime('%Y-%m-%d')
    min_date_str = request.args.get('min_data') or default_min
    max_date_str = request.args.get('max_data') or default_max

    q_nome = (request.args.get('q_nome') or '').strip()
    q_supervisor = (request.args.get('q_supervisor') or '').strip()
    q_matricula_raw = (request.args.get('q_matricula') or '').strip()

    q = Colaborador.query
    if min_date_str:
        try:
            min_date = datetime.strptime(min_date_str, '%Y-%m-%d').date()
            q = q.filter(Colaborador.data >= min_date)
        except ValueError:
            pass
    if max_date_str:
        try:
            max_date = datetime.strptime(max_date_str, '%Y-%m-%d').date()
            q = q.filter(Colaborador.data <= max_date)
        except ValueError:
            pass

    if q_nome:
        q = q.filter(Colaborador.nome.ilike(f"%{q_nome}%"))
    if q_supervisor:
        q = q.filter(Colaborador.supervisor.ilike(f"%{q_supervisor}%"))
    if q_matricula_raw:
        try:
            q_matricula = int(q_matricula_raw)
            q = q.filter(Colaborador.matricula == q_matricula)
        except ValueError:
            pass

    q = q.order_by(Colaborador.data.desc(), Colaborador.created_at.desc())
    rows = q.all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Dados'
    headers = [
        'Data', 'Matrícula', 'Nome', 'Tipo', 'Setor', 'Área', 'Turno', 'Supervisor', 'Integração', 'Observação'
    ]
    ws.append(headers)
    for r in rows:
        ws.append([
            r.data.strftime('%Y-%m-%d') if r.data else '',
            r.matricula,
            r.nome,
            r.tipo,
            r.setor,
            r.area,
            r.turno,
            r.supervisor,
            r.integracao,
            r.observacao or '',
        ])
    # Largura das colunas básica
    widths = [12, 10, 26, 14, 18, 18, 12, 18, 12, 40]
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = w

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    filename = 'tabela_qualidade.xlsx'
    return send_file(
        bio,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


# Config Lists API and page
@bp.route('/config-lists')
def config_lists():
    # Show grouped lists
    all_lists = {}
    for nome in ['tipo', 'setor', 'area', 'turno', 'integracao']:
        all_lists[nome] = get_list(nome)
    return render_template('config_lists.html', all_lists=all_lists)


@bp.route('/api/lists/<nome_lista>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_lists(nome_lista):
    nome_lista = nome_lista.lower()
    if request.method == 'GET':
        return jsonify(get_list(nome_lista))

    data = request.get_json(force=True, silent=True) or {}

    if request.method == 'POST':
        valor = (data.get('valor') or '').strip()
        if not valor:
            return jsonify({'error': 'Valor é obrigatório'}), 400
        if len(valor) > 120:
            return jsonify({'error': 'Valor excede 120 caracteres'}), 400
        # Verificação case-insensitive
        exists = (
            db.session.query(ConfigList.id)
            .filter(
                ConfigList.nome_lista == nome_lista,
                func.lower(ConfigList.valor) == func.lower(valor),
            )
            .first()
        )
        if exists:
            return jsonify({'error': 'Valor já existe (comparação sem diferenciar maiúsculas/minúsculas)'}), 409
        db.session.add(ConfigList(nome_lista=nome_lista, valor=valor))
        db.session.commit()
        return jsonify({'ok': True})

    if request.method == 'PUT':
        old = (data.get('old') or '').strip()
        new = (data.get('new') or '').strip()
        if not old or not new:
            return jsonify({'error': 'Parâmetros inválidos'}), 400
        if len(new) > 120:
            return jsonify({'error': 'Valor excede 120 caracteres'}), 400
        row = ConfigList.query.filter_by(nome_lista=nome_lista, valor=old).first()
        if not row:
            return jsonify({'error': 'Valor não encontrado'}), 404
        # Case-insensitive uniqueness
        exists = (
            db.session.query(ConfigList.id)
            .filter(
                ConfigList.nome_lista == nome_lista,
                func.lower(ConfigList.valor) == func.lower(new),
                ConfigList.id != row.id,
            )
            .first()
        )
        if exists:
            return jsonify({'error': 'Novo valor já existe (comparação sem diferenciar maiúsculas/minúsculas)'}), 409
        row.valor = new
        db.session.commit()
        return jsonify({'ok': True})

    if request.method == 'DELETE':
        valor = (data.get('valor') or '').strip()
        row = ConfigList.query.filter_by(nome_lista=nome_lista, valor=valor).first()
        if not row:
            return jsonify({'error': 'Valor não encontrado'}), 404
        # Bloqueia remoção se valor estiver em uso por Colaborador
        field_map = {
            'tipo': Colaborador.tipo,
            'setor': Colaborador.setor,
            'area': Colaborador.area,
            'turno': Colaborador.turno,
            'integracao': Colaborador.integracao,
        }
        if nome_lista in field_map:
            in_use = db.session.query(Colaborador.id).filter(field_map[nome_lista] == valor).first()
            if in_use:
                return jsonify({'error': 'Não é possível remover: valor está em uso em registros existentes'}), 409
        db.session.delete(row)
        db.session.commit()
        return jsonify({'ok': True})

    return jsonify({'error': 'Método não suportado'}), 405


# Página para upload de planilha (Input*Dados)
@bp.route('/input-dados', methods=['GET', 'POST'])
def input_dados():
    if request.method == 'POST':
        files = [f for f in request.files.getlist('files') if f and f.filename]
        if not files:
            flash('Nenhum arquivo selecionado.', 'warning')
            return redirect(url_for('main.input_dados'))

        allowed_extensions = {'.xlsx', '.xls', '.xlsb'}

        try:
            import pandas as pd  # import local para não quebrar app se pandas não estiver instalado
        except Exception:
            flash('Dependência pandas não encontrada. Instale com: pip install pandas', 'danger')
            return redirect(url_for('main.input_dados'))

        global last_planilha, last_planilha_hc
        last_planilha_hc = None

        def determine_engine(ext: str) -> str:
            ext = (ext or '').lower()
            if ext == '.xlsb':
                try:
                    importlib.import_module('pyxlsb')
                except ImportError:
                    raise RuntimeError('Dependência pyxlsb não encontrada. Instale com: pip install pyxlsb')
                return 'pyxlsb'
            if ext == '.xls':
                try:
                    importlib.import_module('xlrd')
                except ImportError:
                    raise RuntimeError('Dependência xlrd não encontrada. Instale com: pip install xlrd==1.2.0')
                return 'xlrd'
            try:
                importlib.import_module('openpyxl')
            except ImportError:
                raise RuntimeError('Dependência openpyxl não encontrada. Instale com: pip install openpyxl')
            return 'openpyxl'

        def read_dataframe(storage, *, sheet_name=0, extension=None):
            ext = extension or Path(storage.filename).suffix.lower()
            engine = determine_engine(ext)
            try:
                storage.stream.seek(0)
            except Exception:
                pass
            return pd.read_excel(storage, engine=engine, sheet_name=sheet_name)

        preview_filename = None
        preview_df = None
        preview_shape = None
        processed_any = False
        invalid_names = []
        hc_previews = []

        for file in files:
            filename = file.filename
            extension = Path(filename).suffix.lower()
            if extension not in allowed_extensions:
                invalid_names.append(filename)
                continue

            uppercase_name = filename.strip().upper()

            if uppercase_name.startswith('HC'):
                try:
                    df_hc = read_dataframe(file, sheet_name='Base Colab.', extension=extension)
                except RuntimeError as dep_err:
                    flash(str(dep_err), 'danger')
                    continue
                except ValueError as sheet_err:
                    flash(f'Planilha "{filename}" não contém a aba "Base Colab.": {sheet_err}', 'danger')
                    continue
                except Exception as err:
                    current_app.logger.exception('Falha ao carregar planilha HC %s', filename)
                    flash(f'Falha ao processar a planilha "{filename}": {err}', 'danger')
                    continue

                display_df = df_hc.copy()
                expected_cols = ["Matrícula", "Cargo", "Situação", "Turno"]
                missing_cols = [col for col in expected_cols if col not in display_df.columns]
                if missing_cols:
                    flash(f'Planilha "{filename}" não possui as colunas esperadas: {", ".join(missing_cols)}', 'warning')
                    continue

                display_df = display_df[expected_cols].copy()
                display_df = display_df.rename(columns={
                    "Cargo": "Cargo HC",
                    "Situação": "Situação HC",
                    "Turno": "Turno HC"
                })
                display_df['Matrícula'] = display_df['Matrícula'].apply(normalize_matricula)
                display_df = display_df[display_df['Matrícula'].notna()].copy()
                try:
                    display_df['Matrícula'] = display_df['Matrícula'].astype(int)
                except Exception:
                    pass

                processed_any = True
                last_planilha_hc = display_df.copy()
                current_app.logger.info('Planilha HC detectada: "%s" (%s). Linhas: %s | Colunas: %s', filename, extension or 'sem extensão', display_df.shape[0], list(display_df.columns))
                try:
                    preview_block = display_df.head(5).copy()
                except Exception:
                    preview_block = display_df
                try:
                    preview_block = preview_block.fillna('')
                except Exception:
                    pass
                try:
                    preview_rows = preview_block.astype(str).values.tolist()
                except Exception:
                    preview_rows = preview_block.values.tolist()
                preview_cols_hc = [str(c) for c in list(preview_block.columns)]
                hc_previews.append({
                    'filename': filename,
                    'shape': display_df.shape,
                    'columns': preview_cols_hc,
                    'rows': preview_rows,
                })
                try:
                    console_preview = display_df.head(5).to_string(index=False)
                except Exception:
                    console_preview = str(display_df.head(5))
                print(f'[Input*Dados][HC] {filename} - Prévia das 5 primeiras linhas:\n{console_preview}')
                flash(f'Planilha "{filename}" (HC) carregada e registrada no console.', 'info')
                continue

            try:
                df = read_dataframe(file, extension=extension)
            except RuntimeError as dep_err:
                flash(str(dep_err), 'danger')
                continue
            except Exception as err:
                current_app.logger.exception('Falha ao processar planilha %s', filename)
                flash(f'Falha ao processar o arquivo "{filename}": {err}', 'danger')
                continue

            processed_any = True

            if filename.startswith("Rastreabilidade_Tra"):
                try:
                    df_listColomns = ["Do Endereço", "Funcionário", "Nome", "Data", "Execução por Voz"]
                    df_trabalho = df[df_listColomns].copy()
                    df_trabalho["MOD"] = df_trabalho["Do Endereço"].fillna("").astype(str).str[:1]

                    existing_matriculas = set()
                    for (value,) in (
                        db.session.query(Colaborador.matricula)
                        .filter(Colaborador.matricula.isnot(None))
                        .all()
                    ):
                        if value is None:
                            continue
                        try:
                            existing_matriculas.add(int(value))
                        except (TypeError, ValueError):
                            continue

                    def flag_treinado(raw):
                        matricula = normalize_matricula(raw)
                        return 'Sim' if matricula is not None and matricula in existing_matriculas else 'Não'

                    df_trabalho['Treinado'] = df_trabalho['Funcionário'].apply(flag_treinado)

                    flash(f'Arquivo de rastreabilidade detectado. Linhas: Columns {df_listColomns} | MOD e Treinado adicionados', 'info')

                    global last_planilha
                    planilha = df_trabalho.copy()
                    resultado = manipular_dados(planilha)
                    if resultado is not None:
                        df_manipulada, planilha, bancodb = resultado
                        if planilha is not None:
                            last_planilha = planilha
                except Exception as e:
                    current_app.logger.exception('Falha ao processar arquivo de rastreabilidade %s', filename)
                    flash(f'Falha ao processar arquivo de rastreabilidade "{filename}": {e}', 'danger')
                    continue

                candidate_df = df_trabalho
            else:
                candidate_df = df

            if preview_df is None:
                preview_df = candidate_df
                preview_filename = filename
                preview_shape = candidate_df.shape

            rows_count = candidate_df.shape[0]
            cols_count = candidate_df.shape[1]
            flash(f'Arquivo "{filename}" processado com sucesso. Linhas: {rows_count} | Colunas: {cols_count}', 'success')

        if invalid_names:
            ignored = ', '.join(invalid_names)
            flash(f'Arquivos ignorados por formato inválido: {ignored}', 'warning')

        if not processed_any:
            return redirect(url_for('main.input_dados'))

        if preview_df is None and not hc_previews:
            return redirect(url_for('main.input_dados'))

        preview_cols = None
        preview_rows = None
        if preview_df is not None:
            preview_display = preview_df.head(5).copy()
            try:
                preview_display = preview_display.fillna('')
            except Exception:
                pass
            try:
                preview_rows = preview_display.astype(str).values.tolist()
            except Exception:
                preview_rows = preview_display.values.tolist()
            preview_cols = [str(c) for c in list(preview_display.columns)]

        return render_template(
            'input_dados.html',
            preview_cols=preview_cols,
            preview_rows=preview_rows,
            preview_shape=preview_shape,
            filename=preview_filename,
            hc_previews=hc_previews,
        )

    return render_template('input_dados.html')

@bp.route('/painel-grafico', methods=['GET'])
def painel_grafico(planilha=None):
    """Renderiza o painel gráfico com cards de consolidados."""

    # Consolidados do banco com período selecionável
    try:
        # Faixa total disponível no banco (para exibição informativa)
        min_all = db.session.query(func.min(Colaborador.data)).scalar()
        max_all = db.session.query(func.max(Colaborador.data)).scalar()

        # Turnos disponíveis (distintos no banco)
        turnos_rows = (
            db.session.query(Colaborador.turno)
            .filter(Colaborador.turno.isnot(None))
            .distinct()
            .order_by(Colaborador.turno.asc())
            .all()
        )
        available_turnos = [t[0] for t in turnos_rows]

        # Filtros adicionais: Setor, Tipo, Supervisor (para timeline)
        setores_rows = (
            db.session.query(Colaborador.setor)
            .filter(Colaborador.setor.isnot(None))
            .distinct()
            .order_by(Colaborador.setor.asc())
            .all()
        )
        tipos_rows = (
            db.session.query(Colaborador.tipo)
            .filter(Colaborador.tipo.isnot(None))
            .distinct()
            .order_by(Colaborador.tipo.asc())
            .all()
        )
        supervisores_rows = (
            db.session.query(Colaborador.supervisor)
            .filter(Colaborador.supervisor.isnot(None))
            .distinct()
            .order_by(Colaborador.supervisor.asc())
            .all()
        )
        available_setores = [s[0] for s in setores_rows]
        available_tipos = [t[0] for t in tipos_rows]
        available_supervisores = [s[0] for s in supervisores_rows]

        # Ler período do usuário (GET) e definir padrão como HOJE (performance)
        min_param = request.args.get('min_data')
        max_param = request.args.get('max_data')
        selected_turno = request.args.get('turno') or 'all'
        selected_setor = request.args.get('setor') or 'all'
        selected_tipo = request.args.get('tipo') or 'all'
        selected_supervisor = request.args.get('supervisor') or 'all'

        def parse_date(s):
            if not s:
                return None
            try:
                return datetime.strptime(s, '%Y-%m-%d').date()
            except Exception:
                return None

        today = datetime.today().date()
        sel_min = parse_date(min_param) or today
        sel_max = parse_date(max_param) or today

        # Query filtrada pelo período e turno selecionados
        q = db.session.query(Colaborador)
        if sel_min:
            q = q.filter(Colaborador.data >= sel_min)
        if sel_max:
            q = q.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q = q.filter(Colaborador.turno == selected_turno)

        total_colaboradores = q.count()

        # Agregações para gráficos (aplicando os mesmos filtros)
        q_setor = db.session.query(
            Colaborador.setor.label('setor'),
            func.count(func.distinct(Colaborador.matricula)).label('qtd')
        )
        if sel_min:
            q_setor = q_setor.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_setor = q_setor.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_setor = q_setor.filter(Colaborador.turno == selected_turno)
        q_setor = q_setor.filter(Colaborador.setor.isnot(None)).group_by(Colaborador.setor).order_by(func.count(func.distinct(Colaborador.matricula)).desc())
        setor_rows = q_setor.all()
        setor_labels = [r.setor for r in setor_rows]
        setor_series = [int(r.qtd or 0) for r in setor_rows]

        # Agregação simples por tipo (contagem total sem distinct)
        q_tipo_resumo = db.session.query(
            Colaborador.tipo.label('tipo'),
            func.count(Colaborador.matricula).label('qtd')
        )
        if sel_min:
            q_tipo_resumo = q_tipo_resumo.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_tipo_resumo = q_tipo_resumo.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_tipo_resumo = q_tipo_resumo.filter(Colaborador.turno == selected_turno)
        q_tipo_resumo = (
            q_tipo_resumo
            .filter(Colaborador.tipo.isnot(None))
            .group_by(Colaborador.tipo)
            .order_by(func.count(Colaborador.matricula).desc())
        )
        tipo_rows = q_tipo_resumo.all()
        tipo_labels = [r.tipo for r in tipo_rows]
        tipo_series = [int(r.qtd or 0) for r in tipo_rows]

        q_turno = db.session.query(
            Colaborador.turno.label('turno'),
            func.count(Colaborador.matricula).label('qtd')
        )
        if sel_min:
            q_turno = q_turno.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_turno = q_turno.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_turno = q_turno.filter(Colaborador.turno == selected_turno)
        q_turno = q_turno.filter(Colaborador.turno.isnot(None)).group_by(Colaborador.turno).order_by(func.count(Colaborador.matricula).desc())
        turno_rows = q_turno.all()
        turno_labels = [r.turno for r in turno_rows]
        turno_series = [int(r.qtd or 0) for r in turno_rows]

        # Agregação simples por setor (contagem total sem distinct para análise de volume)
        q_setor_total = db.session.query(
            Colaborador.setor.label('setor'),
            func.count(Colaborador.id).label('qtd')
        )
        if sel_min:
            q_setor_total = q_setor_total.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_setor_total = q_setor_total.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_setor_total = q_setor_total.filter(Colaborador.turno == selected_turno)
        q_setor_total = (
            q_setor_total
            .filter(Colaborador.setor.isnot(None))
            .group_by(Colaborador.setor)
            .order_by(func.count(Colaborador.id).desc())
        )
        setor_total_rows = q_setor_total.all()
        stacked_categories = [r.setor for r in setor_total_rows]
        stacked_series = [int(r.qtd or 0) for r in setor_total_rows]
        min_data = db.session.query(func.min(Colaborador.data))
        max_data = db.session.query(func.max(Colaborador.data))
        if sel_min:
            min_data = min_data.filter(Colaborador.data >= sel_min)
            max_data = max_data.filter(Colaborador.data >= sel_min)
        if sel_max:
            min_data = min_data.filter(Colaborador.data <= sel_max)
            max_data = max_data.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            min_data = min_data.filter(Colaborador.turno == selected_turno)
            max_data = max_data.filter(Colaborador.turno == selected_turno)
        min_data = min_data.scalar()
        max_data = max_data.scalar()

        # Strings para inputs (YYYY-MM-DD)
        def to_str(d):
            try:
                return d.strftime('%Y-%m-%d') if d else ''
            except Exception:
                return ''

        min_all_str = to_str(min_all)
        max_all_str = to_str(max_all)
        min_data_str = to_str(sel_min)
        max_data_str = to_str(sel_max)
        today_str = to_str(today)

        # Série temporal (Data X contagem distinta de Matrícula) com filtros
        q_time = db.session.query(
            Colaborador.data.label('data'),
            func.count(func.distinct(Colaborador.matricula)).label('qtd'),
        )
        if sel_min:
            q_time = q_time.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_time = q_time.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_time = q_time.filter(Colaborador.turno == selected_turno)
        if selected_setor and selected_setor != 'all':
            q_time = q_time.filter(Colaborador.setor == selected_setor)
        if selected_tipo and selected_tipo != 'all':
            q_time = q_time.filter(Colaborador.tipo == selected_tipo)
        if selected_supervisor and selected_supervisor != 'all':
            q_time = q_time.filter(Colaborador.supervisor == selected_supervisor)
        q_time = q_time.group_by(Colaborador.data).order_by(Colaborador.data.asc())
        time_rows = q_time.all()
        # Converter para pares [timestamp_ms, valor]
        timeline_data = []
        for r in time_rows:
            try:
                # Usar meio-dia para evitar DST edge-cases
                ts = datetime(r.data.year, r.data.month, r.data.day, 12, 0, 0)
                timeline_data.append([int(ts.timestamp() * 1000), int(r.qtd or 0)])
            except Exception:
                pass
    except Exception as e:
        current_app.logger.exception('Falha ao calcular consolidados do banco: %s', e)
        total_colaboradores, min_data, max_data = 0, None, None
        min_all_str = max_all_str = min_data_str = max_data_str = today_str = ''
        available_turnos = []
        selected_turno = 'all'
        available_setores = []
        available_tipos = []
        available_supervisores = []
        selected_setor = selected_tipo = selected_supervisor = 'all'
        timeline_data = []
        setor_labels = []
        setor_series = []
        tipo_labels = []
        tipo_series = []
        turno_labels = []
        turno_series = []
        stacked_categories = []
        stacked_series = []

    def slugify_column(label):
        if label is None:
            return ''
        text = str(label)
        normalized = unicodedata.normalize('NFKD', text)
        ascii_text = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
        slug = re.sub(r'[^a-z0-9]+', '_', ascii_text.lower()).strip('_')
        return slug or 'col'

    def build_query_args(skip_keys=None, overrides=None):
        skip = set(skip_keys or [])
        base = {k: v for k, v in request.args.to_dict(flat=True).items() if v not in (None, '') and k not in skip}
        if overrides:
            base.update(overrides)
        return base

    def sort_dataframe(df, column, ascending=True):
        if column not in df.columns or df.empty:
            return df
        series = df[column]
        numeric_series = pd.to_numeric(series, errors='coerce')
        if numeric_series.notna().any():
            sort_key = numeric_series
        else:
            datetime_series = pd.to_datetime(series, errors='coerce')
            if datetime_series.notna().any():
                sort_key = datetime_series
            else:
                sort_key = series.astype(str).str.lower()
        sorted_df = df.assign(__sort_key=sort_key)
        sorted_df = sorted_df.sort_values('__sort_key', ascending=ascending, na_position='last', kind='mergesort')
        return sorted_df.drop(columns='__sort_key')

    input_column_definitions = [
        {"name": "Do Endereço", "param": "do_endereco", "icon": "geo-alt", "placeholder": "Endereço"},
        {"name": "Funcionário", "param": "funcionario", "icon": "hash", "placeholder": "Funcionário"},
        {"name": "Nome", "param": "nome", "icon": "person", "placeholder": "Nome"},
        {"name": "Data", "param": "data", "icon": "calendar-event", "placeholder": "Data"},
        {"name": "Execução por Voz", "param": "execucao", "icon": "mic", "placeholder": "Execução"},
        {"name": "Treinado", "param": "treinado", "icon": "mortarboard", "placeholder": "Treinado"},
    ]
    input_table_columns = [col["name"] for col in input_column_definitions]
    input_table_rows = []
    input_table_total = 0
    input_table_page_size = 10
    input_table_page = request.args.get('input_page', default=1, type=int) or 1
    input_table_page = max(1, input_table_page)
    input_table_pages = 0
    input_table_has_data = False
    input_table_pagination = None
    input_table_range_start = 0
    input_table_range_end = 0
    merge_colab_percent = None
    input_sort = (request.args.get('input_sort') or '').strip()
    valid_input_sorts = {col['param'] for col in input_column_definitions}
    if input_sort not in valid_input_sorts:
        input_sort = ''
    input_order = (request.args.get('input_order') or 'asc').lower()
    if input_order not in {'asc', 'desc'}:
        input_order = 'asc'
    if not input_sort:
        input_order = 'asc'
    input_filters = {}
    for col in input_column_definitions:
        value = (request.args.get(f"input_filter_{col['param']}") or '').strip()
        col['filter_value'] = value
        if value:
            input_filters[col['name']] = value

    try:
        source_df = last_planilha
    except NameError:
        source_df = None

    if source_df is not None:
        try:
            df_input = source_df.copy()
            missing_cols = [col for col in input_table_columns if col not in df_input.columns]
            if missing_cols:
                current_app.logger.warning('Planilha Input*Dados ajustada por colunas ausentes: %s', missing_cols)
                for col in missing_cols:
                    default_value = 'Não' if col == 'Treinado' else ''
                    df_input[col] = default_value
            df_input = df_input[input_table_columns].copy()
            filtered_df = df_input.copy()
            for col_name, filter_value in input_filters.items():
                filter_series = filtered_df[col_name].astype(str).fillna('')
                filtered_df = filtered_df[filter_series.str.contains(filter_value, case=False, na=False)]

            if input_sort:
                sort_column = next((col['name'] for col in input_column_definitions if col['param'] == input_sort), None)
                if sort_column:
                    ascending = input_order == 'asc'
                    filtered_df = sort_dataframe(filtered_df, sort_column, ascending=ascending)

            display_df = filtered_df.fillna('')
            input_table_total = len(display_df)
            if input_table_total > 0:
                input_table_has_data = True
                input_table_pages = max(1, math.ceil(input_table_total / input_table_page_size))
                if input_table_page > input_table_pages:
                    input_table_page = input_table_pages
                start = (input_table_page - 1) * input_table_page_size
                end = start + input_table_page_size
                page_df = display_df.iloc[start:end]
                input_table_range_start = start + 1
                input_table_range_end = min(end, input_table_total)
                input_table_rows = []
                for row in page_df.itertuples(index=False, name=None):
                    formatted = {}
                    for col, value in zip(input_table_columns, row):
                        cell = value
                        if cell is None:
                            text = ''
                        elif isinstance(cell, (int, float)):
                            if isinstance(cell, float) and math.isnan(cell):
                                text = ''
                            elif isinstance(cell, float) and cell.is_integer():
                                text = str(int(cell))
                            else:
                                text = str(cell)
                        else:
                            text = str(cell)
                        formatted[col] = text
                    input_table_rows.append(formatted)

                trained_mask = display_df["Treinado"].astype(str).str.strip().str.lower() == 'sim'
                trained_df = display_df[trained_mask].copy()

                trained_exec_count = 0
                trained_total = len(trained_df)

                if trained_total:
                    try:
                        execution_series = trained_df["Execução por Voz"].astype(str).map(lambda v: v.strip())
                    except Exception:
                        execution_series = trained_df["Execução por Voz"].astype(str)

                    negative_pattern = re.compile(r"\b(n[aã]o|pendente|aguard|sem|falta)\b", re.IGNORECASE)

                    for value in execution_series:
                        if not value or value.lower() in {"", "nan", "none", "0"}:
                            continue
                        if negative_pattern.search(value.lower()):
                            continue
                        trained_exec_count += 1

                trained_no_exec_count = max(0, trained_total - trained_exec_count)
                total_count = trained_exec_count + trained_no_exec_count
                if total_count > 0:
                    trained_pct = round((trained_exec_count / total_count) * 100, 2)
                    untrained_pct = round((trained_no_exec_count / total_count) * 100, 2)
                else:
                    trained_pct = untrained_pct = 0.0

                merge_colab_percent = {
                    "labels": ["Com execução por Voz", "Sem execução por Voz"],
                    "values": [trained_exec_count, trained_no_exec_count],
                    "percentages": [trained_pct, untrained_pct],
                    "total": total_count
                }

                preserved_args = build_query_args(overrides={'tab': 'input', 'input_filter': 'separacao'})
                preserved_args.pop('input_page', None)
                window = 2
                start_page = max(1, input_table_page - window)
                end_page = min(input_table_pages, input_table_page + window)

                page_links = []
                for p in range(start_page, end_page + 1):
                    args = {**preserved_args, 'input_page': p}
                    page_links.append({
                        'page': p,
                        'url': url_for('main.painel_grafico', **args),
                        'active': p == input_table_page
                    })

                input_table_pagination = {
                    'page': input_table_page,
                    'pages': input_table_pages,
                    'total': input_table_total,
                    'has_prev': input_table_page > 1,
                    'has_next': input_table_page < input_table_pages,
                    'prev_url': url_for(
                        'main.painel_grafico',
                        **{**preserved_args, 'input_page': input_table_page - 1}
                    ) if input_table_page > 1 else None,
                    'next_url': url_for(
                        'main.painel_grafico',
                        **{**preserved_args, 'input_page': input_table_page + 1}
                    ) if input_table_page < input_table_pages else None,
                    'page_links': page_links
                }
        except Exception as e:
            current_app.logger.exception('Falha ao preparar dados do Input*Dados: %s', e)

    input_column_meta = []
    input_filter_keys = set()
    for col in input_column_definitions:
        input_filter_keys.add(f"input_filter_{col['param']}")
        input_column_meta.append({
            'name': col['name'],
            'param': col['param'],
            'icon': col['icon'],
            'placeholder': col.get('placeholder', ''),
            'filter_value': col.get('filter_value', ''),
            'is_sorted': input_sort == col['param'],
            'sort_direction': input_order if input_sort == col['param'] else None,
        })

    input_form_args = build_query_args(
        skip_keys={'input_page', 'input_sort', 'input_order'} | input_filter_keys,
        overrides={'tab': 'input', 'input_filter': 'separacao'}
    )

    hc_merged_rows = []
    hc_merged_columns = []
    hc_preview_info = None
    hc_table_total = 0
    hc_table_page_size = 10
    hc_table_page = request.args.get('hc_page', default=1, type=int) or 1
    hc_table_page = max(1, hc_table_page)
    hc_table_pages = 0
    hc_table_range_start = 0
    hc_table_range_end = 0
    hc_table_pagination = None
    hc_sort = (request.args.get('hc_sort') or '').strip()
    hc_order = (request.args.get('hc_order') or 'asc').lower()
    if hc_order not in {'asc', 'desc'}:
        hc_order = 'asc'
    hc_column_meta = []
    hc_slug_to_column = {}

    try:
        source_hc = last_planilha_hc
    except NameError:
        source_hc = None

    if source_hc is not None:
        try:
            bind = db.session.get_bind()
            stmt = select(
                Colaborador.matricula.label("Matrícula"),
                Colaborador.nome.label("Nome"),
                Colaborador.tipo.label("Tipo"),
                Colaborador.setor.label("Setor"),
                Colaborador.area.label("Área"),
                Colaborador.turno.label("Turno"),
                Colaborador.supervisor.label("Supervisor"),
                Colaborador.integracao.label("Integração"),
                Colaborador.data.label("Data"),
            )
            df_db = pd.read_sql(stmt, bind)
            df_db['Matrícula'] = df_db['Matrícula'].apply(normalize_matricula)
            df_db = df_db[df_db['Matrícula'].notna()].copy()
            try:
                df_db['Matrícula'] = df_db['Matrícula'].astype(int)
            except Exception:
                pass

            merged_hc = pd.merge(df_db, source_hc, on='Matrícula', how='left')
            cargo_hc_column = 'Cargo HC' if 'Cargo HC' in merged_hc.columns else None
            if cargo_hc_column:
                with_hc = int(merged_hc[cargo_hc_column].notna().sum())
                without_hc = int(merged_hc[cargo_hc_column].isna().sum())
            else:
                with_hc = 0
                without_hc = len(merged_hc)

            hc_preview_info = {
                'total': len(merged_hc),
                'with_hc': with_hc,
                'without_hc': without_hc,
            }

            slug_counts = {}
            hc_filters = {}
            for column in merged_hc.columns:
                base_slug = slugify_column(column)
                if base_slug in slug_counts:
                    slug_counts[base_slug] += 1
                    slug = f"{base_slug}_{slug_counts[base_slug]}"
                else:
                    slug_counts[base_slug] = 1
                    slug = base_slug
                hc_slug_to_column[slug] = column
                value = (request.args.get(f"hc_filter_{slug}") or '').strip()
                if value:
                    hc_filters[column] = value
                hc_column_meta.append({
                    'name': str(column),
                    'slug': slug,
                    'filter_value': value,
                })

            filtered_hc = merged_hc.copy()
            for column, value in hc_filters.items():
                filter_series = filtered_hc[column].astype(str).fillna('')
                filtered_hc = filtered_hc[filter_series.str.contains(value, case=False, na=False)]

            if hc_sort in hc_slug_to_column:
                sort_column = hc_slug_to_column[hc_sort]
                ascending = hc_order == 'asc'
                filtered_hc = sort_dataframe(filtered_hc, sort_column, ascending=ascending)
            else:
                hc_sort = ''
                hc_order = 'asc'

            display_df = filtered_hc.fillna('')
            hc_table_total = len(display_df)
            if hc_table_total > 0:
                hc_table_pages = max(1, math.ceil(hc_table_total / hc_table_page_size))
                if hc_table_page > hc_table_pages:
                    hc_table_page = hc_table_pages
                start = (hc_table_page - 1) * hc_table_page_size
                end = start + hc_table_page_size
                page_df = display_df.iloc[start:end].copy()
                hc_table_range_start = start + 1
                hc_table_range_end = min(end, hc_table_total)

                hc_merged_columns = [str(c) for c in list(display_df.columns)]
                try:
                    hc_merged_rows = page_df.astype(str).values.tolist()
                except Exception:
                    hc_merged_rows = page_df.values.tolist()

                preserved_args = build_query_args(overrides={'tab': 'input', 'input_filter': 'hc'})
                preserved_args.pop('hc_page', None)

                window = 2
                start_page = max(1, hc_table_page - window)
                end_page = min(hc_table_pages, hc_table_page + window)

                page_links = []
                for p in range(start_page, end_page + 1):
                    args = {**preserved_args, 'hc_page': p}
                    page_links.append({
                        'page': p,
                        'url': url_for('main.painel_grafico', **args),
                        'active': p == hc_table_page
                    })

                hc_table_pagination = {
                    'page': hc_table_page,
                    'pages': hc_table_pages,
                    'total': hc_table_total,
                    'has_prev': hc_table_page > 1,
                    'has_next': hc_table_page < hc_table_pages,
                    'prev_url': url_for('main.painel_grafico', **{**preserved_args, 'hc_page': hc_table_page - 1}) if hc_table_page > 1 else None,
                    'next_url': url_for('main.painel_grafico', **{**preserved_args, 'hc_page': hc_table_page + 1}) if hc_table_page < hc_table_pages else None,
                    'page_links': page_links,
                }
            else:
                hc_merged_columns = [str(c) for c in list(display_df.columns)]
        except Exception as e:
            current_app.logger.exception('Falha ao gerar merge HC: %s', e)

    hc_filter_keys = set()
    for meta in hc_column_meta:
        slug = meta['slug']
        hc_filter_keys.add(f"hc_filter_{slug}")
        meta['is_sorted'] = hc_sort == slug
        meta['sort_direction'] = hc_order if meta['is_sorted'] else None

    hc_form_args = build_query_args(
        skip_keys={'hc_page', 'hc_sort', 'hc_order'} | hc_filter_keys,
        overrides={'tab': 'input', 'input_filter': 'hc'}
    )

    return render_template(
        'painel_grafico.html',
        total_colaboradores=total_colaboradores,
        min_data=min_data,
        max_data=max_data,
        min_all_str=min_all_str,
        max_all_str=max_all_str,
        min_data_str=min_data_str,
        max_data_str=max_data_str,
        today_str=today_str,
        setor_labels=setor_labels,
        setor_series=setor_series,
        tipo_labels=tipo_labels,
        tipo_series=tipo_series,
        turno_labels=turno_labels,
        turno_series=turno_series,
        stacked_categories=stacked_categories,
        stacked_series=stacked_series,
        timeline_data=timeline_data,
        available_turnos=available_turnos,
        selected_turno=selected_turno,
        available_setores=available_setores,
        available_tipos=available_tipos,
        available_supervisores=available_supervisores,
        selected_setor=selected_setor,
        selected_tipo=selected_tipo,
        selected_supervisor=selected_supervisor,
        input_table_columns=input_table_columns,
        input_table_rows=input_table_rows,
        input_table_total=input_table_total,
        input_table_page=input_table_page,
        input_table_pages=input_table_pages,
        input_table_page_size=input_table_page_size,
        input_table_has_data=input_table_has_data,
        input_table_pagination=input_table_pagination,
        input_table_range_start=input_table_range_start,
        input_table_range_end=input_table_range_end,
        merge_colab_percent=merge_colab_percent,
        input_column_meta=input_column_meta,
        input_sort=input_sort,
        input_order=input_order,
        input_form_args=input_form_args,
        hc_merged_columns=hc_merged_columns,
        hc_merged_rows=hc_merged_rows,
        hc_preview_info=hc_preview_info,
        hc_table_total=hc_table_total,
        hc_table_page=hc_table_page,
        hc_table_pages=hc_table_pages,
        hc_table_page_size=hc_table_page_size,
        hc_table_pagination=hc_table_pagination,
        hc_table_range_start=hc_table_range_start,
        hc_table_range_end=hc_table_range_end,
        hc_column_meta=hc_column_meta,
        hc_sort=hc_sort,
        hc_order=hc_order,
        hc_form_args=hc_form_args,
    )