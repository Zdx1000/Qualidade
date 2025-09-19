from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from pathlib import Path
from sqlalchemy import text

# Database instance
db = SQLAlchemy()


def create_app(test_config: dict | None = None) -> Flask:
    # templates/static estão na raiz do projeto (../templates e ../static)
    app = Flask(
        __name__,
        instance_relative_config=True,
        template_folder="../templates",
        static_folder="../static",
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

    # Ensure instance folder exists
    try:
        Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

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
