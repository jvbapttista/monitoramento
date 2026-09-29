"""Monitoramento - rotas HTTP.

Nenhuma regra de negocio aqui: tudo vem do pacote monitoramento/. Este arquivo so
traduz o estado em memoria para HTTP.

O token do Zabbix nunca chega ao navegador. A tela conversa somente com estas
rotas; quem fala com o Zabbix e monitoramento/zabbix.py, dentro do container.
"""

import json
import mimetypes
import os
import threading
from pathlib import Path
from flask import render_template, session
from werkzeug.middleware.proxy_fix import ProxyFix
import time

from flask import (Flask, Response, jsonify, redirect, request,
                   send_from_directory, url_for)

from monitoramento import (acessos, aplicativos, config, contas, detalhe, estado,
                  relatorios, sessao)
from monitoramento.zabbix import ZabbixIndisponivel

FRONTEND = Path(__file__).resolve().parent.parent / 'frontend'
app = Flask(__name__, static_folder=str(FRONTEND / 'static'),
            template_folder=str(FRONTEND / 'templates'), static_url_path='')
if os.environ.get('CONFIAR_PROXY', '0') == '1':
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
_fluxos = threading.BoundedSemaphore(20)

# A base de tipos MIME da imagem python:slim nao conhece woff2, e a fonte sairia
# como application/octet-stream. Navegador nenhum se importa - woff2 e detectado
# pela assinatura do arquivo - mas servir o tipo certo e barato e evita que um
# proxy ou uma politica de conteudo mais estrita bloqueie no futuro.
mimetypes.add_type("font/woff2", ".woff2")

# Sessao antes de tudo: configurar() levanta excecao se SECRET_KEY faltar, e e
# melhor a aplicacao nao subir do que subir com sessao insegura.
sessao.configurar(app)
sessao.instalar_guarda(app)

if os.environ.get('INICIAR_COLETA', '1') == '1':
    estado.iniciar()


# ------------------------------------------------------------------- acesso

@app.route("/login", methods=["GET", "POST"])
def login():
    if sessao.usuario_atual():
        return redirect(url_for("raiz"))

    if request.method == "GET":
        return sessao.pagina_login()

    if sessao.bloqueado():
        # Nao diz quanto falta: informar o tempo exato ajuda quem esta tentando
        # automatizar a espera.
        return sessao.pagina_login(
            erro="Muitas tentativas. Aguarde alguns minutos e tente de novo."), 429

    usuario = (request.form.get("usuario") or "").strip()
    senha = request.form.get("senha") or ""

    nome = contas.conferir(usuario, senha)
    if not nome:
        sessao.registrar_falha()
        # A MESMA mensagem para usuario inexistente e senha errada. Distinguir
        # os dois casos entrega a lista de quem tem conta.
        return sessao.pagina_login(erro="Usuário ou senha inválidos."), 401

    sessao.limpar_falhas()
    sessao.entrar(nome)
    return redirect(url_for("raiz"))


@app.route("/sair", methods=["POST", "GET"])
def sair():
    if request.method == 'GET':
        return render_template('sair.html')
    sessao.sair()
    return redirect(url_for("login"))


@app.route("/trocar-senha", methods=["GET", "POST"])
def trocar_senha():
    u = sessao.usuario_atual()
    if not u:
        return redirect(url_for("login"))

    obrigatoria = contas.precisa_trocar(u)

    if request.method == "GET":
        return sessao.pagina_troca(obrigatoria=obrigatoria)

    atual = request.form.get("atual") or ""
    nova = request.form.get("nova") or ""
    repetir = request.form.get("repetir") or ""

    # Confere a senha atual mesmo na troca obrigatoria: sem isso, quem sentasse
    # numa maquina com a sessao aberta trocaria a senha do dono e o expulsaria
    # da propria conta.
    if not contas.conferir(u, atual):
        return sessao.pagina_troca(erro="A senha atual não confere.",
                                   obrigatoria=obrigatoria), 401
    if nova != repetir:
        return sessao.pagina_troca(erro="As senhas novas não conferem.",
                                   obrigatoria=obrigatoria), 400
    if nova == atual:
        return sessao.pagina_troca(erro="A senha nova precisa ser diferente da atual.",
                                   obrigatoria=obrigatoria), 400
    try:
        contas.trocar_senha(u, nova, trocar=False)
        sessao.entrar(u)
    except ValueError as e:
        return sessao.pagina_troca(erro=str(e), obrigatoria=obrigatoria), 400

    return redirect(url_for("raiz"))


# --------------------------------------------------------- gestao de contas
#
# Todas exigem master E o cabecalho de acao. Ver monitoramento/sessao.py para o porque
# do cabecalho em vez de token em campo escondido.

@app.route("/api/usuarios")
@sessao.exigir_master
def usuarios_listar():
    return _sem_cache(jsonify({"usuarios": contas.listar(),
                               "eu": sessao.usuario_atual()}))


@app.route("/api/usuarios", methods=["POST"])
@sessao.exigir_master
@sessao.exigir_cabecalho
def usuarios_criar():
    corpo = request.get_json(silent=True) or {}
    nome = (corpo.get("usuario") or "").strip()
    master = bool(corpo.get("master"))
    temporaria = contas.gerar_temporaria()
    try:
        criado = contas.criar(nome, temporaria, master=master,
                              por=sessao.usuario_atual(), trocar=True)
    except ValueError as e:
        return _sem_cache(jsonify({"erro": str(e)})), 400
    # A senha em claro sai AQUI e em nenhum outro lugar - nao e gravada nem
    # registrada em log. Quem pediu tem uma chance de anotar.
    return _sem_cache(jsonify({"usuario": criado, "senha_temporaria": temporaria,
                               "master": master}))


@app.route("/api/usuarios/<nome>/senha", methods=["POST"])
@sessao.exigir_master
@sessao.exigir_cabecalho
def usuarios_redefinir(nome):
    try:
        temporaria = contas.redefinir(nome, por=sessao.usuario_atual())
    except ValueError as e:
        return _sem_cache(jsonify({"erro": str(e)})), 400
    return _sem_cache(jsonify({"usuario": nome.lower(),
                               "senha_temporaria": temporaria}))


@app.route("/api/usuarios/<nome>/master", methods=["POST"])
@sessao.exigir_master
@sessao.exigir_cabecalho
def usuarios_master(nome):
    corpo = request.get_json(silent=True) or {}
    try:
        contas.definir_master(nome, bool(corpo.get("master")))
    except ValueError as e:
        return _sem_cache(jsonify({"erro": str(e)})), 400
    return _sem_cache(jsonify({"ok": True}))


@app.route("/api/usuarios/<nome>", methods=["DELETE"])
@sessao.exigir_master
@sessao.exigir_cabecalho
def usuarios_remover(nome):
    if (nome or "").lower() == (sessao.usuario_atual() or ""):
        # Deixar alguem remover a propria conta com a sessao aberta produz um
        # estado esquisito: logado como quem nao existe mais.
        return _sem_cache(jsonify({"erro": "não é possível remover a própria conta"})), 400
    try:
        contas.remover(nome, por=sessao.usuario_atual())
    except ValueError as e:
        return _sem_cache(jsonify({"erro": str(e)})), 400
    return _sem_cache(jsonify({"ok": True}))


@app.route("/api/eu")
def eu():
    """Quem esta logado. A tela usa para desenhar o cabecalho."""
    return _sem_cache(jsonify({
        "usuario": sessao.usuario_atual(),
        "master": sessao.e_master(),
        "dados_pessoais": config.DADOS_PESSOAIS,
        "demo": config.MODO_DEMO,
        # Qual IP o servidor esta vendo. Serve para conferir, depois do deploy,
        # se o Docker preserva o endereco do cliente - do que depende o limite
        # de tentativas nao virar bloqueio coletivo. Ver monitoramento/sessao.py.
        "origem_vista": sessao.origem(),
    }))


def _sem_cache(resposta):
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


# ------------------------------------------------------------------- pagina

@app.route("/")
def raiz():
    return send_from_directory(app.static_folder, "index.html")


# -------------------------------------------------------------- fluxo (SSE)

@app.route("/api/fluxo")
def fluxo():
    """Envia o painel por Server-Sent Events assim que ele muda.

    Por que SSE e nao polling: com polling o dado so aparece na tela no
    proximo tique do relogio do navegador, somando ate um intervalo inteiro
    de atraso ao que ja levou para coletar. Aqui o servidor empurra no
    instante em que a coleta termina - o atraso extra e zero.

    Por que SSE e nao WebSocket: o trafego e de mao unica (servidor para
    tela). SSE roda em HTTP comum, reconecta sozinho pelo proprio navegador e
    nao precisa de biblioteca nem de tratamento especial em proxy.

    Um pulso a cada PULSO_SSE segundos permite a tela perceber que a conexao
    caiu mesmo quando nada mudou no Zabbix.
    """
    if not _fluxos.acquire(blocking=False):
        return jsonify(erro="Limite de conexões simultâneas atingido"), 503
    usuario = sessao.usuario_atual()
    versao_sessao = session.get('versao')
    expira = session.get('desde', 0) + app.permanent_session_lifetime.total_seconds()
    def gerar():
        conhecida = -1
        # manda o estado atual de imediato, para a tela nao nascer vazia
        while True:
            try:
                conhecida, payload = estado.assinar(conhecida, config.PULSO_SSE)
                if time.time() >= expira or contas.versao_sessao(usuario) != versao_sessao:
                    return
                if payload is not None:
                    yield "event: painel\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"
                else:
                    yield ("event: pulso\ndata: "
                           + json.dumps({"em": int(time.time()),
                                         "conexao": estado.diagnostico()["conexao"]},
                                        ensure_ascii=False) + "\n\n")
            except GeneratorExit:
                return
            except Exception as e:                               # noqa: BLE001
                yield "event: erro\ndata: " + json.dumps({"erro": "Fluxo temporariamente indisponível"}) + "\n\n"
                return

    def protegido():
        try:
            yield from gerar()
        finally:
            _fluxos.release()
    resposta = Response(protegido(), mimetype="text/event-stream")
    resposta.headers["Cache-Control"] = "no-cache"
    resposta.headers["Connection"] = "keep-alive"
    # desliga o buffer do nginx, caso um dia entre um proxy na frente
    resposta.headers["X-Accel-Buffering"] = "no"
    return resposta


# -------------------------------------------------------------------- dados

@app.route("/api/painel")
def painel():
    """Estado completo. Usado na primeira carga e como reserva do SSE."""
    dados = estado.instantaneo()
    if dados is None:
        diag = estado.diagnostico()
        return _sem_cache(jsonify({
            "erro": diag["erro_parque"] or diag["erro_problemas"]
                    or "coletando pela primeira vez, aguarde alguns segundos",
            "conexao": diag["conexao"],
        })), 503
    return _sem_cache(jsonify(dados))


# Nome antigo da rota, mantido para nao quebrar nada que ja aponte para ele.
@app.route("/api/dashboard")
def dashboard():
    return painel()


@app.route("/api/host/<hostid>")
def host(hostid):
    """Detalhe de um host, consultado no Zabbix na hora do clique."""
    if not hostid.isdigit():
        return _sem_cache(jsonify({"erro": "hostid invalido"})), 400
    try:
        dados = detalhe.obter(hostid)
    except ZabbixIndisponivel as e:
        return _sem_cache(jsonify({"erro": str(e)})), 502
    if dados is None:
        return _sem_cache(jsonify({"erro": "host nao encontrado no Zabbix"})), 404
    # Mesma regra da rota de acessos: quem esta logado na maquina e dado
    # pessoal, e so master recebe. Aqui o campo e ACRESCENTADO para master, em
    # vez de ser removido para os demais - assim esquecer de filtrar nao vaza,
    # porque o padrao e nao ter o campo.
    recursos = dados.get('recursos', {})
    if not (sessao.e_master() and config.DADOS_PESSOAIS):
        recursos.pop('abas', None)
        recursos.pop('abas_em', None)
    if sessao.e_master() and config.DADOS_PESSOAIS:
        try:
            dados["usuario_logado"] = acessos.de_um_host(hostid)
        except ZabbixIndisponivel:
            dados["usuario_logado"] = None
    return _sem_cache(jsonify(dados))


# ------------------------------------------------------------------ servico

# --------------------------------------------------------------- acessos
#
# Rota separada, e nao um pedaco do payload principal, de proposito.
#
# O payload principal e empurrado por SSE para TODO mundo que esta logado.
# Nome de usuario e dado pessoal, e a regra combinada e que so master ve. Se o
# nome viajasse junto do resto, a restricao seria a tela escondendo algo que o
# navegador ja recebeu - ou seja, nao seria restricao nenhuma.
#
# Aqui quem nao e master leva 403 e o dado nunca sai do servidor.

@app.route("/api/acessos")
@sessao.exigir_master
def acessos_listar():
    if not config.DADOS_PESSOAIS:
        return jsonify(erro="Coleta de dados pessoais desabilitada"), 403
    try:
        dias = int(request.args.get("dias") or acessos.DIAS_PADRAO)
    except ValueError:
        dias = acessos.DIAS_PADRAO
    try:
        return _sem_cache(jsonify(acessos.montar(dias)))
    except ZabbixIndisponivel as e:
        return _sem_cache(jsonify({"erro": str(e)})), 502


@app.route("/api/relatorio/disponibilidade")
def relatorio_disponibilidade():
    """Presenca do agente por maquina no periodo.

    Nao e master-only: nao ha dado pessoal aqui, so hostname e percentual -
    a mesma informacao que o inventario ja mostra a qualquer um que entra.
    """
    try:
        dias = int(request.args.get("dias") or 7)
    except ValueError:
        dias = 7
    try:
        return _sem_cache(jsonify(relatorios.disponibilidade(dias)))
    except ZabbixIndisponivel as e:
        return _sem_cache(jsonify({"erro": str(e)})), 502


@app.route("/api/aplicativos")
def aplicativos_listar():
    """Ranking de aplicativos instalados no parque.

    Nao e master-only: nome de programa e hostname nao sao dado pessoal -
    mesma visibilidade do inventario. O dado em si vem de fora do ciclo do
    Zabbix (ver monitoramento/aplicativos.py e scripts/monitoramento_software.ps1).
    """
    projeto = request.args.get("projeto") or None
    ambiente = request.args.get("ambiente") or None
    try:
        return _sem_cache(jsonify(aplicativos.montar(projeto, ambiente)))
    except ZabbixIndisponivel as e:
        return _sem_cache(jsonify({"erro": str(e)})), 502


@app.route("/api/atualizar", methods=["POST"])
@sessao.exigir_cabecalho
def atualizar():
    """Forca uma coleta do Zabbix agora, sem esperar o proximo ciclo.

    Nao devolve dado: quem entrega o resultado e o proprio SSE, alguns
    segundos depois. Assim a rota responde na hora e a tela nao trava
    esperando o Zabbix.

    Exige o cabecalho de acao (X-monitoramento) porque provoca trabalho no
    servidor - formulario de outro site nao consegue defini-lo.
    """
    estado.forcar_coleta()
    return _sem_cache(jsonify({"ok": True}))


@app.route("/api/saude")
@sessao.exigir_master
def saude():
    diag = estado.diagnostico()
    ok = diag["configurado"] and diag["ja_coletou"] and diag["conexao"]["ok"]
    return _sem_cache(jsonify(diag)), (200 if ok else 503)


# A politica de conteudo pode ser estrita porque o painel nao busca NADA de
# fora: CSS, JS, fonte, logo - tudo sai deste servidor. Nao ha CDN para
# liberar, nao ha script de terceiro.
#
# Duas escolhas merecem explicacao:
#
# script-src 'self' SEM 'unsafe-inline'. Foi por isto que o onerror inline do
#   logo virou codigo em app.js. E a metade da politica que realmente vale:
#   com ela, texto que por algum caminho vire HTML na pagina nao executa.
#
# style-src aceita 'unsafe-inline'. A tela monta barras e cores com atributo
#   style (largura de barra, cor de severidade), e reescrever tudo isso em
#   classe seria um refatoramento grande para um ganho pequeno - estilo inline
#   nao executa codigo. Fica registrado como divida, nao como descuido.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",          # o SSE de /api/fluxo entra aqui
    "frame-ancestors 'none'",      # ninguem embute este painel em iframe
    "base-uri 'none'",
    # 'self' e nao 'none': a tela de login tem formulario, e 'none' bloqueia o
    # envio - o botao Entrar simplesmente nao fazia nada. Ficou 'none' por dias
    # porque na epoca era verdade que nenhuma tela enviava formulario; virou
    # mentira no minuto em que o login entrou. Diretiva de CSP precisa ser
    # revisada quando a aplicacao ganha capacidade nova.
    # 'self' mantem a protecao que importa: o formulario so pode postar para
    # este mesmo servidor, nunca para um site de fora.
    "form-action 'self'",
    "object-src 'none'",
])


@app.route('/health/live')
def vivo():
    return jsonify(status='ok')


@app.route('/health/ready')
def pronto():
    diag = estado.diagnostico()
    ok = diag['ja_coletou'] and diag['conexao']['ok']
    return jsonify(status='ok' if ok else 'aguardando'), 200 if ok else 503


@app.after_request
def cabecalhos(resposta):
    resposta.headers['Cache-Control'] = 'no-store'
    if request.is_secure:
        resposta.headers['Strict-Transport-Security'] = 'max-age=31536000' 
    resposta.headers.setdefault("Content-Security-Policy", CSP)
    resposta.headers.setdefault("X-Content-Type-Options", "nosniff")
    resposta.headers.setdefault("Referrer-Policy", "same-origin")
    # frame-ancestors ja cobre isto na CSP; o cabecalho antigo fica para
    # navegador que ignore a diretiva.
    resposta.headers.setdefault("X-Frame-Options", "DENY")
    resposta.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    resposta.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return resposta


if __name__ == "__main__":
    # so para desenvolvimento; em producao roda sob gunicorn
    app.run(host="127.0.0.1", port=8099, threaded=True, debug=False)
