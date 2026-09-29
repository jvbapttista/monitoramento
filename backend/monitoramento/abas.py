"""Abas recebidas por item opcional monitoramento.browser.tabs.get.

O coletor não está incluído. Contrato: lista de objetos com p (processo),
t (título) e u (URL opcional). Dados pessoais exigem configuração explícita
 e papel administrativo na rota que os entrega.
"""

import json

CHAVE = "monitoramento.browser.tabs.get"


def parse_item(bruto):
    """JSON do item -> dict {processo: [{"titulo", "url"}, ...]}, agrupado
    pelo mesmo nome de processo usado em "Programas em execução", para a
    tela juntar as duas coisas sem precisar cruzar nada.

    Tolerante a valor ausente ou quebrado: uma máquina com formato
    inesperado não pode derrubar o resto do detalhe."""
    if not bruto:
        return {}
    try:
        lido = json.loads(bruto)
    except (ValueError, TypeError):
        return {}
    if not isinstance(lido, list):
        return {}

    agrupado = {}
    for item in lido:
        if not isinstance(item, dict):
            continue
        if any(item.get(chave) is not None and not isinstance(item[chave], str)
               for chave in ['p', 't', 'u']):
            continue
        processo = (item.get("p") or "").strip().lower()
        titulo = (item.get("t") or "").strip()
        if not processo or not titulo:
            continue
        agrupado.setdefault(processo, []).append({
            "titulo": titulo,
            "url": (item.get("u") or "").strip() or None,
        })
    return agrupado
