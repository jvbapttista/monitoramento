"""Autenticação local, revogação de sessão e proteção das ações HTTP."""
import os
import secrets
import threading
import time
from functools import wraps
from flask import jsonify, redirect, render_template, request, session, url_for
from . import contas
from .segredos import ler

LIVRES = {'/login', '/health/live', '/health/ready', '/js/login.js', '/js/tema.js'}
PREFIXOS_LIVRES = ('/css/', '/fontes/')
LIVRES_COM_TROCA_PENDENTE = {'/trocar-senha', '/sair'}
CABECALHO_ACAO = 'X-Monitoramento'
TENTATIVAS_MAX = 10
JANELA_SEG = BLOQUEIO_SEG = 600
_falhas = {}
_trava = threading.Lock()


def configurar(app):
    chave = ler('SECRET_KEY')
    if len(chave) < 32:
        raise RuntimeError('SECRET_KEY deve ter pelo menos 32 caracteres aleatórios')
    app.secret_key = chave
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Strict',
        SESSION_COOKIE_SECURE=os.environ.get('COOKIE_SEGURO', '1') == '1',
        SESSION_REFRESH_EACH_REQUEST=False,
        PERMANENT_SESSION_LIFETIME=int(os.environ.get('SESSAO_HORAS', '8')) * 3600,
        MAX_CONTENT_LENGTH=16384,
        MAX_FORM_MEMORY_SIZE=16384,
        MAX_FORM_PARTS=20,
        TRUSTED_HOSTS=[h.strip() for h in os.environ.get(
            'TRUSTED_HOSTS', 'localhost,127.0.0.1,[::1]').split(',') if h.strip()],
    )
    app.jinja_env.globals['csrf_token'] = csrf_token


def origem():
    # ProxyFix é habilitado explicitamente no modo proxy em app.py.
    return request.remote_addr or '?'


def _chave():
    return origem(), (request.form.get('usuario') or '').strip().lower()[:32]


def bloqueado():
    with _trava:
        marcas = _falhas.get(_chave(), [])
        return sum(time.time() - t < BLOQUEIO_SEG for t in marcas) >= TENTATIVAS_MAX


def registrar_falha():
    agora = time.time()
    with _trava:
        for chave in list(_falhas):
            _falhas[chave] = [t for t in _falhas[chave] if agora - t < JANELA_SEG]
            if not _falhas[chave]:
                del _falhas[chave]
        if len(_falhas) >= 1000 and _chave() not in _falhas:
            del _falhas[next(iter(_falhas))]
        _falhas.setdefault(_chave(), []).append(agora)


def limpar_falhas():
    with _trava:
        _falhas.pop(_chave(), None)


def usuario_atual():
    usuario = session.get('usuario')
    if not usuario:
        return None
    versao = contas.versao_sessao(usuario)
    if not versao or not secrets.compare_digest(versao, session.get('versao', '')):
        session.clear()
        return None
    return usuario


def e_master():
    usuario = usuario_atual()
    return bool(usuario and contas.e_master(usuario))


def entrar(usuario):
    session.clear()
    session.permanent = True
    session.update(usuario=usuario, versao=contas.versao_sessao(usuario), desde=time.time())


def sair():
    usuario = usuario_atual()
    if usuario:
        contas.revogar_sessoes(usuario)
    session.clear()


def csrf_token():
    if 'csrf' not in session:
        session['csrf'] = secrets.token_urlsafe(32)
    return session['csrf']


def instalar_guarda(app):
    @app.before_request
    def guarda():
        if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            if request.path.startswith('/api/'):
                if request.headers.get(CABECALHO_ACAO) != '1':
                    return jsonify(erro='Cabeçalho de ação ausente'), 400
                if request.data:
                    corpo = request.get_json(silent=True)
                    if not isinstance(corpo, dict):
                        return jsonify(erro='Envie um objeto JSON'), 400
                    if 'usuario' in corpo and not isinstance(corpo['usuario'], str):
                        return jsonify(erro='Usuário inválido'), 400
                    if 'master' in corpo and not isinstance(corpo['master'], bool):
                        return jsonify(erro='Papel deve ser booleano'), 400
            else:
                enviado = request.form.get('csrf_token', '')
                esperado = session.get('csrf', '')
                if not esperado or not secrets.compare_digest(enviado, esperado):
                    return 'Formulário expirado. Recarregue a página.', 400
        if request.path in LIVRES or request.path.startswith(PREFIXOS_LIVRES):
            return None
        usuario = usuario_atual()
        if not usuario:
            if request.path.startswith('/api/'):
                return jsonify(erro='não autenticado'), 401
            return redirect(url_for('login'))
        if contas.precisa_trocar(usuario) and request.path not in LIVRES_COM_TROCA_PENDENTE:
            if request.path.startswith('/api/'):
                return jsonify(erro='Troque a senha antes de continuar', trocar_senha=True), 403
            return redirect(url_for('trocar_senha'))


def exigir_master(funcao):
    @wraps(funcao)
    def interno(*args, **kwargs):
        if not usuario_atual():
            return jsonify(erro='não autenticado'), 401
        if not e_master():
            return jsonify(erro='Acesso restrito ao administrador'), 403
        return funcao(*args, **kwargs)
    return interno


def exigir_cabecalho(funcao):
    @wraps(funcao)
    def interno(*args, **kwargs):
        if request.headers.get(CABECALHO_ACAO) != '1':
            return jsonify(erro='Cabeçalho de ação ausente'), 400
        return funcao(*args, **kwargs)
    return interno


def pagina_login(erro=None, aviso=None):
    return render_template('login.html', erro=erro, aviso=aviso,
                           sem_contas=not contas.existe_algum())


def pagina_troca(erro=None, obrigatoria=False):
    return render_template('trocar-senha.html', erro=erro, obrigatoria=obrigatoria,
                           usuario=usuario_atual(), minimo=contas.MINIMO_SENHA)
