window.MON = window.MON || {};

MON.fmt = (function () {
  "use strict";

  var SEV_NOME = {
    5: "Desastre", 4: "Alta", 3: "Média",
    2: "Atenção", 1: "Informação", 0: "Não classificada"
  };
  // Marcador de forma junto da cor: a severidade continua legivel para quem
  // nao distingue as cores e em monitor mal calibrado.
  var SEV_GLIFO = { 5: "◆", 4: "▲", 3: "●", 2: "■", 1: "▪", 0: "·" };
  var SEV_COR = {
    
    5: "var(--critico)", 4: "var(--alto)", 3: "var(--medio)",
    2: "var(--baixo)", 1: "var(--marca)", 0: "var(--neutro)"
  };

  var ESCOPO_NOME = {
    availability: "Disponibilidade",
    capacity: "Capacidade",
    performance: "Desempenho",
    security: "Segurança",
    notice: "Aviso",
    outros: "Outros"
  };

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function csvCelula(c) {
    var s = c == null ? "" : String(c);
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function n(v, casas, sufixo) {
    if (v == null || (typeof v === "number" && !isFinite(v))) return "—";
    var f = casas == null ? 0 : casas;
    return Number(v).toFixed(f).replace(".", ",") + (sufixo || "");
  }

  function pct(v, casas) { return n(v, casas == null ? 1 : casas, "%"); }

  function inteiro(v) {
    if (v == null) return "—";
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function bytes(b) {
    if (b == null) return "—";
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0, v = Number(b);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return n(v, v < 10 ? 1 : 0) + " " + u[i];
  }

  function bps(v) {
    if (v == null) return "—";
    var u = ["bps", "Kbps", "Mbps", "Gbps"], i = 0, x = Number(v) * 8;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return n(x, x < 10 ? 1 : 0) + " " + u[i];
  }

  function duracao(s) {
    if (s == null) return "—";
    s = Math.max(0, Math.floor(s));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "min";
    if (s < 86400) {
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return m ? h + "h" + m + "min" : h + "h";
    }
    var d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600);
    return hr ? d + "d" + hr + "h" : d + "d";
  }

  function desde(ts) {
    if (!ts) return "nunca";
    return duracao(Math.floor(Date.now() / 1000) - ts);
  }

  function hora(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    return String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }

  function horaSeg(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    return hora(ts) + ":" + String(d.getSeconds()).padStart(2, "0");
  }

  function dataHora(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + " " + hora(ts);
  }

  function corUso(v, limite) {
    if (v == null) return "var(--txt-3)";
    var lim = limite == null ? 90 : limite;
    if (v >= lim) return "var(--critico)";
    if (v >= lim - 15) return "var(--alto)";
    return "var(--ok)";
  }

  function corLivre(v, critico, atencao) {
    if (v == null) return "var(--txt-3)";
    if (v < (critico == null ? 10 : critico)) return "var(--critico)";
    if (v < (atencao == null ? 20 : atencao)) return "var(--alto)";
    return "var(--ok)";
  }

  function corSaude(nota) {
    if (nota == null) return "var(--txt-3)";
    if (nota >= 90) return "var(--ok)";
    if (nota >= 75) return "var(--medio)";
    if (nota >= 50) return "var(--alto)";
    return "var(--critico)";
  }

  var FAIXA_NOME = {
    "tudo certo": "Tudo certo",
    "pequenos ajustes": "Pequenos ajustes",
    "precisa de atenção": "Precisa de atenção",
    "situação grave": "Situação grave",
    sem_dados: "Sem dados",
    saudavel: "Tudo certo", atencao: "Pequenos ajustes",
    degradado: "Precisa de atenção", critico: "Situação grave"
  };

  var FAIXA_FRASE = {
    "tudo certo": "nada exige ação agora",
    "pequenos ajustes": "nada urgente, mas há o que resolver",
    "precisa de atenção": "há coisas esperando alguém",
    "situação grave": "boa parte do parque precisa de ação",
    sem_dados: "ainda coletando"
  };

  function seloSeveridade(nivel) {
    var s = Number(nivel);
    if (!(s in SEV_NOME)) s = 0;
    return '<span class="selo sev-' + s + '"><span class="glifo">' +
           SEV_GLIFO[s] + '</span>' + SEV_NOME[s] + "</span>";
  }

  function nomeSeveridade(nivel) { return SEV_NOME[Number(nivel)] || "—"; }
  function corSeveridade(nivel) { return SEV_COR[Number(nivel)] || SEV_COR[0]; }
  function nomeEscopo(e) { return ESCOPO_NOME[e] || e || "—"; }

  return {
    esc: esc, csvCelula: csvCelula, n: n, pct: pct, inteiro: inteiro, bytes: bytes, bps: bps,
    duracao: duracao, desde: desde, hora: hora, horaSeg: horaSeg, dataHora: dataHora,
    corUso: corUso, corLivre: corLivre, corSaude: corSaude,
    seloSeveridade: seloSeveridade, nomeSeveridade: nomeSeveridade,
    corSeveridade: corSeveridade, nomeEscopo: nomeEscopo,
    SEV_NOME: SEV_NOME, SEV_COR: SEV_COR, FAIXA_NOME: FAIXA_NOME,
    FAIXA_FRASE: FAIXA_FRASE
  };
})();
