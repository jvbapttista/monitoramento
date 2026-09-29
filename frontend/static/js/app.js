(function () {
  "use strict";

  var agendado = null;

  function redesenhar() {
    if (agendado) return;
    agendado = setTimeout(function () {
      agendado = null;
      try { pintar(); }
      catch (e) { console.error("falha ao desenhar:", e); }
    }, 16);
  }

  var jaAvisado = {};

  function seguro(nome, fn) {
    try { fn(); }
    catch (e) {
      if (!jaAvisado[nome]) {
        jaAvisado[nome] = true;
        console.warn("[monitoramento] painel \"" + nome + "\" nao desenhou:", e && e.message);
      }
    }
  }

  function pintar() {
    seguro("conexao", MON.paineis.conexao);
    seguro("aviso", pintarAviso);
    seguro("vista", MON.vistas.desenhar);
    seguro("capacidade", MON.paineis.capacidade);
    seguro("kpis", MON.paineis.resumo);
    seguro("atencao", MON.paineis.atencao);
    seguro("eventos", MON.paineis.eventos);
    
    seguro("recursos", MON.paineis.recursos);
    seguro("topmaq", MON.paineis.topMaquinas);
    seguro("problemas", MON.tabelas.problemas);
    seguro("hosts", MON.tabelas.hosts);
    seguro("chips", chips);
    seguro("seletores", seletores);
    seguro("nota-ruido", notaRuido);
  }

  function pintarAviso() {
    var aviso = document.getElementById("aviso");
    if (!aviso) return;
    if (MON.estado.erro && !MON.estado.dados) {
      aviso.innerHTML = '<div class="estado-erro"><b>Não foi possível obter os dados do Zabbix</b>' +
        "Nenhum número é exibido porque nenhum foi lido — a tela não mostra zero no lugar de " +
        "informação ausente.<code>" + MON.fmt.esc(MON.estado.erro) + "</code></div>";
    } else if (MON.estado.erro) {
      
      aviso.innerHTML = '<div class="estado-erro estado-aviso">' +
        "<b>Exibindo a última leitura conhecida</b>A comunicação com o Zabbix falhou; " +
        "os números abaixo são de antes da falha.<code>" + MON.fmt.esc(MON.estado.erro) + "</code></div>";
    } else {
      aviso.innerHTML = "";
    }
  }

  function chips() {
    var alvo = document.getElementById("chips");
    if (!alvo) return;
    var lista = MON.estado.ativos();
    if (!lista.length) { alvo.innerHTML = ""; return; }

    alvo.innerHTML =
      '<span style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--txt-3)">Filtros</span>' +
      lista.map(function (a) {
        return '<span class="chip">' + MON.fmt.esc(a.rotulo) + ": <b>" + MON.fmt.esc(a.valor) + "</b>" +
          '<button data-remover="' + a.campo + '" aria-label="Remover filtro">&times;</button></span>';
      }).join("") +
      '<button class="botao discreto" data-limpar="1">Limpar filtros</button>';
  }

  function seletores() {
    var d = MON.estado.dados;
    if (!d) return;
    var f = MON.estado.filtros;

    encher("f-projeto", "Todos os projetos",
      (d.por_projeto || []).map(function (p) {
        return { v: p.nome, t: p.nome + " (" + p.total + ")" };
      }), f.projeto);

    encher("f-grupo", "Todos os grupos",
      (d.por_grupo || []).map(function (g) {
        return { v: g.nome, t: g.nome + " (" + g.total + ")" };
      }), f.grupo);

    encher("f-severidade", "Qualquer severidade",
      [5, 4, 3, 2, 1].map(function (n) {
        return { v: String(n), t: MON.fmt.nomeSeveridade(n) + " ou pior" };
      }), f.severidade);

    var escopos = (d.por_escopo || []).map(function (e) { return e.nome; });
    (d.escopos_ruido || []).forEach(function (r) {
      if (escopos.indexOf(r) === -1) escopos.push(r);
    });
    encher("f-escopo", "Todos os escopos",
      escopos.map(function (n) { return { v: n, t: MON.fmt.nomeEscopo(n) }; }), f.escopo);

    encher("f-especial", "Sem recorte",
      Object.keys(MON.estado.ESPECIAL).map(function (k) {
        return { v: k, t: MON.estado.ESPECIAL[k] };
      }), f.especial);

    var status = document.getElementById("f-status");
    if (status) status.value = f.status;
  }

  function encher(id, vazio, opcoes, valor) {
    var el = document.getElementById(id);
    if (!el) {
      // Apagar um bloco de proposito pode falhar em silencio; renomear um
      // controle por engano nao. O nome do filtro sai do proprio id (o
      // prefixo "f-" e removido), entao um id trocado quebra sem sintoma.
      if (!jaAvisado["select:" + id]) {
        jaAvisado["select:" + id] = true;
        console.warn('[monitoramento] select "' + id + '" nao existe - o filtro ' +
                     'correspondente ficou sem opcoes. Se voce renomeou o id, ' +
                     'o prefixo "f-" precisa ser mantido.');
      }
      return;
    }
    var novo = '<option value="">' + MON.fmt.esc(vazio) + "</option>" +
      opcoes.map(function (o) {
        return '<option value="' + MON.fmt.esc(o.v) + '">' + MON.fmt.esc(o.t) + "</option>";
      }).join("");
    if (el.innerHTML !== novo) el.innerHTML = novo;
    el.value = valor || "";
  }

  function notaRuido() {
    var d = MON.estado.dados;
    var alvo = document.getElementById("nota-ruido");
    if (!alvo || !d) return;
    var deOff = d.resumo.problemas_de_offline || 0;
    if (!d || (!d.resumo.problemas_ruido && !deOff)) { alvo.innerHTML = ""; return; }

    var texto = "Exibindo <b>" + MON.fmt.inteiro(d.resumo.problemas) +
      "</b> problemas relevantes.";

    if (deOff) {
      texto += " Outros <b>" + MON.fmt.inteiro(deOff) +
        "</b> estão em máquinas desligadas e não contam como problema — " +
        "quase todos são o próprio Zabbix avisando que o agente parou de " +
        "responder, que é o que acontece quando alguém desliga o computador.";
    }

    if (d.resumo.problemas_ruido) {
      texto += " Outros <b>" + MON.fmt.inteiro(d.resumo.problemas_ruido) +
        "</b> foram classificados como ruído pela tag <i>scope=" +
        MON.fmt.esc(d.escopos_ruido.join(", ")) +
        "</i> do próprio Zabbix — quase todos são serviços do Windows que " +
        "sobem sob demanda. " +
        '<button class="botao discreto" data-recorte=\'' +
        MON.fmt.esc(JSON.stringify({ escopo: d.escopos_ruido[0] })) +
        "'>ver o ruído</button>";
    }

    alvo.innerHTML = texto;
  }

  var buscaTimer = null;
  var marcada = -1;

  function sugerir() {
    var campo = document.getElementById("busca");
    var caixa = document.getElementById("sugestoes");
    var termo = campo.value.trim().toLowerCase();
    var d = MON.estado.dados;

    if (!termo || !d) { caixa.innerHTML = ""; caixa.style.display = "none"; return; }

    var achados = [];

    d.maquinas.forEach(function (m) {
      if (achados.length >= 24) return;
      if ((m.hostname + " " + m.ip + " " + (m.sistema || "")).toLowerCase().indexOf(termo) !== -1) {
        achados.push({
          tipo: "maquina", alvo: m.hostname,
          meta: m.projeto + (m.ip ? " · " + m.ip : ""), host: m.hostid
        });
      }
    });

    (d.por_projeto || []).forEach(function (p) {
      if (p.nome.toLowerCase().indexOf(termo) !== -1) {
        achados.push({ tipo: "projeto", alvo: p.nome, meta: p.total + " maquinas",
                       recorte: { projeto: p.nome } });
      }
    });

    (d.por_grupo || []).forEach(function (g) {
      if (g.nome.toLowerCase().indexOf(termo) !== -1) {
        achados.push({ tipo: "grupo", alvo: g.nome, meta: g.total + " maquinas",
                       recorte: { grupo: g.nome } });
      }
    });

    var vistos = {};
    d.problemas.forEach(function (p) {
      if (vistos[p.nome] || achados.length >= 32) return;
      if (p.nome.toLowerCase().indexOf(termo) !== -1) {
        vistos[p.nome] = true;
        achados.push({ tipo: "problema", alvo: p.nome, meta: "", recorte: { problema: p.nome } });
      }
    });

    if (!achados.length) {
      caixa.innerHTML = '<div class="estado-vazio" style="padding:18px">Nada encontrado para ' +
        MON.fmt.esc(campo.value) + ".</div>";
      caixa.style.display = "block";
      return;
    }

    marcada = -1;
    caixa.innerHTML = achados.slice(0, 12).map(function (a, i) {
      return '<button class="sugestao" data-indice="' + i + '"' +
        (a.host ? ' data-host="' + MON.fmt.esc(a.host) + '"' : "") +
        (a.recorte ? " data-recorte='" + MON.fmt.esc(JSON.stringify(a.recorte)) + "'" : "") +
        '><span class="tipo">' + a.tipo + "</span>" +
        '<span class="alvo">' + MON.fmt.esc(a.alvo) + "</span>" +
        '<span class="meta">' + MON.fmt.esc(a.meta) + "</span></button>";
    }).join("");
    caixa.style.display = "block";
  }

  function fecharSugestoes() {
    var caixa = document.getElementById("sugestoes");
    caixa.innerHTML = "";
    caixa.style.display = "none";
    marcada = -1;
  }

  function moverMarca(passo) {
    var itens = document.querySelectorAll("#sugestoes .sugestao");
    if (!itens.length) return;
    if (marcada >= 0) itens[marcada].classList.remove("marcada");
    marcada = (marcada + passo + itens.length) % itens.length;
    itens[marcada].classList.add("marcada");
    itens[marcada].scrollIntoView({ block: "nearest" });
  }

  function aplicarRecorte(texto, fecharModal) {
    var recorte;
    try { recorte = JSON.parse(texto); }
    catch (e) { return; }
    if (fecharModal) MON.detalhe.fechar();
    MON.tabelas.reiniciarLotes();
    MON.estado.aplicar(recorte);
  }

  document.addEventListener("click", function (ev) {
    var alvo = ev.target;

    var fundo = alvo.closest ? alvo.closest("[data-fundo]") : null;
    if (fundo && alvo === fundo) { MON.detalhe.fechar(); return; }

    var el = alvo.closest ? alvo.closest("[data-recorte],[data-host],[data-ordenar]," +
      "[data-mais],[data-remover],[data-limpar],[data-fechar],[data-recarregar]," +
      "[data-recolher],[data-lista]") : null;
    if (!el) { if (!alvo.closest("#busca-caixa")) fecharSugestoes(); return; }

    if (el.hasAttribute("data-lista")) {
      var recorte = null;
      try { recorte = JSON.parse(el.getAttribute("data-lista")); } catch (e) { recorte = null; }
      if (recorte) {
        MON.detalhe.listar(el.getAttribute("data-lista-tit") || "Máquinas",
                          el.getAttribute("data-lista-sub") || "", recorte);
      }
      return;
    }

    if (el.hasAttribute("data-recolher")) {
      alternarSecao(el.getAttribute("data-recolher"));
      return;
    }

    if (el.hasAttribute("data-fechar")) { MON.detalhe.fechar(); return; }

    if (el.hasAttribute("data-recarregar")) {
      var id = MON.detalhe.idAberto();
      if (id) MON.detalhe.abrir(id);
      return;
    }

    if (el.hasAttribute("data-limpar")) {
      MON.tabelas.reiniciarLotes();
      document.getElementById("busca").value = "";
      MON.estado.limpar();
      return;
    }

    if (el.hasAttribute("data-remover")) {
      var campo = el.getAttribute("data-remover");
      if (campo === "busca") document.getElementById("busca").value = "";
      MON.tabelas.reiniciarLotes();
      MON.estado.remover(campo);
      return;
    }

    if (el.hasAttribute("data-ordenar")) {
      MON.tabelas.ordenar(el.getAttribute("data-tabela"), el.getAttribute("data-ordenar"));
      return;
    }

    if (el.hasAttribute("data-mais")) { MON.tabelas.mais(el.getAttribute("data-mais")); return; }

    if (el.hasAttribute("data-host") && el.getAttribute("data-host")) {
      fecharSugestoes();
      document.getElementById("busca").value = "";
      MON.detalhe.abrir(el.getAttribute("data-host"));
      return;
    }

    if (el.hasAttribute("data-recorte")) {
      fecharSugestoes();
      aplicarRecorte(el.getAttribute("data-recorte"), el.hasAttribute("data-fecha-antes"));
    }
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el.id || el.id.indexOf("f-") !== 0) return;
    MON.tabelas.reiniciarLotes();
    MON.estado.definir(el.id.slice(2), el.value);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if (document.querySelector("#sugestoes .sugestao")) { fecharSugestoes(); return; }
      if (MON.detalhe.estaAberto()) { MON.detalhe.fechar(); return; }
      if (MON.estado.filtroAtivo()) {
        document.getElementById("busca").value = "";
        MON.estado.limpar();
      }
      return;
    }

    if ((ev.key === "r" || ev.key === "R")
        && !ev.ctrlKey && !ev.metaKey && !ev.altKey
        && document.activeElement.tagName !== "INPUT"
        && document.activeElement.tagName !== "SELECT"
        && MON.detalhe.estaAberto()) {
      var aberto = MON.detalhe.idAberto();
      if (aberto) {
        ev.preventDefault();
        var bt = document.querySelector(".modal-atualizar");
        if (bt) { bt.classList.add("ocupado"); bt.disabled = true; }
        MON.detalhe.abrir(aberto);
        return;
      }
    }

    if (ev.key === "/" && document.activeElement.tagName !== "INPUT") {
      ev.preventDefault();
      document.getElementById("busca").focus();
      return;
    }

    if (document.activeElement.id === "busca") {
      if (ev.key === "ArrowDown") { ev.preventDefault(); moverMarca(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); moverMarca(-1); }
      else if (ev.key === "Enter") {
        var itens = document.querySelectorAll("#sugestoes .sugestao");
        if (marcada >= 0 && itens[marcada]) { ev.preventDefault(); itens[marcada].click(); }
        else {
          MON.tabelas.reiniciarLotes();
          MON.estado.definir("busca", document.getElementById("busca").value.trim());
          fecharSugestoes();
        }
      }
    }
  });

  function ao(id, evento, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(evento, fn);
    else console.warn("[monitoramento] elemento \"" + id + "\" nao existe no HTML");
  }

  ao("busca", "input", function () {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(sugerir, 120);
  });

  var girandoAte = 0;
  var carimboAoClicar = null;   // gerado_em do payload no instante do clique
  var giroDesde = 0;

  function pararGiro() {
    var bt = document.getElementById("bt-atualizar");
    if (bt) bt.classList.remove("ocupado");
    girandoAte = 0;
    carimboAoClicar = null;
  }

  function atualizarAgora() {
    var bt = document.getElementById("bt-atualizar");
    if (!bt || bt.classList.contains("ocupado")) return;
    bt.classList.add("ocupado");
    girandoAte = Date.now() + 12000;
    giroDesde = Date.now();
    
    carimboAoClicar = (MON.estado.dados || {}).gerado_em || 0;

    fetch("/api/atualizar", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Monitoramento": "1" }
    }).catch(function () { pararGiro(); });

    setTimeout(function () { if (girandoAte && Date.now() >= girandoAte) pararGiro(); },
               12200);
  }

  MON.estado.observar(function () {
    if (!girandoAte) return;
    var agora = (MON.estado.dados || {}).gerado_em || 0;
    if (agora === carimboAoClicar) return;
    var falta = 600 - (Date.now() - giroDesde);
    if (falta > 0) setTimeout(pararGiro, falta);
    else pararGiro();
  });

  ao("bt-atualizar", "click", atualizarAgora);

  ao("bt-noc", "click", function () {
    document.body.classList.toggle("noc");
    this.classList.toggle("on");
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "r" && ev.key !== "R") return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"
              || a.isContentEditable)) return;
    if (MON.detalhe.estaAberto()) return;   
    ev.preventDefault();
    atualizarAgora();
  });

  ao("bt-tela", "click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });

  (function () {
    
    var logos = [].slice.call(document.querySelectorAll(".marca img"));
    if (!logos.length) return;
    var trocado = false;
    function trocar() {
      if (trocado || !logos[0].parentNode) return;
      trocado = true;
      
      logos.forEach(function (l) {
        if (l.parentNode) l.parentNode.removeChild(l);
      });
    }
    logos.forEach(function (l) {
      l.addEventListener("error", trocar);
      
      if (l.complete && l.naturalWidth === 0) trocar();
    });
  }());

  var CHAVE_RECOLHIDAS = "monitoramento:secoes-recolhidas";

  function lerRecolhidas() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_RECOLHIDAS) || "[]") || [];
    } catch (e) { return []; }
  }

  function gravarRecolhidas(lista) {
    try { localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify(lista)); }
    catch (e) {  }
  }

  function pintarSecao(secao, recolhida) {
    secao.classList.toggle("recolhida", recolhida);
    var bt = secao.querySelector("[data-recolher]");
    if (bt) {
      bt.setAttribute("aria-expanded", recolhida ? "false" : "true");
      bt.setAttribute("title", recolhida ? "Expandir esta seção" : "Recolher esta seção");
    }
  }

  function alternarSecao(chave) {
    var secao = document.querySelector('[data-secao="' + chave + '"]');
    if (!secao) return;
    var recolhida = !secao.classList.contains("recolhida");
    pintarSecao(secao, recolhida);

    var lista = lerRecolhidas().filter(function (k) { return k !== chave; });
    if (recolhida) lista.push(chave);
    gravarRecolhidas(lista);
  }

  function restaurarSecoes() {
    var lista = lerRecolhidas();
    [].forEach.call(document.querySelectorAll("[data-secao]"), function (secao) {
      pintarSecao(secao, lista.indexOf(secao.getAttribute("data-secao")) >= 0);
    });
  }

  window.addEventListener("hashchange", function () { MON.vistas.sincronizar(); });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-limpar-campo]") : null;
    if (!b) return;
    ev.preventDefault();
    var campo = document.getElementById(b.getAttribute("data-limpar-campo"));
    if (!campo) return;
    campo.value = "";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.focus();
  });

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest
      ? ev.target.closest('[data-vista="null"],[data-inicio]') : null;
    if (!a) return;
    ev.preventDefault();
    if (location.hash) location.hash = "";
    else MON.vistas.sincronizar();
  });

  var ICONE_CONTA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9.2"/>'
    + '<circle cx="12" cy="9.6" r="3.1"/>'
    + '<path d="M6.2 19.2a6.2 6.2 0 0 1 11.6 0"/></svg>';

  function pintarUsuario(u) {
    var alvo = document.getElementById("usuario");
    if (!alvo || !u || !u.usuario) return;

    alvo.innerHTML =
      '<button class="conta-botao" id="conta-botao" aria-haspopup="menu"'
      +   ' aria-expanded="false" aria-label="Conta de ' + MON.fmt.esc(u.usuario) + '"'
      +   ' title="' + MON.fmt.esc(u.usuario) + '">' + ICONE_CONTA + "</button>"
      + '<div class="conta-menu" id="conta-menu" role="menu" hidden>'
      +   '<div class="conta-cab">'
      +     '<span class="conta-nome">' + MON.fmt.esc(u.usuario) + "</span>"
      +     '<span class="conta-papel' + (u.master ? " e-master" : "") + '">'
      +       (u.master ? "Master" : "Usuário") + "</span>"
      +   "</div>"
      
      +   (u.master
            ? '<a class="conta-item" role="menuitem" href="#/usuarios" data-vista="USUARIOS">'
              + "Usuários</a>"
            : "")
      +   '<a class="conta-item" role="menuitem" href="/trocar-senha">Trocar senha</a>'
      
      +   '<a class="conta-item conta-sair" role="menuitem" href="/sair">Sair</a>'
      + "</div>";

    ligarMenuConta();
    if (u.master && u.dados_pessoais) mostrarAcessos();
    MON.demo = !!u.demo;
    MON.paineis.conexao();
    var avisoDemo = document.getElementById('demo-aviso');
    if (avisoDemo) avisoDemo.hidden = !u.demo;
  }

  var ICONE_ACESSOS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="9" cy="8.5" r="3.3"/>'
    + '<path d="M3.2 19a5.8 5.8 0 0 1 11.6 0"/>'
    + '<path d="M17 8.5h4M17 12h4M17 15.5h3"/></svg>';

  function mostrarAcessos() {
    var nav = document.querySelector(".topo-vistas");
    if (!nav || document.querySelector('[data-vista="ACESSOS"]')) return;
    var a = document.createElement("a");
    a.className = "botao botao-vista";
    a.href = "#/acessos";
    a.setAttribute("data-vista", "ACESSOS");
    a.setAttribute("title", "Quem está logado em cada máquina");
    a.innerHTML = ICONE_ACESSOS + ' <span class="rot">Acessos</span>';
    nav.appendChild(a);
    MON.vistas.sincronizar();
  }

  function fecharMenuConta() {
    var m = document.getElementById("conta-menu");
    var b = document.getElementById("conta-botao");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function ligarMenuConta() {
    var b = document.getElementById("conta-botao");
    var m = document.getElementById("conta-menu");
    if (!b || !m) return;

    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var abrindo = m.hidden;
      m.hidden = !abrindo;
      b.setAttribute("aria-expanded", abrindo ? "true" : "false");
    });

    m.addEventListener("click", function () { setTimeout(fecharMenuConta, 0); });
    document.addEventListener("click", fecharMenuConta);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") fecharMenuConta();
    });
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-acao="tour"]') : null;
    if (!b || !MON.tour) return;
    ev.preventDefault();
    
    setTimeout(MON.tour.abrir, 30);
  });

  fetch("/api/eu", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(pintarUsuario)
    .catch(function () {  });

  if (MON.usuarios) MON.usuarios.ligarCliques();
  if (MON.acessos) MON.acessos.ligarCliques();
  if (MON.mapa) MON.mapa.ligar();
  if (MON.relatorios) MON.relatorios.ligar();
  if (MON.aplicativos) MON.aplicativos.ligar();
  
  if (MON.pulso) MON.pulso.iniciar();
  if (MON.painelRede) MON.painelRede.iniciar();
  restaurarSecoes();
  MON.vistas.sincronizar();
  MON.estado.observar(redesenhar);
  redesenhar();
  
  if (MON.tour) MON.tour.armar();
  MON.fluxo.iniciar();
})();
