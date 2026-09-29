window.MON = window.MON || {};

MON.tour = (function () {
  "use strict";

  var VERSAO = 9;
  var CHAVE = "monitoramento:tour-visto";

  var FOLGA = 14;

  var PASSOS = [
    {
      alvo: null,
      titulo: "Bem-vindo(a) ao Monitoramento",
      texto: "Um tour rápido pelas principais telas — leva menos de um minuto. "
           + "Pode pular a qualquer momento e reabrir depois no <b>?</b> do topo da tela."
    },
    {
      alvo: "#menu-lateral",
      titulo: "O menu, aqui na lateral",
      texto: "Todas as telas do painel saem daqui. Ele fica encolhido em "
           + "ícones para sobrar espaço; <b>encoste o mouse</b> e ele abre com "
           + "os nomes por extenso. Se preferir deixá-lo aberto o tempo todo, "
           + "a seta lá no alto <b>fixa</b> — e o painel lembra da sua escolha."
    },
    {
      alvo: ".topo-vistas",
      titulo: "Plantas por bloco",
      texto: "Cada botão abre a planta de um bloco com as máquinas daquele "
           + "andar, uma por ícone e coloridas pelo estado. Clique em qualquer "
           + "ícone para ver os detalhes da máquina."
    },
    {
      alvo: "#pulso",
      titulo: "O pulso do parque",
      texto: "Quantas máquinas estão com problema <b>agora</b>. Ele fica no menu "
           + "de propósito: acompanha você para dentro das plantas de bloco e da "
           + "aba Acessos, onde os cartões do painel não estão à vista. Clique "
           + "para ver quais são. Máquina desligada <b>não</b> conta aqui."
    },
    {
      alvo: "#bt-noc",
      titulo: "Modo NOC",
      texto: "Para deixar numa TV na parede: esconde busca, filtros e inventário "
           + "e aumenta os números, mantendo só o que se lê de longe."
    },
    {
      alvo: "#bt-tema",
      titulo: "Tema claro e escuro",
      texto: "O painel nasce no tema do seu Windows e este botão troca quando "
           + "quiser. A escolha fica guardada neste navegador — e a partir dela "
           + "o painel para de seguir o sistema."
    },
    {
      alvo: ".topo-busca",
      titulo: "Busca global",
      texto: "Procure por nome de máquina, IP, projeto, grupo ou problema. "
           + "A tecla <b>/</b> leva o cursor até aqui de qualquer lugar do painel."
    },
    {
      alvo: "#conexao",
      titulo: "Isto aqui é ao vivo",
      texto: "O painel não recarrega: o servidor empurra cada mudança assim que "
           + "o Zabbix a registra. Este indicador mostra se a ligação está de pé "
           + "e quando foi a última atualização."
    },
    {
      alvo: "#bt-atualizar",
      titulo: "Atualizar agora",
      texto: "O painel já é ao vivo — o servidor empurra cada mudança sozinho. "
           + "Este botão serve para não esperar: ele pede uma leitura nova ao "
           + "Zabbix na hora. Útil depois de mexer numa máquina. A tecla "
           + "<b>R</b> faz o mesmo."
    },
    {
      alvo: "#capacidade",
      titulo: "Capacidade do parque",
      texto: "Quanto de disco e de memória o parque ainda tem, em valor "
           + "absoluto. Clique numa faixa para ver exatamente quais máquinas "
           + "estão nela."
    },
    {
      alvo: "#kpis",
      titulo: "Os números do parque",
      texto: "O retrato do momento: máquinas ligadas, problemas abertos, "
           + "discos apertados. <b>Clique em qualquer número</b> para abrir a "
           + "lista das máquinas que ele conta."
    },
    {
      alvo: "#topmaq",
      titulo: "Top hosts",
      texto: "As máquinas que mais consomem CPU e memória agora, em ordem. "
           + "É por onde começar quando alguém reclama de lentidão."
    },
    {
      alvo: "#rede",
      titulo: "Estabilidade da rede",
      texto: "Quantas vezes a rede <b>piscou</b> nas últimas 24 horas — o link "
           + "caiu ou o agente sumiu, e voltou sozinho em menos de 15 minutos. "
           + "Queda que não volta é máquina desligada e não entra aqui. A lista "
           + "de baixo mostra <b>onde</b> mais oscila; clique para abrir a "
           + "máquina."
    },
    {
      alvo: "#top-problemas",
      titulo: "O que precisa de atenção",
      texto: "Os problemas agrupados por tipo, do mais urgente para o menos. "
           + "Clicar num item abre a lista das máquinas exatas naquela situação."
    },
    {
      alvo: "#eventos",
      titulo: "Linha do tempo",
      texto: "O que aconteceu nas últimas horas, em ordem de chegada — útil "
           + "para entender se um problema é novo ou já vinha se arrastando."
    },
    {
      
      alvo: '[data-secao="problemas"] .camada-cab',
      titulo: "Problemas ativos",
      texto: "A tabela completa, com filtros por severidade, projeto e grupo. "
           + "A setinha no título recolhe a seção — o painel lembra da sua "
           + "escolha na próxima vez que você entrar."
    },
    {
      
      alvo: '[data-vista="ACESSOS"]',
      titulo: "Acessos",
      texto: "Quem está logado em cada máquina agora, e o histórico de quem "
           + "esteve — com data e hora de cada entrada e saída. Os cartões de "
           + "cima <b>filtram a lista</b> quando clicados. Visível apenas para "
           + "quem é <b>master</b>."
    },
    {
      alvo: "#usuario",
      titulo: "Sua conta",
      texto: "Trocar senha, sair e — se você for master — criar e gerenciar "
           + "usuários."
    }
  ];

  var indice = 0;
  var visiveis = [];        // passos que existem na tela AGORA (ver decisao 2)
  var abertas = [];         // secoes que o tour abriu e precisa fechar de volta
  var fundo = null, furo = null, cartao = null;
  var rodando = false;
  var pedido = 0;           // rAF pendente do reposicionamento
  var voltando = false;     // ja tentou sair da vista de bloco

  function esc(t) {
    return MON.fmt && MON.fmt.esc ? MON.fmt.esc(t) : String(t);
  }

  function achar(sel) {
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function naTela(el) {
    if (!el) return false;
    var c = el.getBoundingClientRect();
    return c.width > 0 && c.height > 0;
  }

  function chaveDoUsuario() {
    var b = document.getElementById("conta-botao");
    var quem = b ? (b.getAttribute("title") || "") : "";
    return CHAVE + ":" + (quem || "?");
  }

  function jaViu() {
    try { return localStorage.getItem(chaveDoUsuario()) === String(VERSAO); }
    catch (e) { return true; }   
  }

  function marcarVisto() {
    try { localStorage.setItem(chaveDoUsuario(), String(VERSAO)); }
    catch (e) {  }
  }

  function abrirSecaoDe(el) {
    var secao = el && el.closest ? el.closest("[data-secao]") : null;
    if (!secao || !secao.classList.contains("recolhida")) return;
    secao.classList.remove("recolhida");
    abertas.push(secao);
  }

  function devolverSecoes() {
    abertas.forEach(function (s) { s.classList.add("recolhida"); });
    abertas = [];
  }

  function montar() {
    fundo = document.createElement("div");
    fundo.className = "tour-fundo";

    furo = document.createElement("div");
    furo.className = "tour-furo";

    cartao = document.createElement("div");
    cartao.className = "tour-cartao";
    cartao.setAttribute("role", "dialog");
    cartao.setAttribute("aria-modal", "true");
    cartao.setAttribute("aria-labelledby", "tour-titulo");

    fundo.appendChild(furo);
    fundo.appendChild(cartao);
    document.body.appendChild(fundo);
    document.body.classList.add("tour-aberto");

    fundo.addEventListener("click", function (ev) { ev.stopPropagation(); });
    cartao.addEventListener("click", cliqueNoCartao);
    window.addEventListener("resize", agendar);
    window.addEventListener("scroll", agendar, true);
    document.addEventListener("keydown", tecla);
  }

  function desmontar() {
    window.removeEventListener("resize", agendar);
    window.removeEventListener("scroll", agendar, true);
    document.removeEventListener("keydown", tecla);
    if (fundo && fundo.parentNode) fundo.parentNode.removeChild(fundo);
    document.body.classList.remove("tour-aberto");
    fundo = furo = cartao = null;
  }

  function pintarCartao() {
    var p = visiveis[indice];
    var ultimo = indice === visiveis.length - 1;

    cartao.innerHTML =
      '<div class="tour-passo">Passo ' + (indice + 1)
        + " de " + visiveis.length + "</div>"
      + '<h3 class="tour-titulo" id="tour-titulo">' + esc(p.titulo) + "</h3>"
      
      + '<p class="tour-texto">' + p.texto + "</p>"
      + '<div class="tour-acoes">'
      +   '<button type="button" class="tour-pular" data-tour="pular">Pular tour</button>'
      +   '<div class="tour-navega">'
      +     (indice > 0
          ? '<button type="button" class="tour-bt" data-tour="anterior">Anterior</button>'
          : "")
      +     '<button type="button" class="tour-bt tour-bt-forte" data-tour="proximo">'
      +       (ultimo ? "Concluir" : "Próximo") + "</button>"
      +   "</div>"
      + "</div>";
  }

  function posicionar() {
    var p = visiveis[indice];
    var alvo = achar(p.alvo);
    var lp = window.innerWidth, ap = window.innerHeight;

    if (!alvo || !naTela(alvo)) {
      
      furo.style.display = "none";
      fundo.classList.add("tour-escuro");
      cartao.style.left = Math.round((lp - cartao.offsetWidth) / 2) + "px";
      cartao.style.top = Math.round((ap - cartao.offsetHeight) / 2) + "px";
      return;
    }

    var c = alvo.getBoundingClientRect();
    fundo.classList.remove("tour-escuro");
    furo.style.display = "block";
    furo.style.left = Math.round(c.left - 6) + "px";
    furo.style.top = Math.round(c.top - 6) + "px";
    furo.style.width = Math.round(c.width + 12) + "px";
    furo.style.height = Math.round(c.height + 12) + "px";

    var lc = cartao.offsetWidth, ac = cartao.offsetHeight;

    function preso(v, teto) { return Math.min(Math.max(FOLGA, v), teto); }

    var esquerda, topo;
    var cabeAbaixo  = c.bottom + FOLGA + ac <= ap - FOLGA;
    var cabeAcima   = c.top - FOLGA - ac >= FOLGA;
    var cabeDireita = c.right + FOLGA + lc <= lp - FOLGA;
    var cabeEsq     = c.left - FOLGA - lc >= FOLGA;

    if (cabeAbaixo || cabeAcima) {
      topo = cabeAbaixo ? c.bottom + FOLGA : c.top - FOLGA - ac;
      esquerda = preso(c.left, lp - lc - FOLGA);
    } else if (cabeDireita || cabeEsq) {
      esquerda = cabeDireita ? c.right + FOLGA : c.left - FOLGA - lc;
      
      topo = preso(c.top + (c.height - ac) / 2, ap - ac - FOLGA);
    } else {
      
      esquerda = preso(c.left, lp - lc - FOLGA);
      topo = Math.max(FOLGA, ap - ac - FOLGA);
    }

    cartao.style.left = Math.round(esquerda) + "px";
    cartao.style.top = Math.round(topo) + "px";
  }

  function agendar() {
    if (!rodando) return;
    if (pedido) cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(function () { pedido = 0; posicionar(); });
  }

  function mostrar() {
    var p = visiveis[indice];
    var alvo = achar(p.alvo);

    if (alvo) {
      abrirSecaoDe(alvo);
      
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    pintarCartao();
    posicionar();
    agendar();

    var bt = cartao.querySelector('[data-tour="proximo"]');
    if (bt) bt.focus();
  }

  function cliqueNoCartao(ev) {
    var bt = ev.target.closest ? ev.target.closest("[data-tour]") : null;
    if (!bt) return;
    ev.preventDefault();
    var acao = bt.getAttribute("data-tour");
    if (acao === "pular") fechar();
    else if (acao === "anterior") ir(-1);
    else ir(1);
  }

  function tecla(ev) {
    if (!rodando) return;
    if (ev.key === "Escape") { ev.preventDefault(); fechar(); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); ir(1); }
    else if (ev.key === "ArrowLeft" && indice > 0) { ev.preventDefault(); ir(-1); }
  }

  function ir(passo) {
    var novo = indice + passo;
    if (novo < 0) return;
    if (novo >= visiveis.length) { fechar(); return; }
    indice = novo;
    mostrar();
  }

  function fechar() {
    if (!rodando) return;
    rodando = false;
    if (MON.menu) MON.menu.travar(false);
    devolverSecoes();
    desmontar();
    marcarVisto();
  }

  function abrir() {
    if (rodando) return;

    if (document.body.classList.contains("em-vista") && !voltando) {
      voltando = true;
      if (location.hash) location.hash = "";
      else if (MON.vistas) MON.vistas.sincronizar();
      setTimeout(abrir, 150);
      return;
    }
    voltando = false;

    if (MON.menu) MON.menu.travar(true);

    visiveis = PASSOS.filter(function (p) {
      if (!p.alvo) return true;
      var el = achar(p.alvo);
      
      if (!el) return false;
      var secao = el.closest ? el.closest("[data-secao]") : null;
      if (secao && secao.classList.contains("recolhida")) return naTela(secao);
      return naTela(el);
    });

    if (!visiveis.length) { if (MON.menu) MON.menu.travar(false); return; }

    if (visiveis.length < Math.ceil(PASSOS.length / 2)) {
      if (MON.menu) MON.menu.travar(false);
      return;
    }

    rodando = true;
    indice = 0;
    abertas = [];
    montar();
    mostrar();
  }

  function armar() {
    var jaDisparou = false;
    MON.estado.observar(function () {
      if (jaDisparou) return;
      jaDisparou = true;
      
      var tentativas = 0;
      (function esperar() {
        if (document.getElementById("conta-botao") || tentativas >= 12) {
          setTimeout(function () { if (!jaViu()) abrir(); }, 400);
          return;
        }
        tentativas++;
        setTimeout(esperar, 250);
      }());
    });
  }

  return { abrir: abrir, armar: armar };
}());
