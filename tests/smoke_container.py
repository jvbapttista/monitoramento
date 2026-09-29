"""Teste HTTP da demonstração Compose local, com conta descartável.

Executar depois de `docker compose up -d --wait`. Não usa credenciais reais.
"""
import http.cookiejar
import json
from pathlib import Path
import re
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8099'
usuario = 'teste.' + secrets.token_hex(6)
senha = secrets.token_urlsafe(32)


def container(codigo, dados):
    subprocess.run(['docker', 'compose', 'exec', '-T', 'app', 'python', '-c', codigo],
                   input=json.dumps(dados), text=True, cwd=ROOT, check=True)


jar = http.cookiejar.CookieJar()
cliente = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def obter(caminho):
    return cliente.open(BASE + caminho, timeout=30)


with obter('/health/ready') as resposta:
    assert resposta.status == 200
try:
    obter('/api/painel')
except urllib.error.HTTPError as erro:
    assert erro.code == 401
else:
    raise AssertionError('Painel exposto sem autenticação')

container('''import json, os, sys
from monitoramento import contas
assert os.environ.get('MODO_DEMO') == '1', 'Teste permitido apenas na demonstração'
u, s = json.load(sys.stdin)
contas.criar(u, s, master=True, por='teste descartável')
''', [usuario, senha])
try:
    with obter('/login') as resposta:
        token = re.search(r'name="csrf_token" value="([^"]+)"', resposta.read().decode()).group(1)
    corpo = urllib.parse.urlencode({'usuario': usuario, 'senha': senha, 'csrf_token': token}).encode()
    with cliente.open(BASE + '/login', data=corpo, timeout=30) as resposta:
        assert resposta.status == 200
        assert "script-src 'self'" in resposta.headers['Content-Security-Policy']
    with obter('/api/eu') as resposta:
        assert json.load(resposta)['demo'] is True
    with obter('/api/painel') as resposta:
        painel = json.load(resposta)
    assert len(painel['maquinas']) == 120
    hostid = painel['maquinas'][0]['hostid']
    with obter('/api/host/' + str(hostid)) as resposta:
        assert resposta.status == 200
        assert 'abas' not in json.load(resposta)
    with obter('/api/fluxo') as resposta:
        assert resposta.headers['Content-Type'].startswith('text/event-stream')
        for _ in range(10):
            if resposta.readline().startswith(b'data:'):
                break
        else:
            raise AssertionError('SSE não enviou estado')
    with obter('/sair') as resposta:
        token = re.search(r'name="csrf_token" value="([^"]+)"', resposta.read().decode()).group(1)
    with cliente.open(BASE + '/sair', data=urllib.parse.urlencode({'csrf_token': token}).encode(), timeout=30):
        pass
    print('OK: saúde, proteção anônima, login, 120 hosts, detalhe, SSE e logout.')
finally:
    # Retira somente a conta gerada por este teste, inclusive se for o único admin.
    container('''import json, os, sys
from monitoramento import contas
assert os.environ.get('MODO_DEMO') == '1'
nome = json.load(sys.stdin)
with contas._bloqueio():
    dados = contas._ler()
    conta = dados['usuarios'].get(nome)
    if conta and conta.get('criado_por') == 'teste descartável':
        del dados['usuarios'][nome]
        contas._gravar(dados)
''', usuario)
