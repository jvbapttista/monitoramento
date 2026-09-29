# -*- coding: utf-8 -*-
"""Rede: trafego por interface e estabilidade do parque.

O QUE ESTE ARQUIVO NAO FAZ, E POR QUE ISSO IMPORTA

Nao mostra perda de pacote. Medido em 26/08/2026, no parque inteiro: os
contadores `net.if.in[...,errors]` e `[...,dropped]` estao **todos em zero** -
134 itens fisicos ativos, nenhum com valor acima de zero.

Nao e defeito de coleta. Esse contador e o da PLACA DE REDE, e perda de pacote
quase nunca acontece na placa: acontece no caminho (cabo, switch, Wi-Fi, link
do provedor). Um grafico de "perda de pacote" alimentado por ele seria uma
linha reta em zero para sempre - pior do que nao ter grafico, porque ensinaria
que esta tudo bem.

A metrica que mediria isso de verdade e ICMP (`icmppingloss`), e ela NAO existe
neste parque: o servidor nao alcanca as maquinas para pingar - a mesma sub-rede
que impede check passivo e execucao de comando remoto.

O QUE ELE FAZ, ENTAO

Mede a instabilidade pelo que o parque de fato registra: **quantas vezes o link
caiu e quantas vezes o agente sumiu**. Medido em 26/08/2026, nas 24 horas
anteriores: 194 quedas de link em Ethernet, 5 em Wi-Fi, e 570 episodios de
agente ou checks indisponiveis.

Isso e a oscilacao que se sente no dia a dia - e, ao contrario dos contadores
de erro, tem sinal de sobra: pico de 60 eventos numa hora, e nenhuma hora vazia
nas 24.
"""

import re
import time

from .zabbix import chamar


class Rede:
    """Classificacao de interface e serie de instabilidade.

    E classe e nao funcoes soltas porque ha estado real a guardar: a lista de
    gatilhos de rede muda devagar (so quando entra maquina nova) e nao precisa
    ser buscada a cada volta do laco. O objeto guarda essa lista e sabe quando
    ela envelheceu.
    """

    # Nomes de item chegam como "Interface Intel(R) Wireless-AC 9560(GUID):
    # Bits received". O que interessa e o miolo, antes do parenteses do GUID.
    _NOME = re.compile(r"^Interface (.+?)(\([^)]*\))?:")

    # A ordem importa: "TAP-Windows Adapter" contem "adapter", e varias placas
    # fisicas contem "wireless". Virtual e testado ANTES de Wi-Fi para o
    # adaptador de VPN nao ser confundido com placa sem fio.
    _VIRTUAL = ("tap-windows", "openvpn", "hyper-v", "vmware", "virtualbox",
                "loopback", "bluetooth", "teredo", "isatap", "wan miniport",
                "kernel debug", "npcap", "wintun")
    _WIFI = ("wireless", "wi-fi", "wifi", "802.11", "wlan")

    # Gatilhos que denunciam instabilidade de rede. Sao dois fenomenos
    # diferentes e por isso ficam separados no grafico:
    #   "Link down"     - a interface caiu. Culpa de cabo, porta de switch ou
    #                     sinal de Wi-Fi.
    #   "not available" - o agente parou de responder. Pode ser a maquina
    #                     desligada, mas em horario de expediente e quase
    #                     sempre a rede caindo debaixo dela.
    _BUSCAS = ("Link down", "not available")

    # Os gatilhos so mudam quando entra maquina nova no Zabbix. Rebuscar a cada
    # volta seria meio segundo de API jogado fora a cada dois minutos.
    VALIDADE_GATILHOS = 3600

    # ------------------------------------------------------------------
    # O CORTE QUE SEPARA OSCILACAO DE FIM DE EXPEDIENTE
    #
    # So conta a queda que VOLTOU sozinha em ate 15 minutos. Quem cai e nao
    # volta nao e instabilidade: e maquina desligada, ou defeito que ja virou
    # problema aberto no painel.
    #
    # Sem esse corte o grafico repetiria a mentira que este painel passou
    # semanas tirando do resto da tela. Medido em 26/08/2026, nas mesmas 24
    # horas:
    #
    #                          sem corte    com corte
    #     pico das 17h .......... 58 .......... 3     <- gente indo embora
    #     pico real ............. 17h ........ 12h-14h <- rede sofrendo mesmo
    #     total ................ 371 ........ 155
    #
    # Das 295 quedas que se resolveram, 114 duraram menos de 5 minutos e 93
    # passaram de uma hora. Sao dois fenomenos diferentes, e somar os dois
    # produzia um grafico que subia quando o escritorio esvaziava.
    LIMITE_PISCADA = 900

    def __init__(self):
        self._gatilhos = None
        self._gatilhos_em = 0.0
        self._familia_por_gatilho = {}

    # ------------------------------------------------------ classificacao

    @classmethod
    def rotulo(cls, nome_do_item, chave=""):
        """Nome legivel da interface, a partir do nome do item.

        A CHAVE nao serve: no Windows ela traz o GUID do adaptador
        (`net.if.in["{1D4921C5-...}"]`), que nao diz nada a ninguem. O nome do
        item traz o nome de fabrica da placa, que e o que a pessoa reconhece.
        """
        m = cls._NOME.match(nome_do_item or "")
        if m:
            return m.group(1).strip()
        # Linux nomeia sem parenteses ("Interface enp2s0: Bits received"); e o
        # caso do proprio servidor.
        if nome_do_item and nome_do_item.startswith("Interface "):
            return nome_do_item[10:].split(":")[0].strip()
        return (chave or "?")

    @classmethod
    def familia(cls, rotulo):
        """`wifi`, `ethernet` ou `virtual`.

        `virtual` existe para ser DESCARTADO da tela. Sao os adaptadores de
        VPN: eles ficam permanentemente "down" quando ninguem esta conectado, e
        e por isso que o painel vive mostrando "Interface OpenVPN: Link down"
        como se fosse problema. Nao e - e uma VPN desligada.
        """
        t = (rotulo or "").lower()
        if any(p in t for p in cls._VIRTUAL):
            return "virtual"
        if any(p in t for p in cls._WIFI):
            return "wifi"
        return "ethernet"

    # ------------------------------------------------------ instabilidade

    def _ids_de_gatilho(self, agora):
        """Gatilhos de queda de link e de agente sumido, com familia."""
        if self._gatilhos is not None and agora - self._gatilhos_em < self.VALIDADE_GATILHOS:
            return self._gatilhos

        ids, familias = [], {}
        for busca in self._BUSCAS:
            for g in chamar("trigger.get", {
                "output": ["triggerid", "description"],
                "search": {"description": busca},
            }):
                tid = g["triggerid"]
                ids.append(tid)
                if busca == "Link down":
                    familias[tid] = self.familia(self.rotulo(g.get("description")))
                else:
                    familias[tid] = "agente"

        self._gatilhos = ids
        self._familia_por_gatilho = familias
        self._gatilhos_em = agora
        return ids

    def instabilidade(self, horas=24, agora=None):
        """Quedas de rede por hora, nas ultimas `horas`.

        Devolve pontos de hora em hora - e nao de minuto em minuto - porque o
        que se quer enxergar aqui e padrao ("toda manha as 6h piora"), nao
        evento isolado. Com balde de hora, 24 pontos contam a historia do dia
        inteiro numa caixa pequena.
        """
        agora = agora or time.time()
        ids = self._ids_de_gatilho(agora)
        if not ids:
            return None

        desde = int(agora - horas * 3600)
        abriu = chamar("event.get", {
            "output": ["clock", "name", "objectid", "r_eventid"],
            "selectHosts": ["host", "hostid"],
            "objectids": ids,
            "source": 0, "object": 0,
            "value": 1,              # so a ABERTURA do problema, nao a volta
            "time_from": desde,
            "limit": 20000,
        })

        # Quando cada queda se resolveu. Sem isso nao da para separar piscada
        # de maquina desligada - ver LIMITE_PISCADA.
        ids_volta = [e["r_eventid"] for e in abriu
                     if e.get("r_eventid") not in (None, "", "0")]
        voltou_em = {}
        if ids_volta:
            for e in chamar("event.get", {"output": "extend",
                                          "eventids": ids_volta, "limit": 20000}):
                voltou_em[str(e.get("eventid"))] = int(e["clock"])

        # Baldes de uma hora, cheios de zero desde o inicio: hora sem evento
        # tem que aparecer como zero no grafico, nao como buraco.
        inicio = (int(agora) // 3600) * 3600 - (horas - 1) * 3600
        baldes = {inicio + i * 3600: {"link": 0, "agente": 0} for i in range(horas)}

        por_maquina = {}
        por_familia = {"ethernet": 0, "wifi": 0}
        descartadas = {"longas": 0, "abertas": 0, "virtual": 0}

        for e in abriu:
            fam = self._familia_por_gatilho.get(e.get("objectid"), "agente")
            # Adaptador de VPN nao conta: ele vive "down" porque a VPN esta
            # desligada, e inflaria o numero todo santo dia.
            if fam == "virtual":
                descartadas["virtual"] += 1
                continue

            volta = voltou_em.get(str(e.get("r_eventid")))
            if volta is None:
                # Ainda aberta. Nao e oscilacao - e problema em curso, e o
                # painel ja mostra isso em "Principais problemas agora".
                descartadas["abertas"] += 1
                continue
            if volta - int(e["clock"]) > self.LIMITE_PISCADA:
                descartadas["longas"] += 1
                continue

            b = (int(e["clock"]) // 3600) * 3600
            if b not in baldes:
                continue
            baldes[b]["agente" if fam == "agente" else "link"] += 1
            if fam in por_familia:
                por_familia[fam] += 1

            hosts = e.get("hosts") or []
            if hosts:
                # hostid junto do nome para a tela poder ABRIR a maquina no
                # clique, em vez de so exibir o nome dela.
                chave_h = (hosts[0].get("hostid"), hosts[0].get("host"))
                if chave_h[1]:
                    por_maquina[chave_h] = por_maquina.get(chave_h, 0) + 1

        pontos = [{"t": t, "link": v["link"], "agente": v["agente"]}
                  for t, v in sorted(baldes.items())]
        total = sum(p["link"] + p["agente"] for p in pontos)
        pior = max(pontos, key=lambda p: p["link"] + p["agente"]) if pontos else None

        return {
            "horas": horas,
            "limite_piscada_min": self.LIMITE_PISCADA // 60,
            "total": total,
            "quedas_link": sum(p["link"] for p in pontos),
            "sem_contato": sum(p["agente"] for p in pontos),
            "por_familia": por_familia,
            # O que ficou de fora, para o numero poder se explicar quando
            # alguem comparar com a contagem crua do Zabbix.
            "descartadas": descartadas,
            "pior_hora": ({"t": pior["t"], "n": pior["link"] + pior["agente"]}
                          if pior and (pior["link"] + pior["agente"]) else None),
            "pontos": pontos,
            "maquinas": [{"hostid": hid, "hostname": nome, "quedas": n}
                         for (hid, nome), n in sorted(por_maquina.items(),
                                                      key=lambda x: -x[1])[:8]],
        }


# Uma instancia por processo. O laco de coleta e unico (ver estado.py), entao
# nao ha concorrencia a proteger aqui.
rede = Rede()
