# Monitoramento de infraestrutura

Dashboard integrado ao Zabbix, desenvolvido com Python/Flask e JavaScript,
com indicadores de capacidade, inventário, alertas e atualização por SSE.

O projeto nasceu da implantação de monitoramento em um ambiente com mais de
100 máquinas, incluindo a preparação do servidor Linux e a configuração do
Zabbix. Este repositório contém a aplicação, infraestrutura em containers e
uma demonstração independente com 120 hosts sintéticos.

## Infraestrutura e DevOps

- **Docker:** build em múltiplos estágios, usuário sem privilégios e healthcheck.
- **Compose:** volumes persistentes, limites de recursos, filesystem somente leitura e remoção de capabilities.
- **Nginx:** proxy reverso com TLS, limites de requisições e suporte a SSE sem buffering.
- **Segredos:** chave de sessão e token montados como arquivos, fora da imagem.
- **Operação:** endpoints de liveness e readiness, logs em stdout/stderr e rotação no Docker.
- **GitHub Actions:** testes Python e JavaScript, auditoria de dependências, build e teste HTTP em Compose.
- **Dependências:** versões Python fixadas com hashes e atualizações via Dependabot.

A integração usa a API do Zabbix somente para leitura.

## Funcionalidades

- CPU, memória e espaço livre, com acesso do indicador às máquinas que o compõem.
- Inventário, filtros por projeto e ambiente, mapa e modo NOC.
- Problemas ativos separados de ruído e de alertas em máquinas offline.
- Detalhe de host com volumes, interfaces, processos e última medição conhecida.
- Relatório de presença do agente e exportação de inventário em CSV.
- Contas locais, papéis de administrador e leitor e troca obrigatória de senha temporária.

Os módulos opcionais de acessos e abas de navegador ficam **desabilitados por padrão**. Os scripts de coleta e de servidor
não estão incluídos. A tela mostra ausência de coleta quando um item opcional não existe.

## Executar a demonstração

Requisitos: Docker Engine + Compose v2 em Linux, ou Docker Desktop com WSL 2
e containers Linux em Windows. Python 3.13+ é usado apenas para preparar a chave.
Execute os comandos dentro desta pasta:

```sh
python scripts/preparar.py
docker compose up -d --build
docker compose exec app python -m monitoramento.contas criar operador --master
```

O último comando solicita a senha no terminal. Não existe senha padrão.
Abra **http://localhost:8099**. A porta é publicada somente no loopback, e a
demonstração não consulta nenhum Zabbix. Em Linux, use `python3` se necessário.

```sh
docker compose ps
docker compose logs --tail=50 app
docker compose down
```

`down` preserva o volume de contas. `down -v` apaga esse volume; não use para
uma simples parada.

Sem Docker, o [guia de operação](docs/operacao.md) explica como executar o modo
de desenvolvimento local. Para dados reais, use o arquivo independente
`compose.production.yaml`, com proxy HTTPS, token de leitura e domínio próprios.

## Organização

```text
backend/
  app.py                  rotas HTTP, autenticação e SSE
  monitoramento/          coleta, regras, integração e contas
frontend/
  static/                 HTML, CSS, JavaScript e fonte local licenciada
  templates/              login, troca de senha e saída
infra/nginx/              proxy reverso com TLS e limites de requisição
docs/                     arquitetura, operação, segurança e testes
scripts/                  configuração local e verificação de arquivos
tests/                    regressões com dados fictícios
.github/workflows/        integração contínua
Dockerfile                imagem Linux com usuário sem privilégios
compose.yaml              demonstração local
compose.production.yaml   integração HTTPS com um Zabbix existente
requirements.txt          dependências fixadas com hashes
```

Backend e frontend ficam separados no código e são empacotados na mesma imagem.
O frontend é servido pelo Flask na mesma origem, o que simplifica cookies e
proteção contra requisições de outros sites. Não há Node.js no container de execução.

## Decisões de arquitetura

**Dado ausente não vira zero.** Um item calculado pelo servidor pode continuar
ganhando horário novo mesmo quando a estação parou de reportar. O último contato
considera itens de agente; quando ficam antigos, as métricas atuais são limpas.

**Uma média não explica um incidente.** O disco usa o volume mais apertado de cada
máquina. A memória é agrupada por capacidade instalada, e os indicadores permitem
abrir a lista das máquinas afetadas.

**A coleta tem ritmos diferentes.** Problemas e eventos são consultados a cada
5 segundos, inventário a cada 30 e séries a cada 120. Uma thread central mantém
o cache; abrir mais navegadores não duplica essa coleta. Consultas de detalhe e
relatórios são feitas sob demanda e acrescentam chamadas à API.

**Um processo é uma restrição consciente.** Cache, coordenação da coleta e limite
de login ficam na memória. O Gunicorn roda com um worker e 32 threads; há limite
de 20 fluxos SSE para reservar capacidade às outras rotas. Escalar réplicas exige
separar coleta, cache, sessões e armazenamento de contas.

## Qualidade e segurança

```sh
python -m pip install --require-hashes -r requirements.txt
python -m unittest discover -s tests -v
python scripts/verificar_publicacao.py
node --test tests/frontend.test.cjs
```

Use um ambiente virtual. O CI repete os testes, audita as dependências, constrói
a imagem e testa o Compose em Linux.

Consulte [testes e validação](docs/validacao.md) para detalhes da cobertura e do pipeline.

## Documentação

- [Arquitetura e critérios de leitura](docs/arquitetura.md)
- [Guia do painel](docs/guia-painel.md)
- [Operação local e integração](docs/operacao.md)
- [Segurança e limites conhecidos](docs/seguranca.md)

A fonte Inter é distribuída com sua [licença original](frontend/static/fontes/LICENCA-Inter.txt).
