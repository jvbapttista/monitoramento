"""Coleta do parque.

Separada em duas velocidades de proposito:

  coletar_problemas()  - barata (~0,2 s). Problemas abertos e eventos recentes.
                         E o que muda a toda hora e o que a operacao precisa
                         ver agora.

  coletar_parque()     - cara (~2 s). Hosts, grupos e metricas de CPU, memoria
                         e disco. Muda devagar: os agentes reportam de minuto
                         em minuto, entao recoletar de 5 em 5 segundos so
                         gastaria o Zabbix sem trazer dado novo.

Quem combina as duas e montar_painel().
"""

import time

from . import config
from .zabbix import chamar


# ------------------------------------------------------------------ auxiliares

def projeto_de(hostname):
    alvo = (hostname or "").upper()
    for projeto in config.PROJETOS:
        if projeto in alvo:
            return projeto
    return "OUTROS"


def num(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def volume_da_chave(chave):
    """De 'vfs.fs.dependent.size[C:,pused]' extrai 'C:'."""
    try:
        miolo = chave[chave.index("[") + 1:chave.rindex("]")]
        return miolo.split(",")[0].strip().strip('"') or "?"
    except ValueError:
        return "?"


def escopo_de(tags):
    for tag in (tags or []):
        if tag.get("tag") == "scope" and tag.get("value"):
            return tag["value"]
    return "outros"


def componente_de(tags):
    """Tag 'component' do Zabbix: cpu, memory, storage, network, system..."""
    for tag in (tags or []):
        if tag.get("tag") == "component" and tag.get("value"):
            return tag["value"]
    return None


# ------------------------------------------------------- problemas (rapido)

# triggerid -> [{"hostid","hostname"}]. O problem.get do Zabbix 7.4 nao aceita
# selectHosts, entao o vinculo com o host vem de um trigger.get. Manter o mapa
# em memoria evita repetir essa chamada a cada 5 s: so os gatilhos novos sao
# consultados.
_mapa_gatilhos = {}


def coletar_problemas():
    """Problemas abertos agora, ja com host, escopo e duracao."""
    agora = int(time.time())

    brutos = chamar("problem.get", {
        "output": ["eventid", "objectid", "clock", "name", "severity",
                   "acknowledged", "suppressed", "opdata"],
        "selectTags": ["tag", "value"],
        "source": 0, "object": 0,
        "sortfield": ["eventid"], "sortorder": "DESC",
        "limit": 20000,
    })

    faltando = [p["objectid"] for p in brutos if p["objectid"] not in _mapa_gatilhos]
    if faltando:
        gatilhos = chamar("trigger.get", {
            "output": ["triggerid"],
            "selectHosts": ["hostid", "host"],
            "triggerids": list(set(faltando)),
        })
        for g in gatilhos:
            _mapa_gatilhos[g["triggerid"]] = [
                {"hostid": h["hostid"], "hostname": h.get("host") or "?"}
                for h in (g.get("hosts") or [])
            ]
        # gatilho que nao voltou (removido do Zabbix) marca vazio para nao
        # ser consultado de novo a cada ciclo
        for tid in faltando:
            _mapa_gatilhos.setdefault(tid, [])

    problemas = []
    for p in brutos:
        tags = p.get("tags") or []
        escopo = escopo_de(tags)
        for host in _mapa_gatilhos.get(p["objectid"]) or []:
            inicio = int(p.get("clock") or 0)
            problemas.append({
                "eventid": p["eventid"],
                "triggerid": p["objectid"],
                "hostid": host["hostid"],
                "hostname": host["hostname"],
                "projeto": projeto_de(host["hostname"]),
                "nome": p.get("name") or "(sem descricao)",
                "severidade": int(p.get("severity") or 0),
                "inicio": inicio,
                "duracao": max(0, agora - inicio) if inicio else None,
                "reconhecido": p.get("acknowledged") == "1",
                "suprimido": p.get("suppressed") == "1",
                "escopo": escopo,
                "componente": componente_de(tags),
                "ruido": escopo in config.ESCOPOS_RUIDO,
                "opdata": p.get("opdata") or "",
            })

    problemas.sort(key=lambda x: (x["ruido"], -x["severidade"], x["inicio"]))
    return problemas


def coletar_eventos():
    """Feed do que mudou: problemas abertos e resolvidos nas ultimas horas."""
    agora = int(time.time())
    desde = agora - config.JANELA_EVENTOS_H * 3600

    brutos = chamar("event.get", {
        "output": ["eventid", "clock", "severity", "value", "name"],
        "selectHosts": ["hostid", "host"],
        "selectTags": ["tag", "value"],
        "source": 0, "object": 0,
        "time_from": desde,
        "sortfield": ["clock"], "sortorder": "DESC",
        "limit": 5000,
    })

    eventos = []
    descartados = 0
    for e in brutos:
        escopo = escopo_de(e.get("tags"))
        if escopo in config.ESCOPOS_RUIDO:
            descartados += 1
            continue
        hosts = e.get("hosts") or []
        eventos.append({
            "eventid": e["eventid"],
            "quando": int(e.get("clock") or 0),
            "severidade": int(e.get("severity") or 0),
            "abriu": e.get("value") == "1",     # 1 = problema, 0 = recuperado
            "nome": e.get("name") or "(sem descricao)",
            "hostid": hosts[0]["hostid"] if hosts else None,
            "hostname": hosts[0].get("host") if hosts else "?",
            "escopo": escopo,
        })
        if len(eventos) >= config.MAX_EVENTOS_FEED:
            break

    return {"itens": eventos, "descartados_ruido": descartados,
            "janela_h": config.JANELA_EVENTOS_H}


# --------------------------------------------------------- parque (completo)

def coletar_parque():
    """Hosts, grupos e metricas de recurso. A parte cara do ciclo."""
    agora = int(time.time())

    hosts = chamar("host.get", {
        "output": ["hostid", "host", "name", "status"],
        "selectInterfaces": ["ip"],
        "selectHostGroups": ["groupid", "name"],
        "filter": {"status": 0},
        "sortfield": "host",
    })

    maquinas = {}
    for h in hosts:
        interfaces = h.get("interfaces") or []
        grupos = [g["name"] for g in (h.get("hostgroups") or [])]
        hostname = h.get("host") or h.get("name") or "?"
        maquinas[h["hostid"]] = {
            "hostid": h["hostid"],
            "hostname": hostname,
            "nome_visivel": h.get("name") or hostname,
            "projeto": projeto_de(hostname),
            "bloco": config.bloco_de(projeto_de(hostname)),
            # "nuvem" ou "local" - ver config.ambiente_de.
            "ambiente": config.ambiente_de(hostname),
            # Servidor e decidido pelo SISTEMA OPERACIONAL, nao pelo nome. O
            # prefixo "SRV" no hostname e convencao, e convencao falha: uma
            # maquina renomeada errado sairia da lista de servidores sem
            # ninguem notar. "Windows Server" no system.sw.os e o proprio
            # sistema se declarando - verificado, 5 maquinas + o servidor
            # Linux do Zabbix.
            "servidor": False,
            # "desktop", "notebook", "servidor" ou None quando o item de
            # PCSystemType ainda nao existe no Zabbix. None faz a planta cair
            # no icone de monitor, que e o comportamento de hoje.
            "tipo": None,
            "grupos": grupos,
            "ip": (interfaces[0].get("ip") if interfaces else "") or "",
            "cpu": None, "memoria": None, "memoria_total": None,
            "disco_livre": None, "disco_volume": None, "discos": [],
            "uptime": None, "versao_agente": None, "sistema": None,
            "agente_disponivel": None,
            "visto_em": 0, "online": False, "sem_dados": False,
        }

    itens = chamar("item.get", {
        # "type" e indispensavel: e ele que separa o que o agente enviou do que
        # o servidor calculou. Ver config.TIPOS_DO_AGENTE.
        "output": ["itemid", "hostid", "key_", "lastvalue", "lastclock", "type"],
        "search": {"key_": config.CHAVES_PARQUE},
        "searchByAny": True,
        "monitored": True,
    })

    volumes = {}
    itens_cpu, itens_mem = [], []

    for item in itens:
        maquina = maquinas.get(item.get("hostid"))
        if not maquina:
            continue

        chave = item.get("key_") or ""
        bruto = item.get("lastvalue")
        valor = num(bruto)
        quando = int(item.get("lastclock") or 0)

        # so item vindo do agente conta como contato. Item calculado pelo
        # servidor tem carimbo novo mesmo com o agente morto.
        if int(item.get("type", -1)) in config.TIPOS_DO_AGENTE:
            if quando > maquina["visto_em"]:
                maquina["visto_em"] = quando

        if chave == "agent.version":
            maquina["versao_agente"] = bruto or None
            continue
        if chave.startswith("wmi.get[root/cimv2,") and "PCSystemType" in chave:
            maquina["tipo"] = config.tipo_de_pc(bruto)
            continue

        if chave == "system.sw.os":
            sistema = (bruto or "").strip() or None
            maquina["sistema"] = sistema
            if sistema:
                alvo_s = sistema.lower()
                maquina["servidor"] = ("server" in alvo_s) or ("linux" in alvo_s)
            continue

        # Guarda o hostid junto: no fim, item de maquina com agente calado sai
        # da serie do parque (ver o filtro logo antes do return).
        if chave == "system.cpu.util":
            itens_cpu.append((item["itemid"], item["hostid"]))
        elif chave == "vm.memory.util":
            itens_mem.append((item["itemid"], item["hostid"]))

        if valor is None:
            continue

        if chave == "system.cpu.util":
            maquina["cpu"] = valor
        elif chave == "vm.memory.util":
            maquina["memoria"] = valor
        elif chave == "vm.memory.size[total]":
            maquina["memoria_total"] = valor
        elif chave == "system.uptime":
            maquina["uptime"] = valor
        elif chave == "zabbix[host,active_agent,available]":
            maquina["agente_disponivel"] = int(valor)
        elif chave.startswith("vfs.fs.dependent.size["):
            vol = volume_da_chave(chave)
            reg = volumes.setdefault(item["hostid"], {}).setdefault(vol, {})
            if chave.endswith(",pused]"):
                reg["usado"] = valor
            elif chave.endswith(",total]"):
                reg["total"] = valor

    for hostid, maquina in maquinas.items():
        for vol, reg in (volumes.get(hostid) or {}).items():
            if "usado" not in reg:
                continue
            maquina["discos"].append({
                "volume": vol,
                "livre": round(100.0 - reg["usado"], 1),
                "total_gb": round(reg["total"] / (1024 ** 3), 1) if reg.get("total") else None,
                "livre_gb": (round(reg["total"] * (100.0 - reg["usado"]) / 100 / (1024 ** 3), 1)
                             if reg.get("total") else None),
            })
        if maquina["discos"]:
            # o volume que exige acao e o mais apertado, nao a media deles
            maquina["discos"].sort(key=lambda d: d["livre"])
            maquina["disco_livre"] = maquina["discos"][0]["livre"]
            maquina["disco_volume"] = maquina["discos"][0]["volume"]

        # Fonte primaria de online/offline: o proprio item de disponibilidade
        # de agente ativo do Zabbix. Sem ele, cai para o ultimo contato.
        if maquina["agente_disponivel"] is not None:
            maquina["online"] = (maquina["agente_disponivel"] == 1)
        else:
            maquina["online"] = (
                maquina["visto_em"] > 0
                and (agora - maquina["visto_em"]) <= config.OFFLINE_APOS
            )

        # "sem dados recentes" nao e a mesma coisa que offline: aqui o Zabbix
        # ainda considera o host ativo, mas parou de chegar medicao.
        maquina["sem_dados"] = (
            maquina["visto_em"] == 0
            or (agora - maquina["visto_em"]) > config.SEM_DADOS_APOS
        )

        # Agente calado ha muito tempo: nenhuma metrica dele descreve o agora.
        # Preferimos o tracinho de "nao sei" a um numero de 15 horas atras
        # apresentado como atual. A coluna "ultimo dado" diz o porque.
        if maquina["sem_dados"]:
            for campo in ("cpu", "memoria", "memoria_total", "uptime",
                          "disco_livre", "disco_volume"):
                maquina[campo] = None
            maquina["discos"] = []

    # Maquina com agente calado nao entra na media do parque.
    #
    # Isto nao e zelo excessivo: neste Zabbix o "vm.memory.util" e item
    # CALCULADO pelo servidor (tipo 15), nao item de agente, e continua
    # emitindo valor mesmo com o agente morto - conferido, 18 das 19 maquinas
    # offline tinham "memoria" com carimbo de 2 minutos atras. Sem este filtro
    # a media de memoria do parque carregava ~19 maquinas mortas com valor
    # congelado, o que desloca o numero e achata a variacao da linha.
    #
    # A CPU se corrige sozinha (item de agente ativo: agente morto, nada
    # chega), mas o filtro vale para as duas - no dia em que alguem trocar o
    # tipo de um item, o painel nao volta a mentir em silencio.
    #
    # O criterio e "sem_dados", nao "offline": e a mesma regra que ja apaga o
    # numero da maquina na tabela, entao tela e grafico contam a mesma historia.
    calados = {hid for hid, m in maquinas.items() if m["sem_dados"]}

    return {
        "maquinas": maquinas,
        "itens_cpu": [i for i, h in itens_cpu if h not in calados],
        "itens_mem": [i for i, h in itens_mem if h not in calados],
        "descartados_serie": {
            "maquinas_caladas": len(calados),
            "itens_cpu": sum(1 for _, h in itens_cpu if h in calados),
            "itens_mem": sum(1 for _, h in itens_mem if h in calados),
        },
        "coletado_em": agora,
    }
