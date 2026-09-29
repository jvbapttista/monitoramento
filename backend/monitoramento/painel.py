"""Monta o payload do painel a partir das coletas.

Nenhum numero aqui e inventado: tudo sai de coleta.py, que so devolve o que o
Zabbix respondeu. Quando um dado nao existe, o campo vai como null - a tela
sabe distinguir null de zero.
"""

import time

from . import capacidade, config, saude


def _media(valores):
    limpos = [v for v in valores if v is not None]
    return round(sum(limpos) / len(limpos), 1) if limpos else None


def _prioridade(maquina):
    """Ordem de atendimento. Quanto maior, mais cedo alguem precisa olhar."""
    pontos = 0
    if not maquina["online"]:
        pontos += 1000
    if maquina["sem_dados"] and maquina["online"]:
        pontos += 300
    if maquina["pior_severidade"] >= 0:
        pontos += maquina["pior_severidade"] * 100
    pontos += min(maquina["problemas"], 20) * 10
    if maquina["disco_livre"] is not None and maquina["disco_livre"] < config.DISCO_CRITICO_PCT:
        pontos += 60
    if maquina["memoria"] is not None and maquina["memoria"] >= config.MEMORIA_ALTA_PCT:
        pontos += 25
    if maquina["cpu"] is not None and maquina["cpu"] >= config.CPU_ALTA_PCT:
        pontos += 15
    return pontos


def _top(maquinas, campo, limite, maior_e_pior=True, quantos=8):
    """Maquinas mais extremas num recurso. Media esconde, isto mostra."""
    com_dado = [m for m in maquinas if m[campo] is not None and m["online"]]
    com_dado.sort(key=lambda m: m[campo], reverse=maior_e_pior)
    if maior_e_pior:
        acima = [m for m in com_dado if m[campo] >= limite]
    else:
        acima = [m for m in com_dado if m[campo] < limite]
    return {
        "media": _media([m[campo] for m in com_dado]),
        "medidos": len(com_dado),
        "limite": limite,
        "acima_do_limite": len(acima),
        "top": [
            {"hostid": m["hostid"], "hostname": m["hostname"],
             "projeto": m["projeto"], "valor": round(m[campo], 1),
             "extra": m.get("disco_volume") if campo == "disco_livre" else None}
            for m in com_dado[:quantos]
        ],
    }


def montar(parque, problemas, eventos, historico, conexao, versao, rede=None):
    """Junta tudo no formato que a tela consome."""
    # O instante de referencia e o da COLETA, nao o do relogio agora: assim a
    # idade de "sem contato" fica coerente com o retrato que esta sendo
    # montado, mesmo que a montagem demore.
    agora = parque.get("coletado_em") or int(time.time())
    maquinas = {hostid: dict(m) for hostid, m in parque["maquinas"].items()}

    for m in maquinas.values():
        m["problemas"] = 0
        m["problemas_ruido"] = 0
        # Problemas que existem, mas nao contam: a maquina esta desligada.
        m["problemas_offline"] = 0
        m["pior_severidade"] = -1
        m["lista_problemas"] = []

    # ------------------------------------------------ problemas por maquina
    por_severidade = {n: 0 for n in config.SEVERIDADES}
    por_escopo, por_nome = {}, {}
    relevantes, ruido, de_offline = [], 0, 0

    for p in problemas:
        maquina = maquinas.get(p["hostid"])
        if p["ruido"]:
            ruido += 1
            if maquina:
                maquina["problemas_ruido"] += 1
                maquina["lista_problemas"].append(p)
            continue

        # Maquina desligada nao tem problema - tem ausencia. O Zabbix dispara
        # "agent is not available" porque o agente parou de responder, o que e
        # a definicao de estar desligada, e nao uma falha a resolver.
        #
        # Medido em 25/08: esses alertas aparecem em ZERO maquinas online.
        # Contando-os, o cartao "Criticos" marcava 19 quando o numero real
        # era 1.
        #
        # O problema continua na lista DA MAQUINA, entao a janela dela mostra
        # tudo. O que ele deixa de fazer e virar numero na tela.
        if maquina and not maquina["online"]:
            p["de_offline"] = True
            de_offline += 1
            maquina["problemas_offline"] += 1
            maquina["lista_problemas"].append(p)
            continue

        relevantes.append(p)
        por_severidade[p["severidade"]] = por_severidade.get(p["severidade"], 0) + 1
        por_escopo[p["escopo"]] = por_escopo.get(p["escopo"], 0) + 1
        por_nome[p["nome"]] = por_nome.get(p["nome"], 0) + 1

        if maquina:
            maquina["problemas"] += 1
            maquina["lista_problemas"].append(p)
            if p["severidade"] > maquina["pior_severidade"]:
                maquina["pior_severidade"] = p["severidade"]

    lista = sorted(maquinas.values(), key=lambda m: m["hostname"])
    for m in lista:
        m["prioridade"] = _prioridade(m)
        m["lista_problemas"].sort(
            key=lambda p: (p.get("de_offline", False), p["ruido"],
                           -p["severidade"], p["inicio"]))

    # ------------------------------------------------------------- contagens
    total = len(lista)
    online = sum(1 for m in lista if m["online"])
    offline = total - online
    sem_dados = sum(1 for m in lista if m["sem_dados"] and m["online"])
    com_problema = sum(1 for m in lista if m["problemas"] > 0)
    com_critico = sum(1 for m in lista if m["pior_severidade"] >= config.SEVERIDADE_CRITICA)

    # Maquina desligada nao e problema; maquina que sumiu e. O corte esta em
    # config.HORAS_SEM_CONTATO - ver o docstring de saude.py para o porque.
    limite_contato = agora - config.HORAS_SEM_CONTATO * 3600
    sem_contato = sum(1 for m in lista
                      if not m["online"]
                      and (not m["visto_em"] or m["visto_em"] < limite_contato))
    desligadas = offline - sem_contato

    # Problema leve = tem problema aberto e NAO e grave. Sem este recorte a
    # mesma maquina descontava em duas parcelas do indice.
    problema_leve = sum(1 for m in lista
                        if m["problemas"] > 0
                        and m["pior_severidade"] < config.SEVERIDADE_CRITICA)
    disco_critico = sum(1 for m in lista
                        if m["disco_livre"] is not None
                        and m["disco_livre"] < config.DISCO_CRITICO_PCT)
    disco_atencao = sum(1 for m in lista
                        if m["disco_livre"] is not None
                        and config.DISCO_CRITICO_PCT <= m["disco_livre"] < config.DISCO_ATENCAO_PCT)
    cpu_alta = sum(1 for m in lista
                   if m["online"] and m["cpu"] is not None and m["cpu"] >= config.CPU_ALTA_PCT)
    mem_alta = sum(1 for m in lista
                   if m["online"] and m["memoria"] is not None
                   and m["memoria"] >= config.MEMORIA_ALTA_PCT)

    indice = saude.calcular({
        "sem_contato": sem_contato,
        "criticos": com_critico,
        "problemas": problema_leve,
        "disco": disco_critico,
        "sem_dados": sem_dados,
    }, total)

    # ------------------------------------------------------------- projetos
    projetos = {}
    for m in lista:
        reg = projetos.setdefault(m["projeto"], {
            "nome": m["projeto"], "total": 0, "online": 0, "offline": 0,
            "com_problema": 0, "criticos": 0, "disco_critico": 0,
            "pior_severidade": -1,
        })
        reg["total"] += 1
        reg["online" if m["online"] else "offline"] += 1
        if m["problemas"] > 0:
            reg["com_problema"] += 1
        if m["pior_severidade"] >= config.SEVERIDADE_CRITICA:
            reg["criticos"] += 1
        if m["disco_livre"] is not None and m["disco_livre"] < config.DISCO_CRITICO_PCT:
            reg["disco_critico"] += 1
        if m["pior_severidade"] > reg["pior_severidade"]:
            reg["pior_severidade"] = m["pior_severidade"]

    for reg in projetos.values():
        # fatia do projeto que precisa de atencao - permite comparar projetos
        # de tamanhos diferentes sem que o maior sempre pareca o pior
        afetadas = reg["offline"] + reg["com_problema"]
        reg["pct_afetado"] = round(min(100.0, afetadas / reg["total"] * 100), 1)
        reg["disponibilidade"] = round(reg["online"] / reg["total"] * 100, 1)

    # Cada linha declara se o grupo tem nome de cliente. A tela usa isso para
    # montar duas tabelas da MESMA lista, em vez de o backend devolver dois
    # blocos parecidos que podem sair de sincronia.
    for reg in projetos.values():
        reg["cliente"] = config.e_cliente(reg["nome"])

    lista_projetos = sorted(projetos.values(),
                            key=lambda r: (-r["criticos"], -r["pct_afetado"], -r["total"]))

    # ---------------------------------------------------------------- grupos
    grupos = {}
    for m in lista:
        for g in m["grupos"]:
            reg = grupos.setdefault(g, {"nome": g, "total": 0, "offline": 0, "com_problema": 0})
            reg["total"] += 1
            if not m["online"]:
                reg["offline"] += 1
            if m["problemas"] > 0:
                reg["com_problema"] += 1
    lista_grupos = sorted(grupos.values(), key=lambda r: -r["total"])

    # -------------------------------------------------------- top problemas
    #
    # Cada linha e uma pergunta operacional com resposta clicavel. As quatro
    # primeiras vem de metrica; o resto vem do nome do gatilho no Zabbix.
    top = []

    def talvez(quantos, rotulo, filtro, gravidade):
        if quantos:
            top.append({"quantos": quantos, "rotulo": rotulo,
                        "filtro": filtro, "gravidade": gravidade})

    # MAQUINA DESLIGADA NAO ENTRA AQUI, em nenhuma forma.
    #
    # Primeiro saiu "máquinas offline". Em 25/08/2026 saiu tambem "máquinas sem
    # contato há mais de Nh", que era a ultima sobrevivente da ideia de que
    # tempo desligado vira gravidade.
    #
    # O motivo e a operacao da monitoramento: ha escala 12x36 e turnos variados, entao
    # nao existe hora em que "ainda desligada" signifique alguma coisa. Uma
    # maquina parada ha 70 horas pode ser so o fim de semana de quem trabalha
    # de segunda a quinta.
    #
    # O sinal util nunca foi o TEMPO - e a maquina que nunca reportou nada (ver
    # pendencia 22 no INFRAESTRUTURA.md). Enquanto essa distincao nao existir,
    # e melhor nao afirmar nada do que afirmar o errado.
    #
    # Quem quiser ver as desligadas tem o cartao "Offline", que e o lugar
    # honesto para elas: informa, sem chamar de problema.
    talvez(com_critico, "máquinas com problema crítico",
           {"especial": "criticos", "severidade": str(config.SEVERIDADE_CRITICA)},
           "critico")
    talvez(disco_critico, "máquinas com disco abaixo de %g%% livre" % config.DISCO_CRITICO_PCT,
           {"especial": "disco"}, "critico")
    talvez(sem_dados, "máquinas sem medição recente",
           {"especial": "sem_dados"}, "alto")
    talvez(mem_alta, "máquinas com memória acima de %g%%" % config.MEMORIA_ALTA_PCT,
           {"especial": "memoria"}, "alto")
    talvez(cpu_alta, "máquinas com CPU acima de %g%%" % config.CPU_ALTA_PCT,
           {"especial": "cpu"}, "medio")
    talvez(disco_atencao, "máquinas com disco entre %g%% e %g%% livre"
           % (config.DISCO_CRITICO_PCT, config.DISCO_ATENCAO_PCT),
           {"especial": "disco_atencao"}, "medio")

    tipos = sorted(por_nome.items(), key=lambda x: -x[1])[:6]
    for nome, quantos in tipos:
        top.append({"quantos": quantos, "rotulo": nome,
                    "filtro": {"problema": nome}, "gravidade": "tipo"})

    # -------------------------------------------------------------- resposta
    return {
        "versao": versao,
        "gerado_em": parque["coletado_em"],
        "conexao": conexao,
        "saude": indice,
        # Pode ser None: a coleta de rede roda no ciclo lento e falha sozinha
        # sem derrubar o resto. A tela esconde o bloco quando vier vazio.
        "rede": rede,
        "formula_saude": saude.descricao_formula(),
        "capacidade": capacidade.montar(lista),
        # O mapa de blocos vai no payload para a tela nao ter uma segunda copia
        # da configuracao. Mudar de bloco e editar o .env, nao o JavaScript.
        "blocos": config.BLOCOS,

        "resumo": {
            "total": total,
            "online": online,
            "offline": offline,
            "sem_contato": sem_contato,
            "desligadas": desligadas,
            "horas_sem_contato": config.HORAS_SEM_CONTATO,
            # a tela refaz o recorte de "sem contato" no clique; para chegar ao
            # mesmo conjunto precisa do MESMO instante de referencia
            "coletado_em": agora,
            "problema_leve": problema_leve,
            "sem_dados": sem_dados,
            "com_problema": com_problema,
            "com_critico": com_critico,
            "disponibilidade": round(online / total * 100, 1) if total else None,
            "problemas": len(relevantes),
            "problemas_ruido": ruido,
            # Quantos alertas existem em maquina desligada. Nao entram em
            # nenhum outro numero - ficam aqui para a tela poder explicar
            # por que a soma "nao fecha" com o que o Zabbix mostra.
            "problemas_de_offline": de_offline,
            "criticos": por_severidade.get(4, 0) + por_severidade.get(5, 0),
            "desastre": por_severidade.get(5, 0),
            "alta": por_severidade.get(4, 0),
            "disco_critico": disco_critico,
            "disco_atencao": disco_atencao,
            "cpu_alta": cpu_alta,
            "memoria_alta": mem_alta,
        },

        "limites": {
            "disco_urgente": config.DISCO_URGENTE_PCT,
            "disco_critico": config.DISCO_CRITICO_PCT,
            "disco_atencao": config.DISCO_ATENCAO_PCT,
            "cpu_alta": config.CPU_ALTA_PCT,
            "memoria_alta": config.MEMORIA_ALTA_PCT,
            "offline_apos": config.OFFLINE_APOS,
            "sem_dados_apos": config.SEM_DADOS_APOS,
        },

        "recursos": {
            "cpu": _top(lista, "cpu", config.CPU_ALTA_PCT, True),
            "memoria": _top(lista, "memoria", config.MEMORIA_ALTA_PCT, True),
            "disco": _top(lista, "disco_livre", config.DISCO_CRITICO_PCT, False),
        },

        "problemas": relevantes,
        "problemas_ruido_total": ruido,
        "problemas_de_offline_total": de_offline,
        "top_problemas": top,
        "eventos": eventos,

        "por_severidade": [
            {"nivel": n, "rotulo": config.SEVERIDADES[n],
             "total": por_severidade.get(n, 0)}
            for n in sorted(config.SEVERIDADES, reverse=True)
        ],
        "por_escopo": sorted([{"nome": k, "total": v} for k, v in por_escopo.items()],
                             key=lambda x: -x["total"]),
        "por_projeto": lista_projetos,
        "por_grupo": lista_grupos,

        "maquinas": lista,
        "historico": historico,
        "escopos_ruido": config.ESCOPOS_RUIDO,
    }
