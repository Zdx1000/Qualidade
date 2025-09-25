from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file, current_app
from sqlalchemy import and_, func
from datetime import datetime, timedelta
from . import db
from .models import ConfigList, Colaborador

bp = Blueprint('main', __name__)


last_planilha = None


# Helpers

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
        file = request.files.get('file')
        if not file or file.filename == '':
            flash('Nenhum arquivo selecionado.', 'warning')
            return redirect(url_for('main.input_dados'))

        filename = file.filename
        if not filename.lower().endswith('.xlsx'):
            flash('Formato inválido. Envie um arquivo .xlsx', 'danger')
            return redirect(url_for('main.input_dados'))

        try:
            import pandas as pd  # import local para não quebrar app se pandas não estiver instalado
        except Exception:
            flash('Dependência pandas não encontrada. Instale com: pip install pandas', 'danger')
            return redirect(url_for('main.input_dados'))

        try:
            file.stream.seek(0)
            df = pd.read_excel(file, engine='openpyxl')

            
            if file.filename.startswith("Rastreabilidade_Tra"):
                try:
                    df_listColomns = ["Do Endereço", "Funcionário", "Nome", "Data", "Execução por Voz"]
                    df = df[df_listColomns]
                    df["MOD"] = df["Do Endereço"].fillna("").astype(str).str[:1]
                    flash(f'Arquivo de rastreabilidade detectado. Linhas: Columns {df_listColomns} | MOD Adicionado', 'info')

                    global last_planilha
                    planilha = df.copy()
                    df_manipulada, planilha, bancodb = manipular_dados(planilha)

                    if planilha is not None:
                        last_planilha = planilha
                    
                except Exception as e:
                    flash(f'Falha ao processar arquivo de rastreabilidade: {e}', 'danger')

            current_app.logger.info('Input*Dados: %s linhas, %s colunas. Colunas: %s', df.shape[0], df.shape[1], list(df.columns))

            preview_df = df.head(5).copy()

            try:
                preview_df = preview_df.fillna('')
            except Exception:
                pass
            try:
                preview_rows = preview_df.astype(str).values.tolist()
            except Exception:
                preview_rows = preview_df.values.tolist()
            preview_cols = [str(c) for c in list(preview_df.columns)]

            flash(f'Arquivo "{filename}" processado com sucesso. Linhas: {df.shape[0]} | Colunas: {df.shape[1]}', 'success')
            return render_template('input_dados.html', preview_cols=preview_cols, preview_rows=preview_rows, preview_shape=df.shape, filename=filename)
        except Exception as e:
            current_app.logger.exception('Falha ao processar planilha %s', filename)
            flash(f'Falha ao processar o arquivo: {e}', 'danger')
            return redirect(url_for('main.input_dados'))

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

        q_turno = db.session.query(
            Colaborador.turno.label('turno'),
            func.count(func.distinct(Colaborador.matricula)).label('qtd')
        )
        if sel_min:
            q_turno = q_turno.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_turno = q_turno.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_turno = q_turno.filter(Colaborador.turno == selected_turno)
        q_turno = q_turno.filter(Colaborador.turno.isnot(None)).group_by(Colaborador.turno).order_by(func.count(func.distinct(Colaborador.matricula)).desc())
        turno_rows = q_turno.all()
        turno_labels = [r.turno for r in turno_rows]
        turno_series = [int(r.qtd or 0) for r in turno_rows]

        # Agregação empilhada: por Tipo (séries) ao longo dos Setores (categorias), contando matrículas distintas
        q_tipo_stack = db.session.query(
            Colaborador.setor.label('setor'),
            Colaborador.tipo.label('tipo'),
            func.count(func.distinct(Colaborador.matricula)).label('qtd')
        )
        if sel_min:
            q_tipo_stack = q_tipo_stack.filter(Colaborador.data >= sel_min)
        if sel_max:
            q_tipo_stack = q_tipo_stack.filter(Colaborador.data <= sel_max)
        if selected_turno and selected_turno != 'all':
            q_tipo_stack = q_tipo_stack.filter(Colaborador.turno == selected_turno)
        q_tipo_stack = (
            q_tipo_stack
            .filter(Colaborador.setor.isnot(None))
            .filter(Colaborador.tipo.isnot(None))
            .group_by(Colaborador.setor, Colaborador.tipo)
        )
        rows_stack = q_tipo_stack.all()
        # Categorias: reaproveitar ordem de setores já calculada
        stacked_categories = setor_labels[:]
        # Construir séries por tipo
        from collections import defaultdict
        tmp = defaultdict(dict)  # tipo -> {setor: qtd}
        for r in rows_stack:
            tmp[r.tipo][r.setor] = int(r.qtd or 0)
        tipos_ordenados = sorted(tmp.keys())
        stacked_series = [
            {
                'name': tipo,
                'data': [tmp[tipo].get(cat, 0) for cat in stacked_categories]
            }
            for tipo in tipos_ordenados
        ]
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
        turno_labels = []
        turno_series = []
        stacked_categories = []
        stacked_series = []

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
    )