window.MON = window.MON || {};

MON.acessos = (function () {
  "use strict";

  var dados = null;
  var carregando = false;
  var erro = null;
  var aba = "agora";        // "agora" | "historico"
  var filtro = "";
  var dias = 7;
  
  var recorte = null;
  
  var projeto = "";
  
  var paradoMin = "";
  
  var abertos = {};

  function esc(t) { return MON.fmt.esc(t == null ? "" : String(t)); }

  function buscar(forcar) {
    if (carregando) return;
    if (dados && !forcar) return;
    carregando = true;
    erro = null;
    pintar();

    fetch("/api/acessos?dias=" + dias, { credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 403) throw new Error("Só um master pode ver esta aba.");
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

  function desdeQuando(ts, agora) {
    if (!ts) return "—";
    var h = (agora - ts) / 3600;
    if (h < 1) return "há " + Math.max(1, Math.round(h * 60)) + " min";
    if (h < 24) return "há " + h.toFixed(1).replace(".", ",") + " h";
    return "há " + Math.floor(h / 24) + " d";
  }

  function relogio(ts) {
    if (!ts) return "—";
    var d = new Date(ts * 1000);
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " "
         + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  var ICONES = {
    pessoa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c1-4.2 4-6.4 7-6.4s6 2.2 7 6.4"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>'
  };

  function cartoes(r) {
    return '<div class="grade g-kpi acessos-resumo">'
      + cartao("Com usuário", ICONES.pessoa, r.com_usuario, "ok", "com_usuario")
      + cartao("Ligada, sem logon", ICONES.monitor, r.sem_logon, "", "sem_logon")
      + cartao("Sem contato", ICONES.x, r.sem_contato, "apagado", "sem_contato")
      
      + cartao("Pessoas distintas", ICONES.pessoa, r.pessoas, "", null)
      + "</div>";
  }

  function cartao(rotulo, icone, valor, tom, recorteDoCartao) {
    var ativo = recorteDoCartao && recorte === recorteDoCartao;
    var classe = "kpi" + (tom ? " kpi-" + tom : "")
               + (recorteDoCartao ? " kpi-clicavel" : "")
               + (ativo ? " kpi-ativo" : "");
    
    var atrTom = tom === "ok" ? ' data-tom="ok"' : "";
    var miolo = '<div class="kpi-rotulo"><span class="kpi-ico">' + icone + "</span>"
              +   esc(rotulo) + "</div>"
              + '<div class="kpi-valor">' + esc(valor) + "</div>"
              + (ativo ? '<div class="kpi-limpar">clique para limpar</div>' : "");
    if (!recorteDoCartao) return '<div class="' + classe + '">' + miolo + "</div>";
    return '<button type="button" class="' + classe + '"' + atrTom
      + ' data-ac-recorte="' + recorteDoCartao + '"'
      + ' aria-pressed="' + (ativo ? "true" : "false") + '">'
      + miolo + "</button>";
  }

  function linhaMaquina(m, agora) {
    var quem, classe;
    if (m.estado === "com_usuario") {
      quem = '<span class="ac-usuario">' + esc(m.usuario) + "</span>"
           + (m.dominio ? '<span class="ac-dominio">' + esc(m.dominio) + "</span>" : "");
      classe = "";
    } else if (m.estado === "sem_logon") {
      quem = '<span class="ac-vazio">Nenhum logon no momento</span>';
      classe = " ac-linha-vazia";
    } else {
      quem = '<span class="ac-calado">Sem contato com o agente</span>';
      classe = " ac-linha-calada";
    }
    
    var ligada = m.estado === "com_usuario" || m.estado === "sem_logon";
    var ponto = '<span class="ac-ponto ' + (ligada ? "ligada" : "desligada")
      + '" title="' + (ligada ? "Ligada" : "Sem contato")
      + '" aria-hidden="true"></span>';

    return '<tr class="clicavel' + classe + '" data-host="' + esc(m.hostid) + '">'
      + "<td>" + ponto + "<b>" + esc(m.hostname) + "</b></td>"
      + "<td>" + quem + "</td>"
      + '<td class="num">'
      + (m.estado === "com_usuario" ? esc(desdeQuando(m.desde, agora)) : "—")
      + "</td>"
      + "<td>" + esc(m.projeto_nome || "—") + "</td></tr>";
  }

  function tabelaAgora(d) {
    var termo = filtro.trim().toLowerCase();
    var lista = d.maquinas.filter(function (m) {
      if (projeto && m.filtro !== projeto) return false;
      if (recorte && m.estado !== recorte) return false;
      
      if (paradoMin) {
        if (!m.visto_em) return false;
        if ((d.coletado_em - m.visto_em) < parseInt(paradoMin, 10) * 86400) return false;
      }
      if (!termo) return true;
      return (m.hostname || "").toLowerCase().indexOf(termo) >= 0
          || (m.usuario || "").toLowerCase().indexOf(termo) >= 0
          || (m.projeto || "").toLowerCase().indexOf(termo) >= 0;
    });
    if (!lista.length) {
      return '<div class="vazio">Nenhuma máquina neste recorte'
           + (filtro ? " para “" + esc(filtro) + "”" : "") + ".</div>";
    }
    return '<table class="tabela"><thead><tr>'
      + "<th>Máquina</th><th>Usuário no console</th>"
      + '<th class="num">Desde</th><th>Projeto</th>'
      + "</tr></thead><tbody>"
      + lista.map(function (m) { return linhaMaquina(m, d.coletado_em); }).join("")
      + "</tbody></table>";
  }

  function frase(e) {
    if (e.tipo === "inicio") {
      
      return e.usuario
        ? '<span class="ac-inicio">início da coleta</span> · já logado: '
          + '<span class="ac-usuario">' + esc(e.usuario) + "</span>"
        : '<span class="ac-inicio">início da coleta</span> · sem ninguém logado';
    }
    if (e.tipo === "entrou") {
      return '<span class="ac-entrou">entrou</span> '
           + '<span class="ac-usuario">' + esc(e.usuario) + "</span>";
    }
    return '<span class="ac-saiu">saiu</span>'
         + (e.anterior ? ' <span class="ac-usuario">' + esc(e.anterior) + "</span>" : "");
  }

  var POR_MAQUINA = 50;

  function tabelaHistorico(d) {
    var termo = filtro.trim().toLowerCase();
    var lista = d.linha.filter(function (e) {
      if (projeto && e.filtro !== projeto) return false;
      if (!termo) return true;
      return (e.hostname || "").toLowerCase().indexOf(termo) >= 0
          || (e.usuario || "").toLowerCase().indexOf(termo) >= 0
          || (e.anterior || "").toLowerCase().indexOf(termo) >= 0
          || (e.projeto_nome || "").toLowerCase().indexOf(termo) >= 0;
    });
    if (!lista.length) {
      return '<div class="vazio">Nenhum evento no período'
           + (filtro ? " para “" + esc(filtro) + "”" : "") + ".</div>";
    }

    var porHost = {}, ordem = [];
    lista.forEach(function (e) {
      var g = porHost[e.hostid];
      if (!g) {
        g = porHost[e.hostid] = {
          hostid: e.hostid, hostname: e.hostname,
          projeto: e.projeto_nome, eventos: [], pessoas: {},
        };
        ordem.push(g);
      }
      g.eventos.push(e);
      var quem = e.usuario || e.anterior;
      if (quem) g.pessoas[quem] = true;
    });

    ordem.sort(function (a, b) { return b.eventos[0].clock - a.eventos[0].clock; });

    return '<div class="ac-grupos">'
      + ordem.map(function (g) {
          var aberto = !!abertos[g.hostid];
          var pessoas = Object.keys(g.pessoas);
          
          var totais = (dados && dados.eventos_por_maquina) || {};
          var n = totais[g.hostid] || g.eventos.length;
          return '<div class="ac-grupo">'
            + '<button type="button" class="ac-grupo-cab" data-ac-grupo="'
            +   esc(g.hostid) + '" aria-expanded="' + (aberto ? "true" : "false") + '">'
            +   '<span class="ac-grupo-seta" aria-hidden="true">'
            +     (aberto ? "&#9662;" : "&#9656;") + "</span>"
            +   '<span class="ac-grupo-nome">' + esc(g.hostname) + "</span>"
            +   '<span class="ac-grupo-proj">' + esc(g.projeto || "—") + "</span>"
            +   '<span class="ac-grupo-meta">' + n + " evento" + (n === 1 ? "" : "s")
            +     (pessoas.length
                    ? " · " + pessoas.length + " pessoa" + (pessoas.length === 1 ? "" : "s")
                    : "")
            +   "</span>"
            +   '<span class="ac-grupo-quando">' + esc(relogio(g.eventos[0].clock)) + "</span>"
            + "</button>"
            + (aberto ? corpoGrupo(g) : "")
            + "</div>";
        }).join("")
      + "</div>";
  }

  function corpoGrupo(g) {
    var mostra = g.eventos.slice(0, POR_MAQUINA);
    return '<div class="ac-grupo-corpo">'
      + '<table class="tabela ac-grupo-tab"><tbody>'
      + mostra.map(function (e) {
          return "<tr><td class=\"ac-quando\">" + esc(relogio(e.clock)) + "</td>"
               + "<td>" + frase(e) + "</td></tr>";
        }).join("")
      + "</tbody></table>"
      + (function () {
          var totais = (dados && dados.eventos_por_maquina) || {};
          var real = totais[g.hostid] || g.eventos.length;
          return real > mostra.length
            ? '<p class="ac-grupo-nota">Mostrando os ' + mostra.length
              + " mais recentes de " + real + ".</p>"
            : "";
        }())
      + '<button type="button" class="botao ac-grupo-abrir" data-host="'
      +   esc(g.hostid) + '">Abrir detalhe da máquina</button>'
      + "</div>";
  }

  function pintar() {
    var alvo = document.getElementById("vista");
    if (!alvo || !ativa()) return;

    if (carregando && !dados) {
      alvo.innerHTML = cabecalho() + '<div class="vazio">Carregando…</div>';
      return;
    }
    if (erro) {
      alvo.innerHTML = cabecalho()
        + '<div class="aviso aviso-erro">' + esc(erro) + "</div>";
      return;
    }
    if (!dados) { alvo.innerHTML = cabecalho(); return; }

    if (dados.sem_item) {
      alvo.innerHTML = cabecalho()
        + '<div class="aviso">O item de usuário logado ainda não existe no '
        + "Zabbix. Nada foi coletado.</div>";
      return;
    }

    alvo.innerHTML = cabecalho()
      + cartoes(dados.resumo)
      + legenda()
      + '<section class="camada" id="ac-camada">'
      +   '<div class="camada-cab">'
      +     '<h2 class="camada-tit">'
      +       (aba === "agora" ? "Quem está logado agora" : "Histórico de acessos")
      +     "</h2>"
      +     '<span class="camada-nota">' + rodape() + "</span>"
      +   "</div>"
      +   '<div class="painel"><div class="painel-corpo sem-espaco">'
      +     (aba === "agora" ? tabelaAgora(dados) : tabelaHistorico(dados))
      +   "</div></div>"
      + "</section>";
  }

  var ICONE_FILTRO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M3.5 5h17l-6.6 7.8v5.4l-3.8 2.1v-7.5z"/></svg>';

  function seletorProjeto() {
    var opcoes = (dados && dados.filtros) || [];
    if (!opcoes.length) return "";
    var total = opcoes.reduce(function (n, o) { return n + o.quantas; }, 0);
    return '<label class="ac-filtro' + (projeto ? " ativo" : "") + '">'
      + '<span class="ac-filtro-icone">' + ICONE_FILTRO + "</span>"
      + '<select class="select" id="ac-projeto" aria-label="Filtrar por projeto">'
      +   '<option value=""' + (projeto ? "" : " selected") + ">"
      +     "Todos os projetos (" + total + ")</option>"
      +   opcoes.map(function (o) {
            return '<option value="' + esc(o.valor) + '"'
                 + (projeto === o.valor ? " selected" : "") + ">"
                 + esc(o.nome) + " (" + o.quantas + ")</option>";
          }).join("")
      + "</select></label>";
  }

  function legenda() {
    return '<div class="ac-legenda">'
      + '<span><b class="ac-usuario">Nome</b> alguém logado no console</span>'
      + '<span><b class="ac-vazio">Nenhum logon</b> a máquina respondeu, '
      +   "não há ninguém</span>"
      + '<span><b class="ac-calado">Sem contato</b> agente calado — '
      +   "não dá para saber</span>"
      + (aba === "historico"
          ? '<span><b class="ac-inicio">Início da coleta</b> não é um logon: '
            + "é o instante em que passamos a registrar esta máquina</span>"
          : "")
      + "</div>";
  }

  function rodape() {
    if (aba === "agora") {
      return "leitura de " + relogio(dados.coletado_em);
    }
    var n = dados.linha_total;
    return dados.dias + " dias · " + n + " evento" + (n === 1 ? "" : "s")
         + (n > dados.linha.length ? " (mostrando os " + dados.linha.length
                                     + " mais recentes)" : "");
  }

  function cabecalho() {
    
    return '<a class="botao vista-voltar" href="#" data-vista="null">'
      + "&larr; Painel</a>"
      + '<div class="vista-cab">'
      + '<div><h1 class="vista-tit">Acessos</h1>'
      + '<p class="vista-sub">Quem está usando cada máquina, agora e no histórico</p></div>'
      + "</div>"
      + '<div class="ac-barra">'
      +   '<div class="ac-abas">'
      +     '<button type="button" class="botao' + (aba === "agora" ? " ativo" : "")
      +       '" data-ac="agora">Agora</button>'
      +     '<button type="button" class="botao' + (aba === "historico" ? " ativo" : "")
      +       '" data-ac="historico">Histórico</button>'
      +   "</div>"
      
      +   '<span class="campo-caixa ac-busca">'
      +     '<input type="text" class="campo" id="ac-busca"'
      +       ' placeholder="Filtrar por máquina, pessoa ou projeto"'
      +       ' value="' + esc(filtro) + '" autocomplete="off" spellcheck="false">'
      +     '<button type="button" class="campo-limpar" data-limpar-campo="ac-busca"'
      +       ' tabindex="-1" title="Limpar o filtro" aria-label="Limpar o filtro">&#10005;</button>'
      +   "</span>"
      +   (aba === "historico"
          ? '<select class="select" id="ac-dias">'
            + [1, 7, 30, 90].map(function (n) {
                return '<option value="' + n + '"' + (n === dias ? " selected" : "")
                     + ">" + (n === 1 ? "24 horas" : n + " dias") + "</option>";
              }).join("")
            + "</select>"
          : '<select class="select" id="ac-parado" aria-label="Sem contato há quanto tempo">'
            + '<option value="">Qualquer tempo sem ligar</option>'
            + '<option value="20"' + (paradoMin === "20" ? " selected" : "")
            +   ">Sem ligar há 20 dias ou mais</option>"
            + '<option value="30"' + (paradoMin === "30" ? " selected" : "")
            +   ">Sem ligar há 30 dias ou mais</option>"
            + "</select>")
      +   '<button type="button" class="botao" data-ac="recarregar"'
      +     (carregando ? " disabled" : "") + ">"
      +     (carregando ? "Atualizando…" : "Atualizar") + "</button>"
      +   seletorProjeto()
      + "</div>";
  }

  function ativa() {
    return (location.hash || "").toLowerCase().indexOf("#/acessos") === 0;
  }

  function ligarCliques() {
    
    document.addEventListener("click", function (ev) {
      var c = ev.target.closest ? ev.target.closest("[data-ac-recorte]") : null;
      if (!c || !ativa()) return;
      ev.preventDefault();
      var qual = c.getAttribute("data-ac-recorte");
      recorte = (recorte === qual) ? null : qual;
      
      if (aba !== "agora") aba = "agora";
      pintar();
    });

    document.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-ac]") : null;
      if (!b || !ativa()) return;
      ev.preventDefault();
      var acao = b.getAttribute("data-ac");
      if (acao === "recarregar") { buscar(true); return; }
      if (acao === aba) return;
      aba = acao;
      pintar();
    });

    document.addEventListener("click", function (ev) {
      var g = ev.target.closest ? ev.target.closest("[data-ac-grupo]") : null;
      if (!g || !ativa()) return;
      ev.preventDefault();
      var hid = g.getAttribute("data-ac-grupo");
      if (abertos[hid]) delete abertos[hid]; else abertos[hid] = true;
      pintar();
      
      var novo = document.querySelector('[data-ac-grupo="' + hid + '"]');
      if (novo) novo.focus();
    });

    document.addEventListener("input", function (ev) {
      if (!ativa() || ev.target.id !== "ac-busca") return;
      filtro = ev.target.value;
      var pos = ev.target.selectionStart;
      pintar();
      var novo = document.getElementById("ac-busca");
      if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) {} }
    });

    document.addEventListener("change", function (ev) {
      if (!ativa()) return;
      if (ev.target.id === "ac-dias") {
        dias = parseInt(ev.target.value, 10) || 7;
        buscar(true);
        return;
      }
      if (ev.target.id === "ac-projeto") {
        
        projeto = ev.target.value;
        pintar();
      }
      if (ev.target.id === "ac-parado") {
        
        paradoMin = ev.target.value;
        pintar();
      }
    });
  }

  function abrir() {
    buscar(false);
    pintar();
  }

  return { abrir: abrir, pintar: pintar, ligarCliques: ligarCliques,
           ativa: ativa };
}());
