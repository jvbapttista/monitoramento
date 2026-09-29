"""Laboratório determinístico: 120 hosts inventados, sem capturas reais.

Emula somente as consultas usadas pela aplicação. Não é um servidor Zabbix.
As respostas passam pelos mesmos agregadores e regras do modo integrado.
"""
import json
import math
import time


def _ids(valor):
    if valor is None:
        return None
    return {str(v) for v in (valor if isinstance(valor, list) else [valor])}


def _dados():
    agora = int(time.time())
    hosts, itens, problemas, gatilhos = [], [], [], []
    for n in range(1, 121):
        hid = str(n)
        projeto = ["PROJETO-A", "PROJETO-B", "PROJETO-C"][(n - 1) % 3]
        servidor = n % 20 == 0
        nome = f"{projeto}-{'CLOUD-' if n % 40 == 0 else 'SRV-' if servidor else ''}{n:03}"
        h = dict(hostid=hid, host=nome, name=nome, status="0",
                 description="Equipamento fictício para demonstração",
                 interfaces=[dict(ip=f"192.0.2.{n + 10}", dns="", port="10050", type="1")],
                 hostgroups=[dict(groupid="1", name="Laboratório")],
                 parentTemplates=[dict(templateid="1", name="Windows by Zabbix agent active")])
        hosts.append(h)
        offline = n % 9 == 0
        sem_dados = offline or n % 19 == 0
        clock = agora - (72000 if sem_dados else 20)
        cpu = round(20 + n % 65 + 8 * math.sin(agora / 120 + n), 1)
        ram = 35 + n % 63
        valores = [
            ("system.cpu.util", cpu, 7, 0),
            ("vm.memory.util", ram, 15, 0),
            ("vm.memory.size[total]", (8, 16, 32)[n % 3] * 1024**3, 7, 3),
            ("vfs.fs.dependent.size[C:,pused]", 96 if n % 11 == 0 else 25 + n % 75, 18, 0),
            ("vfs.fs.dependent.size[C:,total]", 256 * 1024**3, 18, 3),
            ("zabbix[host,active_agent,available]", 0 if offline else 1, 5, 3),
            ("agent.version", "7.4", 7, 1),
            ("system.uptime", 86400 + n * 60, 7, 3),
            ("system.sw.os", "Windows Server" if servidor else "Windows 11", 7, 1),
            ('wmi.get[root/cimv2,"Select PCSystemType from Win32_ComputerSystem"]', 4 if servidor else 1, 7, 3),
            ("system.cpu.num", 8, 7, 3),
            ("system.hostname", nome, 7, 1),
            ("agent.ping", 1, 7, 3),
            ("monitoramento.software.get", json.dumps([dict(n="Editor de texto", v="1.0", d="2026-01-01")]), 2, 4),
            ("proc.get[,,,summary]", json.dumps(dict(t=1, p=[dict(n="editor.exe", q=2, m=102400, c=50)])), 7, 4),
        ]
        for k, (chave, valor, tipo, valor_tipo) in enumerate(valores):
            itens.append(dict(itemid=str(n * 100 + k), hostid=hid, key_=chave,
                              name=chave, lastvalue=str(valor),
                              lastclock=str(agora if tipo in (5, 15) else clock),
                              type=str(tipo), value_type=str(valor_tipo), state="0", hosts=[h]))
        if n % 11 == 0 or offline:
            tid = str(n + 1000)
            descricao = "Zabbix agent is not available" if offline else "Pouco espaço livre no volume C:"
            tags = [dict(tag="scope", value="availability" if offline else "capacity"),
                    dict(tag="component", value="agent" if offline else "storage")]
            gatilhos.append(dict(triggerid=tid, description=descricao, priority="4",
                                 lastchange=str(agora - 600), hosts=[h], tags=tags))
            problemas.append(dict(eventid=str(n + 2000), objectid=tid, clock=str(agora - 600),
                                   name=descricao, severity="4", acknowledged="0", suppressed="0",
                                   opdata="Cenário fictício", tags=tags))
    return hosts, itens, problemas, gatilhos


def chamar(metodo, params):
    hosts, itens, problemas, gatilhos = _dados()
    hids = _ids(params.get("hostids"))
    if metodo == "host.get":
        return [h for h in hosts if hids is None or h["hostid"] in hids]
    if metodo == "problem.get":
        return problemas
    if metodo == "trigger.get":
        tids = _ids(params.get("triggerids"))
        busca = params.get("search", {}).get("description")
        return [g for g in gatilhos
                if (tids is None or g["triggerid"] in tids)
                and (hids is None or g["hosts"][0]["hostid"] in hids)
                and (not busca or busca in g["description"])]
    if metodo == "event.get":
        # Nenhum histórico real é incluído; o cenário demonstra ausência de eventos.
        return []
    if metodo == "item.get":
        chaves = params.get("filter", {}).get("key_")
        chaves = chaves if isinstance(chaves, list) else [chaves] if chaves else None
        buscas = params.get("search", {}).get("key_")
        buscas = buscas if isinstance(buscas, list) else [buscas] if buscas else None
        return [i for i in itens
                if (hids is None or i["hostid"] in hids)
                and (chaves is None or i["key_"] in chaves)
                and (buscas is None or any(b in i["key_"] for b in buscas))]
    if metodo == "history.get":
        ids = _ids(params.get("itemids")) or set()
        agora = int(time.time())
        desde = int(params.get("time_from", agora - 3600))
        ate = min(agora, int(params.get("time_till", agora)))
        resultado = []
        for i in itens:
            if i["itemid"] not in ids:
                continue
            if i["key_"] == "agent.ping":
                # Distribuição didática de presença: não representa SLA.
                n = int(i["hostid"])
                total = int(max(0, ate - desde) / 60 * (0.4 + (n % 7) / 10))
                resultado.extend({"itemid": i["itemid"]} for _ in range(total))
            elif i["key_"] in {"system.cpu.util", "vm.memory.util"}:
                for clock in range(desde, ate, 120):
                    resultado.append(dict(itemid=i["itemid"], clock=str(clock),
                                          value=str(round(float(i["lastvalue"]) + math.sin(clock / 120), 2))))
        return resultado[:int(params.get("limit", 300000))]
    raise ValueError("Consulta não implementada no laboratório")
