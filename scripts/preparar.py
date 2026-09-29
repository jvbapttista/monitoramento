"""Cria apenas a chave da sessão; nunca sobrescreve uma chave existente."""
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pasta = root / ".secrets"
pasta.mkdir(mode=0o700, exist_ok=True)
if os.name == "posix":
    pasta.chmod(0o700)
chave = pasta / "session_key"
try:
    fd = os.open(chave, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o444)
except FileExistsError:
    print("Chave existente preservada.")
else:
    with os.fdopen(fd, "w", encoding="utf-8") as arquivo:
        arquivo.write(secrets.token_hex(32))
    print("Chave criada em .secrets/session_key (conteúdo não exibido).")
