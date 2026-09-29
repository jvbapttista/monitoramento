"""Detalhe de um host, consultado sob demanda.

Por que nao vem na coleta geral: rede, processos e volumes por host somam mais
de 800 itens no parque atual. Buscar isso a cada ciclo triplicaria a chamada
mais cara do sistema para alimentar uma tela que quase nunca esta aberta.
Aqui a conta e outra - uma pessoa abriu UM host e quer ver tudo dele.
"""

import json
import time

from . import config
from .abas import CHAVE as CHAVE_ABAS, parse_item as _parse_abas
from .aplicativos import CHAVE as CHAVE_APLICATIVOS, parse_item as _parse_aplicativos
from .coleta import num, projeto_de, escopo_de, volume_da_chave
from .rede import Rede
from .zabbix import chamar

CHAVES_DETALHE = [
    "system.cpu.util", "vm.memory.util", "vm.memory.size",
    "vfs.fs.dependent.size", "system.uptime", "system.sw.os",
    "system.hostname", "agent.version", "agent.ping",
    "zabbix[host,active_agent,available]",
    "net.if.in", "net.if.out", "net.if.speed", "net.if.status",
    "proc.num", "system.users.num", "system.cpu.num", "system.cpu.load",
    # Programas em execucao, do template MONITORAMENTO - Processos. Chega como JSON ja
    # reduzido pelo pre-processamento do Zabbix.
    "proc.get[,,,summary]",
    # Numero de processadores logicos, via WMI. Ja vem do template de fabrica.
    # E o denominador da porcentagem de CPU por programa - sem ele, a coluna
    # fica vazia. system.cpu.num seria o caminho obvio e NAO existe neste
    # parque; conferido em 24/08, host por host.
    "NumberOfLogicalProcessors",
    # Aplicativos instalados - trapper alimentado pelo coletor opcional, nao pelo
    # agente (ver monitoramento/aplicativos.py). E OUTRA pergunta da "programas em
    # execucao" logo acima: aquilo e o Gerenciador de Tarefas de agora,
    # isto e o Painel de Controle > Programas - o que esta instalado, rode
    # ou nao neste instante.
    CHAVE_APLICATIVOS,
    # Abas de navegador abertas - mesmo esquema do item acima (trapper do
    # coletor opcional, ver monitoramento/abas.py e scripts/monitoramento_browser_tabs.ps1), so que
    # muda a todo instante em vez de raramente.
    CHAVE_ABAS,
]


def _ler_programas(bruto):
    """Traduz o JSON do item de processos para o que a tela usa.

    Formato gravado pelo Zabbix (ja reduzido la):
        {"t": nomes distintos no total, "p": [{"n": nome, "q": processos,
                                               "m": memoria em KB}]}

    Devolve None quando nao ha o que ler - ai a tela diz "sem coleta" em vez de
    mostrar uma lista vazia, que pareceria uma maquina sem programa nenhum.
    """
    if not bruto:
        return None
    try:
        d = json.loads(bruto)
    except (ValueError, TypeError):
        return None
    if isinstance(d, list):          # formato antigo, antes do campo "t"
        d = {"t": len(d), "p": d}
    itens = d.get("p") or []
    saida = []
    for p in itens:
        nome = (p.get("n") or "").strip()
        if not nome:
            continue
        kb = p.get("m") or 0
        saida.append({
            "nome": nome,
            "processos": int(p.get("q") or 1),
            "memoria_mb": round(kb / 1024.0, 1),
            # Acumulado em segundos. Sozinho nao serve para a tela - vira
            # porcentagem em _cpu_por_programa, comparando duas coletas.
            "cpu_s": p.get("c"),
        })
    return {"lista": saida, "distintos": int(d.get("t") or len(saida))}


def _cpu_por_programa(itemid, nucleos):
    """Porcentagem de CPU por programa, a partir de DUAS coletas.

    O agente nao entrega "% agora" por processo. Entrega cputime acumulado
    desde que o processo subiu - um navegador aberto ha oito horas tem cputime
    enorme e pode estar parado neste instante. Mostrar o acumulado como se
    fosse uso atual seria mentira, e seria a mentira que mais engana: os
    numeros ate parecem certos.

    A porcentagem sai da DIFERENCA entre dois pontos do historico:

        (cpu2 - cpu1) / (t2 - t1) / nucleos * 100

    Dividir pelos nucleos e o que faz o numero bater com o Gerenciador de
    Tarefas: la, 100% e a maquina inteira, nao um nucleo. Um processo de uma
    thread saturando um nucleo numa maquina de 8 aparece como 12,5%.

    Devolve {} quando ainda nao ha dois pontos - o que acontece nos primeiros
    5 minutos de cada maquina. A tela mostra a coluna vazia, nao um zero: zero
    afirmaria que o processo esta parado, e nao e isso que sabemos.
    """
    if not itemid or not nucleos:
        return {}
    pontos = chamar("history.get", {
        "itemids": itemid, "history": 4,     # 4 = text
        "sortfield": "clock", "sortorder": "DESC", "limit": 2,
    })
    if len(pontos) < 2:
        return {}

    dt = int(pontos[0]["clock"]) - int(pontos[1]["clock"])
    if dt <= 0:
        return {}

    def mapa(bruto):
        lido = _ler_programas(bruto)
        if not lido:
            return None
        return {p["nome"]: p["cpu_s"] for p in lido["lista"]}

    novo, velho = mapa(pontos[0]["value"]), mapa(pontos[1]["value"])
    if not novo or not velho:
        return {}

    saida = {}
    for nome, agora in novo.items():
        antes = velho.get(nome)
        if antes is None or agora is None:
            continue
        # Processo que reiniciou zera o contador e daria diferenca negativa.
        # Nao da para saber quanto ele gastou antes de morrer, entao ele fica
        # de fora em vez de aparecer como 0%.
        delta = agora - antes
        if delta < 0:
            continue
        pct = delta / float(dt) / float(nucleos) * 100.0
        # Teto em 100: arredondamento e processo que nasceu no meio da janela
        # podem estourar um pouco, e "112% de CPU" so faria a pessoa duvidar
        # do resto da tela.
        saida[nome] = round(min(pct, 100.0), 1)
    return saida


def _rotulo_interface(chave):
    """De 'net.if.in["{GUID}"]' extrai o GUID, que e como o Windows nomeia.

    Serve so de CHAVE de agrupamento - o GUID nao vai para a tela. O nome que
    a pessoa reconhece ("Intel(R) Wireless-AC 9560") vem do campo `name` do
    item, e quem o extrai e Rede.rotulo(). Ver monitoramento/rede.py.
    """
    return volume_da_chave(chave)


def obter(hostid):
    """Tudo que o Zabbix tem sobre um host. Levanta ZabbixIndisponivel."""
    agora = int(time.time())

    hosts = chamar("host.get", {
        "output": ["hostid", "host", "name", "status", "description"],
        "selectInterfaces": ["ip", "dns", "port", "type", "available"],
        "selectHostGroups": ["groupid", "name"],
        "selectParentTemplates": ["templateid", "name"],
        "hostids": hostid,
    })
    if not hosts:
        return None
    h = hosts[0]
    hostname = h.get("host") or h.get("name") or "?"

    itens = chamar("item.get", {
        "output": ["itemid", "key_", "name", "lastvalue", "lastclock",
                   "units", "value_type", "type"],
        "hostids": hostid,
        "search": {"key_": [k for k in CHAVES_DETALHE if k != CHAVE_ABAS or config.DADOS_PESSOAIS]},
        "searchByAny": True,
        "monitored": True,
    })

    dados = {
        "cpu": None, "memoria": None, "memoria_total": None, "memoria_livre": None,
        "uptime": None, "sistema": None, "hostname_agente": None,
        "versao_agente": None, "agente_disponivel": None, "agente_ping": None,
        "processos": None, "usuarios": None, "cpu_nucleos": None, "cpu_carga": None,
        # Lista de programas por nome, e o instante em que foi coletada.
        # None = o item ainda nao existe ou nunca reportou; [] = reportou vazio.
        "programas": None, "programas_em": None, "programas_distintos": None,
        # Aplicativos INSTALADOS (nao processos rodando) - mesmo par
        # None/[] pelo mesmo motivo acima.
        "aplicativos": None, "aplicativos_em": None,
        # Abas de navegador por processo (ver monitoramento/abas.py). Mesma regra
        # None/dict-vazio: None = nunca coletou, {} = coletou e nao achou
        # navegador aberto.
        "abas": None, "abas_em": None,
    }
    volumes, interfaces = {}, {}
    itemid_cpu, itemid_mem = None, None
    itemid_prog = None
    visto_em = 0

    for item in itens:
        chave = item.get("key_") or ""
        bruto = item.get("lastvalue")
        valor = num(bruto)
        quando = int(item.get("lastclock") or 0)

        # so item vindo do agente conta como contato - item calculado pelo
        # servidor tem carimbo novo mesmo com o agente morto. Ver
        # config.TIPOS_DO_AGENTE.
        if int(item.get("type", -1)) in config.TIPOS_DO_AGENTE:
            visto_em = max(visto_em, quando)

        if chave == "system.sw.os":
            dados["sistema"] = (bruto or "").strip() or None
        elif chave == "system.hostname":
            dados["hostname_agente"] = bruto or None
        elif chave == "agent.version":
            dados["versao_agente"] = bruto or None
        elif chave == "agent.ping":
            dados["agente_ping"] = valor
        elif chave == "system.cpu.util":
            dados["cpu"] = valor
            itemid_cpu = item["itemid"]
        elif chave == "vm.memory.util":
            dados["memoria"] = valor
            itemid_mem = item["itemid"]
        elif chave == "vm.memory.size[total]":
            dados["memoria_total"] = valor
        elif chave == "vm.memory.size[available]":
            dados["memoria_livre"] = valor
        elif chave == "system.uptime":
            dados["uptime"] = valor
        elif chave == "zabbix[host,active_agent,available]":
            dados["agente_disponivel"] = int(valor) if valor is not None else None
        elif chave == "proc.get[,,,summary]":
            itemid_prog = item["itemid"]
            # O pre-processamento no Zabbix ja agregou por nome e cortou nos 40
            # que mais consomem memoria. Aqui so se traduz KB -> MB e se guarda
            # o carimbo: e ele que a tela mostra como "coletado ha X min", e sem
            # ele a lista pareceria mais fresca do que e.
            lido = _ler_programas(bruto)
            if lido is not None:
                dados["programas"] = lido["lista"]
                dados["programas_distintos"] = lido["distintos"]
                dados["programas_em"] = quando
            continue
        elif chave == CHAVE_APLICATIVOS:
            # "not bruto" e nao "bruto is not None": o Zabbix devolve
            # string vazia para item que nunca reportou, e e ISSO que
            # precisa continuar None (mesma regra de _ler_programas acima -
            # "nunca coletou" nao pode aparecer igual a "coletou e nao achou
            # nada", que teria bruto = "[]", uma string nao vazia).
            if bruto:
                dados["aplicativos"] = _parse_aplicativos(bruto)
                dados["aplicativos_em"] = quando
            continue
        elif chave == CHAVE_ABAS:
            # Mesma regra de "string vazia continua None" do bloco acima.
            if bruto:
                dados["abas"] = _parse_abas(bruto)
                dados["abas_em"] = quando
            continue
        elif chave.startswith("proc.num"):
            dados["processos"] = valor
        elif chave == "system.users.num":
            dados["usuarios"] = valor
        elif "NumberOfLogicalProcessors" in chave:
            # Fallback: so preenche se system.cpu.num nao tiver preenchido
            # antes. A ordem dos itens na resposta do Zabbix nao e garantida,
            # entao a preferencia precisa estar escrita, e nao depender de sorte.
            if valor and not dados["cpu_nucleos"]:
                dados["cpu_nucleos"] = int(valor)
        elif chave == "system.cpu.num":
            dados["cpu_nucleos"] = valor
        elif chave.startswith("system.cpu.load"):
            dados["cpu_carga"] = valor
        elif chave.startswith("vfs.fs.dependent.size["):
            vol = volume_da_chave(chave)
            reg = volumes.setdefault(vol, {})
            if chave.endswith(",pused]"):
                reg["usado"] = valor
            elif chave.endswith(",total]"):
                reg["total"] = valor
        elif chave.startswith(("net.if.in[", "net.if.out[", "net.if.speed[", "net.if.status[")):
            iface = _rotulo_interface(chave)
            reg = interfaces.setdefault(iface, {})
            # O nome legivel so aparece no `name` do item; a chave tem o GUID.
            # Basta o primeiro item da interface para descobri-lo.
            if "nome" not in reg:
                reg["nome"] = Rede.rotulo(item.get("name"), iface)
                reg["familia"] = Rede.familia(reg["nome"])
            if chave.startswith("net.if.in[") and "," not in chave:
                reg["entrada_bps"] = valor
            elif chave.startswith("net.if.out[") and "," not in chave:
                reg["saida_bps"] = valor
            elif chave.startswith("net.if.speed["):
                reg["velocidade"] = valor
            elif chave.startswith("net.if.status["):
                reg["ativa"] = (valor == 1)

    lista_volumes = []
    for vol, reg in volumes.items():
        if reg.get("usado") is None:
            continue
        total_gb = round(reg["total"] / (1024 ** 3), 1) if reg.get("total") else None
        livre = round(100.0 - reg["usado"], 1)
        lista_volumes.append({
            "volume": vol, "livre": livre, "usado": round(reg["usado"], 1),
            "total_gb": total_gb,
            "livre_gb": round(total_gb * livre / 100, 1) if total_gb else None,
        })
    lista_volumes.sort(key=lambda v: v["livre"])

    # Adaptador de VPN fica de fora: ele existe em quase toda maquina, vive
    # com trafego zero e "link down" quando a VPN esta desligada, e empurraria
    # a placa de verdade para fora da tela.
    lista_interfaces = [
        i for i in interfaces.values()
        if i.get("familia") != "virtual"
        and (i.get("entrada_bps") is not None or i.get("saida_bps") is not None)
    ]

    # "Ativa" deixa de sair de net.if.status. Medido em 26/08: aquele item vem
    # `false` ate em placa com 13 Mbps passando - ele so atualiza quando muda,
    # e o valor guardado envelhece. Trafego agora e uma afirmacao que se
    # sustenta sozinha; velocidade de enlace conhecida e o segundo melhor
    # sinal de que ha cabo do outro lado.
    for i in lista_interfaces:
        passando = (i.get("entrada_bps") or 0) + (i.get("saida_bps") or 0)
        i["ativa"] = passando > 0 or bool(i.get("velocidade"))
        i["total_bps"] = passando

    lista_interfaces.sort(key=lambda i: -i["total_bps"])

    # ------------------------------------------------- problemas deste host
    gatilhos = chamar("trigger.get", {
        "output": ["triggerid", "description", "priority", "lastchange"],
        "selectTags": "extend",
        "hostids": hostid,
        "filter": {"value": 1},
        "monitored": True,
        "skipDependent": True,
    })
    problemas = []
    for g in gatilhos:
        escopo = escopo_de(g.get("tags"))
        inicio = int(g.get("lastchange") or 0)
        problemas.append({
            "triggerid": g["triggerid"],
            "nome": g.get("description") or "(sem descricao)",
            "severidade": int(g.get("priority") or 0),
            "inicio": inicio,
            "duracao": max(0, agora - inicio) if inicio else None,
            "escopo": escopo,
            "ruido": escopo in config.ESCOPOS_RUIDO,
        })
    problemas.sort(key=lambda p: (p["ruido"], -p["severidade"], p["inicio"]))

    # -------------------------------------------------- eventos deste host
    eventos = chamar("event.get", {
        "output": ["eventid", "clock", "severity", "value", "name"],
        "selectTags": ["tag", "value"],
        "hostids": hostid,
        "source": 0, "object": 0,
        "time_from": agora - 24 * 3600,
        "sortfield": ["clock"], "sortorder": "DESC",
        "limit": 200,
    })
    linha_do_tempo = []
    for e in eventos:
        escopo = escopo_de(e.get("tags"))
        if escopo in config.ESCOPOS_RUIDO:
            continue
        linha_do_tempo.append({
            "eventid": e["eventid"],
            "quando": int(e.get("clock") or 0),
            "severidade": int(e.get("severity") or 0),
            "abriu": e.get("value") == "1",
            "nome": e.get("name") or "",
        })
        if len(linha_do_tempo) >= 40:
            break

    # -------------------------------------------------- series deste host
    series = {"cpu": [], "memoria": []}
    ids = [i for i in (itemid_cpu, itemid_mem) if i]
    if ids:
        desde = agora - config.JANELA_MIN * 60
        historico = chamar("history.get", {
            "history": 0, "itemids": ids, "time_from": desde,
            "output": ["itemid", "clock", "value"], "limit": 20000,
            "sortfield": "clock", "sortorder": "ASC",
        })
        for p in historico:
            valor = num(p.get("value"))
            clock = int(p["clock"])
            if valor is None or clock > agora or clock < desde:
                continue
            alvo = "cpu" if p["itemid"] == itemid_cpu else "memoria"
            series[alvo].append({"t": clock, "v": round(valor, 2)})

    online = (dados["agente_disponivel"] == 1 if dados["agente_disponivel"] is not None
              else (visto_em > 0 and (agora - visto_em) <= config.OFFLINE_APOS))

    sem_dados = visto_em == 0 or (agora - visto_em) > config.SEM_DADOS_APOS

    # Agente calado ha muito tempo: guardamos o ultimo valor conhecido em
    # "ultima_medicao" e limpamos o campo atual. Aqui, diferente da tela geral,
    # vale a pena manter o historico visivel - a pessoa abriu ESTA maquina para
    # investigar - mas rotulado como o que e: a ultima medicao, nao a de agora.
    # A porcentagem de CPU por programa depende de DUAS coletas, entao so pode
    # ser calculada depois do laco de itens. Fica aqui, antes do trecho de
    # maquina calada, porque nao tem relacao com ele - misturar as duas coisas
    # foi exatamente o erro que zerou o detalhe inteiro em 24/08.
    if dados["programas"]:
        try:
            pct = _cpu_por_programa(itemid_prog, dados.get("cpu_nucleos"))
        except Exception:
            pct = {}          # historico indisponivel nao derruba o detalhe
        for prog in dados["programas"]:
            prog["cpu_pct"] = pct.get(prog["nome"])
            prog.pop("cpu_s", None)     # bruto acumulado nao serve a tela
        dados["cpu_por_programa"] = bool(pct)

    ultima_medicao = None
    if sem_dados:
        ultima_medicao = {
            "quando": visto_em,
            "cpu": dados["cpu"], "memoria": dados["memoria"],
            "uptime": dados["uptime"], "volumes": lista_volumes,
        }
        # "programas" entra nesta lista pelo mesmo motivo que os demais: a
        # maquina esta calada, e mostrar a ultima lista de processos como se
        # fosse a de agora e pior do que nao mostrar nada. Quem quiser o que
        # havia antes tem "ultima_medicao" logo acima.
        for campo in ("cpu", "memoria", "memoria_livre", "uptime",
                      "processos", "usuarios", "cpu_carga",
                      "programas", "programas_em", "programas_distintos"):
            dados[campo] = None
        lista_volumes = []
        lista_interfaces = []

    return {
        "hostid": hostid,
        "hostname": hostname,
        "nome_visivel": h.get("name") or hostname,
        "projeto": projeto_de(hostname),
        "descricao": (h.get("description") or "").strip() or None,
        "grupos": [g["name"] for g in (h.get("hostgroups") or [])],
        "templates": [t["name"] for t in (h.get("parentTemplates") or [])],
        "interfaces_zabbix": [
            {"ip": i.get("ip"), "dns": i.get("dns"), "porta": i.get("port")}
            for i in (h.get("interfaces") or [])
        ],
        "online": online,
        "visto_em": visto_em,
        "sem_dados": sem_dados,
        "ultima_medicao": ultima_medicao,
        "recursos": dados,
        "volumes": lista_volumes,
        "interfaces_rede": lista_interfaces,
        "problemas": problemas,
        "linha_do_tempo": linha_do_tempo,
        "series": series,
        "janela_min": config.JANELA_MIN,
        "gerado_em": agora,
    }
