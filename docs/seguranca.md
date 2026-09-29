# Segurança e limites

A demonstração usa dados sintéticos e não precisa de token para demonstrar as regras de monitoramento.

## Controles implementados

- Token usado apenas no backend, métodos de leitura permitidos, HTTPS obrigatório, certificado validado, timeout e ausência de redirecionamentos.
- Senhas com scrypt, mínimo de 12 caracteres, erro de login sem revelar existência da conta e limite de tentativas por IP e usuário.
- Cookies HttpOnly e SameSite Strict, expiração de oito horas por padrão e revogação após redefinição de senha ou saída. Secure e HSTS no modo HTTPS; demonstração HTTP restrita ao loopback.
- Papéis verificados no servidor. Leitor não administra contas; o último administrador não pode ser removido nem rebaixado.
- CSRF nos formulários e cabeçalho próprio nas ações JSON, sem CORS. GET não executa logout.
- Escape de texto externo, CSP sem scripts inline, bloqueio de enquadramento e neutralização de fórmulas no CSV.
- Saúde pública sem diagnóstico detalhado, respostas sem cache e erros da integração sem URL ou token.
- Containers sem root, capacidades removidas, filesystem somente leitura, limites de recursos e rotação de logs.
- JSON de contas com escrita atômica e bloqueio entre processos, inclusive a ferramenta de administração.
- Acessos e abas desabilitados por padrão; quando habilitados, exigem administrador.

## Limites conhecidos

Não há MFA, SSO, cofre de segredos, auditoria central nem alta disponibilidade. O limite de login vive em memória, reinicia com o processo e não impede ataque distribuído. Usuários atrás do mesmo NAT compartilham os limites do proxy.

Volumes e secrets não são criptografados pela aplicação. Quem controla o host ou o daemon Docker pode lê-los. Proteja sistema operacional, backups e acesso administrativo. Cookies assinados não são criptografados; a sessão não contém senha nem token do Zabbix.

O frontend usa estilos inline para gráficos; por isso a CSP permite `unsafe-inline` apenas para estilos. O escopo de leitura é o parque visível ao token: não há segregação de hosts por usuário do painel. Leitores autenticados veem inventário, endereços e processos desse parque. Use uma conta de integração dedicada, com grupos restritos.

Antes de habilitar dados pessoais, avalie finalidade, acesso, retenção e autorização. A opção desligada no painel não apaga dados já mantidos pelo Zabbix.

A nota de saúde e a presença do agente são indicadores operacionais, não SLA de negócio. Alertas de máquinas offline ficam fora de certos agregados; a política de incidentes de servidores precisa considerar isso.

## Verificação de arquivos sensíveis

Execute `python scripts/verificar_publicacao.py`, testes e auditoria de dependências. O verificador procura algumas classes de vazamento na árvore publicável e ignora as pastas locais documentadas. Ele não reconhece todos os nomes de empresa, senhas ou informações de negócio. Revise também o diff preparado para commit.

Não guarde exportações reais, capturas, logs ou backups nesta árvore pública. Se um segredo for publicado, revogue-o: apagar o arquivo do último commit não apaga o histórico.
