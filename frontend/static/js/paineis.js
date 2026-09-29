window.MON = window.MON || {};

MON.paineis = (function () {
  "use strict";

  var f = null;   // MON.fmt, resolvido no primeiro uso

  function pega(id) { return document.getElementById(id); }

  function json(o) { return MON.fmt.esc(JSON.stringify(o)); }

  function conexao() {
    var alvo = pega("conexao");
    if (!alvo) return;
    var c = MON.estado.conexao || {};
    var idade = MON.estado.idadeSegundos();
    var teto = (c.intervalo_completo || 30) * 2;

    var classe, texto, detalhe;

    if (MON.estado.carregando) {
      classe = ""; texto = "Conectando ao Zabbix"; detalhe = "";
    } else if (!c.ok) {
      classe = "morta";
      texto = "Sem dados do Zabbix";
      detalhe = idade != null
        ? "última atualização há " + MON.fmt.duracao(idade)
        : "nenhuma leitura obtida";
    } else if (idade != null && idade > teto) {
      classe = "velha";
      texto = "Dado atrasado";
      detalhe = "coletado há " + MON.fmt.duracao(idade);
    } else {
      classe = "viva";
      texto = MON.demo ? "Demonstração ativa" : "Zabbix conectado";
      detalhe = idade != null ? "atualizado há " + MON.fmt.duracao(idade) : "";
    }

    var titulo = c.ultimo_erro ? "Último erro: " + c.ultimo_erro : "";
    if (MON.fluxo && MON.fluxo.modo === "reserva") {
      detalhe += (detalhe ? " · " : "") + "modo reserva";
      titulo = titulo || "O fluxo contínuo não subiu; a tela está buscando periodicamente.";
    }

    alvo.className = "conexao " + classe;
    alvo.title = titulo;
    alvo.innerHTML = '<span class="bolha"></span><span>' + MON.fmt.esc(texto) + "</span>" +
      (detalhe ? '<span style="opacity:.75">' + MON.fmt.esc(detalhe) + "</span>" : "");
  }

  function capacidade() {
    var d = MON.estado.dados;
    var alvo = pega("capacidade");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(180); return; }

    var c = d.capacidade;
    if (!c || !c.medindo_disco) {
      alvo.innerHTML = '<div class="estado-vazio">Sem máquinas reportando recurso agora.</div>';
      return;
    }

    var maiorDisco = Math.max.apply(null, c.disco.map(function (f) { return f.quantas; })) || 1;

    var disco = c.disco.map(function (f) {
      var zerada = !f.quantas;
      return '<button class="cap-linha' + (zerada ? " zerada" : "") + '"'
        
        + (zerada ? " disabled" : " data-lista='" + json(f.filtro) + "'"
            + ' data-lista-tit="' + MON.fmt.esc("Disco " + f.rotulo) + '"'
            + ' data-lista-sub="' + MON.fmt.esc(f.quantas + " de " + c.medindo_disco
                + " máquinas medindo · faixa do volume mais apertado") + '"')
        + ' title="' + MON.fmt.esc(f.quantas + " de " + c.medindo_disco
            + " máquinas medindo estão com " + f.rotulo + " no volume mais apertado") + '">'
        + '<span class="cap-q">' + f.quantas + "</span>"
        + '<span class="cap-r">' + MON.fmt.esc(f.rotulo) + "</span>"
        + '<span class="cap-barra"><i class="tom-' + f.tom
        +   '" style="width:' + (100 * f.quantas / maiorDisco).toFixed(1) + '%"></i></span>'
        + "</button>";
    }).join("");

    var ram = c.ram.map(function (g) {
      var tom = g.uso_medio >= c.limite_memoria ? "critico"
              : g.uso_medio >= 80 ? "alto"
              : g.uso_medio >= 65 ? "medio" : "ok";
      
      return '<button class="cap-ram"'
        + " data-lista='" + json(g.filtro) + "'"
        // "Máquinas com RAM acima de 16 GB" le bem nos tres grupos; "Máquinas
        // com acima de 16 GB de RAM" nao.
        + ' data-lista-tit="' + MON.fmt.esc("Máquinas com RAM " + g.rotulo) + '"'
        + ' data-lista-sub="' + MON.fmt.esc(g.quantas + " máquinas · uso médio de "
            + MON.fmt.pct(g.uso_medio) + " · " + g.acima_do_limite + " acima de "
            + MON.fmt.pct(c.limite_memoria, 0)) + '"'
        + ' title="' + MON.fmt.esc("Ver as " + g.quantas + " máquinas com RAM "
            + g.rotulo) + '">'
        + '<span class="cap-ram-topo">'
        +   '<span class="cap-ram-nome">' + MON.fmt.esc(g.rotulo) + "</span>"
        +   '<span class="cap-ram-n">' + g.quantas + " máq.</span>"
        +   '<span class="cap-ram-uso tom-txt-' + tom + '">' + MON.fmt.pct(g.uso_medio, 0) + "</span>"
        + "</span>"
        + '<span class="cap-barra cap-barra-uso">'
        +   '<i class="tom-' + tom + '" style="width:' + Math.min(100, g.uso_medio).toFixed(1) + '%"></i>'
        +   '<b style="left:' + c.limite_memoria + '%"></b>'
        + "</span>"
        + "</button>";
    }).join("");

    var ap = c.aperto;
    var notaDisco = ap
      ? '<button class="cap-nota cap-nota-clicavel"'
        + " data-lista='" + json(ap.filtro) + "'"
        + ' data-lista-tit="' + MON.fmt.esc("Máquinas " + ap.rotulo + " de espaço livre") + '"'
        + ' data-lista-sub="' + MON.fmt.esc(ap.quantas + " máquinas · a mais apertada tem "
            + MON.fmt.n(ap.gb_pior, 1) + " GB livres") + '"'
        + ' title="' + MON.fmt.esc("Ver as " + ap.quantas + " máquinas " + ap.rotulo + " de espaço livre") + '">'
        + "As <b>" + ap.quantas + "</b> " + MON.fmt.esc(ap.rotulo) + " somam <b>"
        + MON.fmt.inteiro(ap.gb_somados) + " GB</b> livres — a mais apertada tem <b>"
        + MON.fmt.n(ap.gb_pior, 1) + " GB</b>"
        + "</button>"
      : '<div class="cap-nota">Nenhuma máquina abaixo de '
        + MON.fmt.n(c.limite_disco_critico || 10, 0) + '% de espaço livre</div>';

    var cpuAlta = c.cpu_alta;
    var notaCpu = cpuAlta
      ? '<button class="cap-nota cap-nota-clicavel"'
        + " data-lista='" + json(cpuAlta.filtro) + "'"
        + ' data-lista-tit="Máquinas com CPU alta"'
        + ' data-lista-sub="' + MON.fmt.esc(cpuAlta.quantas + " máquinas · acima de "
            + MON.fmt.n(c.limite_cpu, 0) + "% de uso agora") + '"'
        + ' title="' + MON.fmt.esc("Ver as " + cpuAlta.quantas + " máquinas com CPU acima de "
            + MON.fmt.n(c.limite_cpu, 0) + "%") + '">'
        + "<b>" + cpuAlta.quantas + "</b> máquinas estão com CPU acima de <b>"
        + MON.fmt.n(c.limite_cpu, 0) + "%</b> agora"
        + "</button>"
      : '<div class="cap-nota">Nenhuma máquina acima de '
        + MON.fmt.n(c.limite_cpu, 0) + '% de uso de CPU</div>';

    var situacoes = (ap ? 1 : 0) + (cpuAlta ? 1 : 0)
      + c.ram.filter(function (g) { return g.uso_medio >= c.limite_memoria; }).length;

    var resumoAlvo = pega("cap-resumo");
    if (resumoAlvo) {
      resumoAlvo.className = "cap-resumo" + (situacoes ? " cap-resumo-critico" : "");
      resumoAlvo.textContent = situacoes
        ? situacoes + " situaç" + (situacoes === 1 ? "ão precisa" : "ões precisam") + " de atenção"
        : c.total_parque + " máquinas no parque";
    }
    var painelAlvo = alvo.closest(".painel");
    if (painelAlvo) painelAlvo.classList.toggle("painel-alerta", situacoes > 0);

    alvo.innerHTML =
      '<div class="cap">'
      + '<div class="cap-secao">'
      +   '<div class="cap-cab"><span>Disco — espaço livre</span>'
      +     "<span>" + c.medindo_disco + " medindo</span></div>"
      +   disco
      +   notaDisco
      + "</div>"
      + '<div class="cap-secao">'
      +   '<div class="cap-cab"><span>Memória — por tamanho instalado</span></div>'
      +   ram
      + "</div>"
      + '<div class="cap-secao">'
      +   '<div class="cap-cab"><span>CPU — uso atual</span>'
      +     "<span>" + c.medindo_cpu + " medindo</span></div>"
      +   notaCpu
      + "</div>"
      + (c.sem_medicao
          ? '<div class="cap-rodape"><b>' + c.sem_medicao
            + "</b> sem medição agora — máquinas desligadas · "
            + c.total_parque + " no parque</div>"
          : '<div class="cap-rodape">' + c.total_parque + " máquinas no parque</div>")
      + "</div>";
  }

  var ICONES = {
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M10.3 3.9 2.4 17.5A1.9 1.9 0 0 0 4 20.4h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z"/>'
      + '<path d="M12 9v4.5M12 17.2v.1"/></svg>',
    
    pulso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M2.5 12h4l1.8-5 3.4 10 2-8.5 1.6 3.5h6.2"/></svg>'
  };

  function tomDaCor(cor) {
    var m = /^var\(--([a-z]+)\)$/.exec(cor || "");
    if (!m) return "";
    return ["ok", "critico", "alto", "medio"].indexOf(m[1]) >= 0 ? m[1] : "";
  }

  function kpi(o) {
    var indisp = o.valor == null;
    var tom = indisp ? "" : tomDaCor(o.cor);

    var temLista = o.recorte && !indisp && o.valor > 0;
    return '<button class="kpi"' +
      (tom ? ' data-tom="' + tom + '"' : "") +
      (temLista
        ? " data-lista='" + json(o.recorte) + "'"
          + ' data-lista-tit="' + MON.fmt.esc(o.listaTit || o.rotulo) + '"'
          + ' data-lista-sub="' + MON.fmt.esc(o.listaSub || "") + '"'
        : " disabled") +
      (o.titulo ? ' title="' + MON.fmt.esc(o.titulo) + '"' : "") + ">" +
      '<span class="kpi-rotulo">' +
        (o.icone
          ? '<span class="kpi-ico"' + (o.cor && !indisp ? ' style="color:' + o.cor + '"' : "") + ">"
            + o.icone + "</span>"
          : "") +
        MON.fmt.esc(o.rotulo) + (o.dica || "") + "</span>" +
      '<span class="kpi-valor' + (indisp ? " indisponivel" : "") + '"' +
        (o.cor && !indisp ? ' style="color:' + o.cor + '"' : "") + ">" +
        (indisp ? "indisponível" : MON.fmt.inteiro(o.valor)) + "</span>" +
      '<span class="kpi-sub">' + MON.fmt.esc(o.sub || "") + "</span>" +
      "</button>";
  }

  function resumo() {
    var d = MON.estado.dados;
    var alvo = pega("kpis");
    if (!alvo) return;

    if (!d) {
      if (!MON.estado.erro) {
        alvo.innerHTML = Array(7).join("|").split("|")
          .map(function () { return esqueleto(112); }).join("");
        return;
      }
      alvo.innerHTML = [
        ["Máquinas", ICONES.monitor], ["Online", ICONES.check], ["Offline", ICONES.x],
        ["Ponto de atenção", ICONES.alerta], ["Problema grave", ICONES.alerta],
        ["Sem medição", ICONES.pulso]
      ].map(function (par) {
        return kpi({ rotulo: par[0], icone: par[1], valor: null, sub: "nenhuma leitura obtida" });
      }).join("");
      return;
    }

    var velho = !MON.estado.conexao.ok;
    var carimbo = velho ? " · leitura de " + MON.fmt.hora(d.gerado_em) : "";
    var r = d.resumo;
    var v = function (x) { return x; };

    alvo.classList.toggle("desatualizado", velho);

    alvo.innerHTML =
      kpi({ rotulo: "Máquinas", icone: ICONES.monitor, valor: v(r.total),
            sub: "monitoradas no Zabbix" + carimbo,
            recorte: {},
            listaTit: "Todas as máquinas",
            listaSub: MON.fmt.inteiro(r.total) + " monitoradas no Zabbix" }) +
      kpi({ rotulo: "Online", icone: ICONES.check, valor: v(r.online), cor: "var(--ok)",
            sub: MON.fmt.pct(r.disponibilidade) + " de disponibilidade" + carimbo,
            recorte: { status: "online" },
            listaTit: "Máquinas online",
            listaSub: MON.fmt.inteiro(r.online) + " respondendo agora · "
                    + MON.fmt.pct(r.disponibilidade) + " do parque" }) +
      kpi({ rotulo: "Offline", icone: ICONES.x, valor: v(r.offline),
            cor: r.offline ? "var(--critico)" : "var(--txt-2)",
            sub: (r.offline ? "sem contato com o agente" : "nenhuma") + carimbo,
            recorte: { status: "offline" },
            listaTit: "Máquinas sem contato",
            listaSub: MON.fmt.inteiro(r.offline) + " sem contato com o agente" }) +
      
      kpi({ rotulo: "Ponto de atenção", icone: ICONES.alerta, valor: v(r.problema_leve), cor: "var(--alto)",
            sub: MON.fmt.inteiro(r.problemas) + " problemas abertos" + carimbo,
            titulo: "Máquinas com problema de severidade média ou aviso — nada parado, mas vale olhar",
            recorte: { especial: "problema_leve" },
            listaTit: "Máquinas em ponto de atenção",
            listaSub: MON.fmt.inteiro(r.problema_leve) + " máquinas · "
                    + "severidade média ou aviso" }) +
      kpi({ rotulo: "Problema grave", icone: ICONES.alerta, valor: v(r.com_critico), cor: "var(--critico)",
            sub: r.desastre + " desastre · " + r.alta + " alta" + carimbo,
            titulo: "Máquinas com problema de severidade alta ou desastre",
            recorte: { especial: "criticos", severidade: "4" },
            listaTit: "Máquinas com problema grave",
            listaSub: r.desastre + " em desastre · " + r.alta + " em alta" }) +
      kpi({ rotulo: "Sem medição", icone: ICONES.pulso, valor: v(r.sem_dados), cor: r.sem_dados ? "var(--medio)" : "var(--txt-2)",
            sub: "online, sem dado há " + MON.fmt.duracao(d.limites.sem_dados_apos) + carimbo,
            titulo: "O Zabbix considera o host ativo, mas parou de receber medição dele",
            recorte: { especial: "sem_dados" },
            listaTit: "Ligadas, sem medição",
            listaSub: "o Zabbix considera o host ativo, mas parou de receber dado" });
  }

  function atencao() {
    var d = MON.estado.dados;
    var alvo = pega("top-problemas");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(240); return; }

    var lista = d.top_problemas || [];
    if (!lista.length) {
      alvo.innerHTML = '<div class="estado-vazio">Nada exigindo atenção agora.<br>' +
        'Nenhuma máquina offline e nenhum problema aberto.</div>';
      return;
    }

    var maior = Math.max.apply(null, lista.map(function (x) { return x.quantos; }).concat([1]));
    var cores = { critico: "var(--critico)", alto: "var(--alto)",
                  medio: "var(--medio)", tipo: "var(--baixo)" };

    alvo.innerHTML = '<div class="lista">' + lista.slice(0, 10).map(function (x) {
      var cor = cores[x.gravidade] || "var(--neutro)";
      var ativo = casaFiltro(x.filtro);
      
      var titulo = x.rotulo.charAt(0).toUpperCase() + x.rotulo.slice(1);
      return '<button class="lista-item' + (ativo ? " ativo" : "") + '"'
        + " data-lista='" + json(x.filtro) + "'"
        + ' data-lista-tit="' + MON.fmt.esc(titulo) + '"'
        + ' data-lista-sub="' + MON.fmt.esc(x.quantos
            + (x.quantos === 1 ? " máquina" : " máquinas")
            + (x.gravidade === "tipo" ? " · problema reportado pelo Zabbix" : "")) + '"'
        + ">" +
        '<span class="q" style="color:' + cor + '">' + x.quantos + "</span>" +
        '<span class="r">' + MON.fmt.esc(x.rotulo) +
          (x.gravidade === "tipo" ? "<small>problema reportado pelo Zabbix</small>" : "") +
        "</span>" +
        '<span class="barra"><i style="width:' +
          Math.max(4, Math.round(x.quantos / maior * 100)) + "%;background:" + cor + '"></i></span>' +
        "</button>";
    }).join("") + "</div>";
  }

  function casaFiltro(recorte) {
    var fi = MON.estado.filtros;
    for (var k in recorte) if (fi[k] !== String(recorte[k])) return false;
    return Object.keys(recorte).length > 0;
  }

  function eventos() {
    var d = MON.estado.dados;
    var alvo = pega("eventos");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(240); return; }

    var ev = (d.eventos && d.eventos.itens) || [];
    if (!ev.length) {
      alvo.innerHTML = '<div class="estado-vazio">Nenhuma mudança nas últimas ' +
        ((d.eventos && d.eventos.janela_h) || 2) + " horas.</div>";
      return;
    }

    alvo.innerHTML = '<div class="feed">' + ev.map(function (e) {
      return '<button class="feed-item ' + (e.abriu ? "abriu" : "fechou") + '" data-host="' +
        MON.fmt.esc(e.hostid || "") + '" title="' + MON.fmt.esc(e.nome) + '">' +
        '<span class="feed-hora">' + MON.fmt.hora(e.quando) + "</span>" +
        '<span class="feed-seta">' + (e.abriu ? "▲" : "▼") + "</span>" +
        '<span class="feed-txt"><b>' + MON.fmt.esc(e.hostname) + "</b> " +
          '<span>' + (e.abriu ? "abriu" : "resolveu") + " · " +
          MON.fmt.esc(recorta(e.nome, 68)) + "</span></span>" +
        "</button>";
    }).join("") + "</div>";
  }

  function recorta(t, n) {
    t = String(t || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }

  function tabelaProjetos(lista, cabecalho, vazio) {
    if (!lista.length) return '<div class="estado-vazio">' + vazio + "</div>";
    var fi = MON.estado.filtros;
    return '<div class="tabela-caixa"><table class="tabela"><thead><tr>'
      + "<th>" + MON.fmt.esc(cabecalho) + "</th><th class='n'>Total</th>"
      + "<th class='n'>Online</th><th class='n'>Offline</th>"
      + "<th class='n'>Com problema</th><th class='n'>Críticos</th><th>Afetado</th>"
      + "</tr></thead><tbody>"
      + lista.map(function (p) {
        var cor = p.criticos ? "var(--critico)"
                : p.pct_afetado >= 50 ? "var(--alto)"
                : p.pct_afetado > 0 ? "var(--medio)" : "var(--ok)";
        return "<tr data-recorte='" + json({ projeto: p.nome }) + "'"
          + (fi.projeto === p.nome ? ' class="linha-ativa"' : "") + ">"
          + "<td><b>" + MON.fmt.esc(p.nome) + "</b></td>"
          + '<td class="n">' + p.total + "</td>"
          + '<td class="n" style="color:var(--ok)">' + p.online + "</td>"
          + '<td class="n"' + (p.offline ? ' style="color:var(--critico)"' : ' class="n vazio"') + ">"
          +   (p.offline || "—") + "</td>"
          + '<td class="n">' + (p.com_problema || "—") + "</td>"
          + '<td class="n"' + (p.criticos ? ' style="color:var(--critico);font-weight:700"' : "") + ">"
          +   (p.criticos || "—") + "</td>"
          + '<td><div class="medidor" style="justify-content:flex-start">'
          +   '<span class="barra" style="width:78px"><i style="width:' + p.pct_afetado
          +     "%;background:" + cor + '"></i></span>'
          +   '<span class="v" style="color:' + cor + '">' + MON.fmt.pct(p.pct_afetado, 0) + "</span>"
          + "</div></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function projetos() {
    var d = MON.estado.dados;
    var alvo = pega("projetos");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(280); return; }
    var lista = (d.por_projeto || []).filter(function (p) { return p.cliente; });
    alvo.innerHTML = tabelaProjetos(lista, "Projeto", "Sem projetos de cliente.");
  }

  function naoIdentificados() {
    var d = MON.estado.dados;
    var alvo = pega("nao-identificados");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(200); return; }

    var lista = (d.por_projeto || []).filter(function (p) { return !p.cliente; });
    var maqs = lista.reduce(function (a, p) { return a + p.total; }, 0);
    var total = (d.resumo || {}).total || 0;

    var nota = document.getElementById("conta-nao-id");
    if (nota) {
      nota.textContent = maqs
        ? maqs + " de " + total + " máquinas sem etiqueta de cliente"
        : "todas as máquinas estão etiquetadas";
    }
    alvo.innerHTML = tabelaProjetos(lista, "Equipamento",
      "Todo equipamento está etiquetado com um cliente.");
  }

  function recursos() {
    var d = MON.estado.dados;
    var alvo = pega("recursos");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(300); return; }

    var r = d.recursos, lim = d.limites;
    alvo.innerHTML =
      bloco("CPU", r.cpu, "%", false, { especial: "cpu" },
            "Média entre as máquinas online que reportaram CPU. Acima de " +
            MON.fmt.pct(lim.cpu_alta, 0) + " conta como alta.") +
      bloco("Memória", r.memoria, "%", false, { especial: "memoria" },
            "Média entre as máquinas online que reportaram memória. Acima de " +
            MON.fmt.pct(lim.memoria_alta, 0) + " conta como alta.") +
      bloco("Disco livre", r.disco, "%", true, { especial: "disco" },
            "Percentual livre do volume mais apertado de cada máquina — não " +
            "a média dos volumes. Abaixo de " + MON.fmt.pct(lim.disco_critico, 0) +
            " conta como crítico. O percentual é usado no lugar de GB porque " +
            "5 GB livres significam coisas diferentes num disco de 120 GB e num de 2 TB.");
  }

  function bloco(titulo, dado, sufixo, menorEhPior, recorte, explicacao) {
    if (!dado) return "";
    var cor = menorEhPior
      ? MON.fmt.corLivre(dado.media, dado.limite, dado.limite * 2)
      : MON.fmt.corUso(dado.media, dado.limite);

    var topo = (dado.top || []).slice(0, 6);
    var maior = Math.max.apply(null,
      topo.map(function (t) { return menorEhPior ? 100 - t.valor : t.valor; }).concat([1]));

    var linhas = topo.map(function (t) {
      var c = menorEhPior ? MON.fmt.corLivre(t.valor, dado.limite, dado.limite * 2)
                          : MON.fmt.corUso(t.valor, dado.limite);
      var largura = Math.max(4, Math.round((menorEhPior ? 100 - t.valor : t.valor) / maior * 100));
      return '<button class="lista-item" data-host="' + MON.fmt.esc(t.hostid) + '">' +
        '<span class="q" style="font-size:14px;color:' + c + '">' + MON.fmt.n(t.valor, 1) + sufixo + "</span>" +
        '<span class="r">' + MON.fmt.esc(t.hostname) +
          "<small>" + MON.fmt.esc(t.projeto + (t.extra ? " · volume " + t.extra : "")) + "</small></span>" +
        '<span class="barra"><i style="width:' + largura + "%;background:" + c + '"></i></span>' +
        "</button>";
    }).join("");

    var passou = dado.acima_do_limite;

    return '<div class="painel">' +
      '<div class="painel-cab"><span class="painel-tit">' + MON.fmt.esc(titulo) + "</span>" +
        '<span class="dica" style="margin-left:6px"><span class="marcador" tabindex="0">?</span>' +
          '<span class="balao">' + MON.fmt.esc(explicacao) + "</span></span>" +
        '<span class="painel-sub">' + dado.medidos + " medidas</span></div>" +
      '<div class="painel-corpo">' +
        '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px">' +
          '<span style="font-size:30px;font-weight:700;color:' + cor + '">' +
            MON.fmt.n(dado.media, 1, sufixo) + "</span>" +
          '<span style="font-size:11.5px;color:var(--txt-3)">média do parque</span>' +
          
          '<button class="botao discreto" style="margin-left:auto"' +
            (passou
              ? " data-lista='" + json(recorte) + "'"
                + ' data-lista-tit="' + MON.fmt.esc(titulo) + '"'
                + ' data-lista-sub="' + MON.fmt.esc(passou + " de "
                    + dado.medidos + " máquinas medidas · limite de "
                    + MON.fmt.n(dado.limite, 0, sufixo)) + '"'
              : " disabled") + ">" +
            (passou ? passou + (menorEhPior ? " abaixo de " : " acima de ") +
              MON.fmt.n(dado.limite, 0, sufixo) : "nenhuma no limite") +
          "</button></div>" +
        '<div class="lista">' + (linhas || '<div class="estado-vazio">Sem medida.</div>') + "</div>" +
      "</div></div>";
  }

  var TOPO_MIN = 6;
  var TOPO_MAX = 20;
  var TOPO_PADRAO = 8;

  var ajustando = false;

  function quantasCabem(alvo) {
    var linha = alvo.querySelector(".topmaq-linha");
    var rodape = alvo.querySelector(".topmaq-rodape");
    var disponivel = alvo.clientHeight;
    if (!linha || !disponivel) return TOPO_PADRAO;

    var alturaLinha = linha.getBoundingClientRect().height + 1;   // + o gap
    if (alturaLinha < 8) return TOPO_PADRAO;                      // caixa degenerada
    var alturaRodape = rodape
      ? rodape.getBoundingClientRect().height + 10
      : 30;

    var cabem = Math.floor((disponivel - alturaRodape) / alturaLinha);
    return Math.max(TOPO_MIN, Math.min(TOPO_MAX, cabem));
  }

  function topMaquinas() {
    var d = MON.estado.dados;
    var alvo = pega("topmaq");
    if (!alvo) return;
    if (!d) { alvo.innerHTML = esqueleto(200); return; }

    var vivas = (d.maquinas || []).filter(function (m) {
      return m.online && !m.sem_dados && m.cpu != null;
    });
    if (!vivas.length) {
      alvo.innerHTML = '<div class="estado-vazio">Nenhuma máquina reportando CPU agora.</div>';
      return;
    }

    var quantas = quantasCabem(alvo);
    var lista = vivas.slice().sort(function (a, b) { return b.cpu - a.cpu; })
                     .slice(0, quantas);
    var lim = MON.estado.limites();

    var SEGMENTOS = 10;
    function barra(valor, alto) {
      var cheios = Math.round(SEGMENTOS * Math.min(100, Math.max(0, valor)) / 100);
      var s = "";
      for (var i = 0; i < SEGMENTOS; i++) {
        var pct = (i + 1) * 100 / SEGMENTOS;
        var tom = !(i < cheios) ? "off"
                : pct > alto ? "critico"
                : pct > alto * 0.75 ? "alto"
                : pct > alto * 0.5 ? "medio" : "ok";
        s += '<i class="seg-' + tom + '"></i>';
      }
      return '<span class="topmaq-barra">' + s + "</span>";
    }

    var linhas = lista.map(function (m) {
      var nome = m.nome_visivel || m.hostname || m.hostid;
      var disco = m.disco_livre;
      return '<button class="topmaq-linha" data-host="' + MON.fmt.esc(m.hostid) + '"'
        + ' title="' + MON.fmt.esc("Abrir o detalhe de " + nome) + '">'
        + '<span class="topmaq-nome">' + MON.fmt.esc(nome) + "</span>"
        + barra(m.cpu, lim.cpu_alta)
        + '<span class="topmaq-v" style="color:' + MON.fmt.corUso(m.cpu, lim.cpu_alta) + '">'
        +   MON.fmt.pct(m.cpu, 1) + "</span>"
        + '<span class="topmaq-extra">RAM <b style="color:'
        +   (m.memoria == null ? "var(--txt-3)" : MON.fmt.corUso(m.memoria, lim.memoria_alta))
        +   '">' + (m.memoria == null ? "—" : MON.fmt.pct(m.memoria, 0)) + "</b></span>"
        + '<span class="topmaq-extra">Disco livre <b style="color:'
        +   (disco == null ? "var(--txt-3)" : MON.fmt.corLivre(disco, lim.disco_critico, lim.disco_atencao))
        +   '">' + (disco == null ? "—" : MON.fmt.pct(disco, 0)) + "</b></span>"
        + "</button>";
    }).join("");

    alvo.innerHTML =
      '<div class="topmaq">' + linhas
      + '<div class="topmaq-rodape">Entre as <b>' + vivas.length
      + "</b> máquinas reportando CPU agora — clique para abrir o detalhe</div>"
      + "</div>";

    if (!ajustando) {
      var agora = quantasCabem(alvo);
      if (agora !== quantas) {
        ajustando = true;
        try { topMaquinas(); } finally { ajustando = false; }
      }
    }
  }

  function esqueleto(altura) {
    return '<div class="esqueleto" style="height:' + altura + 'px"></div>';
  }

  return {
    conexao: conexao, capacidade: capacidade, resumo: resumo, atencao: atencao,
    eventos: eventos, projetos: projetos,
    naoIdentificados: naoIdentificados, recursos: recursos,
    topMaquinas: topMaquinas
  };
})();
