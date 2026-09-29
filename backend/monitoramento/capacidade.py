"""Capacidade do parque: disco e memoria como decisao, nao como nota.

Este modulo responde duas perguntas que se decide com orcamento, nao com
plantao:

    Quantas maquinas estao perto de encher o disco?
    Que tamanho de RAM esta sofrendo, e em quantas maquinas?

Por que nao reaproveitar o grafico de "maquinas sob pressao": aquele mostra
PRESSAO NO TEMPO - quantas passaram de 90% na ultima hora. E operacional, muda
o dia todo. Aqui e CAPACIDADE - a foto de quanto ainda cabe, que muda em
semanas e sustenta decisao de compra. Sao perguntas diferentes.

Duas honestidades embutidas:

    Maquina com agente calado nao tem valor de recurso (o painel apaga esses
    campos de proposito). Entao a base aqui e "quantas estao medindo", nunca o
    total do parque - dizer "15 criticas de 114" esconde que sao 15 de 74.

    A memoria e agrupada por TAMANHO INSTALADO, nao por uso. Uso alto num
    equipamento de 32 GB e uso; uso alto num de 8 GB e falta de hardware. Sem
    separar por tamanho, as duas situacoes viram o mesmo numero e a conclusao
    se perde.
"""

from . import config


def _faixas_disco(medindo):
    """Distribuicao por espaco livre no volume mais apertado de cada maquina."""
    u, c, a = (config.DISCO_URGENTE_PCT, config.DISCO_CRITICO_PCT,
               config.DISCO_ATENCAO_PCT)
    faixas = [
        ("urgente", "abaixo de %g%% livre" % u, 0, u, "critico",
         {"especial": "disco_urgente"}),
        # "disco_baixo" e nao "disco": "disco" significa TUDO abaixo do limite
        # critico, e e o que o item de atencao e o indice de saude contam. Usar
        # a mesma chave para a faixa do meio fazia o clique devolver menos
        # maquinas do que o numero mostrado.
        ("critico", "%g%% a %g%%" % (u, c), u, c, "alto",
         {"especial": "disco_baixo"}),
        ("atencao", "%g%% a %g%%" % (c, a), c, a, "medio",
         {"especial": "disco_atencao"}),
        ("ok", "acima de %g%%" % a, a, 1e9, "ok",
         {"especial": "disco_ok"}),
    ]
    saida = []
    for chave, rotulo, ini, fim, tom, filtro in faixas:
        quantas = sum(1 for m in medindo if ini <= m["disco_livre"] < fim)
        saida.append({"chave": chave, "rotulo": rotulo, "quantas": quantas,
                      "tom": tom, "filtro": filtro})
    return saida


def _grupos_ram(medindo):
    """Agrupa por tamanho de RAM instalada e mede o aperto de cada grupo.

    Os cortes (8 / 16 GB) nao sao arbitrarios: sao os tamanhos que existem
    neste parque. Medido em 20/08 - 19 maquinas de 8 GB com 82% de uso medio,
    44 de 16 GB com 73%, e as de 32 GB ou mais em 46%. O grupo de 8 GB e a
    unica conclusao que o dado sustenta sozinho.
    """
    grupos = [
        ("ate8",  "até 8 GB",        0,          8 * 1024 ** 3, {"especial": "ram_8"}),
        ("ate16", "9 a 16 GB",       8 * 1024 ** 3, 16 * 1024 ** 3, {"especial": "ram_16"}),
        ("mais",  "acima de 16 GB",  16 * 1024 ** 3, float("inf"), {"especial": "ram_32"}),
    ]
    saida = []
    for chave, rotulo, ini, fim, filtro in grupos:
        g = [m for m in medindo if ini < m["memoria_total"] <= fim]
        if not g:
            continue
        alta = sum(1 for m in g if m["memoria"] >= config.MEMORIA_ALTA_PCT)
        saida.append({
            "chave": chave, "rotulo": rotulo, "quantas": len(g),
            "uso_medio": round(sum(m["memoria"] for m in g) / len(g), 1),
            "acima_do_limite": alta,
            "filtro": filtro,
        })
    return saida


def _volume_apertado(maquina):
    """O volume com menos espaco livre. E ele que decide o destino da maquina:
    a media entre C: cheio e D: vazio nao descreve nada."""
    volumes = maquina.get("discos") or []
    if not volumes:
        return None
    return min(volumes, key=lambda v: v.get("livre", 100))


def _aperto(com_disco):
    """A faixa mais apertada que tem alguem, em GIGABYTES.

    Percentual esconde o que mata. Medido em 20/08: as 8 maquinas abaixo de 5%
    somavam 32 GB livres e a pior tinha 1,5 GB de um disco de 223 GB. O
    Windows precisa de espaco para atualizacao e paginacao - abaixo de uns
    poucos GB a maquina falha sozinha, e "4,7% livre" nao comunica isso.

    Devolve None quando ninguem esta apertado, para a tela poder dizer isso em
    vez de mostrar um numero vazio.
    """
    for limite, rotulo, filtro in (
        (config.DISCO_URGENTE_PCT, "abaixo de %g%%" % config.DISCO_URGENTE_PCT,
         {"especial": "disco_urgente"}),
        (config.DISCO_CRITICO_PCT, "abaixo de %g%%" % config.DISCO_CRITICO_PCT,
         {"especial": "disco"}),
    ):
        grupo = [m for m in com_disco if m["disco_livre"] < limite]
        if not grupo:
            continue
        livres = []
        for m in grupo:
            v = _volume_apertado(m)
            if v and v.get("livre_gb") is not None:
                livres.append(v["livre_gb"])
        if not livres:
            continue
        return {
            "rotulo": rotulo,
            "quantas": len(grupo),
            "gb_somados": round(sum(livres)),
            "gb_pior": round(min(livres), 1),
            "filtro": filtro,
        }
    return None


def _cpu_alta(medindo):
    """Quantas maquinas estao com CPU acima do limite AGORA - o mesmo
    CPU_ALTA_PCT que ja gera o alerta "Ponto de atencao". A diferenca e a
    pergunta: o alerta e "isso aconteceu", aqui e "quantas rotineiramente
    vivem no limite" - uma decisao de capacidade, nao um susto de 5 minutos.

    So existe UM limite de CPU configurado (nao ha "atencao" nem "urgente"
    como no disco) - por isso uma faixa so, e nao quatro. Inventar cortes
    intermediarios sem numero configurado por tras seria decisao nossa
    disfarcada de dado.

    Devolve None quando ninguem esta, para a tela dizer isso - mesmo padrao
    de _aperto() acima.
    """
    grupo = [m for m in medindo if m["cpu"] >= config.CPU_ALTA_PCT]
    if not grupo:
        return None
    return {
        "quantas": len(grupo),
        # Mesmo recorte que o KPI "Ponto de atenção" e o alerta ja usam
        # (ver painel.py) - clicar aqui abre a mesma lista de sempre.
        "filtro": {"especial": "cpu"},
    }


def montar(lista):
    """lista: as maquinas ja montadas pelo painel."""
    com_disco = [m for m in lista if m.get("disco_livre") is not None]
    com_ram = [m for m in lista
               if m.get("memoria") is not None and m.get("memoria_total")]
    com_cpu = [m for m in lista if m.get("cpu") is not None]

    gb_livre = sum((v.get("livre_gb") or 0)
                   for m in lista for v in (m.get("discos") or []))
    gb_total = sum((v.get("total_gb") or 0)
                   for m in lista for v in (m.get("discos") or []))

    return {
        "total_parque": len(lista),
        "medindo_disco": len(com_disco),
        "medindo_ram": len(com_ram),
        "medindo_cpu": len(com_cpu),
        "sem_medicao": len(lista) - len(com_disco),
        "disco": _faixas_disco(com_disco),
        # O aperto em GB substituiu "X TB livres de Y TB" no rodape da secao.
        # O total do parque parecia informativo e era o contrario: 7 TB livres
        # somados sugerem folga justamente quando 8 maquinas estao morrendo por
        # falta de 2 GB. Media e soma escondem o caso extremo, e o caso extremo
        # e o que gera chamado.
        "aperto": _aperto(com_disco),
        "disco_gb_livre": round(gb_livre),
        "disco_gb_total": round(gb_total),
        "ram": _grupos_ram(com_ram),
        "cpu_alta": _cpu_alta(com_cpu),
        "limite_memoria": config.MEMORIA_ALTA_PCT,
        "limite_disco_critico": config.DISCO_CRITICO_PCT,
        "limite_cpu": config.CPU_ALTA_PCT,
    }
