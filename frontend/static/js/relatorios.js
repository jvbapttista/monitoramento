window.MON = window.MON || {};

MON.relatorios = (function () {
  "use strict";

  var dados = null;
  var carregando = false;
  var erro = null;
  var dias = 7;

  function esc(t) { return MON.fmt.esc(t == null ? "" : String(t)); }

  function buscar(forcar) {
    if (carregando) return;
    if (dados && dados.dias === dias && !forcar) return;
    carregando = true; erro = null;
    pintar();
    fetch("/api/relatorio/disponibilidade?dias=" + dias, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("Não consegui carregar (" + r.status + ").");
        return r.json();
      })
      .then(function (d) {
        if (d.erro) throw new Error(d.erro);
        dados = d;
      })
      .catch(function (e) { erro = e.message || String(e); })
      .then(function () { carregando = false; pintar(); });
  }

  function csv(linhas) {
    return linhas.map(function (l) {
      return l.map(function (c) {
        return MON.fmt.csvCelula(c);
      }).join(";");
    }).join("\r\n");
  }

  function num1(v) {
    return v == null ? "" : (Math.round(v * 10) / 10).toString().replace(".", ",");
  }

  function baixarInventario() {
    var d = MON.estado.dados;
    if (!d) return;
    var linhas = [[
      "Máquina", "Projeto", "Ambiente", "Bloco", "Sistema", "IP",
      "Estado", "CPU %", "Memória %", "Disco livre %", "Memória total GB",
      "Agente", "Problemas", "Último dado"
    ]];
    d.maquinas.forEach(function (m) {
      linhas.push([
        m.hostname, m.projeto, m.ambiente, m.bloco || "",
        m.sistema || "", m.ip || "",
        m.online ? (m.sem_dados ? "sem medição" : "online") : "offline",
        num1(m.cpu), num1(m.memoria), num1(m.disco_livre),
        m.memoria_total == null ? "" : String(Math.round(m.memoria_total / 1073741824)),
        m.versao_agente || "", m.problemas || 0,
        m.visto_em ? new Date(m.visto_em * 1000).toLocaleString("pt-BR") : "nunca"
      ]);
    });
    
    var blob = new Blob([String.fromCharCode(0xFEFF) + csv(linhas)],
                        { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var hoje = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "inventario-Monitoramento-" + hoje + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function tomPct(p) {
    if (p >= 90) return "ok";
    if (p >= 60) return "alerta";
    return "critico";
  }

  function barra(p) {
    return '<span class="rl-barra"><i data-tom="' + tomPct(p)
      + '" style="width:' + Math.max(2, Math.min(100, p)) + '%"></i></span>';
  }

  function tabelaProjetos(d) {
    if (!d.projetos.length) return "";
    return '<div class="painel"><div class="painel-corpo sem-espaco">'
      + '<table class="tabela"><thead><tr><th>Projeto</th>'
      + '<th class="num">Máquinas</th><th>Presença do agente</th>'
      + '<th class="num">%</th></tr></thead><tbody>'
      + d.projetos.map(function (p) {
          return "<tr><td><b>" + esc(p.projeto) + "</b></td>"
            + '<td class="num">' + p.maquinas + "</td>"
            + "<td>" + barra(p.pct) + "</td>"
            + '<td class="num" data-tom="' + tomPct(p.pct) + '">'
            +   MON.fmt.n(p.pct, 1, "%") + "</td></tr>";
        }).join("")
      + "</tbody></table></div></div>";
  }

  function tabelaMaquinas(d) {
    var piores = d.maquinas.slice(0, 25);
    return '<div class="painel"><div class="painel-corpo sem-espaco">'
      + '<table class="tabela"><thead><tr><th>Máquina</th><th>Projeto</th>'
      + '<th>Presença do agente</th><th class="num">%</th></tr></thead><tbody>'
      + piores.map(function (m) {
          return '<tr class="clicavel" data-host="' + esc(m.hostid) + '">'
            + "<td><b>" + esc(m.hostname) + "</b></td>"
            + "<td>" + esc(m.projeto) + "</td>"
            + "<td>" + barra(m.pct) + "</td>"
            + '<td class="num" data-tom="' + tomPct(m.pct) + '">'
            +   MON.fmt.n(m.pct, 1, "%") + "</td></tr>";
        }).join("")
      + "</tbody></table></div></div>";
  }

  function pintar() {
    var alvo = document.getElementById("vista");
    if (!alvo || !MON.vistas || MON.vistas.atual !== "RELATORIOS") return;

    var cab = '<a class="botao vista-voltar" href="#" data-vista="null">&larr; Painel</a>'
      + '<div class="vista-cab"><div><h1 class="vista-tit">Relatórios</h1>'
      + '<p class="vista-sub">O que aconteceu no período — o painel mostra o agora</p></div></div>';

    var caixaCsv = '<section class="camada"><div class="camada-cab">'
      + '<h2 class="camada-tit">Inventário completo</h2>'
      + '<span class="camada-nota">todas as máquinas, com hardware, sistema e último contato</span>'
      + "</div><div class=\"painel\"><div class=\"painel-corpo\">"
      + '<p class="rl-texto">Uma linha por máquina, com projeto, ambiente, sistema, '
      + "memória instalada, disco livre, versão do agente e último contato. "
      + "Abre direto no Excel.</p>"
      + '<button type="button" class="botao" id="rl-csv">Baixar CSV</button>'
      + "</div></div></section>";

    var miolo;
    if (erro) {
      miolo = '<div class="estado-erro"><b>Não foi possível montar o relatório</b>'
        + "<code>" + esc(erro) + "</code></div>";
    } else if (carregando || !dados) {
      miolo = '<div class="esqueleto" style="height:280px"></div>';
    } else {
      miolo = '<p class="rl-texto">Presença do agente no período: quanto do tempo '
        + "cada máquina esteve falando com o Zabbix. "
        + '<b>Estação desligada à noite derruba o número sem que nada esteja errado</b> '
        + "— por isso vale comparar entre projetos, e não com 100%.</p>"
        + tabelaProjetos(dados)
        + '<h3 class="rl-sub">As 25 com menor presença</h3>'
        + tabelaMaquinas(dados);
    }

    alvo.innerHTML = cab
      + '<div class="ac-barra">'
      +   '<select class="select" id="rl-dias">'
      +     [1, 7, 30].map(function (n) {
              return '<option value="' + n + '"' + (n === dias ? " selected" : "") + ">"
                   + (n === 1 ? "Últimas 24 horas" : "Últimos " + n + " dias") + "</option>";
            }).join("")
      +   "</select>"
      +   '<button type="button" class="botao" id="rl-atualizar"'
      +     (carregando ? " disabled" : "") + ">"
      +     (carregando ? "Calculando…" : "Atualizar") + "</button>"
      + "</div>"
      + '<section class="camada"><div class="camada-cab">'
      +   '<h2 class="camada-tit">Disponibilidade</h2>'
      +   '<span class="camada-nota">'
      +     (dados && !carregando
              ? dados.maquinas.length + " máquinas · " + dados.dias
                + (dados.dias === 1 ? " dia" : " dias")
              : "consultando o histórico…")
      +   "</span></div>" + miolo + "</section>"
      + caixaCsv;
  }

  function abrir() { buscar(false); pintar(); }

  function ligar() {
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t.id === "rl-csv") { ev.preventDefault(); baixarInventario(); return; }
      if (t.id === "rl-atualizar") { ev.preventDefault(); buscar(true); }
    });
    document.addEventListener("change", function (ev) {
      if (ev.target.id !== "rl-dias") return;
      dias = parseInt(ev.target.value, 10) || 7;
      buscar(true);
    });
  }

  return { abrir: abrir, pintar: pintar, ligar: ligar };
}());
