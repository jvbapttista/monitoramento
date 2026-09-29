# Testes e validação

## Testes automatizados

Em um ambiente virtual com as dependências instaladas:

```sh
python -m unittest discover -s tests -v
node --test tests/frontend.test.cjs
python scripts/verificar_publicacao.py
```

Os testes Python cobrem autorização, CSRF, revogação de sessões, privacidade,
tratamento de itens antigos, hosts offline, agregação de indicadores, restrição
a métodos de leitura e falhas de comunicação sem exposição de credenciais.
Os testes JavaScript verificam formatadores e proteção contra fórmulas no CSV.
O verificador de arquivos busca padrões de credenciais, caminhos pessoais e
endereços de rede privada; sua cobertura se limita aos padrões implementados.

## Integração em container

Inicie a demonstração conforme o README e execute:

```sh
python tests/smoke_container.py
```

O teste cria uma conta temporária, verifica saúde, autenticação, proteção de rotas,
inventário, detalhe de host, SSE e logout, e remove a conta ao terminar.
Execute somente na demonstração; a criação da conta de teste é recusada fora
desse modo.

## Integração contínua

O workflow [validacao.yaml](../.github/workflows/validacao.yaml) define dois jobs:

- **Testes:** instalação com hashes, testes Python e JavaScript, verificação de arquivos e auditoria de dependências com `pip-audit`.
- **Container:** preparação da chave, validação do Compose, build, inicialização com espera pelo healthcheck e teste HTTP. Coleta logs em caso de falha e remove o ambiente descartável e seu volume ao terminar.

Para executar a auditoria localmente:

```sh
python -m pip install pip-audit==2.10.1
python -m pip_audit -r requirements.txt --disable-pip --no-deps
```

## Limites da cobertura

A demonstração usa dados sintéticos. A integração com Zabbix exige validação de
token, permissões, templates, histórico, DNS e certificados no ambiente de destino.
O pipeline não cobre implantação HTTPS completa, teste prolongado de carga,
pentest ou restauração de backup.
