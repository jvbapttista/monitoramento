"""Desenvolvimento local, ligado somente ao loopback, sempre com dados fictícios."""
import os
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
runpy.run_path(str(root / "scripts/preparar.py"))
sys.path.insert(0, str(root / "backend"))
os.environ.update(MODO_DEMO="1", COOKIE_SEGURO="0", CONFIAR_PROXY="0",
                  SECRET_KEY_FILE=str(root / ".secrets/session_key"),
                  ARQUIVO_CONTAS=str(root / "data/usuarios.json"))
os.environ.pop("SECRET_KEY", None)
if len(sys.argv) > 1:
    sys.argv = ["monitoramento.contas", *sys.argv[1:]]
    runpy.run_module("monitoramento.contas", run_name="__main__")
else:
    runpy.run_path(str(root / "backend/app.py"), run_name="__main__")
