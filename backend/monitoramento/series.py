"""Series temporais do parque.

Duas leituras dos MESMOS dados, e a diferenca entre elas e o ponto central
deste arquivo:

- CONTAGEM de maquinas acima do limite. E o que vai no grafico. Esta linha se
  mexe: sai de 18 para 22 para 15, e cada passo e uma maquina real que entrou
  ou saiu do aperto.

- MEDIA do parque. Vira texto no subtitulo, nao linha. Numa media de ~95
  maquinas, uma que salta de 20% para 95% move o total em menos de 1 ponto:
  medido, a amplitude de uma hora inteira e de 1,2 ponto na CPU e 1,6 na
  memoria. Como linha e quase uma reta; como numero, ainda serve de regua de
  normalidade ("o normal aqui e 75-76%").

As duas saem de UMA consulta de historico por metrica. Contagem e media leem
os mesmos baldes - nao ha chamada extra ao Zabbix por causa do grafico novo.

Series por maquina ficam no detalhe do host, sob demanda - ver detalhe.py.
"""

import time

from . import config
from .coleta import num
from .zabbix import chamar


def _baldes(itemids, desde, balde, agora):
    """Agrupa o historico em janelas de tempo: {janela: {itemid: [valores]}}.

    Amostra com relogio fora de hora cai fora. Encontramos uma maquina
    adiantada em 24 minutos: sozinha ela criava pontos "futuros" que esticavam
    o eixo de tempo e desenhavam uma queda que nunca existiu.
    """
    if not itemids:
        return {}

    pontos = chamar("history.get", {
        "history": 0,                    # 0 = float
        "itemids": itemids,
        "time_from": desde,
        "output": ["itemid", "clock", "value"],
        "limit": 300000,
    })

    janelas = {}
    for p in pontos:
        valor = num(p.get("value"))
        if valor is None:
            continue
        clock = int(p["clock"])
        if clock > agora or clock < desde:
            continue
        j = (clock // balde) * balde
        janelas.setdefault(j, {}).setdefault(p["itemid"], []).append(valor)
    return janelas


def _por_item(janelas, balde, agora):
    """Uma media POR ITEM dentro de cada janela, na ordem do tempo.

    A media por item vem antes de qualquer conta entre maquinas: sem isso, uma
    maquina que reporta com mais frequencia pesaria mais que as outras no mesmo
    ponto do grafico.

    A janela ainda aberta e descartada de proposito - so parte do parque ja
    reportou nela, e tanto a media quanto a contagem saem baixas (aparecia como
    um degrau no fim da linha).
    """
    balde_aberto = (agora // balde) * balde
    saida = []
    for j in sorted(janelas):
        if j >= balde_aberto:
            continue
        medias = [sum(v) / len(v) for v in janelas[j].values() if v]
        if medias:
            saida.append((j, medias))
    return saida


def _com_cobertura(bruta):
    """Descarta janela de cobertura baixa.

    Uma janela onde 1 de 95 maquinas reportou nao descreve o parque - ela
    descreve aquela maquina. Vale para as duas leituras: media distorcida e
    contagem subnotificada tem a mesma causa.
    """
    if not bruta:
        return []
    piso = max(len(m) for _, m in bruta) * config.COBERTURA_MIN
    return [(j, m) for j, m in bruta if len(m) >= piso]


def _media(bruta):
    return [{"t": j, "v": round(sum(m) / len(m), 2), "n": len(m)} for j, m in bruta]


def _contagem(bruta, limite):
    """Quantas maquinas acima do limite em cada janela."""
    return [{"t": j, "v": sum(1 for x in m if x >= limite), "n": len(m)}
            for j, m in bruta]


def coletar(itens_cpu, itens_mem):
    agora = int(time.time())
    desde = agora - config.JANELA_MIN * 60
    balde = config.BALDE_SEG

    bruta_cpu = _com_cobertura(_por_item(_baldes(itens_cpu, desde, balde, agora), balde, agora))
    bruta_mem = _com_cobertura(_por_item(_baldes(itens_mem, desde, balde, agora), balde, agora))

    def ultimo(serie):
        return serie[-1]["v"] if serie else None

    media_cpu = _media(bruta_cpu)
    media_mem = _media(bruta_mem)

    return {
        # o que vai no grafico
        "cpu_altas": _contagem(bruta_cpu, config.CPU_ALTA_PCT),
        "mem_altas": _contagem(bruta_mem, config.MEMORIA_ALTA_PCT),
        # a regua de normalidade, em texto
        "cpu": media_cpu,
        "memoria": media_mem,
        "media_cpu": ultimo(media_cpu),
        "media_memoria": ultimo(media_mem),
        "limite_cpu": config.CPU_ALTA_PCT,
        "limite_memoria": config.MEMORIA_ALTA_PCT,
        "janela_min": config.JANELA_MIN,
        "gerado_em": agora,
    }
