"""Regressões de autenticação, privacidade e interpretação das métricas."""
import copy
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
TEST_ROOT = Path(__file__).resolve().parents[1] / "data"
TEST_ROOT.mkdir(exist_ok=True)
TEMP = tempfile.TemporaryDirectory(dir=TEST_ROOT)
os.environ.update(SECRET_KEY=secrets.token_hex(32), COOKIE_SEGURO="0",
                  MODO_DEMO="1", INICIAR_COLETA="0", CONFIAR_PROXY="0",
                  ARQUIVO_CONTAS=str(Path(TEMP.name) / "usuarios.json"))
os.environ.pop("SECRET_KEY_FILE", None)
from app import app  # noqa: E402
from monitoramento import coleta, config, contas, detalhe, estado, painel, sessao, zabbix  # noqa: E402
from monitoramento import aplicativos, abas, series, saude  # noqa: E402


class Seguranca(unittest.TestCase):
    def setUp(self):
        contas.CAMINHO = str(Path(TEMP.name) / (secrets.token_hex(8) + ".json"))
        contas.criar("admin.teste", "frase longa de teste", master=True)
        contas.criar("leitor.teste", "frase longa de teste")
        self.client = app.test_client()
        sessao._falhas.clear()

    def login(self, usuario="admin.teste"):
        r = self.client.get("/login")
        token = re.search(r'name="csrf_token" value="([^"]+)"', r.text).group(1)
        return self.client.post("/login", data={"usuario": usuario,
                                "senha": "frase longa de teste", "csrf_token": token})

    def test_coleta_opcional_ignora_campos_com_tipo_invalido(self):
        self.assertEqual(aplicativos.parse_item('[{"n": 123}]'), [])
        self.assertEqual(abas.parse_item('[{"p": "browser.exe", "t": []}]'), {})

    def test_sem_login_nao_recebe_dados(self):
        for rota in ("/api/painel", "/api/usuarios", "/api/host/1", "/api/saude", "/api/fluxo"):
            self.assertEqual(self.client.get(rota).status_code, 401, rota)

    def test_login_exige_csrf(self):
        self.assertEqual(self.client.post("/login", data={"usuario": "admin.teste"}).status_code, 400)

    def test_login_e_politicas_do_cookie(self):
        r = self.login()
        self.assertEqual(r.status_code, 302)
        self.assertIn("HttpOnly", r.headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", r.headers["Set-Cookie"])
        with self.client.get("/") as pagina:
            self.assertEqual(pagina.status_code, 200)
            self.assertIn("script-src 'self'", pagina.headers["Content-Security-Policy"])

    def test_cookie_secure_em_https(self):
        with patch.dict(app.config, SESSION_COOKIE_SECURE=True):
            self.assertIn("Secure", self.login().headers["Set-Cookie"])

    def test_host_invalido(self):
        self.assertEqual(self.client.get("/health/live", headers={"Host": "untrusted.invalid"}).status_code, 400)

    def test_health_publico_minimo(self):
        self.assertEqual(self.client.get("/health/live").json, {"status": "ok"})
        self.assertEqual(set(self.client.get("/health/ready").json), {"status"})

    def test_leitor_nao_administra_contas(self):
        self.login("leitor.teste")
        self.assertEqual(self.client.get("/api/usuarios").status_code, 403)
        self.assertEqual(self.client.post("/api/usuarios", json={"usuario": "novo"},
                                         headers={"X-Monitoramento": "1"}).status_code, 403)

    def test_acao_exige_cabecalho(self):
        self.login()
        self.assertEqual(self.client.post("/api/atualizar").status_code, 400)
        self.assertEqual(self.client.post("/api/atualizar", headers={"X-Monitoramento": "1"}).status_code, 200)

    def test_json_invalido_nao_vira_erro_interno(self):
        self.login()
        for corpo in ([], {"usuario": 42}, {"usuario": "novo", "master": "false"}):
            self.assertEqual(self.client.post("/api/usuarios", json=corpo,
                                             headers={"X-Monitoramento": "1"}).status_code, 400)

    def test_conta_removida_perde_sessao(self):
        self.login("leitor.teste")
        contas.remover("leitor.teste")
        self.assertEqual(self.client.get("/api/eu").status_code, 401)

    def test_senha_redefinida_revoga_sessao(self):
        self.login("leitor.teste")
        contas.redefinir("leitor.teste")
        self.assertEqual(self.client.get("/api/eu").status_code, 401)

    def test_troca_pendente_bloqueia_painel(self):
        contas.trocar_senha("leitor.teste", "frase longa de teste", trocar=True)
        self.login("leitor.teste")
        self.assertEqual(self.client.get("/api/painel").status_code, 403)
        self.assertEqual(self.client.get("/trocar-senha").status_code, 200)

    def test_logout_get_nao_altera_sessao(self):
        self.login()
        self.assertEqual(self.client.get("/sair").status_code, 200)
        self.assertEqual(self.client.get("/api/eu").status_code, 200)

    def test_logout_post_revoga_cookie_antigo(self):
        self.login()
        antigo = self.client.get_cookie("session").value
        token = re.search(r'name="csrf_token" value="([^"]+)"', self.client.get("/sair").text).group(1)
        self.client.post("/sair", data={"csrf_token": token})
        self.client.set_cookie("session", antigo)
        self.assertEqual(self.client.get("/api/eu").status_code, 401)

    def test_ip_forjado_nao_muda_limite(self):
        with app.test_request_context("/login", headers={"X-Real-IP": "192.0.2.1"},
                                      environ_base={"REMOTE_ADDR": "127.0.0.1"}):
            self.assertEqual(sessao.origem(), "127.0.0.1")
            for _ in range(10):
                sessao.registrar_falha()
            self.assertTrue(sessao.bloqueado())

    def test_ultimo_master_preservado(self):
        with self.assertRaises(ValueError):
            contas.remover("admin.teste")
        with self.assertRaises(ValueError):
            contas.definir_master("admin.teste", False)

    def test_hash_nao_sai_na_api(self):
        self.login()
        self.assertNotIn('"hash"', self.client.get("/api/usuarios").text)
        self.assertNotIn("frase longa de teste", Path(contas.CAMINHO).read_text(encoding="utf-8"))

    def test_abas_nao_vazam_para_leitor(self):
        self.login("leitor.teste")
        with patch.object(detalhe, "obter", return_value={"recursos": {"abas": {"p": "restrito"}, "abas_em": 1}}):
            dados = self.client.get("/api/host/1").json
            self.assertNotIn("abas", dados["recursos"])

    def test_dados_pessoais_desabilitados(self):
        self.login()
        self.assertEqual(self.client.get("/api/acessos").status_code, 403)

    def test_sse_encerra_apos_revogacao(self):
        self.login("leitor.teste")
        with patch.object(estado, "assinar", return_value=(1, {"maquinas": []})):
            r = self.client.get("/api/fluxo", buffered=False)
            self.assertIn(b"event: painel", next(r.response))
            contas.redefinir("leitor.teste")
            with self.assertRaises(StopIteration):
                next(r.response)
            r.close()


class Metricas(unittest.TestCase):
    def test_demo_passa_por_coleta_e_painel(self):
        with patch("requests.Session.post", side_effect=AssertionError("Rede proibida na demo")):
            estado._uma_volta(True, True)
        dados = estado.instantaneo()
        self.assertEqual(dados["resumo"]["total"], 120)
        self.assertEqual(dados["resumo"]["online"] + dados["resumo"]["offline"], 120)

    def test_item_calculado_nao_ressuscita_host(self):
        m = coleta.coletar_parque()["maquinas"]["9"]
        self.assertFalse(m["online"])
        self.assertTrue(m["sem_dados"])
        self.assertIsNone(m["memoria"])
        self.assertIsNone(m["cpu"])

    def test_detalhe_online_tem_recursos(self):
        dados = detalhe.obter("1")
        self.assertIsNotNone(dados["recursos"]["cpu"])
        self.assertTrue(dados["volumes"])

    def test_detalhe_offline_preserva_ultima_medicao(self):
        dados = detalhe.obter("9")
        self.assertIsNone(dados["recursos"]["cpu"])
        self.assertIsNotNone(dados["ultima_medicao"]["cpu"])

    def test_tipo_passivo_inteiro_zero_conta_contato(self):
        agora = int(time.time())
        def api(metodo, params):
            if metodo == "host.get":
                return [{"hostid": "1", "host": "PROJETO-A-001"}]
            return [{"hostid": "1", "itemid": "1", "key_": "system.cpu.util", "lastvalue": "0",
                     "lastclock": str(agora), "type": 0}]
        with patch.object(coleta, "chamar", side_effect=api):
            m = coleta.coletar_parque()["maquinas"]["1"]
        self.assertTrue(m["online"])
        self.assertEqual(m["cpu"], 0)

    def test_faixas_disco_somam_base_medida(self):
        estado._uma_volta(True, False)
        c = estado.instantaneo()["capacidade"]
        self.assertEqual(sum(f["quantas"] for f in c["disco"]), c["medindo_disco"])

    def test_problemas_offline_continuam_no_host(self):
        estado._uma_volta(True, False)
        d = estado.instantaneo()
        m = next(m for m in d["maquinas"] if m["hostid"] == "9")
        self.assertEqual(m["problemas"], 0)
        self.assertTrue(m["lista_problemas"])
        self.assertFalse(any(p["hostid"] == "9" for p in d["problemas"]))

    def test_sem_parque_nao_tem_nota_zero(self):
        self.assertIsNone(saude.calcular({}, 0)["nota"])

    def test_series_nao_aceitam_janela_aberta(self):
        self.assertEqual(series._por_item({120: {"1": [90]}}, 120, 180), [])

    def test_metodos_de_escrita_recusados(self):
        with self.assertRaises(ValueError):
            zabbix.chamar("host.create", {})

    def test_http_recusado_no_modo_integrado(self):
        with patch.object(config, "MODO_DEMO", False), patch.object(config, "ZABBIX_URL", "http://example.invalid"), patch.object(config, "ZABBIX_TOKEN", "ficticio"):
            with self.assertRaises(zabbix.ZabbixIndisponivel):
                zabbix.chamar("host.get", {})

    def test_falha_externa_nao_expoe_detalhes(self):
        import requests
        with patch.object(config, "MODO_DEMO", False), patch.object(config, "ZABBIX_URL", "https://example.invalid"), patch.object(config, "ZABBIX_TOKEN", "ficticio"), patch("requests.Session.post", side_effect=requests.RequestException("DETALHE-RESTRITO")):
            with self.assertRaises(zabbix.ZabbixIndisponivel) as erro:
                zabbix.chamar("host.get", {})
            self.assertNotIn("DETALHE-RESTRITO", str(erro.exception))


if __name__ == "__main__":
    unittest.main()
