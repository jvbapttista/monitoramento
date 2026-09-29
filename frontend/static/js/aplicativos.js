window.MON = window.MON || {};

MON.aplicativos = (function () {
  "use strict";

  var dados = null;
  var carregando = false;
  var erro = null;

  var filtro = "";       // busca por texto, local - não pede de novo ao servidor
  var projeto = "";       // "" = todos - pede de novo, o servidor já filtra
  var ambiente = "";       // "" | "nuvem" | "local" - idem

  var abertos = {};

  function esc(t) { return MON.fmt.esc(t == null ? "" : String(t)); }

  function buscar(forcar) {
    if (carregando) return;
    if (dados && !forcar) return;
    carregando = true; erro = null;
    pintar();

    var q = [];
    if (projeto) q.push("projeto=" + encodeURIComponent(projeto));
    if (ambiente) q.push("ambiente=" + encodeURIComponent(ambiente));

    fetch("/api/aplicativos" + (q.length ? "?" + q.join("&") : ""),
          { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("Não consegui carregar (" + r.status + ").");
        return r.json();
      })
      .then(function (d) {
        if (d.erro) throw new Error(d.erro);
        dados = d;
        abertos = {};
      })
      .catch(function (e) { erro = e.message || String(e); })
      .then(function () { carregando = false; pintar(); });
  }

  function dataBr(iso) {
    if (!iso) return null;
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }

  function seletorProjeto(d) {
    var opcoes = (d && d.filtros) || [];
    if (!opcoes.length) return "";
    var total = opcoes.reduce(function (n, o) { return n + o.quantas; }, 0);
    return '<select class="select" id="ap-projeto">'
      +   '<option value=""' + (projeto ? "" : " selected") + ">"
      +     "Todos os projetos (" + total + ")</option>"
      +   opcoes.map(function (o) {
            return '<option value="' + esc(o.valor) + '"'
                 + (projeto === o.valor ? " selected" : "") + ">"
                 + esc(o.nome) + " (" + o.quantas + ")</option>";
          }).join("")
      + "</select>";
  }

  function seletorAmbiente() {
    var op = [["", "Nuvem e local"], ["nuvem", "Só nuvem"], ["local", "Só local"]];
    return '<select class="select" id="ap-ambiente">'
      + op.map(function (o) {
          return '<option value="' + o[0] + '"' + (ambiente === o[0] ? " selected" : "")
               + ">" + o[1] + "</option>";
        }).join("")
      + "</select>";
  }

  function linhaMaquina(m) {
    return "<li>"
      + "<b>" + esc(m.hostname) + "</b>"
      + (m.versao ? '<span class="ap-maq-v">' + esc(m.versao) + "</span>" : "")
      + '<span class="ap-maq-d">'
      +   (m.instalado_em ? "instalado em " + esc(dataBr(m.instalado_em))
                            : "data de instalação não informada")
      + "</span>"
      + "</li>";
  }

  function linhaApp(app, totalMedindo) {
    var aberto = !!abertos[app.nome];
    var pct = totalMedindo ? Math.min(100, 100 * app.quantas / totalMedindo) : 0;
    return '<tr class="ap-linha' + (aberto ? " aberta" : "") + '"'
      + ' data-ap-grupo="' + esc(app.nome) + '">'
      + "<td>"
      +   '<button type="button" class="ap-abrir" aria-expanded="' + (aberto ? "true" : "false") + '">'
      +     '<span class="ap-seta" aria-hidden="true">' + (aberto ? "&#9662;" : "&#9656;") + "</span>"
      +     "<b>" + esc(app.nome) + "</b>"
      +   "</button>"
      + "</td>"
      + '<td class="ap-num">' + app.quantas + " de " + totalMedindo + "</td>"
      + '<td><span class="ap-presenca" title="' + Math.round(pct) + '% das máquinas reportando">'
      +   '<span class="cap-barra"><i class="ap-barra-i" style="width:' + pct.toFixed(1) + '%"></i></span>'
      +   '<span class="ap-presenca-pct">' + Math.round(pct) + "%</span>"
      + "</span></td>"
      + "</tr>"
      + (aberto
          ? '<tr class="ap-detalhe"><td colspan="3"><ul class="ap-maquinas">'
            + app.maquinas
                .slice().sort(function (a, b) { return a.hostname.localeCompare(b.hostname); })
                .map(linhaMaquina).join("")
            + "</ul></td></tr>"
          : "");
  }

  function tabela(d, lista) {
    if (!lista.length) {
      return '<div class="vazio">Nenhum aplicativo' + (filtro ? " para “" + esc(filtro) + "”" : "") + ".</div>";
    }
    return '<table class="tabela ap-tabela"><thead><tr>'
      + '<th>Aplicativo</th><th class="ap-num">Máquinas</th>'
      + '<th title="Percentual das máquinas reportando que têm este aplicativo instalado">Presença no parque</th>'
      + "</tr></thead><tbody>"
      + lista.map(function (a) { return linhaApp(a, d.maquinas_medindo); }).join("")
      + "</tbody></table>";
  }

  function pintar() {
    var alvo = document.getElementById("vista");
    if (!alvo || !MON.vistas || MON.vistas.atual !== "APLICATIVOS") return;

    var cab = '<a class="botao vista-voltar" href="#" data-vista="null">&larr; Painel</a>'
      + '<div class="vista-cab"><div><h1 class="vista-tit">Aplicativos</h1>'
      + '<p class="vista-sub">Quantas máquinas têm cada programa instalado</p></div></div>';

    var barra = '<div class="ac-barra">'
      + '<span class="campo-caixa ac-busca">'
      +   '<input type="text" class="campo" id="ap-busca"'
      +     ' placeholder="Filtrar por aplicativo" value="' + esc(filtro) + '"'
      +     ' autocomplete="off" spellcheck="false">'
      +   '<button type="button" class="campo-limpar" data-limpar-campo="ap-busca"'
      +     ' tabindex="-1" title="Limpar o filtro" aria-label="Limpar o filtro">&#10005;</button>'
      + "</span>"
      + seletorAmbiente()
      + (dados ? seletorProjeto(dados) : "")
      + '<button type="button" class="botao" id="ap-atualizar"' + (carregando ? " disabled" : "") + ">"
      +   (carregando ? "Atualizando…" : "Atualizar") + "</button>"
      + "</div>";

    var miolo;
    if (erro) {
      miolo = '<div class="estado-erro"><b>Não foi possível montar o ranking</b>'
        + "<code>" + esc(erro) + "</code></div>";
    } else if (carregando && !dados) {
      miolo = '<div class="esqueleto" style="height:280px"></div>';
    } else if (!dados) {
      miolo = "";
    } else if (!dados.maquinas_medindo) {
      miolo = '<div class="estado-vazio">Nenhuma máquina reportando aplicativos ainda — '
        + "o script do coletor opcional ainda não rodou em nenhuma, ou o item ainda não foi "
        + "criado no Zabbix.</div>";
    } else {
      var termo = filtro.trim().toLowerCase();
      var lista = dados.ranking.filter(function (a) {
        return !termo || a.nome.toLowerCase().indexOf(termo) >= 0;
      });
      miolo = '<p class="rl-texto">'
        + "<b>" + dados.total_apps_distintos + "</b> aplicativos distintos em <b>"
        + dados.maquinas_medindo + "</b> máquinas reportando"
        + (dados.total_apps_distintos > dados.ranking.length
            ? " · mostrando os " + dados.ranking.length + " mais presentes" : "")
        + ".</p>"
        + '<div class="painel"><div class="painel-corpo sem-espaco">'
        + tabela(dados, lista)
        + "</div></div>";
    }

    alvo.innerHTML = cab + barra
      + '<section class="camada"><div class="camada-cab">'
      +   '<h2 class="camada-tit">Ranking</h2>'
      +   '<span class="camada-nota">'
      +     (dados && !carregando
              ? "leitura mais antiga de " + (dados.coletado_mais_antigo
                  ? new Date(dados.coletado_mais_antigo * 1000).toLocaleString("pt-BR")
                  : "—")
              : "consultando…")
      +   "</span></div>" + miolo + "</section>";
  }

  function abrir() { buscar(false); pintar(); }

  function ligar() {
    document.addEventListener("click", function (ev) {
      if (!MON.vistas || MON.vistas.atual !== "APLICATIVOS") return;

      var b = ev.target.closest ? ev.target.closest("[data-ap-grupo]") : null;
      if (b) {
        ev.preventDefault();
        var k = b.getAttribute("data-ap-grupo");
        if (abertos[k]) delete abertos[k]; else abertos[k] = true;
        pintar();
        return;
      }

      if (ev.target.id === "ap-atualizar") { ev.preventDefault(); buscar(true); }
    });

    document.addEventListener("input", function (ev) {
      if (!MON.vistas || MON.vistas.atual !== "APLICATIVOS") return;
      if (ev.target.id !== "ap-busca") return;
      filtro = ev.target.value;
      var pos = ev.target.selectionStart;
      pintar();
      var novo = document.getElementById("ap-busca");
      if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) {} }
    });

    document.addEventListener("change", function (ev) {
      if (!MON.vistas || MON.vistas.atual !== "APLICATIVOS") return;
      if (ev.target.id === "ap-projeto") { projeto = ev.target.value; buscar(true); return; }
      if (ev.target.id === "ap-ambiente") { ambiente = ev.target.value; buscar(true); return; }
    });
  }

  return { abrir: abrir, pintar: pintar, ligar: ligar };
}());
