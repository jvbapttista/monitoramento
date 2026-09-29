window.MON = window.MON || {};

MON.fluxo = (function () {
  "use strict";

  var fonte = null;
  var relogioReserva = null;
  var tentativas = 0;
  var modo = "iniciando";        // sse | reserva | iniciando
  var ultimoPulso = 0;
  var vigia = null;

  function agora() { return Date.now(); }

  function abrir() {
    if (!window.EventSource) { usarReserva("navegador sem suporte a SSE"); return; }

    try { fonte = new EventSource("/api/fluxo"); }
    catch (e) { usarReserva("nao foi possivel abrir o fluxo"); return; }

    fonte.addEventListener("open", function () {
      modo = "sse";
      tentativas = 0;
      ultimoPulso = agora();
    });

    fonte.addEventListener("painel", function (ev) {
      ultimoPulso = agora();
      try { MON.estado.receber(JSON.parse(ev.data)); }
      catch (e) { console.error("painel invalido:", e); }
    });

    fonte.addEventListener("pulso", function (ev) {
      ultimoPulso = agora();
      try { MON.estado.receberPulso(JSON.parse(ev.data)); }
      catch (e) {  }
    });

    fonte.addEventListener("erro", function (ev) {
      try { MON.estado.falhar(JSON.parse(ev.data).erro); }
      catch (e) { MON.estado.falhar("erro no fluxo de dados"); }
    });

    fonte.addEventListener("error", function () {
      
      fetch("/api/eu", { cache: "no-store", credentials: "same-origin" })
        .then(function (r) { if (r.status === 401) sessaoCaiu(); })
        .catch(function () {  });

      if (fonte && fonte.readyState === EventSource.CLOSED) {
        tentativas++;
        if (tentativas >= 3) { usarReserva("fluxo interrompido"); return; }
        MON.estado.falhar("reconectando ao servidor...");
        setTimeout(abrir, Math.min(8000, 1000 * tentativas));
      } else {
        MON.estado.falhar("conexao com o servidor instavel");
      }
    });
  }

  function sessaoCaiu() {
    location.href = "/login";
  }

  function buscar() {
    return fetch("/api/painel", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 401) { sessaoCaiu(); return { ok: false, corpo: {} }; }
        return r.json().then(function (corpo) { return { ok: r.ok, corpo: corpo }; });
      })
      .then(function (res) {
        ultimoPulso = agora();
        if (res.ok) MON.estado.receber(res.corpo);
        else MON.estado.falhar(res.corpo.erro || "o servidor nao devolveu dados");
      })
      .catch(function () {
        MON.estado.falhar("sem conexao com o servidor");
      });
  }

  function usarReserva(motivo) {
    if (modo === "reserva") return;
    modo = "reserva";
    if (fonte) { fonte.close(); fonte = null; }
    console.warn("[monitoramento] usando busca periodica:", motivo);
    buscar();
    if (relogioReserva) clearInterval(relogioReserva);
    relogioReserva = setInterval(buscar, 5000);
  }

  function vigiar() {
    vigia = setInterval(function () {
      if (!ultimoPulso) return;
      var silencio = (agora() - ultimoPulso) / 1000;
      if (silencio > 30 && modo === "sse") {
        MON.estado.falhar("sem sinal do servidor ha " + Math.round(silencio) + "s");
      }
      MON.estado.avisar();   // atualiza o "ha quanto tempo" no cabecalho
    }, 1000);
  }

  function iniciar() {
    // Primeira carga por HTTP: a tela nasce preenchida mesmo que o proximo
    // ciclo de coleta so termine daqui a alguns segundos.
    buscar().then(abrir);
    vigiar();
  }

  function encerrar() {
    if (fonte) fonte.close();
    if (relogioReserva) clearInterval(relogioReserva);
    if (vigia) clearInterval(vigia);
  }

  return {
    iniciar: iniciar, encerrar: encerrar, forcar: buscar,
    get modo() { return modo; },
    get silencioSegundos() {
      return ultimoPulso ? Math.floor((agora() - ultimoPulso) / 1000) : null;
    }
  };
})();
