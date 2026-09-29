"""Verificação preventiva da árvore publicável; não substitui revisão humana."""
import ipaddress
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORADOS = {'.git', '.venv', '.secrets', 'certs', 'data', 'backups',
             '__pycache__', 'node_modules', '.pytest_cache'}
REDES = [ipaddress.ip_network(x) for x in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
PADROES = {
    'chave privada': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'token de provedor': re.compile(r'\b(?:ghp_|github_pat_|AKIA)[A-Za-z0-9_]{16,}'),
    'credencial em URL': re.compile(r'https?://[^\s/]+:[^\s/@]+@'),
    'caminho pessoal': re.compile(r'[A-Za-z]:[\\/]Users[\\/][^\s]+'),
}


def verificar():
    erros = []
    total = 0
    for arquivo in sorted(ROOT.rglob('*')):
        relativo = arquivo.relative_to(ROOT)
        if any(p in IGNORADOS for p in relativo.parts) or not arquivo.is_file():
            continue
        if arquivo.name.startswith('.env') and arquivo.name != '.env.example':
            continue
        if arquivo.suffix == '.woff2':
            continue
        if arquivo.suffix.lower() in {'.pem', '.key', '.pfx', '.zip', '.tar', '.png', '.jpg', '.pdf'}:
            erros.append(f'{relativo}: formato não previsto para publicação')
            continue
        try:
            texto = arquivo.read_text(encoding='utf-8-sig')
        except UnicodeError:
            erros.append(f'{relativo}: binário inesperado')
            continue
        total += 1
        if arquivo == Path(__file__).resolve():
            continue
        for linha, conteudo in enumerate(texto.splitlines(), 1):
            for nome, padrao in PADROES.items():
                if padrao.search(conteudo):
                    erros.append(f'{relativo}:{linha}: {nome}')
            for valor in re.findall(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])', conteudo):
                try:
                    endereco = ipaddress.ip_address(valor)
                except ValueError:
                    continue
                if any(endereco in rede for rede in REDES):
                    erros.append(f'{relativo}:{linha}: endereço de rede privada')
    for erro in erros:
        print(erro)
    print(f'{total} arquivos de texto conferidos; {len(erros)} ocorrência(s).')
    return bool(erros)


if __name__ == '__main__':
    raise SystemExit(verificar())
