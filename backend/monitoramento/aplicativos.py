"""Ranking por número de máquinas com cada aplicativo, sem contar duplicatas.

O item opcional monitoramento.software.get recebe uma lista de objetos com
n (nome), v (versão) e d (data AAAA-MM-DD). O coletor não está incluído.
A consulta fica fora do ciclo rápido porque inventário de software é maior
 e muda com menos frequência que as métricas de recursos.
"""

import json

from . import config
from .coleta import projeto_de
from .zabbix import chamar

CHAVE = "monitoramento.software.get"


def parse_item(bruto):
    """Publica, e não _parse: monitoramento/detalhe.py usa a MESMA função para
    mostrar os aplicativos de UMA máquina na janela de detalhe, em vez de
    duplicar a lógica de decodificar o JSON do item."""
    return _parse(bruto)


def _parse(bruto):
    """JSON do item -> lista de apps. Tolerante a valor ausente ou quebrado:
    uma máquina com formato inesperado não pode derrubar o ranking inteiro."""
    if not bruto:
        return []
    try:
        lido = json.loads(bruto)
    except (ValueError, TypeError):
        return []
    if not isinstance(lido, list):
        return []

    saida = []
    for item in lido:
        if not isinstance(item, dict):
            continue
        if any(item.get(chave) is not None and not isinstance(item[chave], str)
               for chave in ['n', 'v', 'd']):
            continue
        nome = (item.get("n") or "").strip()
        if not nome:
            continue
        saida.append({
            "nome": nome,
            "versao": (item.get("v") or "").strip() or None,
            "instalado_em": (item.get("d") or "").strip() or None,
        })
    return saida


def montar(projeto=None, ambiente=None, limite=200):
    """Ranking de aplicativos por quantidade de máquinas.

    projeto: prefixo de cliente (ex: "PROJETO-A"), mesmo valor de
             config.grupo_de_filtro - filtra antes de contar.
    ambiente: "nuvem" ou "local", mesmo valor de config.ambiente_de.
    limite: máximo de aplicativos distintos devolvidos (a lista completa de
            um parque grande pode passar de mil nomes distintos entre
            versões de driver, patch de terceiros etc. - só os mais
            presentes é que respondem "quais aplicativos usamos").

    Levanta ZabbixIndisponivel (de .zabbix) se o Zabbix não responder -
    tratado pela rota, igual aos outros módulos.
    """
    itens = chamar("item.get", {
        "output": ["itemid", "hostid", "lastvalue", "lastclock"],
        "selectHosts": ["hostid", "host", "name"],
        "filter": {"key_": CHAVE},
        "monitored": True,
    })
    itens = [i for i in itens if i.get("hosts")]

    ranking = {}
    filtros = {}          # opções reais do seletor de projeto, por prefixo
    maquinas_medindo = 0
    coletado_mais_antigo = None

    for i in itens:
        h = i["hosts"][0]
        hostname = h.get("host") or h.get("name") or "?"
        proj = projeto_de(hostname)
        amb = config.ambiente_de(hostname)
        grupo_filtro = config.grupo_de_filtro(proj)

        apps = _parse(i.get("lastvalue"))
        if not apps:
            # Máquina sem este item ainda (coletor opcional não passou nela, ou
            # passou e não achou nada) - não entra na base de "medindo",
            # mesmo raciocínio de capacidade.py: contar quem não tem dado
            # como se tivesse zero programas mentiria sobre o parque.
            continue

        # As opções do seletor de projeto vêm de quem REALMENTE tem dado
        # aqui - um projeto sem nenhuma máquina reportando não deveria
        # aparecer como opção que devolve lista vazia.
        filtros[grupo_filtro] = filtros.get(grupo_filtro, 0) + 1

        if projeto and grupo_filtro != projeto:
            continue
        if ambiente and amb != ambiente:
            continue

        maquinas_medindo += 1
        clock = int(i.get("lastclock") or 0)
        if clock and (coletado_mais_antigo is None or clock < coletado_mais_antigo):
            coletado_mais_antigo = clock

        vistos_nesta_maquina = set()
        for app in apps:
            chave_app = app["nome"].strip().lower()
            if chave_app in vistos_nesta_maquina:
                continue
            vistos_nesta_maquina.add(chave_app)

            reg = ranking.get(chave_app)
            if not reg:
                reg = ranking[chave_app] = {
                    "nome": app["nome"], "quantas": 0, "maquinas": [],
                }
            reg["quantas"] += 1
            reg["maquinas"].append({
                "hostid": h["hostid"],
                "hostname": hostname,
                "projeto": proj,
                "versao": app["versao"],
                "instalado_em": app["instalado_em"],
            })

    lista = sorted(ranking.values(),
                    key=lambda r: (-r["quantas"], r["nome"].lower()))[:limite]

    return {
        "maquinas_medindo": maquinas_medindo,
        "total_apps_distintos": len(ranking),
        "coletado_mais_antigo": coletado_mais_antigo,
        "ranking": lista,
        "filtros": [
            {"valor": chave, "nome": config.nome_projeto(chave), "quantas": n}
            for chave, n in sorted(filtros.items(), key=lambda kv: kv[0])
        ],
    }
