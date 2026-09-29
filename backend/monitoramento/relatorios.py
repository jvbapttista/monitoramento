# -*- coding: utf-8 -*-
"""Presença do agente: amostras recebidas / uma amostra esperada por minuto.

Consulta history.get em fatias diárias para limitar a resposta. Não mede SLA:
retenção insuficiente, mudança de intervalo e estações desligadas alteram o
percentual. Ausência de amostras resulta em zero recebido, sem distinguir a
causa. Hosts sem item agent.ping não entram no relatório.
"""

import collections
import time

from . import config
from .coleta import projeto_de
from .zabbix import chamar

#: Uma leitura por minuto e o esperado de `agent.ping`.
PONTOS_POR_DIA = 1440

#: Ate onde se pode pedir. Acima disso a varredura passa de meio minuto e o
#: numero para de ser util - vira arqueologia.
DIAS_MAX = 90


def disponibilidade(dias=7):
    """Percentual de presenca por maquina e por projeto no periodo.

    Levanta ZabbixIndisponivel se o servidor nao responder.
    """
    dias = max(1, min(int(dias or 7), DIAS_MAX))
    agora = int(time.time())
    inicio = agora - dias * 86400

    hosts = chamar("host.get", {
        "output": ["hostid", "host", "name"],
        "monitored_hosts": True,
    })
    nome = {h["hostid"]: (h.get("host") or h.get("name") or "?") for h in hosts}

    itens = chamar("item.get", {
        "output": ["itemid", "hostid"],
        "filter": {"key_": "agent.ping"},
        "monitored": True,
    })
    if not itens:
        return {"dias": dias, "gerado_em": agora, "maquinas": [], "projetos": []}

    de_item = {i["itemid"]: i["hostid"] for i in itens}
    ids = list(de_item)

    # Dia a dia, e nao o periodo inteiro de uma vez: 30 dias numa chamada so
    # seriam ~3 milhoes de registros atravessando a rede e a memoria de uma vez.
    recebidos = collections.Counter()
    for d in range(dias):
        janela_ini = inicio + d * 86400
        janela_fim = min(janela_ini + 86400, agora)
        if janela_fim <= janela_ini:
            continue
        pontos = chamar("history.get", {
            "itemids": ids,
            "history": 3,
            "time_from": janela_ini,
            "time_till": janela_fim - 1,
            "output": ["itemid"],
            "limit": 1000000,
        })
        for p in pontos:
            recebidos[p["itemid"]] += 1

    esperado = PONTOS_POR_DIA * dias

    maquinas = []
    for itemid, hostid in de_item.items():
        n = recebidos.get(itemid, 0)
        h = nome.get(hostid, hostid)
        maquinas.append({
            "hostid": hostid,
            "hostname": h,
            "projeto": projeto_de(h),
            "ambiente": config.ambiente_de(h),
            "pontos": n,
            "esperado": esperado,
            "pct": round(min(100.0, n / esperado * 100), 1) if esperado else 0.0,
        })
    maquinas.sort(key=lambda m: m["pct"])

    # Por projeto: a media das maquinas dele, e nao a soma dos pontos. Somar
    # faria um projeto de 46 maquinas pesar 46 vezes mais que um de 1, e a
    # pergunta aqui e "como esta cada operacao", nao "quem tem mais maquina".
    por_projeto = collections.defaultdict(list)
    for m in maquinas:
        por_projeto[m["projeto"]].append(m["pct"])
    projetos = [
        {"projeto": p, "maquinas": len(v), "pct": round(sum(v) / len(v), 1)}
        for p, v in por_projeto.items()
    ]
    projetos.sort(key=lambda p: p["pct"])

    return {
        "dias": dias,
        "gerado_em": agora,
        "esperado_por_maquina": esperado,
        "maquinas": maquinas,
        "projetos": projetos,
    }
