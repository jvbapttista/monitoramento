"""Contas locais com scrypt, escrita atômica e bloqueio entre processos.

O JSON atende uma instalação pequena, com um volume persistente. Senhas
permanentes não saem pela API; senhas temporárias são devolvidas uma vez ao
administrador e exigem troca. Remover ou rebaixar o último administrador é proibido.
"""

import json
import os
import re
import secrets
from filelock import FileLock
from contextlib import contextmanager
import time

from werkzeug.security import check_password_hash, generate_password_hash

# O volume montado no compose. Fora do container, para os usuarios sobreviverem
# a reconstrucao da imagem.
CAMINHO = os.environ.get("ARQUIVO_CONTAS", "/dados/usuarios.json")

# Usuario curto, minusculo: "operador.exemplo". Nao aceita espaco nem arroba - a
# escolha foi por nome curto, e validar aqui evita que metade das contas nasca
# como e-mail e metade como nome, com a busca deixando de funcionar depois.
PADRAO_USUARIO = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")

# Comprimento minimo, e nada de regra de complexidade. Exigir maiuscula, numero
# e simbolo produz "Senha@123" em toda a empresa; comprimento e o que de fato
# aumenta o custo de adivinhar.
MINIMO_SENHA = 12

# Alfabeto da senha temporaria: sem 0/O, 1/l/I e outros pares que se confundem
# quando alguem le em voz alta ou copia de um papel. A senha temporaria e feita
# para ser DITADA uma vez, entao legibilidade importa mais que entropia maxima -
# e 12 caracteres deste conjunto ainda dao mais de 60 bits.
ALFABETO_TEMP = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"
TAMANHO_TEMP = 12

@contextmanager
def _bloqueio():
    os.makedirs(os.path.dirname(CAMINHO) or '.', exist_ok=True)
    with FileLock(CAMINHO + '.lock', timeout=15):
        yield



def gerar_temporaria():
    """Senha temporaria aleatoria.

    secrets, nao random: random e previsivel a partir do estado interno, e
    senha previsivel nao e senha.
    """
    return "".join(secrets.choice(ALFABETO_TEMP) for _ in range(TAMANHO_TEMP))


# ------------------------------------------------------------------ arquivo

def _vazio():
    return {"versao": 1, "usuarios": {}}


def _ler():
    try:
        with open(CAMINHO, "r", encoding="utf-8") as f:
            dados = json.load(f)
    except FileNotFoundError:
        return _vazio()
    except (OSError, ValueError) as e:
        # Arquivo corrompido: falhar alto. Devolver vazio aqui seria pior -
        # a aplicacao subiria "sem usuarios", e o primeiro que chegasse na tela
        # de criacao viraria master.
        raise RuntimeError(
            "arquivo de contas ilegivel (%s): %s" % (CAMINHO, e))
    if not isinstance(dados, dict) or "usuarios" not in dados:
        raise RuntimeError("arquivo de contas com formato inesperado: %s" % CAMINHO)
    return dados


def _gravar(dados):
    pasta = os.path.dirname(CAMINHO) or "."
    try:
        os.makedirs(pasta, exist_ok=True)
    except PermissionError:
        pass  # a pasta ja existe e nao e nossa; o open abaixo dira o porque

    temporario = CAMINHO + ".novo"
    try:
        _gravar_em(temporario, dados)
    except PermissionError as e:
        # Mensagem util em vez de rastro de pilha. Este erro tem uma causa
        # quase sempre: o volume nasceu pertencendo ao root e o processo roda
        # como usuario sem privilegio.
        raise RuntimeError(
            "sem permissão para gravar em %s (%s). "
            "Causa provável: o volume de dados pertence ao root e a "
            "aplicação roda como usuário sem privilégio. "
            "Conserto: pare os containers, remova o volume vazio e "
            "reconstrua — a imagem já cria /dados com o dono correto."
            % (pasta, e))
    os.replace(temporario, CAMINHO)
    try:
        os.chmod(CAMINHO, 0o600)
    except OSError:
        pass  # sistema de arquivos que nao suporta; nao e motivo para falhar


def _gravar_em(temporario, dados):
    fd = os.open(temporario, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())


# ------------------------------------------------------------------ consultas

def existe_algum():
    """Ha pelo menos uma conta? Usado para decidir se a aplicacao pode subir."""
    with _bloqueio():
        return bool(_ler()["usuarios"])


def listar():
    """Todas as contas, SEM o hash. O hash nunca sai deste modulo."""
    with _bloqueio():
        us = _ler()["usuarios"]
    saida = []
    for nome in sorted(us):
        u = us[nome]
        saida.append({
            "usuario": nome,
            "master": bool(u.get("master")),
            "criado_em": u.get("criado_em"),
            "criado_por": u.get("criado_por"),
            "ultimo_acesso": u.get("ultimo_acesso"),
            "trocar": bool(u.get("trocar")),
        })
    return saida


def e_master(usuario):
    with _bloqueio():
        u = _ler()["usuarios"].get((usuario or "").lower())
    return bool(u and u.get("master"))


def quantos_masters():
    with _bloqueio():
        us = _ler()["usuarios"]
    return sum(1 for u in us.values() if u.get("master"))


# ------------------------------------------------------------------ validacao

def validar_usuario(usuario):
    nome = (usuario or "").strip().lower()
    if not PADRAO_USUARIO.match(nome):
        raise ValueError(
            "usuário deve ter de 3 a 32 caracteres, começar com letra ou número "
            "e usar apenas letras minúsculas, números, ponto, hífen ou sublinhado")
    return nome


def validar_senha(senha):
    if len(senha or "") < MINIMO_SENHA:
        raise ValueError("a senha precisa de pelo menos %d caracteres" % MINIMO_SENHA)
    if len(senha) > 1024:
        raise ValueError("senha longa demais")
    return senha


# ------------------------------------------------------------------ escrita

def criar(usuario, senha, master=False, por="(desconhecido)", trocar=False):
    nome = validar_usuario(usuario)
    validar_senha(senha)
    with _bloqueio():
        dados = _ler()
        if nome in dados["usuarios"]:
            raise ValueError("o usuário %s já existe" % nome)
        dados["usuarios"][nome] = {
            "hash": generate_password_hash(senha),
            "versao_sessao": secrets.token_hex(16),
            "master": bool(master),
            "criado_em": int(time.time()),
            "criado_por": por,
            "ultimo_acesso": None,
            # Quando um master cria a conta, a senha e temporaria: quem recebe
            # troca no primeiro acesso. Assim a senha que o master conhece
            # deixa de valer, e ninguem alem da pessoa sabe a dela.
            #
            # Na criacao pela linha de comando com senha digitada (o primeiro
            # master), nao faz sentido obrigar: quem digitou foi o proprio dono.
            "trocar": bool(trocar),
        }
        _gravar(dados)
    return nome


def remover(usuario, por="(desconhecido)"):
    nome = (usuario or "").strip().lower()
    with _bloqueio():
        dados = _ler()
        u = dados["usuarios"].get(nome)
        if not u:
            raise ValueError("o usuário %s não existe" % nome)
        if u.get("master") and sum(1 for x in dados["usuarios"].values()
                                   if x.get("master")) <= 1:
            raise ValueError(
                "%s é o único master: removê-lo deixaria a aplicação sem "
                "ninguém capaz de criar contas" % nome)
        del dados["usuarios"][nome]
        _gravar(dados)
    return nome


def definir_master(usuario, master):
    nome = (usuario or "").strip().lower()
    with _bloqueio():
        dados = _ler()
        u = dados["usuarios"].get(nome)
        if not u:
            raise ValueError("o usuário %s não existe" % nome)
        if u.get("master") and not master:
            if sum(1 for x in dados["usuarios"].values() if x.get("master")) <= 1:
                raise ValueError(
                    "%s é o único master: rebaixá-lo deixaria a aplicação sem "
                    "ninguém capaz de criar contas" % nome)
        u["master"] = bool(master)
        _gravar(dados)
    return nome


def trocar_senha(usuario, senha, trocar=False):
    """Grava senha nova.

    trocar=False  -> a pessoa trocou a propria senha; a marca de "precisa
                     trocar" e limpa e ela entra normalmente.
    trocar=True   -> um master redefiniu; a senha e temporaria e a marca fica
                     ligada, obrigando a troca no proximo acesso.
    """
    nome = (usuario or "").strip().lower()
    validar_senha(senha)
    with _bloqueio():
        dados = _ler()
        u = dados["usuarios"].get(nome)
        if not u:
            raise ValueError("o usuário %s não existe" % nome)
        u["hash"] = generate_password_hash(senha)
        u["versao_sessao"] = secrets.token_hex(16)
        u["trocar"] = bool(trocar)
        _gravar(dados)
    return nome


def precisa_trocar(usuario):
    with _bloqueio():
        u = _ler()["usuarios"].get((usuario or "").lower())
    return bool(u and u.get("trocar"))


def redefinir(usuario, por="(desconhecido)"):
    """Gera senha temporaria nova e devolve em claro, UMA vez.

    Este e o unico ponto do sistema que devolve senha legivel, e ela nunca e
    gravada nem registrada em log - so entra na resposta HTTP para quem pediu.
    """
    temporaria = gerar_temporaria()
    trocar_senha(usuario, temporaria, trocar=True)
    return temporaria


# ------------------------------------------------------------------ conferir

def conferir(usuario, senha):
    """Devolve o nome normalizado se a senha bate, ou None.

    Mensagem de erro nao e decidida aqui de proposito: quem chama devolve a
    MESMA resposta para usuario inexistente e senha errada, senao a tela conta
    quem existe.
    """
    nome = (usuario or "").strip().lower()
    with _bloqueio():
        u = _ler()["usuarios"].get(nome)

    if not u:
        # Gasta o mesmo tempo de um hash real. Sem isso, responder mais rapido
        # para usuario inexistente revela quem existe pelo cronometro.
        generate_password_hash("comparacao-de-tempo")
        return None

    if not check_password_hash(u.get("hash") or "", senha or ""):
        return None

    with _bloqueio():
        dados = _ler()
        atual = dados["usuarios"].get(nome)
        if not atual or atual.get("hash") != u.get("hash"):
            return None
        atual["ultimo_acesso"] = int(time.time())
        _gravar(dados)
    return nome


# ------------------------------------------------------------ linha de comando

def _cli():
    """Uso pelo servidor:

        docker compose exec app python -m monitoramento.contas listar
        docker compose exec app python -m monitoramento.contas criar NOME --master
        docker compose exec app python -m monitoramento.contas senha NOME
        docker compose exec app python -m monitoramento.contas remover NOME
        docker compose exec app python -m monitoramento.contas master NOME --nao

    A senha e sempre PERGUNTADA, nunca passada como argumento: argumento fica
    no historico do shell e aparece na lista de processos.
    """
    import getpass
    import sys

    args = sys.argv[1:]
    if not args:
        print(_cli.__doc__)
        return 1
    acao, resto = args[0], args[1:]

    try:
        if acao == "listar":
            contas = listar()
            if not contas:
                print("nenhuma conta criada")
                return 0
            print("%-24s %-8s %s" % ("USUARIO", "MASTER", "ULTIMO ACESSO"))
            for c in contas:
                ult = (time.strftime("%d/%m/%Y %H:%M", time.localtime(c["ultimo_acesso"]))
                       if c["ultimo_acesso"] else "nunca")
                print("%-24s %-8s %s" % (c["usuario"], "sim" if c["master"] else "-", ult))
            return 0

        if acao in ("criar", "senha"):
            if not resto:
                print("falta o nome do usuário")
                return 2
            nome = resto[0]
            if acao == "criar":
                validar_usuario(nome)
            senha = getpass.getpass("Senha para %s: " % nome)
            if senha != getpass.getpass("Repita a senha: "):
                print("as senhas não conferem")
                return 2
            if acao == "criar":
                criar(nome, senha, master=("--master" in resto), por="(linha de comando)")
                print("criado: %s%s" % (nome, " (master)" if "--master" in resto else ""))
            else:
                trocar_senha(nome, senha)
                print("senha trocada: %s" % nome)
            return 0

        if acao == "remover":
            if not resto:
                print("falta o nome do usuário")
                return 2
            remover(resto[0], por="(linha de comando)")
            print("removido: %s" % resto[0])
            return 0

        if acao == "master":
            if not resto:
                print("falta o nome do usuário")
                return 2
            definir_master(resto[0], master=("--nao" not in resto))
            print("%s: master = %s" % (resto[0], "não" if "--nao" in resto else "sim"))
            return 0

        print("ação desconhecida: %s" % acao)
        print(_cli.__doc__)
        return 2

    except (ValueError, RuntimeError) as e:
        print("erro: %s" % e)
        return 1




def versao_sessao(usuario):
    with _bloqueio():
        u = _ler()['usuarios'].get((usuario or '').lower())
        return u.get('versao_sessao') if u else None


def revogar_sessoes(usuario):
    with _bloqueio():
        dados = _ler()
        u = dados['usuarios'].get((usuario or '').lower())
        if u:
            u['versao_sessao'] = secrets.token_hex(16)
            _gravar(dados)

if __name__ == "__main__":
    raise SystemExit(_cli())
