"""Quem esta logado nas maquinas, agora e no historico.

POR QUE ISTO NAO ENTRA NO PAYLOAD PRINCIPAL

O painel empurra o payload por SSE para TODO mundo que esta logado. Nome de
usuario e dado pessoal, e a regra combinada e que so master ve. Se o nome
viajasse no payload principal, a restricao seria so a tela escondendo algo que
o navegador ja recebeu - ou seja, nao seria restricao nenhuma.

Por isso este modulo tem rota propria, com @exigir_master, e e consultado sob
demanda. Quem nao e master nunca recebe o dado, nem no fio.

DE ONDE VEM O "DESDE"

O item no Zabbix tem pre-processamento "descartar valor nao alterado com
heartbeat de 12h": o servidor so grava quando o valor MUDA. Entao o historico
ja e, por construcao, a lista de logons e logoffs.

O heartbeat, porem, regrava o mesmo valor depois de 12h sem mudanca - e quem
ficou logado dois dias teria "desde" saltando para o carimbo do heartbeat.
Por isso o "desde" nao sai do lastclock: sai de caminhar o historico de tras
para frente enquanto o valor for igual ao atual, e ficar com o carimbo mais
antigo dessa sequencia. Repeticao de heartbeat e absorvida assim, de graca.

LGPD

Retencao de 90 dias, definida em 24/08/2026. O corte e feito pelo Zabbix
(history do item), nao aqui - este modulo so nao pede mais do que isso.
"""

import time

from . import config
from .coleta import projeto_de
from .zabbix import chamar

# A mesma chave publicada no template MONITORAMENTO - Acessos. Se ela mudar la, muda
# aqui - e o item passa a nao ser encontrado, o que a tela mostra como
# "sem coleta" em vez de quebrar.
CHAVE = 'wmi.getall[root/cimv2,"select UserName from Win32_ComputerSystem"]'

# O valor que o pre-processamento grava quando a maquina respondeu e nao havia
# ninguem logado. E um valor legitimo, nao um erro - ver o README.
SEM_LOGON = "sem-logon"

# Teto de dias que a rota aceita. Existe para uma chamada com ?dias=99999 nao
# virar um history.get que ocupa o Zabbix por minutos.
DIAS_MAX = 90
DIAS_PADRAO = 7


def _pessoa(valor):
    """De 'MONITORAMENTO\\a.silva' tira 'a.silva'; de 'a.silva' tira 'a.silva'."""
    if not valor or valor == SEM_LOGON:
        return None
    return valor.split("\\")[-1].strip() or None


def _dominio(valor):
    if not valor or valor == SEM_LOGON or "\\" not in valor:
        return None
    return valor.split("\\")[0].strip() or None


def montar(dias=DIAS_PADRAO):
    """Estado atual e linha do tempo. Levanta ZabbixIndisponivel."""
    agora = int(time.time())
    dias = max(1, min(int(dias or DIAS_PADRAO), DIAS_MAX))

    itens = chamar("item.get", {
        "output": ["itemid", "hostid", "lastvalue", "lastclock", "state"],
        "selectHosts": ["hostid", "host", "name"],
        "filter": {"key_": CHAVE},
        "monitored": True,
    })
    itens = [i for i in itens if i.get("hosts")]

    if not itens:
        return {
            "coletado_em": agora, "dias": dias, "sem_item": True,
            "resumo": {"com_usuario": 0, "sem_logon": 0, "sem_contato": 0,
                       "pessoas": 0, "total": 0},
            "maquinas": [], "pessoas": [], "linha": [],
        }

    por_item = {}
    for i in itens:
        h = i["hosts"][0]
        hostname = h.get("host") or h.get("name") or "?"
        proj = projeto_de(hostname)
        por_item[i["itemid"]] = {
            "hostid": h["hostid"],
            "hostname": hostname,
            "projeto": proj,
            # Como o projeto se chama de verdade - "PROJETO-F", e nao
            # "PROJETO-F". O prefixo continua sendo a chave; isto e so fachada.
            "projeto_nome": config.nome_projeto(proj),
            # A qual opcao do filtro esta maquina pertence. NTB, NOTEBOOK,
            # DESKTOP e OP-DESK caem todos em NAO-IDENTIFICADO.
            "filtro": config.grupo_de_filtro(proj),
            "bloco": config.bloco_de(proj),
        }

    # ------------------------------------------------------------ historico
    # Um history.get so, para todos os itens. Como o item guarda apenas as
    # trocas, o volume e pequeno: medido em 24/08, 54 registros por hora no
    # parque inteiro.
    bruto = chamar("history.get", {
        "itemids": list(por_item.keys()),
        "history": 1,                      # 1 = character, o tipo do item
        "time_from": agora - dias * 86400,
        "sortfield": ["itemid", "clock"],
        "sortorder": "ASC",
        "limit": 50000,
    })

    serie = {}
    for p in bruto:
        serie.setdefault(p["itemid"], []).append((int(p["clock"]), p["value"]))

    # ------------------------------------------------- estado de cada maquina
    maquinas = []
    linha = []
    pessoas = {}
    com_usuario = sem_logon = sem_contato = 0

    for i in itens:
        base = por_item[i["itemid"]]
        pontos = serie.get(i["itemid"], [])
        atual = i.get("lastvalue")
        quando = int(i.get("lastclock") or 0)
        suportado = i.get("state") == "0"

        # Sem carimbo, ou carimbo velho demais: o agente esta calado. Nao e
        # "ninguem logado" - e "nao sabemos", e as duas coisas nao podem virar
        # a mesma linha na tela.
        calado = (not suportado or not quando
                  or agora - quando > config.HORAS_SEM_CONTATO * 3600)

        desde = None
        if not calado and atual:
            # caminha de tras para frente enquanto o valor for o mesmo
            desde = quando
            for clock, valor in reversed(pontos):
                if valor != atual:
                    break
                desde = clock

        if calado:
            estado = "sem_contato"
            sem_contato += 1
        elif atual == SEM_LOGON:
            estado = "sem_logon"
            sem_logon += 1
        elif atual:
            estado = "com_usuario"
            com_usuario += 1
        else:
            estado = "sem_contato"
            sem_contato += 1

        pessoa = _pessoa(atual) if estado == "com_usuario" else None
        if pessoa:
            reg = pessoas.setdefault(pessoa, {"pessoa": pessoa, "maquinas": [],
                                              "dominio": _dominio(atual)})
            reg["maquinas"].append(base["hostname"])

        maquinas.append(dict(base, estado=estado, usuario=pessoa,
                             dominio=_dominio(atual) if pessoa else None,
                             desde=desde, visto_em=quando))

        # ------------------------------------------------ linha do tempo
        anterior = None
        primeiro = True
        for clock, valor in pontos:
            if valor == anterior:
                continue          # repeticao de heartbeat: nao e evento
            quem = _pessoa(valor)
            linha.append({
                "clock": clock,
                "hostid": base["hostid"],
                "hostname": base["hostname"],
                "projeto": base["projeto"],
                "projeto_nome": base["projeto_nome"],
                "filtro": base["filtro"],
                "usuario": quem,
                # O PRIMEIRO registro de cada maquina nao e um logon: e o
                # instante em que a coleta comecou a existir. Quem ja estava
                # logado desde a vespera apareceria como "entrou agora", e nos
                # primeiros dias isso seria a maior parte da linha do tempo -
                # 141 de 151 eventos, medido em 24/08. A tela rotula diferente.
                "tipo": ("inicio" if primeiro
                         else ("entrou" if quem else "saiu")),
                "anterior": _pessoa(anterior) if anterior else None,
            })
            anterior = valor
            primeiro = False

    linha.sort(key=lambda e: -e["clock"])

    lista_pessoas = sorted(
        ({"pessoa": r["pessoa"], "dominio": r["dominio"],
          "maquinas": sorted(r["maquinas"]), "quantas": len(r["maquinas"])}
         for r in pessoas.values()),
        key=lambda r: r["pessoa"])

    maquinas.sort(key=lambda m: (m["estado"] != "com_usuario", m["hostname"]))

    # Opcoes do filtro, montadas a partir do que EXISTE no parque - e nao da
    # lista fixa da configuracao. Projeto configurado mas sem nenhuma maquina
    # viraria uma opcao que nao filtra nada, e a pessoa acharia que quebrou.
    contagem = {}
    for m in maquinas:
        contagem[m["filtro"]] = contagem.get(m["filtro"], 0) + 1

    opcoes = [{"valor": k, "nome": (config.ROTULO_SEM_ETIQUETA
                                    if k == config.SEM_ETIQUETA
                                    else config.nome_projeto(k)),
               "quantas": n}
              for k, n in contagem.items()]
    # Ordem alfabetica pelo nome exibido, com "Nao identificado" sempre por
    # ultimo: ele nao e um projeto, e o balde do que sobrou.
    opcoes.sort(key=lambda o: (o["valor"] == config.SEM_ETIQUETA,
                               o["nome"].lower()))

    return {
        "coletado_em": agora,
        "dias": dias,
        "sem_item": False,
        "resumo": {
            "com_usuario": com_usuario,
            "sem_logon": sem_logon,
            "sem_contato": sem_contato,
            "pessoas": len(lista_pessoas),
            "total": len(itens),
            # Quantas maquinas tem mais de uma pessoa no periodo - e o numero
            # que responde "temos equipamento compartilhado?".
            "trocas_no_periodo": len(linha),
        },
        "maquinas": maquinas,
        "filtros": opcoes,
        "pessoas": lista_pessoas,
        # A linha do tempo inteira pode ter milhares de eventos em 90 dias. A
        # tela nunca mostra tudo de uma vez, entao o corte e aqui e nao no
        # navegador: o que nao cabe na tela nao precisa atravessar a rede.
        #
        # O corte e POR MAQUINA, e nao nos 600 mais recentes do parque.
        # Medido em 02/09/2026: uma unica estacao em sessao remota gerou 12
        # eventos em 6 minutos. Num corte global ela comeria o orcamento e
        # maquinas com um logon no periodo simplesmente nao chegariam a tela -
        # e a tela agrupa por maquina, entao a ausencia seria invisivel.
        "linha": _por_maquina(linha),
        "linha_total": len(linha),
        # Quantos eventos cada maquina teve DE VERDADE, para o grupo poder
        # dizer "mostrando 60 de 312" em vez de mentir o total.
        "eventos_por_maquina": _contar(linha),
    }


#: Quantos eventos de cada maquina atravessam a rede. Acima disto a tela
#: passaria a rolar dentro do proprio grupo, o que ja e mais do que alguem le.
EVENTOS_POR_MAQUINA = 60


def _por_maquina(linha):
    """Os N mais recentes de cada maquina, preservando a ordem original."""
    vistos = {}
    saida = []
    for e in linha:                      # ja vem do mais recente para o antigo
        hid = e["hostid"]
        n = vistos.get(hid, 0)
        if n < EVENTOS_POR_MAQUINA:
            vistos[hid] = n + 1
            saida.append(e)
    return saida


def _contar(linha):
    total = {}
    for e in linha:
        total[e["hostid"]] = total.get(e["hostid"], 0) + 1
    return total


def de_um_host(hostid):
    """Quem esta logado numa maquina so, para a janela de detalhe.

    Devolve None quando nao ha item, quando o agente esta calado, ou quando
    ninguem esta logado - a tela distingue os tres pelo campo "estado".
    """
    itens = chamar("item.get", {
        "output": ["itemid", "lastvalue", "lastclock", "state"],
        "hostids": hostid,
        "filter": {"key_": CHAVE},
        "monitored": True,
    })
    if not itens:
        return None

    i = itens[0]
    quando = int(i.get("lastclock") or 0)
    atual = i.get("lastvalue")
    agora = int(time.time())

    if i.get("state") != "0" or not quando \
            or agora - quando > config.HORAS_SEM_CONTATO * 3600:
        return {"estado": "sem_contato", "usuario": None, "desde": None}
    if atual == SEM_LOGON or not atual:
        return {"estado": "sem_logon", "usuario": None, "desde": None}

    # "Desde" pelo mesmo caminho da tela de acessos: caminhar o historico para
    # tras enquanto o valor for igual, para o heartbeat de 12h nao ser
    # confundido com um logon novo. Aqui a janela e curta - 30 dias resolve
    # qualquer turno real e mantem a consulta barata.
    desde = quando
    pontos = chamar("history.get", {
        "itemids": i["itemid"], "history": 1,
        "time_from": agora - 30 * 86400,
        "sortfield": "clock", "sortorder": "DESC", "limit": 400,
    })
    for p in pontos:
        if p["value"] != atual:
            break
        desde = int(p["clock"])

    return {"estado": "com_usuario", "usuario": _pessoa(atual),
            "dominio": _dominio(atual), "desde": desde}
