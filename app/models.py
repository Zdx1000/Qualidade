from datetime import datetime
from . import db


class ConfigList(db.Model):
    __tablename__ = 'config_lists'
    id = db.Column(db.Integer, primary_key=True)
    nome_lista = db.Column(db.String(50), nullable=False, index=True)
    valor = db.Column(db.String(120), nullable=False)

    __table_args__ = (
        db.UniqueConstraint('nome_lista', 'valor', name='uq_lista_valor'),
    )

    def __repr__(self) -> str:
        return f"<ConfigList {self.nome_lista}={self.valor}>"


class Colaborador(db.Model):
    __tablename__ = 'colaboradores'
    id = db.Column(db.Integer, primary_key=True)

    matricula = db.Column(db.Integer, nullable=False, index=True)
    nome = db.Column(db.String(120), nullable=False)

    tipo = db.Column(db.String(50), nullable=False)  # from list 'tipo'
    setor = db.Column(db.String(50), nullable=False)  # from list 'setor'
    area = db.Column(db.String(120), nullable=False)  # list 'area' (editable)
    turno = db.Column(db.String(50), nullable=False)  # from list 'turno'
    supervisor = db.Column(db.String(120), nullable=False)  # stored UPPER
    integracao = db.Column(db.String(10), nullable=False)  # from list 'integracao'

    data = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    observacao = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Colaborador {self.matricula} - {self.nome}>"
