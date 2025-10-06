import pandas as pd

def carregar_dados(start_nome_arquivo: str, planilha_nome: str | None) -> pd.DataFrame | None:
    # start nome == "HC" tipo do arquivo .xlsb or xlsx or xls, Nome da planilha == "Base Colab."
    try:
        import pyxlsb
        dados = pd.read_excel(start_nome_arquivo, engine='pyxlsb', sheet_name=planilha_nome)
        dados = dados[["Matrícula", "Cargo", "Situação", "Turno"]]
        return dados
    except Exception as e:
        return None
    
