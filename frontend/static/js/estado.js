window.MON = window.MON || {};

MON.estado = (function () {
  "use strict";

  var dados = null;          // ultimo payload do servidor
  var erro = null;           // erro de comunicacao, se houver
  var carregando = true;
  var conexao = { ok: false, ultimo_erro: null };
  var recebidoEm = 0;        // relogio local do navegador, para "ha quanto"

  var observadores = [];

  var VAZIO = {
    busca: "", projeto: "", grupo: "", status: "",
    severidade: "", escopo: "", problema: "", especial: "", parada: ""
  };
  var filtros = Object.assign({}, VAZIO);

  var ROTULO = {
    busca: "Busca", projeto: "Projeto", grupo: "Grupo", status: "Status",
    severidade: "Severidade", escopo: "Escopo", problema: "Problema",
    especial: "Recorte",
    parada: "Tempo parada"
  };

  var ESPECIAL = {
    criticos: "Com problema grave",
    com_problema: "Com problema aberto",
    problema_leve: "Com problema leve",
    sem_contato: "Sem contato há horas",
    disco: "Disco quase cheio",
    disco_urgente: "Disco abaixo de 5%",
    disco_baixo: "Disco entre 5% e 10%",
    disco_atencao: "Disco em atenção",
    disco_ok: "Disco com folga",
    ram_8: "RAM de até 8 GB",
    ram_16: "RAM de 9 a 16 GB",
    ram_32: "RAM acima de 16 GB",
    sem_dados: "Ligada, sem medição",
    memoria: "Memória alta",
    cpu: "CPU alta"
  };

  function observar(fn) { observadores.push(fn); }

  function avisar() {
    for (var i = 0; i < observadores.length; i++) {
      try { observadores[i](); }
      catch (e) { console.error("observador falhou:", e); }
    }
  }

  function receber(payload) {
    // payload malformado nao pode derrubar a tela: mantem o que ja havia e
    // registra como falha de comunicacao
    if (!payload || typeof payload !== "object" || !payload.resumo) {
      falhar("o servidor devolveu um pacote inválido");
      return;
    }
    dados = payload;
    conexao = payload.conexao || { ok: true };
    erro = null;
    carregando = false;
    recebidoEm = Date.now();
    avisar();
  }

  function receberPulso(info) {
    if (info && info.conexao) conexao = info.conexao;
    avisar();
  }

  function falhar(mensagem) {
    erro = mensagem;
    carregando = false;
    conexao = Object.assign({}, conexao, { ok: false, ultimo_erro: mensagem });
    avisar();
  }

  function idadeSegundos() {
    if (!recebidoEm) return null;
    return Math.floor((Date.now() - recebidoEm) / 1000);
  }

  function filtroAtivo() {
    for (var k in filtros) if (filtros[k]) return true;
    return false;
  }

  function definir(campo, valor) {
    if (!(campo in filtros)) return;
    filtros[campo] = valor == null ? "" : String(valor);
    avisar();
  }

  function alternar(campo, valor) {
    if (!(campo in filtros)) return;
    var v = valor == null ? "" : String(valor);
    filtros[campo] = (filtros[campo] === v) ? "" : v;
    avisar();
  }

  function aplicar(recorte) {
    var igual = true;
    for (var k in recorte) if (filtros[k] !== String(recorte[k])) igual = false;
    limpar(true);
    if (!igual) {
      for (var c in recorte) if (c in filtros) filtros[c] = String(recorte[c]);
    }
    avisar();
  }

  function limpar(silencioso) {
    filtros = Object.assign({}, VAZIO);
    if (!silencioso) avisar();
  }

  function remover(campo) { definir(campo, ""); }

  function ativos() {
    var lista = [];
    for (var k in filtros) {
      if (!filtros[k]) continue;
      lista.push({ campo: k, rotulo: ROTULO[k], valor: legivel(k, filtros[k]) });
    }
    return lista;
  }

  function legivel(campo, valor) {
    if (campo === "severidade") return MON.fmt.nomeSeveridade(valor) + " ou pior";
    if (campo === "especial") return ESPECIAL[valor] || valor;
    if (campo === "escopo") return MON.fmt.nomeEscopo(valor);
    if (campo === "status") return valor === "online" ? "Online" : "Offline";
    return valor;
  }

  function limites() {
    return (dados && dados.limites) || {
      disco_critico: 10, disco_atencao: 20, cpu_alta: 85, memoria_alta: 90
    };
  }

  function casaBusca(m, termo) {
    return (m.hostname + " " + m.projeto + " " + m.ip + " " +
            (m.grupos || []).join(" ") + " " + (m.sistema || "")
           ).toLowerCase().indexOf(termo) !== -1;
  }

  function maquinas() {
    return maquinasCom(filtros);
  }

  function maquinasCom(recorte) {
    if (!dados) return [];
    var f = Object.assign({}, VAZIO, recorte || {});
    var lim = limites();
    var termo = (f.busca || "").trim().toLowerCase();

    return dados.maquinas.filter(function (m) {
      if (termo && !casaBusca(m, termo)) return false;
      if (f.projeto && m.projeto !== f.projeto) return false;
      if (f.grupo && (m.grupos || []).indexOf(f.grupo) === -1) return false;
      if (f.status === "online" && !m.online) return false;
      if (f.status === "offline" && m.online) return false;
      if (f.severidade && m.pior_severidade < Number(f.severidade)) return false;
      if (f.escopo && !(m.lista_problemas || []).some(function (p) {
        return p.escopo === f.escopo;
      })) return false;
      if (f.problema && !(m.lista_problemas || []).some(function (p) {
        return p.nome === f.problema;
      })) return false;

      if (f.parada) {
        var refS = dados.resumo.coletado_em || (Date.now() / 1000);
        if (f.parada === "nunca") {
          
          if (m.visto_em) return false;
        } else {
          if (!m.visto_em) return false;
          if ((refS - m.visto_em) < parseInt(f.parada, 10) * 86400) return false;
        }
      }

      switch (f.especial) {
        case "criticos":
          if (m.pior_severidade < 4) return false; break;
        case "com_problema":
          if (!m.problemas) return false; break;
        
        case "problema_leve":
          if (!(m.problemas && m.pior_severidade < 4)) return false; break;
        
        case "sem_contato":
          if (m.online) return false;
          if (m.visto_em && (dados.resumo.coletado_em || 0) - m.visto_em
              < (dados.resumo.horas_sem_contato || 8) * 3600) return false;
          break;
        
        case "disco_urgente":
          if (!(m.disco_livre != null && m.disco_livre < lim.disco_urgente)) return false; break;
        case "disco":
          if (!(m.disco_livre != null && m.disco_livre < lim.disco_critico)) return false; break;
        case "disco_baixo":
          if (!(m.disco_livre != null && lim.disco_urgente <= m.disco_livre
                && m.disco_livre < lim.disco_critico)) return false; break;
        case "disco_ok":
          if (!(m.disco_livre != null && m.disco_livre >= lim.disco_atencao)) return false; break;
        
        case "ram_8":
          if (!(m.memoria_total && m.memoria_total <= 8 * 1073741824)) return false; break;
        case "ram_16":
          if (!(m.memoria_total && m.memoria_total > 8 * 1073741824
                && m.memoria_total <= 16 * 1073741824)) return false; break;
        case "ram_32":
          if (!(m.memoria_total && m.memoria_total > 16 * 1073741824)) return false; break;
        case "disco_atencao":
          if (!(m.disco_livre != null && m.disco_livre >= lim.disco_critico
                && m.disco_livre < lim.disco_atencao)) return false; break;
        case "sem_dados":
          if (!(m.sem_dados && m.online)) return false; break;
        case "memoria":
          if (!(m.memoria != null && m.memoria >= lim.memoria_alta)) return false; break;
        case "cpu":
          if (!(m.cpu != null && m.cpu >= lim.cpu_alta)) return false; break;
      }
      return true;
    });
  }

  function problemas() {
    if (!dados) return [];
    var f = filtros;
    var termo = f.busca.trim().toLowerCase();
    var permitidos = null;

    if (f.especial || f.parada || f.projeto || f.grupo || f.status || termo) {
      permitidos = {};
      maquinas().forEach(function (m) { permitidos[m.hostid] = true; });
    }

    return dados.problemas.filter(function (p) {
      if (permitidos && !permitidos[p.hostid]) return false;
      if (f.severidade && p.severidade < Number(f.severidade)) return false;
      if (f.escopo && p.escopo !== f.escopo) return false;
      if (f.problema && p.nome !== f.problema) return false;
      if (termo && !permitidos) {
        if ((p.hostname + " " + p.nome).toLowerCase().indexOf(termo) === -1) return false;
      }
      return true;
    });
  }

  function maquinaPor(hostid) {
    if (!dados) return null;
    for (var i = 0; i < dados.maquinas.length; i++) {
      if (dados.maquinas[i].hostid === String(hostid)) return dados.maquinas[i];
    }
    return null;
  }

  return {
    observar: observar, avisar: avisar,
    receber: receber, receberPulso: receberPulso, falhar: falhar,
    definir: definir, alternar: alternar, aplicar: aplicar,
    limpar: limpar, remover: remover, ativos: ativos, filtroAtivo: filtroAtivo,
    maquinas: maquinas, maquinasCom: maquinasCom,
    problemas: problemas, maquinaPor: maquinaPor,
    limites: limites, idadeSegundos: idadeSegundos,
    get dados() { return dados; },
    get erro() { return erro; },
    get carregando() { return carregando; },
    get conexao() { return conexao; },
    get filtros() { return filtros; },
    ESPECIAL: ESPECIAL
  };
})();
