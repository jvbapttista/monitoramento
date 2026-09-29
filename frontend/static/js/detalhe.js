window.MON = window.MON || {};

MON.detalhe = (function () {
  "use strict";

  var caixa = null;
  var aberto = null;        // hostid, quando o modal mostra UMA maquina
  var listaAberta = false;  // quando mostra uma LISTA de maquinas
  
  var origem = null;
  var focoAnterior = null;

  function alvo() {
    if (!caixa) caixa = document.getElementById("detalhe");
    return caixa;
  }

  function travarFundo(v) {
    document.documentElement.classList.toggle("com-janela", !!v);
  }

  function abrir(hostid) {
    if (!hostid) return;
    if (aberto !== String(hostid)) abertasAbas = {};
    aberto = String(hostid);
    listaAberta = false;
    // so guarda o foco na PRIMEIRA abertura: recarregar (botao ou tecla R)
    // chama abrir() de novo, e ai o foco ativo e o proprio botao da janela.
    if (!focoAnterior) focoAnterior = document.activeElement;

    var m = MON.estado.maquinaPor(hostid);
    moldura(
      m ? MON.fmt.esc(m.hostname) : "Carregando...",
      m ? MON.fmt.esc(m.projeto) + (m.ip ? " · " + MON.fmt.esc(m.ip) : "") : "",
      '<div class="esqueleto" style="height:340px"></div>'
    );

    fetch("/api/host/" + encodeURIComponent(hostid), { cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (c) { return { ok: r.ok, corpo: c }; });
      })
      .then(function (res) {
        if (aberto !== String(hostid)) return;      // o usuario ja fechou
        if (!res.ok) { erro(res.corpo.erro || "nao foi possivel obter o host"); return; }
        desenhar(res.corpo);
      })
      .catch(function () {
        if (aberto === String(hostid)) erro("sem conexao com o servidor");
      });
  }

  function erro(mensagem) {
    var corpo = alvo().querySelector(".modal-corpo");
    if (!corpo) return;
    corpo.innerHTML =
      '<div class="estado-erro"><b>Não foi possível obter os dados deste host</b>' +
      "O painel continua mostrando o que já tinha; este detalhe precisa de uma " +
      "consulta nova ao Zabbix, e ela falhou." +
      "<code>" + MON.fmt.esc(mensagem) + "</code></div>" +
      '<button class="botao" style="margin-top:16px" data-recarregar="1">Tentar de novo</button>';
  }

  var SETA_VOLTAR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M15 5l-7 7 7 7"/></svg>';

  function moldura(titulo, sub, corpo) {
    
    var voltar = origem
      ? '<button class="modal-voltar" data-voltar="1"'
        + ' aria-label="Voltar para ' + MON.fmt.esc(origem.titulo) + '"'
        + ' title="Voltar para ' + MON.fmt.esc(origem.titulo) + '">'
        + SETA_VOLTAR + "</button>"
      : "";

    travarFundo(true);
    alvo().innerHTML =
      '<div class="fundo-modal" data-fundo="1">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Detalhe da máquina">' +
          '<div class="modal-cab">' + voltar + "<div>" +
            "<h2>" + titulo + "</h2>" +
            '<div class="sub">' + sub + "</div>" +
          "</div>" +
          
          '<button class="modal-atualizar" data-recarregar="1"' +
            ' aria-label="Atualizar os dados desta máquina"' +
            ' title="Atualizar agora (tecla R)&#10;O Zabbix coleta a cada 1 min:' +
            ' reler antes disso devolve o mesmo valor.">' +
            '<span class="giro" aria-hidden="true">&#10227;</span> Atualizar' +
          "</button>" +
          '<button class="modal-fechar" data-fechar="1" aria-label="Fechar">&times;</button>' +
          "</div>" +
          '<div class="modal-corpo">' + corpo + "</div>" +
        "</div></div>";
    var b = alvo().querySelector(".modal-fechar");
    if (b) b.focus();
  }

  var ultimo = null;

  var abertoAplicativos = false;

  var abertasAbas = {};

  function desenhar(h) {
    ultimo = h;
    var lim = MON.estado.limites();
    var r = h.recursos;

    var subtitulo =
      MON.fmt.esc(h.projeto) +
      (h.interfaces_zabbix.length && h.interfaces_zabbix[0].ip
        ? " · " + MON.fmt.esc(h.interfaces_zabbix[0].ip) : "") +
      " · " + (h.online
        ? '<span class="selo selo-ok">Online</span>'
        : '<span class="selo selo-off">Offline</span>') +
      (h.sem_dados
        ? ' <span class="selo selo-morno">Sem medição há ' + MON.fmt.desde(h.visto_em) + "</span>"
        : "") +
      (r.versao_agente ? ' <span class="selo selo-neutro">agente ' + MON.fmt.esc(r.versao_agente) + "</span>" : "");

    moldura(MON.fmt.esc(h.hostname), subtitulo, corpoDetalhe(h, r, lim));
  }

  function corpoDetalhe(h, r, lim) {
    var reais = h.problemas.filter(function (p) { return !p.ruido; });
    var ruidos = h.problemas.filter(function (p) { return p.ruido; });

    return trilha(h) + calado(h) + fichas(h, r, lim) + quemEsta(h) +
           
           identificacao(h, r) + ultimaMedicao(h, lim) + volumes(h, lim) +
           rede(h) + programas(h, r) + aplicativosInstalados(h, r) + series(h) +
           problemas(reais, ruidos) + linhaDoTempo(h);
  }

  function trilha(h) {
    
    return '<div class="trilha">Parque › ' +
      '<button data-recorte=\'' + MON.fmt.esc(JSON.stringify({ projeto: h.projeto })) + "' " +
      'data-fecha-antes="1">' + MON.fmt.esc(h.projeto) + "</button> › " +
      MON.fmt.esc(h.hostname) + "</div>";
  }

  function calado(h) {
    if (!h.sem_dados) return "";
    return '<div class="estado-erro estado-aviso" style="margin-bottom:20px">' +
      "<b>Esta máquina não fala com o Zabbix há " + MON.fmt.desde(h.visto_em) + "</b>" +
      "As medidas de CPU, memória, disco e rede foram apagadas dos campos acima porque " +
      "descrevem o passado, não o estado atual. O último valor conhecido está preservado " +
      "mais abaixo, com a hora em que foi medido." +
      "</div>";
  }

  function ultimaMedicao(h, lim) {
    var u = h.ultima_medicao;
    if (!u) return "";
    var vols = (u.volumes || []).map(function (v) {
      return '<div class="volume"><div class="n">' + MON.fmt.esc(v.volume) + "</div>" +
        '<div class="p">' + MON.fmt.n(v.livre, 1, "%") + " livre</div>" +
        '<div class="t">' + (v.total_gb != null ? MON.fmt.n(v.total_gb, 1) + " GB" : "") + "</div></div>";
    }).join("");

    return '<div class="secao"><h4>Última medição conhecida ' +
      "<small>" + MON.fmt.dataHora(u.quando) + " &mdash; há " + MON.fmt.desde(u.quando) +
      ", não é o estado atual</small></h4>" +
      '<div class="fichas" style="opacity:.7">' +
        ficha("CPU era", MON.fmt.n(u.cpu, 1, "%"), "", "") +
        ficha("Memória era", MON.fmt.n(u.memoria, 1, "%"), "", "") +
        ficha("Ligada havia", MON.fmt.duracao(u.uptime), "", "") +
      "</div>" +
      (vols ? '<div class="volumes" style="margin-top:8px;opacity:.7">' + vols + "</div>" : "") +
      "</div>";
  }

  function fichas(h, r, lim) {
    var memSub = r.memoria_total ? MON.fmt.bytes(r.memoria_total) + " no total" : "";
    var disco = h.volumes.length ? h.volumes[0] : null;

    return '<div class="fichas">' +
      ficha("CPU", MON.fmt.n(r.cpu, 1, "%"), MON.fmt.corUso(r.cpu, lim.cpu_alta),
            r.cpu_nucleos ? MON.fmt.n(r.cpu_nucleos, 0) + " núcleos" : "") +
      ficha("Memória", MON.fmt.n(r.memoria, 1, "%"), MON.fmt.corUso(r.memoria, lim.memoria_alta), memSub) +
      ficha("Disco livre", disco ? MON.fmt.n(disco.livre, 1, "%") : "—",
            disco ? MON.fmt.corLivre(disco.livre, lim.disco_critico, lim.disco_atencao) : "",
            disco ? "volume " + disco.volume : "sem volume medido") +
      ficha("Ligada há", MON.fmt.duracao(r.uptime), "", "") +
      ficha("Último dado", MON.fmt.desde(h.visto_em), h.sem_dados ? "var(--medio)" : "", "") +
      ficha("Processos", MON.fmt.n(r.processos, 0), "", "") +
      "</div>";
  }

  function ficha(rotulo, valor, cor, extra) {
    return '<div class="ficha"><div class="r">' + MON.fmt.esc(rotulo) + "</div>" +
      '<div class="v"' + (cor ? ' style="color:' + cor + '"' : "") + ">" + valor + "</div>" +
      (extra ? '<div class="x">' + MON.fmt.esc(extra) + "</div>" : "") + "</div>";
  }

  function identificacao(h, r) {
    var linhas = [
      ["Hostname", h.hostname],
      ["Nome no Zabbix", h.nome_visivel !== h.hostname ? h.nome_visivel : null],
      ["Hostname do agente", r.hostname_agente],
      ["Sistema", r.sistema],
      ["Projeto", h.projeto],
      ["Grupos", h.grupos.join(", ")],
      ["Templates", h.templates.join(", ")],
      ["Endereços", h.interfaces_zabbix.map(function (i) {
        return (i.ip || i.dns || "?") + (i.porta ? ":" + i.porta : "");
      }).join(", ")],
      ["Usuários conectados", r.usuarios == null ? null : MON.fmt.n(r.usuarios, 0)],
      ["Observação", h.descricao]
    ].filter(function (l) { return l[1]; });

    return '<div class="secao"><h4>Identificação</h4><dl class="par">' +
      linhas.map(function (l) {
        return "<dt>" + MON.fmt.esc(l[0]) + "</dt><dd>" + MON.fmt.esc(l[1]) + "</dd>";
      }).join("") + "</dl></div>";
  }

  function quemEsta(h) {
    var u = h.usuario_logado;
    if (!u) return "";

    var conteudo;
    if (u.estado === "com_usuario") {
      var desde = "";
      if (u.desde) {
        var horas = (h.gerado_em - u.desde) / 3600;
        desde = horas < 1
          ? "há " + Math.max(1, Math.round(horas * 60)) + " min"
          : (horas < 24 ? "há " + horas.toFixed(1).replace(".", ",") + " h"
                        : "há " + Math.floor(horas / 24) + " d");
      }
      conteudo = '<div class="det-usuario">'
        + '<span class="det-usuario-nome">' + MON.fmt.esc(u.usuario) + "</span>"
        + (u.dominio ? '<span class="ac-dominio">' + MON.fmt.esc(u.dominio) + "</span>" : "")
        + (desde ? '<span class="det-usuario-desde">' + MON.fmt.esc(desde) + "</span>" : "")
        + "</div>";
    } else if (u.estado === "sem_logon") {
      conteudo = '<div class="estado-vazio">Nenhum logon no momento.</div>';
    } else {
      conteudo = '<div class="estado-vazio">Sem contato com o agente — '
               + "não dá para saber quem está logado.</div>";
    }
    return '<div class="secao"><h4>Quem está no console</h4>' + conteudo + "</div>";
  }

  function programas(h, r) {
    if (h.sem_dados) return "";
    if (r.programas == null) {
      return '<div class="secao"><h4>Programas em execução</h4>'
        + '<div class="estado-vazio">Ainda sem coleta para esta máquina. '
        + "O item existe, mas o agente ainda não reportou.</div></div>";
    }
    if (!r.programas.length) {
      return '<div class="secao"><h4>Programas em execução</h4>'
        + '<div class="estado-vazio">A coleta veio vazia.</div></div>';
    }

    var idade = "";
    if (r.programas_em) {
      var min = Math.round((h.gerado_em - r.programas_em) / 60);
      idade = min <= 1 ? "agora há pouco" : "há " + min + " min";
    }

    var por = ordemProgramas();
    var temCpu = r.cpu_por_programa;
    if (por === "cpu" && !temCpu) por = "memoria";

    var lista = r.programas.slice().sort(function (a, b) {
      if (por === "cpu") return (b.cpu_pct || 0) - (a.cpu_pct || 0);
      return (b.memoria_mb || 0) - (a.memoria_mb || 0);
    });

    var teto = por === "cpu"
      ? Math.max(1, lista[0].cpu_pct || 1)
      : Math.max(1, lista[0].memoria_mb || 1);

    var totalMb = r.memoria_total ? r.memoria_total / 1048576 : null;

    return '<div class="secao"><h4>Programas em execução <small>'
      + (r.programas_distintos ? r.programas_distintos + " nomes distintos · " : "")
      + "os " + r.programas.length + " maiores"
      + (idade ? " · coletado " + MON.fmt.esc(idade) : "")
      + "</small></h4>"
      + '<div class="prog-cab' + (totalMb ? " com-pct" : "") + '">'
      +   "<span>Programa</span>"
      
      +   '<span class="prog-cab-proc" title="Quantos processos separados '
      +     'rodam com este nome. A memória ao lado é a soma de todos eles.">'
      +     "Proc.</span>"
      +   "<span></span>"
      +   '<button type="button" class="prog-ord' + (por === "cpu" ? " ativo" : "")
      +     '" data-ordem-prog="cpu"' + (temCpu ? "" : " disabled")
      +     ' title="' + (temCpu
            ? "Média de CPU no intervalo entre as duas últimas coletas"
            : "Ainda sem duas coletas para comparar") + '">CPU</button>'
      +   '<button type="button" class="prog-ord' + (por === "cpu" ? "" : " ativo")
      +     '" data-ordem-prog="memoria">Memória</button>'
      
      +   (totalMb ? '<span class="prog-cab-pct" title="Fatia da memória total '
                     + 'da máquina">% do total</span>' : "")
      + "</div>"
      + '<div class="prog-lista' + (totalMb ? " com-pct" : "") + '">'
      + lista.map(function (p) {
          var base = por === "cpu" ? (p.cpu_pct || 0) : (p.memoria_mb || 0);
          var largura = Math.max(2, Math.round(base / teto * 100));
          
          var chaveProc = p.nome.toLowerCase();
          var tabs = abasDoProcesso(r, chaveProc);
          var temAbas = tabs && tabs.length > 0;
          var expandida = temAbas && !!abertasAbas[chaveProc];

          return '<div class="prog-linha' + (temAbas ? " prog-tem-abas" : "") + '">'
            + (temAbas
                ? '<button type="button" class="prog-nome prog-abas-abrir"'
                  + ' data-abas-prog="' + MON.fmt.esc(chaveProc) + '"'
                  + ' aria-expanded="' + (expandida ? "true" : "false") + '"'
                  + ' title="' + tabs.length + ' aba(s) aberta(s) neste navegador">'
                  + '<span class="secao-seta" aria-hidden="true">'
                  +   (expandida ? "&#9662;" : "&#9656;") + "</span>"
                  + MON.fmt.esc(p.nome)
                  + "</button>"
                : '<span class="prog-nome">' + MON.fmt.esc(p.nome) + "</span>")
            
            + '<span class="prog-qtd"'
            +   (p.processos > 1
                 ? ' title="' + p.processos + ' processos com este nome">'
                   + p.processos
                 : ">")
            + "</span>"
            + '<span class="prog-barra"><i style="width:' + largura + '%"></i></span>'
            
            + '<span class="prog-cpu">'
            +   (p.cpu_pct == null ? "&mdash;"
                 : MON.fmt.n(p.cpu_pct, 1).replace(".", ",") + "%")
            + "</span>"
            + '<span class="prog-mem">' + MON.fmt.n(p.memoria_mb, 0) + " MB</span>"
            + (totalMb ? '<span class="prog-pct">' + fatia(p, totalMb) + "</span>" : "")
            + "</div>"
            + (expandida ? listaAbas(tabs) : "");
        }).join("")
      + "</div>"
      + '<p class="prog-nota">'
      +   (temCpu
            ? "CPU é a média entre as duas últimas coletas, não o instante. "
              + "100% é a máquina inteira, como no Gerenciador de Tarefas. "
            : "A coluna de CPU aparece assim que houver duas coletas desta "
              + "máquina para comparar. ")
      
      +   (totalMb
            ? "A memória de cada linha é a soma dos seus processos; somar a "
              + "coluna passa de 100%, porque processos do mesmo programa "
              + "compartilham memória e ela é contada em cada um."
            : "")
      + "</p>"
      + "</div>";
  }

  function abasDoProcesso(r, chaveProc) {
    if (!r.abas) return null;
    return r.abas[chaveProc] || null;
  }

  function listaAbas(tabs) {
    return '<div class="prog-abas-lista">'
      + tabs.map(function (t) {
          return '<div class="prog-aba">'
            + '<span class="prog-aba-tit">' + MON.fmt.esc(t.titulo) + "</span>"
            + (t.url
                ? '<span class="prog-aba-url">' + MON.fmt.esc(t.url) + "</span>"
                
                : '<span class="prog-aba-url prog-aba-sem-url">'
                  + "aba em segundo plano - sem URL disponível</span>")
            + "</div>";
        }).join("")
      + "</div>";
  }

  function dataBrCurta(iso) {
    if (!iso) return null;
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }

  function aplicativosInstalados(h, r) {
    var cabecalho = function (miolo) {
      return '<h4><button type="button" class="secao-alterna"'
        + ' data-alternar-aplicativos="1" aria-expanded="' + (abertoAplicativos ? "true" : "false") + '">'
        + '<span class="secao-seta" aria-hidden="true">' + (abertoAplicativos ? "&#9662;" : "&#9656;") + "</span>"
        + "Aplicativos instalados</button>"
        + (miolo ? "<small>" + miolo + "</small>" : "")
        + "</h4>";
    };

    if (r.aplicativos == null) {
      return '<div class="secao">' + cabecalho(null)
        + '<div class="estado-vazio">Ainda sem coleta para esta máquina. '
        + "O coletor opcional ainda não rodou o inventário de aplicativos aqui.</div></div>";
    }

    var idade = "";
    if (r.aplicativos_em) {
      var dias = Math.round((h.gerado_em - r.aplicativos_em) / 86400);
      idade = dias < 1 ? "coletado hoje"
            : dias === 1 ? "coletado há 1 dia" : "coletado há " + dias + " dias";
    }
    var nota = r.aplicativos.length + " no total"
      + (idade ? " · " + idade : "");

    if (!abertoAplicativos) {
      return '<div class="secao">' + cabecalho(nota) + "</div>";
    }
    if (!r.aplicativos.length) {
      return '<div class="secao">' + cabecalho(nota)
        + '<div class="estado-vazio">Nenhum aplicativo encontrado nesta coleta.</div></div>';
    }

    var lista = r.aplicativos.slice()
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });

    return '<div class="secao">' + cabecalho(nota)
      + '<ul class="aplic-lista">'
      + lista.map(function (a) {
          return "<li><b>" + MON.fmt.esc(a.nome) + "</b>"
            + (a.versao ? '<span class="aplic-versao">' + MON.fmt.esc(a.versao) + "</span>" : "")
            + '<span class="aplic-data">'
            +   (a.instalado_em
                  ? "instalado em " + MON.fmt.esc(dataBrCurta(a.instalado_em))
                  : "data não informada")
            + "</span></li>";
        }).join("")
      + "</ul></div>";
  }

  function fatia(p, totalMb) {
    var pct = p.memoria_mb / totalMb * 100;
    if (pct <= 0) return "0%";
    if (pct < 0.5) return "&lt;1%";
    return MON.fmt.n(pct, 0) + "%";
  }

  var CHAVE_ORDEM = "monitoramento:ordem-programas";

  function ordemProgramas() {
    try { return localStorage.getItem(CHAVE_ORDEM) === "cpu" ? "cpu" : "memoria"; }
    catch (e) { return "memoria"; }
  }

  function definirOrdem(v) {
    try { localStorage.setItem(CHAVE_ORDEM, v); } catch (e) {  }
  }

  function volumes(h, lim) {
    if (!h.volumes.length) {
      return '<div class="secao"><h4>Volumes</h4><div class="estado-vazio">' +
        (h.sem_dados
          ? "Sem medida atual: o agente parou de responder. O último valor conhecido está acima."
          : "O Zabbix não tem medida de disco para esta máquina.") +
        "</div></div>";
    }
    return '<div class="secao"><h4>Volumes <small>' + h.volumes.length +
      " no total</small></h4><div class=\"volumes\">" +
      h.volumes.map(function (v) {
        var cor = MON.fmt.corLivre(v.livre, lim.disco_critico, lim.disco_atencao);
        return '<div class="volume"><div class="n">' + MON.fmt.esc(v.volume) + "</div>" +
          '<div class="p" style="color:' + cor + '">' + MON.fmt.n(v.livre, 1, "%") + " livre</div>" +
          '<div class="t">' + (v.livre_gb != null ? MON.fmt.n(v.livre_gb, 1) + " GB de " : "") +
          (v.total_gb != null ? MON.fmt.n(v.total_gb, 1) + " GB" : "tamanho desconhecido") + "</div>" +
          '<div class="barra" style="margin-top:8px"><i style="width:' + (100 - v.livre) +
            "%;background:" + cor + '"></i></div></div>';
      }).join("") + "</div></div>";
  }

  var ICONE_REDE = {
    wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M2 8.8a16 16 0 0 1 20 0"/>'
        + '<path d="M5.5 12.5a11 11 0 0 1 13 0"/><path d="M9 16.2a6 6 0 0 1 6 0"/>'
        + '<path d="M12 20h.01"/></svg>',
    ethernet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="6" y="3" width="12" height="8" rx="1.5"/><path d="M9 11v4M15 11v4"/>'
        + '<rect x="3" y="15" width="18" height="6" rx="1.5"/></svg>'
  };

  function rede(h) {
    var lista = h.interfaces_rede || [];
    if (!lista.length) return "";

    return '<div class="secao"><h4>Rede <small>' +
      (lista.length === 1 ? "1 interface" : lista.length + " interfaces") +
      "</small></h4>" +
      '<div class="volumes">' +
      lista.slice(0, 4).map(function (i) {
        var fam = i.familia === "wifi" ? "wifi" : "ethernet";
        var parado = !i.total_bps;
        return '<div class="rede-cartao">' +
          '<div class="n"><span class="rede-ico">' + ICONE_REDE[fam] + "</span>" +
            MON.fmt.esc(fam === "wifi" ? "Wi-Fi" : "Cabo") + "</div>" +
          '<div class="rede-fluxo' + (parado ? " parado" : "") + '">' +
            '<span><b>&darr;</b> ' + MON.fmt.bps(i.entrada_bps) + "</span>" +
            '<span><b>&uarr;</b> ' + MON.fmt.bps(i.saida_bps) + "</span>" +
          "</div>" +
          '<div class="t" title="' + MON.fmt.esc(i.nome || "") + '">' +
            MON.fmt.esc(i.nome || "") + "</div>" +
          (i.velocidade
            ? '<div class="t">enlace de ' + MON.fmt.bps(i.velocidade / 8) + "</div>"
            : "") +
          "</div>";
      }).join("") + "</div></div>";
  }

  function series(h) {
    var cpu = h.series.cpu || [], mem = h.series.memoria || [];
    if (!cpu.length && !mem.length) return "";
    return '<div class="secao"><h4>Últimos ' + h.janela_min +
      " minutos <small>desta máquina, não do parque</small></h4>" +
      (MON.graf.linha([
        
        { nome: "CPU", cor: "var(--serie-cpu)", pontos: cpu },
        { nome: "Memória", cor: "var(--serie-memoria)", pontos: mem }
      ], { sufixo: "%", id: "h" + h.hostid,
           largura: 900, altura: 200 }) || "") + "</div>";
  }

  function problemas(reais, ruidos) {
    var html = '<div class="secao"><h4>Problemas abertos <small>' + reais.length +
      " relevantes</small></h4>";
    html += reais.length
      ? reais.map(cartaoProblema).join("")
      : '<div class="estado-vazio">Nenhum problema relevante nesta máquina.</div>';
    if (ruidos.length) {
      html += '<h4 style="margin-top:20px">Ruído <small>' + ruidos.length +
        " · serviços que sobem sob demanda</small></h4>" +
        ruidos.slice(0, 12).map(cartaoProblema).join("");
      if (ruidos.length > 12) {
        html += '<div class="estado-vazio">e mais ' + (ruidos.length - 12) + "…</div>";
      }
    }
    return html + "</div>";
  }

  function cartaoProblema(p) {
    return '<div class="problema p' + p.severidade + (p.ruido ? " ruido" : "") + '">' +
      '<div class="d">' + MON.fmt.esc(p.nome) + "</div>" +
      '<div class="m">' + MON.fmt.seloSeveridade(p.severidade) +
        "<span>" + MON.fmt.esc(MON.fmt.nomeEscopo(p.escopo)) + "</span>" +
        "<span>aberto há " + MON.fmt.duracao(p.duracao) + "</span>" +
        "<span>desde " + MON.fmt.dataHora(p.inicio) + "</span>" +
      "</div></div>";
  }

  function linhaDoTempo(h) {
    if (!h.linha_do_tempo.length) {
      return '<div class="secao"><h4>Linha do tempo</h4>' +
        '<div class="estado-vazio">Nenhuma mudança nas últimas 24 horas.</div></div>';
    }
    return '<div class="secao"><h4>Linha do tempo <small>últimas 24 h</small></h4>' +
      '<div class="feed">' + h.linha_do_tempo.map(function (e) {
        return '<div class="feed-item ' + (e.abriu ? "abriu" : "fechou") + '" style="cursor:default">' +
          '<span class="feed-hora">' + MON.fmt.dataHora(e.quando) + "</span>" +
          '<span class="feed-seta">' + (e.abriu ? "▲" : "▼") + "</span>" +
          '<span class="feed-txt"><span>' + (e.abriu ? "abriu" : "resolveu") + " · " +
          MON.fmt.esc(e.nome) + "</span></span></div>";
      }).join("") + "</div></div>";
  }

  function listar(titulo, sub, recorte) {
    var lista = MON.estado.maquinasCom(recorte);
    listaAberta = true;
    aberto = null;
    
    origem = null;
    focoAnterior = document.activeElement;

    var lim = MON.estado.limites();
    var corpo;

    if (!lista.length) {
      corpo = '<div class="estado-vazio">Nenhuma máquina neste grupo agora.</div>';
    } else {
      
      var ord = lista.slice().sort(function (a, b) {
        if (a.online !== b.online) return a.online ? 1 : -1;
        return (b.memoria || 0) - (a.memoria || 0);
      });

      corpo =
        '<div class="lista-maq-acoes">'
        + "<button class=\"botao\" data-recorte='" + JSON.stringify(recorte) + "'"
        + ' title="Aplica este recorte na tela e fecha esta janela">'
        + "Filtrar a tela por este grupo</button>"
        + "</div>"
        + '<div class="tabela-caixa"><table class="tabela"><thead><tr>'
        + "<th>Máquina</th><th>Projeto</th><th class='n'>RAM</th>"
        + "<th class='n'>Memória</th><th class='n'>Disco livre</th><th>Estado</th>"
        + "</tr></thead><tbody>"
        + ord.map(function (m) {
          var gb = m.memoria_total ? Math.round(m.memoria_total / 1073741824) : null;
          return "<tr data-host='" + MON.fmt.esc(m.hostid) + "'>"
            + "<td><b>" + MON.fmt.esc(m.nome_visivel || m.hostname) + "</b></td>"
            + "<td>" + MON.fmt.esc(m.projeto || "—") + "</td>"
            + '<td class="n">' + (gb ? gb + " GB" : "—") + "</td>"
            + '<td class="n"' + (m.memoria == null ? "" :
                ' style="color:' + MON.fmt.corUso(m.memoria, lim.memoria_alta) + '"') + ">"
            +   (m.memoria == null ? "—" : MON.fmt.pct(m.memoria, 0)) + "</td>"
            + '<td class="n"' + (m.disco_livre == null ? "" :
                ' style="color:' + MON.fmt.corLivre(m.disco_livre, lim.disco_critico, lim.disco_atencao) + '"') + ">"
            +   (m.disco_livre == null ? "—" : MON.fmt.pct(m.disco_livre, 0)) + "</td>"
            + "<td>" + (m.online
                ? '<span class="selo-ok">online</span>'
                : '<span class="selo-off">offline</span>') + "</td>"
            + "</tr>";
        }).join("") + "</tbody></table></div>"
        + '<div class="lista-maq-nota">Clique numa linha para abrir o detalhe da máquina.</div>';
    }

    moldura(MON.fmt.esc(titulo), MON.fmt.esc(sub), corpo);

    origem = { titulo: titulo, sub: sub, recorte: recorte };
  }

  function fechar() {
    aberto = null;
    listaAberta = false;
    ultimo = null;
    origem = null;
    alvo().innerHTML = "";
    travarFundo(false);
    var voltar = focoAnterior;
    focoAnterior = null;   // limpa, senao a proxima abertura nao regrava
    if (voltar && voltar.focus) voltar.focus();
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-ordem-prog]") : null;
    if (!b || b.disabled || !ultimo) return;
    ev.preventDefault();
    definirOrdem(b.getAttribute("data-ordem-prog"));
    
    var corpo = alvo().querySelector(".modal-corpo");
    var pos = corpo ? corpo.scrollTop : 0;
    desenhar(ultimo);
    var novoCorpo = alvo().querySelector(".modal-corpo");
    if (novoCorpo) novoCorpo.scrollTop = pos;
  });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-alternar-aplicativos]") : null;
    if (!b || !ultimo) return;
    ev.preventDefault();
    abertoAplicativos = !abertoAplicativos;
    var corpo = alvo().querySelector(".modal-corpo");
    var pos = corpo ? corpo.scrollTop : 0;
    desenhar(ultimo);
    var novoCorpo = alvo().querySelector(".modal-corpo");
    if (novoCorpo) novoCorpo.scrollTop = pos;
  });

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-abas-prog]") : null;
    if (!b || !ultimo) return;
    ev.preventDefault();
    var chave = b.getAttribute("data-abas-prog");
    if (abertasAbas[chave]) delete abertasAbas[chave]; else abertasAbas[chave] = true;
    var corpo = alvo().querySelector(".modal-corpo");
    var pos = corpo ? corpo.scrollTop : 0;
    desenhar(ultimo);
    var novoCorpo = alvo().querySelector(".modal-corpo");
    if (novoCorpo) novoCorpo.scrollTop = pos;
  });

  function voltar() {
    if (!origem) return;
    var o = origem;
    listar(o.titulo, o.sub, o.recorte);
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-voltar]") : null;
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    voltar();
  });

  function estaAberto() { return aberto !== null || listaAberta; }
  function idAberto() { return aberto; }

  return { abrir: abrir, listar: listar, fechar: fechar, voltar: voltar,
           estaAberto: estaAberto, idAberto: idAberto };
})();
