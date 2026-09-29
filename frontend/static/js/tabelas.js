window.MON = window.MON || {};

MON.tabelas = (function () {
  "use strict";

  var LOTE = 60;

  var ordemProblemas = { coluna: "severidade", desc: true };
  var ordemHosts = { coluna: "prioridade", desc: true };
  var limiteProblemas = LOTE;
  var limiteHosts = LOTE;

  function pega(id) { return document.getElementById(id); }

  function comparar(a, b, coluna, desc) {
    var va = a[coluna], vb = b[coluna];
    var s = desc ? -1 : 1;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;          // sem dado sempre por ultimo
    if (vb == null) return -1;
    if (typeof va === "string") return va.localeCompare(vb) * s;
    return (va - vb) * s;
  }

  function cabecalho(colunas, ordem, alvoId) {
    return colunas.map(function (c) {
      var seta = ordem.coluna === c.campo ? (ordem.desc ? " ▼" : " ▲") : "";
      return '<th class="' + (c.n ? "n" : "") + '" data-ordenar="' + c.campo +
        '" data-tabela="' + alvoId + '" title="Ordenar por ' + MON.fmt.esc(c.rotulo) + '">' +
        MON.fmt.esc(c.rotulo) + '<span class="ord">' + seta + "</span></th>";
    }).join("");
  }

  var COL_PROBLEMAS = [
    { campo: "severidade", rotulo: "Severidade" },
    { campo: "hostname", rotulo: "Máquina" },
    { campo: "nome", rotulo: "Problema" },
    { campo: "escopo", rotulo: "Escopo" },
    { campo: "inicio", rotulo: "Início" },
    { campo: "duracao", rotulo: "Duração", n: true },
    { campo: "reconhecido", rotulo: "Situação" }
  ];

  function problemas() {
    var alvo = pega("tabela-problemas");
    var contador = pega("conta-problemas");
    var d = MON.estado.dados;

    if (!alvo) return;
    if (!d) { alvo.innerHTML = '<div class="esqueleto" style="height:300px"></div>'; return; }

    var lista = MON.estado.problemas().slice();
    lista.sort(function (a, b) { return comparar(a, b, ordemProblemas.coluna, ordemProblemas.desc); });

    if (contador) {
      contador.textContent = lista.length === 1 ? "1 problema"
        : MON.fmt.inteiro(lista.length) + " problemas";
    }

    if (!lista.length) {
      alvo.innerHTML = '<div class="estado-vazio">' +
        (MON.estado.filtroAtivo()
          ? "Nenhum problema corresponde aos filtros."
          : "Nenhum problema aberto. O parque está limpo.") + "</div>";
      return;
    }

    var visiveis = lista.slice(0, limiteProblemas);

    alvo.innerHTML =
      '<div class="tabela-caixa"><table class="tabela"><thead><tr>' +
        cabecalho(COL_PROBLEMAS, ordemProblemas, "problemas") +
      "</tr></thead><tbody>" +
      visiveis.map(function (p) {
        return '<tr data-host="' + MON.fmt.esc(p.hostid) + '">' +
          "<td>" + MON.fmt.seloSeveridade(p.severidade) + "</td>" +
          '<td><span class="host-nome">' + MON.fmt.esc(p.hostname) + "</span>" +
            '<div class="host-ip">' + MON.fmt.esc(p.projeto) + "</div></td>" +
          '<td title="' + MON.fmt.esc(p.nome) + '">' + MON.fmt.esc(corta(p.nome, 90)) +
            (p.opdata ? '<div class="host-ip">' + MON.fmt.esc(p.opdata) + "</div>" : "") + "</td>" +
          "<td>" + MON.fmt.esc(MON.fmt.nomeEscopo(p.escopo)) + "</td>" +
          "<td>" + MON.fmt.dataHora(p.inicio) + "</td>" +
          '<td class="n">' + MON.fmt.duracao(p.duracao) + "</td>" +
          "<td>" + situacao(p) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (lista.length > limiteProblemas
        ? '<button class="mais" data-mais="problemas">Mostrar mais ' +
          Math.min(LOTE, lista.length - limiteProblemas) + " de " +
          MON.fmt.inteiro(lista.length - limiteProblemas) + " restantes</button>"
        : "");
  }

  function situacao(p) {
    if (p.suprimido) return '<span class="selo selo-neutro">Suprimido</span>';
    if (p.reconhecido) return '<span class="selo selo-marca">Reconhecido</span>';
    return '<span class="selo selo-morno">Em aberto</span>';
  }

  function corta(t, n) {
    t = String(t || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }

  var COL_HOSTS = [
    { campo: "prioridade", rotulo: "!", n: true },
    { campo: "hostname", rotulo: "Máquina" },
    { campo: "projeto", rotulo: "Projeto" },
    { campo: "online", rotulo: "Estado" },
    { campo: "cpu", rotulo: "CPU", n: true },
    { campo: "memoria", rotulo: "Memória", n: true },
    { campo: "disco_livre", rotulo: "Disco livre", n: true },
    { campo: "problemas", rotulo: "Problemas", n: true },
    { campo: "uptime", rotulo: "Ligada há", n: true },
    { campo: "visto_em", rotulo: "Último dado", n: true }
  ];

  function hosts() {
    var alvo = pega("tabela-hosts");
    var contador = pega("conta-hosts");
    var d = MON.estado.dados;

    if (!alvo) return;
    if (!d) { alvo.innerHTML = '<div class="esqueleto" style="height:400px"></div>'; return; }

    var lim = MON.estado.limites();
    var lista = MON.estado.maquinas().slice();
    lista.sort(function (a, b) { return comparar(a, b, ordemHosts.coluna, ordemHosts.desc); });

    if (contador) {
      contador.textContent = lista.length === 1 ? "1 máquina"
        : MON.fmt.inteiro(lista.length) + " máquinas";
    }

    if (!lista.length) {
      alvo.innerHTML = '<div class="estado-vazio">Nenhuma máquina corresponde aos filtros.</div>';
      return;
    }

    var visiveis = lista.slice(0, limiteHosts);

    alvo.innerHTML =
      '<div class="tabela-caixa"><table class="tabela"><thead><tr>' +
        cabecalho(COL_HOSTS, ordemHosts, "hosts") +
      "</tr></thead><tbody>" +
      visiveis.map(function (m) {
        return '<tr data-host="' + MON.fmt.esc(m.hostid) + '" title="Abrir detalhe de ' +
            MON.fmt.esc(m.hostname) + '">' +
          '<td class="n">' + marcador(m) + "</td>" +
          '<td><span class="host-nome">' + MON.fmt.esc(m.hostname) + "</span>" +
            (m.ip ? '<div class="host-ip">' + MON.fmt.esc(m.ip) + "</div>" : "") + "</td>" +
          "<td>" + MON.fmt.esc(m.projeto) + "</td>" +
          "<td>" + estadoSelo(m) + "</td>" +
          '<td class="n">' + medidor(m.cpu, MON.fmt.corUso(m.cpu, lim.cpu_alta)) + "</td>" +
          '<td class="n">' + medidor(m.memoria, MON.fmt.corUso(m.memoria, lim.memoria_alta)) + "</td>" +
          '<td class="n">' + medidor(m.disco_livre,
              MON.fmt.corLivre(m.disco_livre, lim.disco_critico, lim.disco_atencao),
              m.disco_volume) + "</td>" +
          '<td class="n">' + problemasSelo(m) + "</td>" +
          '<td class="n' + (m.online ? "" : " vazio") + '">' +
            (m.online ? MON.fmt.duracao(m.uptime) : "—") + "</td>" +
          '<td class="n' + (m.sem_dados ? "" : " vazio") + '"' +
            (m.sem_dados ? ' style="color:var(--medio)"' : "") + ">" +
            MON.fmt.desde(m.visto_em) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (lista.length > limiteHosts
        ? '<button class="mais" data-mais="hosts">Mostrar mais ' +
          Math.min(LOTE, lista.length - limiteHosts) + " de " +
          MON.fmt.inteiro(lista.length - limiteHosts) + " restantes</button>"
        : "");
  }

  function marcador(m) {
    
    if (!m.online) return '<span style="color:var(--txt-3)" title="Offline">◆</span>';
    if (m.pior_severidade >= 4) return '<span style="color:var(--alto)" title="Problema crítico">▲</span>';
    if (m.sem_dados) return '<span style="color:var(--medio)" title="Sem medição recente">■</span>';
    if (m.problemas) return '<span style="color:var(--medio)" title="Com problema">●</span>';
    return '<span style="color:var(--ok)" title="Sem pendência">·</span>';
  }

  function estadoSelo(m) {
    if (!m.online) return '<span class="selo selo-off">Offline</span>';
    if (m.sem_dados) return '<span class="selo selo-morno">Sem dado</span>';
    return '<span class="selo selo-ok">Online</span>';
  }

  function problemasSelo(m) {
    var p = [];
    if (m.problemas) {
      p.push('<span class="selo sev-' + Math.max(0, m.pior_severidade) + '">' + m.problemas + "</span>");
    }
    if (m.problemas_ruido) {
      p.push('<span class="selo selo-ruido" title="classificados como ruído">' +
             m.problemas_ruido + "</span>");
    }
    return p.length ? p.join(" ") : '<span class="vazio">—</span>';
  }

  function medidor(v, cor, extra) {
    if (v == null) return '<span class="vazio">—</span>';
    return '<div class="medidor"' + (extra ? ' title="volume ' + MON.fmt.esc(extra) + '"' : "") + ">" +
      '<span class="barra"><i style="width:' + Math.min(100, v) + "%;background:" + cor + '"></i></span>' +
      '<span class="v" style="color:' + cor + '">' + MON.fmt.pct(v, 1) + "</span></div>";
  }

  function ordenar(tabela, campo) {
    var o = tabela === "problemas" ? ordemProblemas : ordemHosts;
    if (o.coluna === campo) { o.desc = !o.desc; }
    else {
      o.coluna = campo;
      // texto comeca crescente; numero e data comecam decrescente, porque o
      // que interessa primeiro e sempre o maior
      o.desc = ["hostname", "projeto", "nome", "escopo"].indexOf(campo) === -1;
    }
    if (tabela === "problemas") { limiteProblemas = LOTE; problemas(); }
    else { limiteHosts = LOTE; hosts(); }
  }

  function mais(tabela) {
    if (tabela === "problemas") { limiteProblemas += LOTE; problemas(); }
    else { limiteHosts += LOTE; hosts(); }
  }

  function reiniciarLotes() { limiteProblemas = LOTE; limiteHosts = LOTE; }

  return {
    problemas: problemas, hosts: hosts,
    ordenar: ordenar, mais: mais, reiniciarLotes: reiniciarLotes
  };
})();
