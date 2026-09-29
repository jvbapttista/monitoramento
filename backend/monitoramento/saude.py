"""Indice de saude do parque.

Nao e um numero inventado. E uma soma de descontos, cada um proporcional a
fatia do parque afetada, com peso fixo e publicado:

    saude = 100 - soma dos descontos

    desconto = peso x (maquinas na situacao / total de maquinas)

    peso  situacao                         por que esse peso
    ----  -------------------------------  -------------------------------
      35  sem contato ha mais de N horas    sumiu e nao voltou; ninguem sabe
                                            o que ha nela
      25  problema de severidade alta ou    exige acao agora
          desastre
      15  problema aberto NAO grave         exige acao, mas nao agora
      15  disco abaixo do limite critico    vira incidente sozinho se ficar
      10  ligada, porem sem medicao         o dado exibido pode estar velho

    Duas escolhas de contagem que mudam bastante o resultado:

    MAQUINA DESLIGADA NAO E PROBLEMA. So conta quem esta sem contato ha mais
    de HORAS_SEM_CONTATO. Medido em 20/08 as 17h: de 40 offline, 31 haviam
    desligado nas ultimas 8 horas. Contar essas 31 fazia o indice cair todo
    fim de tarde por causa do relogio, nao do parque.

    PROBLEMA GRAVE NAO CONTA DUAS VEZES. A parcela de "problema leve" exclui
    quem ja entrou em "problema grave". Antes a mesma maquina descontava nas
    duas parcelas (25 + 15), o que punia a gravidade duas vezes - medido, eram
    40 maquinas contadas em dobro.

Os pesos somam 100, entao o pior caso possivel e 0. Cada desconto e devolvido
separado, com o filtro que o isola, para a tela poder explicar de onde veio a
nota e deixar o usuario clicar e ver quais maquinas causaram cada parcela.
"""

from . import config

# O recorte de "critico" leva a severidade junto de proposito: sem isso a tela
# filtraria as maquinas certas mas listaria TODOS os problemas delas, e o
# numero da tabela nao bateria com o numero que a pessoa clicou.
_CRITICO = {"especial": "criticos", "severidade": str(config.SEVERIDADE_CRITICA)}

PESOS = [
    # (chave, peso, rotulo, filtro que isola essas maquinas na tela)
    # "%dh" recebe config.HORAS_SEM_CONTATO na hora de montar: o rotulo tem de
    # dizer QUANTAS horas, senao "sem contato há horas" nao informa nada.
    ("sem_contato", 35, "sem contato há mais de %dh", {"especial": "sem_contato"}),
    ("criticos", 25, "com problema grave", _CRITICO),
    ("problemas", 15, "com problema leve", {"especial": "problema_leve"}),
    ("disco", 15, "com disco quase cheio", {"especial": "disco"}),
    ("sem_dados", 10, "ligada, mas sem medição", {"especial": "sem_dados"}),
]

# Rotulo em linguagem de quem NAO acompanha TI no dia a dia. A tela e lida por
# diretoria: "degradado" nao diz se e para agir hoje ou nao.
FAIXAS = [
    (90, "tudo certo"),
    (75, "pequenos ajustes"),
    (50, "precisa de atenção"),
    (0, "situação grave"),
]


def calcular(contagens, total):
    """contagens: dict com as chaves de PESOS. Devolve nota e as parcelas."""
    if not total:
        return {
            "nota": None, "faixa": "sem_dados", "total": 0,
            "parcelas": [], "pesos_somam": sum(p for _, p, _, _ in PESOS),
        }

    parcelas = []
    desconto_total = 0.0

    for chave, peso, rotulo, filtro in PESOS:
        quantas = contagens.get(chave, 0)
        fracao = min(1.0, quantas / total)
        desconto = peso * fracao
        desconto_total += desconto
        parcelas.append({
            "chave": chave,
            "rotulo": (rotulo % config.HORAS_SEM_CONTATO) if "%d" in rotulo else rotulo,
            "quantas": quantas,
            "peso": peso,
            "desconto": round(desconto, 1),
            "filtro": filtro,
        })

    nota = max(0.0, 100.0 - desconto_total)
    faixa = next(nome for piso, nome in FAIXAS if nota >= piso)

    parcelas.sort(key=lambda p: p["desconto"], reverse=True)

    return {
        "nota": round(nota, 1),
        "faixa": faixa,
        "total": total,
        "parcelas": parcelas,
        "pesos_somam": sum(p for _, p, _, _ in PESOS),
    }


def descricao_formula():
    """Texto do tooltip. Sai dos MESMOS pesos usados no calculo, entao nunca
    fica desatualizado em relacao a conta."""
    partes = ["%d%% %s" % (peso, (rotulo % config.HORAS_SEM_CONTATO)
                                  if "%d" in rotulo else rotulo)
              for _, peso, rotulo, _ in PESOS]
    return (
        "Nota de 0 a 100. Começa em 100 e desconta por situação, "
        "proporcional à fatia do parque afetada: " + "; ".join(partes) + ". "
        "Máquina desligada não desconta — só entra quem está "
        "sem contato há mais de %d horas, para a nota não cair todo fim "
        "de expediente. Problema grave não é contado duas vezes. "
        "Clique em qualquer linha para ver quais máquinas a compõem."
        % config.HORAS_SEM_CONTATO
    )
