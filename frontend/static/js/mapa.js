window.MON = window.MON || {};

MON.mapa = (function () {
  "use strict";

  var abertos = {};

  var escala = 1;
  var ESCALA_MIN = 0.6, ESCALA_MAX = 1.6, ESCALA_PASSO = 0.1;
  var cheia = false;

  var abertosServ = { fisicos: true, nuvem: true };

  var nucleoAberto = { zabbix: false };

  function esc(t) { return MON.fmt.esc(t == null ? "" : String(t)); }

  function tom(m, lim) {
    if (!m.online) return "off";
    if (m.pior_severidade >= 4) return "critico";
    if (m.problemas > 0) return "alerta";
    if (m.disco_livre != null && m.disco_livre < lim.disco_critico) return "alerta";
    if (m.memoria != null && m.memoria >= lim.memoria_alta) return "alerta";
    return "ok";
  }

  var ORDEM_TOM = { critico: 0, alerta: 1, off: 2, ok: 3 };

  function ordenarChips(itens) {
    return itens.slice().sort(function (a, b) {
      return (ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom])
          || a.m.hostname.localeCompare(b.m.hostname);
    });
  }


  function chaveDe(m) {
    return m.projeto || "Outros";
  }

  function agrupar(maquinas, lim) {
    var mapa = {};
    maquinas.forEach(function (m) {
      var k = chaveDe(m);
      var g = mapa[k];
      if (!g) g = mapa[k] = { chave: k, itens: [], ok: 0, alerta: 0, critico: 0, off: 0 };
      var t = tom(m, lim);
      g.itens.push({ m: m, tom: t });
      g[t]++;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; })
      
      .sort(function (a, b) {
        
        var sa = a.chave === "Outros" ? 1 : 0, sb = b.chave === "Outros" ? 1 : 0;
        return (sa - sb) || (b.critico - a.critico) || (b.alerta - a.alerta)
            || (b.itens.length - a.itens.length);
      });
  }

  function bolinhas(g) {
    var partes = [];
    if (g.critico) partes.push('<span class="mp-b critico">' + g.critico + "</span>");
    if (g.alerta) partes.push('<span class="mp-b alerta">' + g.alerta + "</span>");
    if (g.off) partes.push('<span class="mp-b off">' + g.off + "</span>");
    if (g.ok) partes.push('<span class="mp-b ok">' + g.ok + "</span>");
    return partes.join("");
  }

  function chip(x) {
    return '<button type="button" class="mp-maq" data-host="' + esc(x.m.hostid)
      + '" data-tom="' + x.tom + '" title="' + esc(x.m.hostname)
      + (x.m.ip ? " · " + esc(x.m.ip) : "") + '">'
      + '<span class="mp-maq-ico">' + ICO.monitor
      +   '<i class="mp-maq-selo" aria-hidden="true"></i></span>'
      + '<span class="mp-maq-n">' + esc(x.m.hostname) + "</span>"
      + "</button>";
  }

  var MOSTRA = 12;

  function grupo(g) {
    var aberto = !!abertos[g.chave];
    var itens = ordenarChips(g.itens);
    var visiveis = aberto ? itens : itens.slice(0, MOSTRA);
    var restam = itens.length - visiveis.length;

    return '<section class="mp-grupo">'
      + '<header class="mp-grupo-cab">'
      +   '<span class="mp-grupo-n">' + esc(g.chave) + "</span>"
      +   '<span class="mp-grupo-q">' + itens.length + "</span>"
      +   '<span class="mp-selos">' + bolinhas(g) + "</span>"
      + "</header>"
      + '<div class="mp-grade">' + visiveis.map(chip).join("") + "</div>"
      + (restam > 0
          ? '<button type="button" class="mp-mais" data-mapa-grupo="' + esc(g.chave) + '">'
            + "+" + restam + (restam === 1 ? " outra" : " outras") + "</button>"
          : aberto && itens.length > MOSTRA
            ? '<button type="button" class="mp-mais" data-mapa-grupo="' + esc(g.chave) + '">'
              + "mostrar menos</button>"
            : "")
      + "</section>";
  }

  function duasColunas(cartoesHtml) {
    var a = [], b = [];
    cartoesHtml.forEach(function (html, i) { (i % 2 === 0 ? a : b).push(html); });
    return [a.join(""), b.join("")];
  }

  var ICO = {
    nuvem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<path d="M17.5 18.5H7a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.53 1.64 3.9 3.9 0 0 1-.43 7.32z"/></svg>',
    predio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/>'
         + '<path d="M15 9h3a2 2 0 0 1 2 2v10"/><path d="M2 21h20"/>'
         + '<path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1M17 13h1M17 17h1"/></svg>',
    servidor: '<svg viewBox="0 0 32 32" aria-hidden="true">'
         + '<rect x="4" y="4" width="24" height="8" rx="2" fill="currentColor"/>'
         + '<rect x="4" y="14" width="24" height="8" rx="2" fill="currentColor"/>'
         + '<rect x="4" y="24" width="24" height="5" rx="2" fill="currentColor" opacity=".5"/>'
         + '<circle cx="8.5" cy="8" r="1.4" fill="#0b0f16" opacity=".6"/>'
         + '<circle cx="8.5" cy="18" r="1.4" fill="#0b0f16" opacity=".6"/>'
         + '<path d="M13 7h11M13 9h7M13 17h11M13 19h7" stroke="#0b0f16" stroke-width="1.4"'
         + ' opacity=".45" stroke-linecap="round"/></svg>',
    
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<rect x="2.5" y="4" width="19" height="13" rx="2"/>'
         + '<path d="M9 20.3h6M12 17v3.3"/></svg>',
    
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<path d="M10.3 3.9 2.4 17.5A1.9 1.9 0 0 0 4 20.4h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z"/>'
         + '<path d="M12 9v4.5M12 17.2v.1"/></svg>',
    zoomMais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M10.5 8v5M8 10.5h5M20 20l-4.3-4.3"/></svg>',
    zoomMenos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M8 10.5h5M20 20l-4.3-4.3"/></svg>',
    
    zoomAjustar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'
         + '<circle cx="12" cy="12" r="7"/>'
         + '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
    telaCheia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4'
         + 'M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/></svg>',
    telaNormal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
         + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         + '<path d="M9 4v3a1 1 0 0 1-1 1H5M15 4v3a1 1 0 0 0 1 1h3'
         + 'M9 20v-3a1 1 0 0 0-1-1H5M15 20v-3a1 1 0 0 1 1-1h3"/></svg>'
  };

  function cartoes(d, nuvem, local, lim) {
    var r = d.resumo;
    var itens = [
      ["Total de máquinas", r.total, "", "monitoradas no Zabbix", ICO.monitor],
      ["Ambiente em nuvem", nuvem.length, "azul",
       r.total ? Math.round(nuvem.length / r.total * 100) + "% do parque" : "", ICO.nuvem],
      ["Ambiente local", local.length, "",
       r.total ? Math.round(local.length / r.total * 100) + "% do parque" : "", ICO.predio],
      ["Ponto de atenção", r.problema_leve, "alto", "severidade média ou aviso", ICO.alerta],
      ["Problema grave", r.com_critico, "critico", r.desastre + " desastre · " + r.alta + " alta", ICO.alerta],
      ["Sem contato", r.offline, r.offline ? "off" : "", "sem contato com o agente", ICO.monitor]
    ];
    return '<div class="mp-resumo">'
      + itens.map(function (c) {
          return '<div class="mp-resumo-item"' + (c[2] ? ' data-mp-tom="' + c[2] + '"' : "")
            +   (c[3] ? ' title="' + esc(c[3]) + '"' : "") + ">"
            + '<span class="mp-resumo-ico">' + c[4] + "</span>"
            + '<div class="mp-resumo-txt">'
            +   "<b>" + MON.fmt.inteiro(c[1] || 0) + "</b>"
            +   "<span>" + esc(c[0]) + "</span>"
            + "</div>"
            + "</div>";
        }).join("")
      + "</div>";
  }

  function legenda() {
    var l = [["ok", "sem problema"], ["alerta", "com alerta"],
             ["critico", "problema grave"], ["off", "sem contato"]];
    return '<div class="mp-legenda">'
      + l.map(function (x) {
          return '<span><i data-tom="' + x[0] + '"></i>' + x[1] + "</span>";
        }).join("")
      + "</div>";
  }

  function subSecaoNuvem(nome, itens) {
    if (!itens.length) return "";
    return '<h4 class="mp-srv-sub">' + esc(nome)
      + '<span class="mp-srv-sub-q">' + itens.length + "</span></h4>"
      + '<div class="mp-grade mp-grade-srv">' + ordenarChips(itens).map(chip).join("") + "</div>";
  }

  function secaoServidores(chave, titulo, icone, contagem, corpoHtml) {
    var aberto = abertosServ[chave] !== false;
    return '<section class="mp-srv-grupo">'
      + '<button type="button" class="mp-srv-cab" data-srv-toggle="' + chave
      +   '" aria-expanded="' + (aberto ? "true" : "false") + '">'
      +   '<span class="mp-grupo-ico">' + icone + "</span>"
      +   '<span class="mp-grupo-n">' + esc(titulo) + "</span>"
      +   '<span class="mp-grupo-q">' + contagem + "</span>"
      +   '<span class="mp-srv-seta" aria-hidden="true">' + (aberto ? "&#9662;" : "&#9656;") + "</span>"
      + "</button>"
      + '<div class="mp-srv-corpo' + (aberto ? "" : " recolhida") + '">' + corpoHtml + "</div>"
      + "</section>";
  }

  function painelServidores(fisicos, nuvem) {
    var corpoFisicos = fisicos.length
      ? '<div class="mp-grade mp-grade-srv">' + ordenarChips(fisicos).map(chip).join("") + "</div>"
      : '<p class="mp-vazio">Nenhum servidor físico monitorado.</p>';

    var totalNuvem = nuvem.length;
    var corpoNuvem = totalNuvem
      ? subSecaoNuvem("Nuvem", nuvem)
      : '<p class="mp-vazio">Nenhum servidor em nuvem ainda.</p>';

    return '<aside class="mp-servidores">'
      + '<h3 class="mp-lado-tit">' + ICO.servidor + "Servidores</h3>"
      + secaoServidores("fisicos", "Servidores físicos", ICO.servidor, fisicos.length, corpoFisicos)
      + secaoServidores("nuvem", "Servidores em nuvem", ICO.nuvem, totalNuvem, corpoNuvem)
      + "</aside>";
  }

  function controlesZoom() {
    return '<div class="mp-zoom">'
      + '<button type="button" class="botao botao-icone" data-mp-zoom="menos" title="Diminuir zoom">'
      +   ICO.zoomMenos + "</button>"
      + '<button type="button" class="botao botao-icone" data-mp-zoom="ajustar" title="Centralizar (100%)">'
      +   ICO.zoomAjustar + "</button>"
      + '<button type="button" class="botao botao-icone" data-mp-zoom="mais" title="Aumentar zoom">'
      +   ICO.zoomMais + "</button>"
      + '<button type="button" class="botao botao-icone" data-mp-zoom="cheia" title="'
      +   (cheia ? "Sair da tela cheia" : "Tela cheia") + '">'
      +   (cheia ? ICO.telaNormal : ICO.telaCheia) + "</button>"
      + "</div>";
  }

  function caixaNucleo(chave, liga, icone, titulo, descricao, statusTexto) {
    var aberto = !!nucleoAberto[chave];
    return '<button type="button" class="mp-nucleo-caixa' + (aberto ? " aberta" : "") + '"'
      + (liga ? ' data-liga="' + liga + '"' : "")
      + ' data-nucleo-toggle="' + chave + '" aria-expanded="' + (aberto ? "true" : "false") + '">'
      + (liga ? '<i class="mp-nucleo-no mp-nucleo-no-esq" aria-hidden="true"></i>'
              + '<i class="mp-nucleo-no mp-nucleo-no-dir" aria-hidden="true"></i>' : "")
      + '<span class="mp-nucleo-cab">'
      +   '<span class="mp-nucleo-ico">' + icone + "</span>"
      +   "<b>" + esc(titulo) + "</b>"
      +   '<span class="mp-nucleo-seta" aria-hidden="true">' + (aberto ? "&#9662;" : "&#9656;") + "</span>"
      + "</span>"
      + (aberto
          ? '<span class="mp-nucleo-detalhe">'
            + "<span>" + esc(descricao) + "</span>"
            + (statusTexto ? "<small>" + esc(statusTexto) + "</small>" : "")
            + "</span>"
          : "")
      + "</button>";
  }

  function desenhar(alvo) {
    var d = MON.estado.dados;
    if (!d) {
      alvo.innerHTML = '<div class="painel"><div class="painel-corpo">'
        + '<div class="esqueleto" style="height:420px"></div></div></div>';
      return;
    }
    var lim = MON.estado.limites();
    var todas = d.maquinas || [];

    var servidores = todas.filter(function (m) { return m.servidor; })
      .map(function (m) { return { m: m, tom: tom(m, lim) }; });
    var fisicos = servidores.filter(function (x) { return x.m.ambiente !== "nuvem"; });
    var servidoresNuvem = servidores.filter(function (x) { return x.m.ambiente === "nuvem"; });

    var idsNuvem = {};
    servidoresNuvem.forEach(function (x) { idsNuvem[x.m.hostid] = true; });
    var nuvem = servidoresNuvem.map(function (x) { return x.m; });
    var local = todas.filter(function (m) { return !idsNuvem[m.hostid]; });

    var localResto = local.filter(function (m) { return !m.servidor; });

    var cartoesGrupo = agrupar(localResto, lim).map(grupo);
    var colunas = duasColunas(cartoesGrupo);

    alvo.innerHTML =
      cartoes(d, nuvem, local, lim)
      + '<div class="mp-barra">' + legenda() + "</div>"
      + '<div class="mp-mapa-wrap' + (cheia ? " mp-mapa-cheia" : "") + '">'
      +   '<div class="mp-viewport">'
      +     '<div class="mp-canvas" style="transform:scale(' + escala + ')">'

      +       '<div class="mp-tela">'
      +         '<div class="mp-grupos mp-grupos-esq">' + colunas[0] + "</div>"

      +         '<div class="mp-nucleo">'
      
      +           caixaNucleo("zabbix", "ambos", ICO.servidor, "Servidor Zabbix",
                    "Coleta e alimenta este painel",
                    d.conexao && d.conexao.ok ? "coletando agora" : "sem conexão")
      +           '<div class="mp-nucleo-fio"></div>'
      
      +         "</div>"

      +         '<div class="mp-grupos mp-grupos-dir">' + colunas[1] + "</div>"
      +       "</div>"

      +       painelServidores(fisicos, servidoresNuvem)
      +     "</div>"
      +   "</div>"
      +   controlesZoom()
      + "</div>";
  }

  function ligar() {
    document.addEventListener("click", function (ev) {
      var alvo = document.getElementById("vista");

      var z = ev.target.closest ? ev.target.closest("[data-mp-zoom]") : null;
      if (z) {
        ev.preventDefault();
        var acao = z.getAttribute("data-mp-zoom");
        if (acao === "mais") escala = Math.min(ESCALA_MAX, Math.round((escala + ESCALA_PASSO) * 100) / 100);
        else if (acao === "menos") escala = Math.max(ESCALA_MIN, Math.round((escala - ESCALA_PASSO) * 100) / 100);
        else if (acao === "ajustar") escala = 1;
        else if (acao === "cheia") cheia = !cheia;
        if (alvo) desenhar(alvo);
        return;
      }

      var srv = ev.target.closest ? ev.target.closest("[data-srv-toggle]") : null;
      if (srv) {
        ev.preventDefault();
        var chaveSrv = srv.getAttribute("data-srv-toggle");
        abertosServ[chaveSrv] = !(abertosServ[chaveSrv] !== false);
        if (alvo) desenhar(alvo);
        return;
      }

      var nc = ev.target.closest ? ev.target.closest("[data-nucleo-toggle]") : null;
      if (nc) {
        ev.preventDefault();
        var chaveNc = nc.getAttribute("data-nucleo-toggle");
        nucleoAberto[chaveNc] = !nucleoAberto[chaveNc];
        if (alvo) desenhar(alvo);
        return;
      }

      var b = ev.target.closest ? ev.target.closest("[data-mapa-grupo]") : null;
      if (!b) return;
      ev.preventDefault();
      var k = b.getAttribute("data-mapa-grupo");
      if (abertos[k]) delete abertos[k]; else abertos[k] = true;
      if (alvo) desenhar(alvo);
      var novo = document.querySelector('[data-mapa-grupo="' + k.replace(/"/g, '\\"') + '"]');
      if (novo) novo.focus();
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || !cheia) return;
      cheia = false;
      var alvo = document.getElementById("vista");
      if (alvo && MON.vistas && MON.vistas.atual === "MAPA") desenhar(alvo);
    });

  }

  return { desenhar: desenhar, ligar: ligar };
}());
