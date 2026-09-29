"""Estado em memoria e o laco que o mantem atualizado.

Um unico laco cuida das tres velocidades. Ele nao dorme entre elas: a cada
volta decide o que ja venceu.

    a cada  5 s  problemas abertos + eventos recentes   
    a cada 30 s  hosts, grupos, CPU, memoria, disco     
    a cada  2 min series historicas                     

Uma unica thread evita disputa pelo mesmo cache e mantem a carga sobre o
Zabbix previsivel: nao existe caminho em que duas coletas pesadas rodem
sobrepostas.

Quem quiser ser avisado de mudanca chama assinar(), que bloqueia ate a versao
mudar. E o que sustenta o SSE - o navegador recebe o dado no instante em que
ele existe, sem ficar perguntando.
"""

import threading
import time
import traceback

from . import coleta, config, painel, series, zabbix
from .rede import rede as _rede

_condicao = threading.Condition()

_cache = {
    "payload": None,        # ultimo painel montado
    "versao": 0,
    "parque": None,         # ultima coleta pesada
    "series": None,
    "rede": None,          # instabilidade de rede, ultimas 24h
    "problemas": [],
    "eventos": {"itens": [], "descartados_ruido": 0, "janela_h": config.JANELA_EVENTOS_H},
    "erro_parque": None,
    "erro_problemas": None,
    "erro_series": None,
    "erro_rede": None,
    "parque_em": 0.0,
    "problemas_em": 0.0,
    "series_em": 0.0,
    "duracao_ms": 0,
}


def _conexao():
    """Retrato honesto da conversa com o Zabbix, para a tela mostrar."""
    conn = zabbix.instantaneo_conexao()
    agora = time.time()
    erro = _cache["erro_problemas"] or _cache["erro_parque"]
    return {
        "ok": conn["ok"] and _cache["payload"] is not None,
        "configurado": config.configurado(),
        "ultimo_erro": erro or conn["ultimo_erro"],
        "idade_parque_s": int(agora - _cache["parque_em"]) if _cache["parque_em"] else None,
        "idade_problemas_s": int(agora - _cache["problemas_em"]) if _cache["problemas_em"] else None,
        "idade_series_s": int(agora - _cache["series_em"]) if _cache["series_em"] else None,
        "falhas": conn["falhas"],
        "chamadas": conn["chamadas"],
        "intervalo_rapido": config.INTERVALO_RAPIDO,
        "intervalo_completo": config.INTERVALO_COMPLETO,
        "duracao_ms": _cache["duracao_ms"],
    }


def _remontar():
    """Junta o que houver em cache num payload novo e acorda os assinantes."""
    if _cache["parque"] is None:
        return
    novo = painel.montar(
        _cache["parque"], _cache["problemas"], _cache["eventos"],
        _cache["series"], _conexao(), _cache["versao"] + 1,
        _cache["rede"],
    )
    with _condicao:
        _cache["payload"] = novo
        _cache["versao"] += 1
        novo["versao"] = _cache["versao"]
        _condicao.notify_all()


def _uma_volta(precisa_parque, precisa_series):
    inicio = time.time()
    mudou = False

    if precisa_parque:
        try:
            _cache["parque"] = coleta.coletar_parque()
            _cache["parque_em"] = time.time()
            _cache["erro_parque"] = None
            mudou = True
        except Exception as e:                                   # noqa: BLE001
            _cache["erro_parque"] = str(e)
            print("[monitoramento] parque: " + str(e), flush=True)

    if precisa_series and _cache["parque"]:
        try:
            _cache["series"] = series.coletar(
                _cache["parque"].get("itens_cpu") or [],
                _cache["parque"].get("itens_mem") or [],
            )
            _cache["series_em"] = time.time()
            _cache["erro_series"] = None
            mudou = True
        except Exception as e:                                   # noqa: BLE001
            _cache["erro_series"] = str(e)
            print("[monitoramento] series: " + str(e), flush=True)

        # Instabilidade de rede: mesma cadencia das series (2 min) porque a
        # janela e de 24 HORAS - recalcular a cada 5 segundos seria pagar
        # meio segundo de API para o numero mudar uma vez por hora.
        #
        # Falha aqui NAO derruba o resto: sem esta chave o painel esconde o
        # bloco de rede e continua inteiro.
        try:
            _cache["rede"] = _rede.instabilidade(config.HORAS_REDE)
            _cache["erro_rede"] = None
            mudou = True
        except Exception as e:                                   # noqa: BLE001
            _cache["erro_rede"] = str(e)
            print("[monitoramento] rede: " + str(e), flush=True)

    try:
        _cache["problemas"] = coleta.coletar_problemas()
        _cache["eventos"] = coleta.coletar_eventos()
        _cache["problemas_em"] = time.time()
        _cache["erro_problemas"] = None
        mudou = True
    except Exception as e:                                       # noqa: BLE001
        _cache["erro_problemas"] = str(e)
        print("[monitoramento] problemas: " + str(e), flush=True)

    _cache["duracao_ms"] = int((time.time() - inicio) * 1000)

    # Mesmo quando nada foi coletado remontamos: o bloco de conexao precisa
    # refletir a falha na tela, senao o usuario continua vendo dado velho
    # como se fosse atual.
    if mudou or _cache["payload"] is not None:
        _remontar()


# Bandeira de "coletar agora", levantada por forcar_coleta(). Nao precisa de
# trava: em Python, atribuir um booleano e atomico, e o pior caso de uma corrida
# aqui e uma coleta a mais - nao um dado errado.
_acordar = threading.Event()
_forcado = False


def forcar_coleta():
    """Pede ao laco que colete AGORA, sem esperar o proximo ciclo.

    Chamado pela rota /api/atualizar. Pedidos repetidos se fundem num so: a
    bandeira ja esta levantada, e levantar de novo nao acrescenta trabalho.
    """
    global _forcado
    _forcado = True
    _acordar.set()


def _laco():
    global _forcado
    proximo_parque = 0.0
    proximo_series = 0.0

    while True:
        agora = time.monotonic()
        # Le e abaixa a bandeira de uma vez: se alguem pedir de novo enquanto
        # esta volta corre, o pedido novo fica para a proxima em vez de se
        # perder nesta.
        forcado = _forcado
        _forcado = False

        precisa_parque = agora >= proximo_parque or forcado
        precisa_series = (agora >= proximo_series or forcado) \
            and (_cache["parque"] or precisa_parque)

        try:
            _uma_volta(precisa_parque, precisa_series)
        except Exception:                                        # noqa: BLE001
            traceback.print_exc()

        if precisa_parque:
            proximo_parque = time.monotonic() + config.INTERVALO_COMPLETO
        if precisa_series:
            proximo_series = time.monotonic() + config.INTERVALO_SERIES

        # Sono INTERROMPIVEL. Com time.sleep(), um pedido de coleta feito
        # durante o sono so seria notado ate 5 segundos depois - e o botao
        # pareceria lento sem motivo.
        _acordar.wait(max(2, config.INTERVALO_RAPIDO))
        _acordar.clear()


_iniciado = False


def iniciar():
    global _iniciado
    if _iniciado:
        return
    _iniciado = True
    threading.Thread(target=_laco, name="coleta", daemon=True).start()


# ------------------------------------------------------------------- leitura

def instantaneo():
    """Ultimo painel montado, ou None se ainda nao houve coleta."""
    with _condicao:
        payload = _cache["payload"]
    if payload is None:
        return None
    payload["conexao"] = _conexao()
    return payload


def versao_atual():
    with _condicao:
        return _cache["versao"]


def assinar(versao_conhecida, espera):
    """Bloqueia ate a versao mudar. Devolve (versao, payload) ou (versao, None).

    O None significa "nada mudou nesse intervalo" - o chamador manda um pulso
    para o navegador saber que a conexao continua viva.
    """
    with _condicao:
        _condicao.wait_for(lambda: _cache["versao"] != versao_conhecida, timeout=espera)
        versao = _cache["versao"]
        payload = _cache["payload"] if versao != versao_conhecida else None
    if payload is not None:
        payload["conexao"] = _conexao()
    return versao, payload


def diagnostico():
    return {
        "configurado": config.configurado(),
        "ja_coletou": _cache["payload"] is not None,
        "versao": _cache["versao"],
        "erro_parque": _cache["erro_parque"],
        "erro_problemas": _cache["erro_problemas"],
        "erro_series": _cache["erro_series"],
        "conexao": _conexao(),
    }
