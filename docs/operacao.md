# Operação

## Demonstração em Windows ou Linux

Use o Compose padrão. No Windows, o Docker Desktop precisa estar aberto, com o motor Linux em execução. O projeto roda em containers Linux, mesmo que seu editor esteja no Windows.

```sh
python scripts/preparar.py
docker compose up -d --build
docker compose exec app python -m monitoramento.contas criar operador --master
```

Acesse http://localhost:8099. A senha é solicitada no terminal, sem ir para o histórico, e precisa ter pelo menos 12 caracteres. Não há senha padrão. O cenário contém 120 hosts fictícios; não precisa de servidor Zabbix.

Use `docker compose ps` e `docker compose logs --tail=50 app` para acompanhar o serviço. `/health/live` testa o processo; `/health/ready` retorna 200 depois de uma coleta bem-sucedida e 503 quando a integração não está pronta. O healthcheck do container usa a primeira rota, para não confundir falha do Zabbix com processo morto.

`docker compose down` mantém as contas. A opção `-v` remove o volume: só use quando quiser apagar os dados daquela demonstração.

## Desenvolvimento sem container

Crie um ambiente virtual com `python -m venv .venv`. No PowerShell, use `.\.venv\Scripts\python.exe` nos comandos abaixo; no Linux, `.venv/bin/python`. A palavra `python` abaixo representa esse executável:

```sh
python -m pip install --require-hashes -r requirements.txt
python scripts/local.py criar operador --master
python scripts/local.py
```

O lançador usa somente dados simulados, salva as contas em `data/` e escuta em 127.0.0.1. O servidor de desenvolvimento não deve ser exposto como serviço de produção.

## Integração com um Zabbix existente

`compose.production.yaml` é um arquivo independente. Não o combine com o Compose da demonstração, pois isso poderia manter a porta HTTP publicada.

1. Copie `.env.example` para `.env`. Configure a URL HTTPS da API, o domínio permitido em `TRUSTED_HOSTS` (sem protocolo nem caminho) e os prefixos de projeto e ambiente.
2. Execute o preparador. Crie `.secrets/zabbix_token` com um token de usuário de leitura, restrito aos grupos necessários. Os métodos usados são `host.get`, `item.get`, `problem.get`, `trigger.get`, `history.get` e `event.get`. O token não vai para `.env` nem para o frontend.
3. Instale um certificado válido e sua chave em `certs/fullchain.pem` e `certs/privkey.pem`. A renovação cabe ao operador. O processo do proxy usa UID 101 e precisa ler esses arquivos.
4. Confira DNS, firewall, permissões e acesso HTTPS do container ao Zabbix:

```sh
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml exec app python -m monitoramento.contas criar operador --master
```

Em Linux, `.secrets/` é criada com modo 0700 e a chave de sessão com modo 0444. O diretório impede acesso por outros usuários locais; o arquivo montado como secret pode ser lido pelo UID 10001 do container. Use a mesma combinação para o token. Não torne o diretório acessível a outros usuários. Compose local monta arquivos; não é um cofre criptografado. Em Windows, restrinja as permissões NTFS dessas pastas ao seu usuário.

Para a chave TLS, mantenha o diretório privado e conceda leitura ao UID/grupo do proxy. Nunca coloque chaves privadas no Git. O app valida o certificado do Zabbix e não segue redirecionamentos. Para uma autoridade interna, instale a CA em uma imagem derivada ou configure um bundle de confiança montado; não desative a verificação TLS.

O proxy sobrescreve os cabeçalhos de origem e o app confia em exatamente um proxy. Se inserir outro balanceador, revise essa cadeia. O app não publica porta no Compose de integração. Há limites de conexões e requisições por IP no proxy e de tentativas de login na aplicação.

## Contas e recuperação

As contas ficam no volume `contas`, em `/dados/usuarios.json`. O arquivo contém hashes, papéis e versões de sessão; ainda é sensível. Faça backup com os containers parados, fora do repositório, e teste restauração em volume separado. Preserve proprietário UID 10001 e modo 0600. Não edite o JSON com o serviço em execução.

```sh
docker compose exec app python -m monitoramento.contas listar
docker compose exec app python -m monitoramento.contas senha operador
```

Acrescente `-f compose.production.yaml` no ambiente integrado. Trocar a senha revoga sessões anteriores. Sair encerra também as outras sessões da mesma conta. Trocar a chave de sessão invalida todos os cookies. O preparador nunca substitui uma chave existente.

Mantenha um worker e uma instância. Cache e limites de login não são compartilhados entre processos; o bloqueio de arquivo protege apenas o JSON. Há 32 threads e no máximo 20 fluxos SSE. Relatórios e detalhes também consomem threads. Faça teste de carga antes de ampliar o público.

O histórico depende da retenção dos itens no Zabbix. Ausência de histórico não comprova disponibilidade. Coletores opcionais de software, acessos e abas não estão incluídos no repositório.

As imagens base usam tags de versão, não digests imutáveis. As bibliotecas Python têm versões e hashes fixados. Atualize as duas camadas periodicamente e repita testes e auditoria.

Referência das permissões: [secrets de arquivo no Compose](https://docs.docker.com/reference/compose-file/services/#secrets).
