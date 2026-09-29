# Como ler o painel

A demonstração apresenta 120 máquinas inventadas e um aviso identificando esse modo. Os números mudam para exercitar a interface; não representam uma operação real.

## Do resumo à máquina

Comece pelos indicadores de CPU, memória, disco e problemas. Abra a lista por trás do indicador antes de concluir que todo o parque está em dificuldade. O objetivo é chegar à máquina que precisa de atenção.

O inventário permite filtrar projetos e ambientes. Prefixo desconhecido fica no grupo não identificado. A classificação de nuvem usa prefixos configurados. O mapa representa agrupamentos lógicos; não descobre switches ou conexões físicas.

## Ausência de dados e offline

Um traço significa que falta uma medida utilizável, não zero. O último contato considera itens de agente: um item calculado no servidor pode continuar recebendo horário novo mesmo com a estação parada.

O detalhe de uma máquina offline pode mostrar a última medição e seu horário. Esse valor é histórico. Os limites de contato e validade estão na configuração; leia a arquitetura antes de ajustá-los.

## Recursos e problemas

A memória é agrupada pela capacidade instalada. O disco resume o volume com menos espaço livre de cada máquina; abra o detalhe para ver todos os volumes. Não some percentuais de discos diferentes.

Interfaces, processos e versão do agente dependem dos itens disponíveis no Zabbix. Ausência de coleta não significa ausência de problema.

Os agregados separam ruído e alertas de máquinas offline. Um alerta fora do resumo pode continuar no detalhe. Esse recorte ajuda a acompanhar estações desligadas, mas não substitui a política de incidentes de servidores. A nota de saúde serve para priorizar investigação, não comprovar SLA.

## Relatórios

O relatório mede presença do agente no histórico disponível. Retenção e periodicidade dos itens afetam o resultado. Zero significa que não foram encontradas amostras no período, sem distinguir desligamento de histórico ausente. Hosts sem o item de presença não entram na lista. O descarte de janelas incompletas é uma regra das séries de recursos, não desse relatório.

O CSV exporta o inventário disponível no navegador, com ponto e vírgula e UTF-8. Células que poderiam executar fórmulas recebem proteção. Ao conectar uma instalação real, a exportação passa a conter dados dela: não a inclua no repositório.

## Contas e coleta opcional

Administradores criam contas e redefinem senhas. Contas criadas pela interface recebem senha temporária e exigem troca no primeiro acesso. A última conta administradora é preservada. Leitores não administram contas.

Acessos e abas vêm desabilitados. Habilitá-los exige configuração explícita e papel de administrador. Software instalado também depende de itens opcionais. Os scripts de coleta não estão incluídos.

Ao sair, confirme a ação: todas as sessões daquela conta serão encerradas.
