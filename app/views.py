from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file
from sqlalchemy import and_, func
from datetime import datetime, timedelta
from . import db
from .models import ConfigList, Colaborador

bp = Blueprint('main', __name__)


# Helpers

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
