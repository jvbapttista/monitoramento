"""Monitoramento - nucleo da aplicacao.

    config.py    variaveis de ambiente e limites
    zabbix.py    unico ponto que fala com a API do Zabbix
    coleta.py    consultas ao Zabbix (parque, problemas, eventos)
    series.py    series temporais de CPU e memoria
    detalhe.py   tudo sobre um host, sob demanda
    saude.py     indice de saude do parque
    painel.py    monta o payload que a tela consome
    estado.py    cache em memoria e o laco de coleta

O modulo app.py na raiz so expoe rotas: nenhuma regra de negocio mora la.
"""

__all__ = ["config", "zabbix", "coleta", "series", "detalhe", "saude", "painel", "estado"]
