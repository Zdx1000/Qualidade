from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from pathlib import Path
from sqlalchemy import text
import sys
import os

# Database instance
db = SQLAlchemy()


def _is_frozen() -> bool:
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')


def _base_path() -> Path:
    """Retorna o diretório base onde ficam templates/static/instance.
    - Em ambiente empacotado (PyInstaller): usa o diretório do executável para persistir dados (instance)
      e sys._MEIPASS para assets (templates/static).
    - Em desenvolvimento: raiz do projeto (.. da pasta app).
    """
    if _is_frozen():
        # Diretório do executável (persistente):
        return Path(sys.executable).resolve().parent
    # Rodando do código-fonte: raiz do projeto
    return Path(__file__).resolve().parent.parent


def _assets_path() -> Path:
    """Diretório para assets (templates/static).
    No PyInstaller onefile, assets são extraídos em sys._MEIPASS.
    """
    if _is_frozen():
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return _base_path()


def create_app(test_config: dict | None = None) -> Flask:
    base = _base_path()
    assets = _assets_path()
    templates_dir = assets / 'templates'
    static_dir = assets / 'static'
    instance_dir = base / 'instance'

    # Garante que a pasta de instance existe e é persistente (ao lado do exe ou do projeto)
    try:
        instance_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    app = Flask(
        __name__,
        instance_relative_config=True,
        instance_path=str(instance_dir),
        template_folder=str(templates_dir),
        static_folder=str(static_dir),
    )

    # Configs
    app.config.from_mapping(
        SECRET_KEY="change-me",
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{Path(app.instance_path) / 'qualidade.db'}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    # Allow override for tests
    if test_config is not None:
        app.config.update(test_config)

    # instance_path já garantido acima

    # Init DB
    db.init_app(app)

    # Models
    from .models import ConfigList, Colaborador

    with app.app_context():
        db.create_all()
        # Seed default lists if empty
        if ConfigList.query.count() == 0:
            seed_defaults()
        ensure_indexes()

    # Blueprints / routes
    from .views import bp
    app.register_blueprint(bp)

    return app


def seed_defaults():
    from .models import ConfigList
    defaults = {
        'tipo': ['TALKMAN', 'RECICLAGEM', 'COLETOR'],
        'setor': ['Controle de estoque', 'Fracionado', 'Carga Grossa', 'Expedição', 'Recebimento'],
        'area': ['fluido'],
        'turno': ['1° Turno', '2° Turno'],
        'integracao': ['SIM', 'NÃO'],
    }
    for name, values in defaults.items():
        for v in values:
            db.session.add(ConfigList(nome_lista=name, valor=v))
    db.session.commit()


def ensure_indexes():
    """Cria índices úteis no SQLite se não existirem (melhora filtros/ordenação)."""
    try:
        db.session.execute(text("CREATE INDEX IF NOT EXISTS ix_colaboradores_data ON colaboradores (data)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS ix_colaboradores_created_at ON colaboradores (created_at)"))
        db.session.commit()
    except Exception:
        db.session.rollback()
