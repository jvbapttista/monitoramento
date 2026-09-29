"""Configuração sensível lida de arquivo montado ou ambiente."""
import os
from pathlib import Path


def ler(nome):
    arquivo = os.environ.get(nome + "_FILE")
    if arquivo and os.environ.get(nome):
        raise RuntimeError(f"Use somente {nome} ou {nome}_FILE")
    if arquivo:
        return Path(arquivo).read_text(encoding="utf-8-sig").strip()
    return os.environ.get(nome, "").strip()
