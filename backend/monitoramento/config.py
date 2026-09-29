"""Configuracao. Tudo vem do ambiente, com padrao razoavel para o parque atual."""

import os
from .segredos import ler

def _int(nome, padrao):
    return int(os.environ.get(nome, padrao))

def _float(nome, padrao):
    return float(os.environ.get(nome, padrao))

def _lista(nome, padrao):
    return [x.strip() for x in os.environ.get(nome, padrao).split(",") if x.strip()]

def _texto(nome, padrao):
    return os.environ.get(nome, padrao)

ZABBIX_URL = os.environ.get("ZABBIX_URL", "").strip()
ZABBIX_TOKEN = ler("ZABBIX_TOKEN")
MODO_DEMO = os.environ.get("MODO_DEMO", "1") == "1"
DADOS_PESSOAIS = os.environ.get("DADOS_PESSOAIS", "0") == "1"
ZABBIX_TIMEOUT = _int("ZABBIX_TIMEOUT", 60)

INTERVALO_RAPIDO = _int("INTERVALO_RAPIDO", 5)
INTERVALO_COMPLETO = _int("INTERVALO_COMPLETO", 30)
INTERVALO_SERIES = _int("INTERVALO_SERIES", 120)

PULSO_SSE = _int("PULSO_SSE", 10)

HORAS_REDE = _int("HORAS_REDE", 24)

OFFLINE_APOS = _int("OFFLINE_APOS", 600)

HORAS_SEM_CONTATO = _int("HORAS_SEM_CONTATO", 8)

SEM_DADOS_APOS = _int("SEM_DADOS_APOS", 900)

DISCO_URGENTE_PCT = _float("DISCO_URGENTE_PCT", 5)
DISCO_CRITICO_PCT = _float("DISCO_CRITICO_PCT", 10)
DISCO_ATENCAO_PCT = _float("DISCO_ATENCAO_PCT", 20)
CPU_ALTA_PCT = _float("CPU_ALTA_PCT", 85)
MEMORIA_ALTA_PCT = _float("MEMORIA_ALTA_PCT", 90)

ESCOPOS_RUIDO = _lista("ESCOPOS_RUIDO", "notice")

JANELA_MIN = _int("JANELA_MIN", 60)
BALDE_SEG = _int("BALDE_SEG", 120)
COBERTURA_MIN = _float("COBERTURA_MIN", 0.5)
JANELA_EVENTOS_H = _int("JANELA_EVENTOS_H", 2)
MAX_EVENTOS_FEED = _int("MAX_EVENTOS_FEED", 60)

PROJETOS_CLIENTE = [p.upper() for p in _lista(
    "PROJETOS_CLIENTE",
    "PROJETO-A,PROJETO-B,PROJETO-C"
)]

PROJETOS_EQUIPAMENTO = [p.upper() for p in _lista(
    "PROJETOS_EQUIPAMENTO",
    "SRV,NTB,NOTEBOOK,DESKTOP"
)]

PROJETOS = PROJETOS_CLIENTE + PROJETOS_EQUIPAMENTO

def _blocos(bruto):
    saida = {}
    for parte in (bruto or "").split(";"):
        parte = parte.strip()
        if not parte or "=" not in parte:
            continue
        nome, projetos = parte.split("=", 1)
        lista = [x.strip().upper() for x in projetos.split(",") if x.strip()]
        if lista:
            saida[nome.strip().upper()] = lista
    return saida

BLOCOS = _blocos(_texto(
    "BLOCOS",
    "A=PROJETO-A,PROJETO-B;"
    "B=PROJETO-C"
))

def bloco_de(projeto):
    """Em qual bloco esse projeto opera, ou None."""
    alvo = (projeto or "").upper()
    for bloco, projetos in BLOCOS.items():
        if alvo in projetos:
            return bloco
    return None

NOMES_PROJETO = {p: p for p in PROJETOS_CLIENTE}

SEM_ETIQUETA = "NAO-IDENTIFICADO"
ROTULO_SEM_ETIQUETA = "Não identificado"

FILTRO_PROPRIO = PROJETOS_CLIENTE

def nome_projeto(projeto):
    """Como o projeto aparece na tela. Nunca devolve vazio."""
    p = (projeto or "").upper()
    if not p:
        return ROTULO_SEM_ETIQUETA
    return NOMES_PROJETO.get(p, p)

def grupo_de_filtro(projeto):
    """A qual opcao do filtro esta maquina pertence.

    Devolve o proprio prefixo quando ele e uma escolha do filtro, e
    SEM_ETIQUETA para todo o resto. E o que faz NTB, NOTEBOOK, DESKTOP e
    OP-DESK cairem juntos numa opcao so.
    """
    p = (projeto or "").upper()
    return p if p in FILTRO_PROPRIO else SEM_ETIQUETA

def e_cliente(projeto):
    """O grupo tem nome de cliente, ou e equipamento sem etiqueta?

    "OUTROS" - o valor de reserva de projeto_de - nao e cliente: e justamente
    o host que nao casou com nenhum prefixo conhecido.
    """
    return (projeto or "").upper() in PROJETOS_CLIENTE

SEVERIDADES = {
    0: "Não classificada",
    1: "Informação",
    2: "Atenção",
    3: "Média",
    4: "Alta",
    5: "Desastre",
}

SEVERIDADE_CRITICA = _int("SEVERIDADE_CRITICA", 4)

CHAVES_PARQUE = [
    "system.cpu.util",
    "vm.memory.util",
    "vm.memory.size[total]",
    "vfs.fs.dependent.size",
    "zabbix[host,active_agent,available]",
    "agent.version",
    "system.uptime",
    "system.sw.os",

    "wmi.get[root/cimv2,\"Select PCSystemType from Win32_ComputerSystem\"]",
]

TIPO_PC = {
    1: "desktop",
    2: "notebook",
    3: "desktop",
    4: "servidor",
    5: "servidor",
    6: "desktop",
    7: "servidor",
}

def tipo_de_pc(valor):
    """Traduz o PCSystemType, ou None quando o item ainda nao existe."""
    try:
        return TIPO_PC.get(int(valor))
    except (TypeError, ValueError):
        return None

TIPOS_DO_AGENTE = (0, 7)

PREFIXOS_NUVEM = [p.upper() for p in _lista(
    "PREFIXOS_NUVEM", "CLOUD")]

def ambiente_de(hostname):
    """"nuvem" ou "local", a partir do nome da maquina."""
    n = (hostname or "").upper()
    return "nuvem" if any(p in n for p in PREFIXOS_NUVEM) else "local"

def configurado():
    return MODO_DEMO or bool(ZABBIX_URL and ZABBIX_TOKEN)
