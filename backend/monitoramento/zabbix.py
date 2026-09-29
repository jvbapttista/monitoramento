"""Cliente JSON-RPC de leitura; o modo demo nunca abre conexões externas."""
import threading
import time
from urllib.parse import urlsplit

import requests

from . import config

METODOS = frozenset({"host.get", "item.get", "history.get", "problem.get",
                     "trigger.get", "event.get"})


class ZabbixIndisponivel(RuntimeError):
    """Falha de consulta, distinta de uma medição com valor zero."""


_local = threading.local()
_trava = threading.Lock()
estado_conexao = dict(ok=False, ultimo_erro=None, ultimo_sucesso=0.0,
                      ultima_falha=0.0, chamadas=0, falhas=0)


def _sessao():
    if not hasattr(_local, "http"):
        _local.http = requests.Session()
        _local.http.headers["Content-Type"] = "application/json-rpc"
    return _local.http


def chamar(metodo, params):
    if metodo not in METODOS:
        raise ValueError("Método não permitido pelo cliente de leitura")
    if config.MODO_DEMO:
        from .demo import chamar as simular
        resultado = simular(metodo, params)
        _registrar(True)
        return resultado
    url = urlsplit(config.ZABBIX_URL)
    if not config.configurado() or url.scheme != "https" or not url.hostname or url.username:
        raise ZabbixIndisponivel("Configure URL HTTPS e token de leitura do Zabbix")
    try:
        resposta = _sessao().post(
            config.ZABBIX_URL,
            json={"jsonrpc": "2.0", "method": metodo, "params": params, "id": 1},
            headers={"Authorization": "Bearer " + config.ZABBIX_TOKEN},
            timeout=(5, config.ZABBIX_TIMEOUT), allow_redirects=False,
        )
        if resposta.status_code != 200:
            raise ZabbixIndisponivel("API de monitoramento indisponível")
        retorno = resposta.json()
        if not isinstance(retorno, dict) or "error" in retorno or "result" not in retorno:
            raise ZabbixIndisponivel("API de monitoramento recusou a consulta")
    except (requests.RequestException, ValueError, ZabbixIndisponivel):
        # URLs, conteúdo da resposta e credenciais não vão para navegador/log.
        _registrar(False)
        raise ZabbixIndisponivel("Falha de comunicação com a API de monitoramento") from None
    _registrar(True)
    return retorno["result"]


def _registrar(ok):
    with _trava:
        estado_conexao["ok"] = ok
        estado_conexao["chamadas"] += 1
        if ok:
            estado_conexao["ultimo_sucesso"] = time.time()
            estado_conexao["ultimo_erro"] = None
        else:
            estado_conexao["ultima_falha"] = time.time()
            estado_conexao["falhas"] += 1
            estado_conexao["ultimo_erro"] = "Falha de comunicação com a API"


def instantaneo_conexao():
    with _trava:
        return dict(estado_conexao)
