window.MON = window.MON || {};

MON.vistas = (function () {
  "use strict";

  var ICO = {
    predio:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/>'
      + '<path d="M15 9h3a2 2 0 0 1 2 2v10"/>'
      + '<path d="M2 21h20"/>'
      + '<path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1M17 13h1M17 17h1"/></svg>',

    monitor:
      '<svg viewBox="0 0 32 32" aria-hidden="true">'
      + '<rect x="3" y="5" width="26" height="18" rx="2.5" fill="currentColor"/>'
      + '<rect x="6.5" y="8.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<rect x="13.5" y="8.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<rect x="20.5" y="8.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<rect x="6.5" y="15.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<rect x="13.5" y="15.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<rect x="20.5" y="15.5" width="4.5" height="4.5" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<path d="M13 23h6v3h4v2H9v-2h4z" fill="currentColor"/></svg>',

    notebook:
      '<svg viewBox="0 0 32 32" aria-hidden="true">'
      + '<rect x="5" y="6" width="22" height="15" rx="2" fill="currentColor"/>'
      + '<rect x="8" y="9" width="16" height="9" rx="1" fill="#0b0f16" opacity=".55"/>'
      + '<path d="M2 23h28l-2 3H4z" fill="currentColor"/></svg>',

    servidor:
      '<svg viewBox="0 0 32 32" aria-hidden="true">'
      + '<rect x="4" y="4" width="24" height="8" rx="2" fill="currentColor"/>'
      + '<rect x="4" y="14" width="24" height="8" rx="2" fill="currentColor"/>'
      + '<rect x="4" y="24" width="24" height="5" rx="2" fill="currentColor" opacity=".5"/>'
      + '<circle cx="8.5" cy="8" r="1.4" fill="#0b0f16" opacity=".6"/>'
      + '<circle cx="8.5" cy="18" r="1.4" fill="#0b0f16" opacity=".6"/>'
      + '<path d="M13 7h11M13 9h7M13 17h11M13 19h7" stroke="#0b0f16" stroke-width="1.4"'
      + ' opacity=".45" stroke-linecap="round"/></svg>'
  };

  var atual = null;   // null = painel; "A"/"B" = bloco; "servidores"

  function daRota() {
    var h = (location.hash || "").replace(/^#\/?/, "").toLowerCase();
    if (h === "usuarios") return "USUARIOS";
    if (h === "acessos") return "ACESSOS";
    if (h === "servidores") return "SERVIDORES";
    
    if (h === "mapa") return "MAPA";
    if (h === "relatorios") return "RELATORIOS";
    if (h === "aplicativos") return "APLICATIVOS";
    if (h === "problemas") return "PROBLEMAS";
    if (h === "inventario") return "INVENTARIO";
    var m = h.match(/^bloco\/(.+)$/);
    return m ? m[1].toUpperCase() : null;
  }

  function tomDaMaquina(m, lim) {
    if (!m.online) return "off";
    if (m.pior_severidade >= 4) return "critico";
    if (m.problemas > 0) return "alerta";
    if (m.disco_livre != null && m.disco_livre < lim.disco_critico) return "alerta";
    if (m.memoria != null && m.memoria >= lim.memoria_alta) return "alerta";
    return "ok";
  }

  var ROTULO_TOM = {
    ok: "sem problema", alerta: "com alerta",
    critico: "com problema grave", off: "sem contato"
  };

  function iconeDe(m, padrao) {
    if (m.tipo === "notebook") return "notebook";
    if (m.tipo === "servidor") return "servidor";
    if (m.tipo === "desktop") return "monitor";
    return padrao;
  }

  function cartao(m, lim, padrao) {
    var icone = iconeDe(m, padrao);
    var tom = tomDaMaquina(m, lim);
    var nome = m.nome_visivel || m.hostname;
    var dica = nome + " — " + ROTULO_TOM[tom];
    if (m.tipo) dica += " · " + m.tipo;
    if (m.memoria != null) dica += " · memória " + MON.fmt.pct(m.memoria, 0);
    if (m.disco_livre != null) dica += " · disco livre " + MON.fmt.pct(m.disco_livre, 0);

    return '<button class="maq maq-' + tom + '" data-host="' + MON.fmt.esc(m.hostid) + '"'
      + ' title="' + MON.fmt.esc(dica) + '">'
      + '<span class="maq-ico">' + ICO[icone] + "</span>"
      + '<span class="maq-nome">' + MON.fmt.esc(nome) + "</span>"
      + "</button>";
  }

  function grupo(titulo, maquinas, lim, icone) {
    var ord = maquinas.slice().sort(function (a, b) {
      return (a.nome_visivel || a.hostname).localeCompare(b.nome_visivel || b.hostname,
                                                          "pt-BR", { numeric: true });
    });
    var off = ord.filter(function (m) { return !m.online; }).length;
    var mal = ord.filter(function (m) { return m.online && m.pior_severidade >= 4; }).length;

    var resumo = ord.length + (ord.length === 1 ? " máquina" : " máquinas");
    if (mal) resumo += " · " + mal + " com problema grave";
    if (off) resumo += " · " + off + " sem contato";

    return '<div class="grupo-maq">'
      + '<div class="grupo-cab">'
      +   '<span class="grupo-nome">' + MON.fmt.esc(titulo) + "</span>"
      +   '<span class="grupo-resumo">' + MON.fmt.esc(resumo) + "</span>"
      + "</div>"
      + '<div class="grupo-grade">'
      +   ord.map(function (m) { return cartao(m, lim, icone); }).join("")
      + "</div></div>";
  }

  function legenda() {
    return '<div class="vista-legenda">'
      + ["ok", "alerta", "critico", "off"].map(function (t) {
          return '<span class="leg"><i class="ponto-' + t + '"></i>'
            + ROTULO_TOM[t] + "</span>";
        }).join("")
      + "</div>";
  }

  function marcarBotoes() {
    [].forEach.call(document.querySelectorAll("[data-vista]"), function (a) {
      a.classList.toggle("ativo", a.getAttribute("data-vista") === String(atual));
    });
    escreverTitulo();
  }

  var TITULOS = {
    "USUARIOS": "Usuários",
    "ACESSOS": "Acessos",
    "SERVIDORES": "Servidores",
    "MAPA": "Mapa",
    "RELATORIOS": "Relatórios",
    "APLICATIVOS": "Aplicativos",
    "PROBLEMAS": "Alertas",
    "INVENTARIO": "Inventário"
  };

  function escreverTitulo() {
    var el = document.getElementById("topo-tit");
    if (!el) return;
    el.textContent = atual === null
      ? ""
      : (TITULOS[atual] || ("Bloco " + atual));
  }

  function desenhar() {
    var alvo = document.getElementById("vista");
    if (!alvo) return;

    document.body.classList.toggle("em-vista", atual !== null);
    
    document.body.setAttribute("data-vista", atual || "");
    marcarBotoes();

    if (atual === null) { alvo.innerHTML = ""; return; }

    if (atual === "USUARIOS") return;

    if (atual === "ACESSOS") return;

    if (atual === "RELATORIOS") return;

    if (atual === "APLICATIVOS") return;

    if (atual === "MAPA") {
      if (MON.mapa) MON.mapa.desenhar(alvo);
      return;
    }

    if (atual === "PROBLEMAS" || atual === "INVENTARIO") {
      alvo.innerHTML = "";
      
      var qual = atual === "PROBLEMAS" ? "problemas" : "inventario";
      var sec = document.querySelector('section[data-secao="' + qual + '"]');
      if (sec) sec.classList.remove("recolhida");
      return;
    }

    var d = MON.estado.dados;
    if (!d) {
      alvo.innerHTML = '<div class="painel"><div class="painel-corpo">'
        + '<div class="esqueleto" style="height:280px"></div></div></div>';
      return;
    }

    var lim = MON.estado.limites();
    var todas = d.maquinas || [];
    var corpo, titulo, sub;

    if (atual === "SERVIDORES") {
      var srv = todas.filter(function (m) { return m.servidor; });
      titulo = "Servidores";
      sub = srv.length + " identificados pelo sistema operacional";
      corpo = srv.length
        ? grupo("Servidores", srv, lim, "servidor")
        : '<div class="estado-vazio">Nenhum servidor identificado.</div>';
    } else {
      var projetos = (d.blocos || {})[atual] || [];
      titulo = "Bloco " + atual;
      
      var doBloco = todas.filter(function (m) {
        return !m.servidor && projetos.indexOf((m.projeto || "").toUpperCase()) >= 0;
      });
      var off2 = doBloco.filter(function (m) { return !m.online; }).length;
      sub = doBloco.length + " máquinas em " + projetos.length + " projetos"
          + (off2 ? " · " + off2 + " sem contato" : "");

      corpo = projetos.map(function (proj) {
        var g = doBloco.filter(function (m) {
          return (m.projeto || "").toUpperCase() === proj;
        });
        return g.length ? grupo(proj, g, lim, "monitor") : "";
      }).join("");
      if (!corpo) corpo = '<div class="estado-vazio">Nenhuma máquina neste bloco.</div>';
    }

    alvo.innerHTML =
      '<div class="vista-cab">'
      +   '<a class="vista-voltar" href="#" data-vista="null">&#8592; Painel</a>'
      +   '<h2 class="vista-tit">' + MON.fmt.esc(titulo) + "</h2>"
      +   '<span class="vista-sub">' + MON.fmt.esc(sub) + "</span>"
      + "</div>"
      + legenda()
      + '<div class="painel"><div class="painel-corpo">' + corpo + "</div></div>";
  }

  function sincronizar() {
    var anterior = atual;
    atual = daRota();

    if (atual === "USUARIOS") {
      marcarBotoes();
      document.body.classList.add("em-vista");
      if (MON.usuarios) {
        if (anterior !== "USUARIOS") MON.usuarios.limparRecado();
        MON.usuarios.carregar();
      }
      window.scrollTo(0, 0);
      return;
    }

    if (atual === "ACESSOS") {
      marcarBotoes();
      document.body.classList.add("em-vista");
      if (MON.acessos) MON.acessos.abrir();
      window.scrollTo(0, 0);
      return;
    }

    if (atual === "RELATORIOS") {
      marcarBotoes();
      document.body.classList.add("em-vista");
      document.body.setAttribute("data-vista", "RELATORIOS");
      if (MON.relatorios) MON.relatorios.abrir();
      window.scrollTo(0, 0);
      return;
    }

    if (atual === "APLICATIVOS") {
      marcarBotoes();
      document.body.classList.add("em-vista");
      document.body.setAttribute("data-vista", "APLICATIVOS");
      if (MON.aplicativos) MON.aplicativos.abrir();
      window.scrollTo(0, 0);
      return;
    }

    desenhar();
    if (atual !== null) window.scrollTo(0, 0);
  }

  return { ICO: ICO, sincronizar: sincronizar, desenhar: desenhar,
           get atual() { return atual; } };
})();
