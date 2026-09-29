(function () {
  "use strict";

  var OLHO_ABERTO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12z"/>'
    + '<circle cx="12" cy="12" r="3.2"/></svg>';

  var OLHO_FECHADO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M9.9 5.2A8.9 8.9 0 0 1 12 5c6.5 0 10.2 7 10.2 7a17 17 0 0 1-3 3.9"/>'
    + '<path d="M6.4 6.5A17 17 0 0 0 1.8 12S5.5 19 12 19c1.9 0 3.5-.6 4.9-1.4"/>'
    + '<path d="M10 10a3.2 3.2 0 0 0 4.3 4.3"/>'
    + '<path d="M3 3l18 18"/></svg>';

  function equipar(campo) {
    if (!campo || campo.type !== "password") return;

    var caixa = campo.parentNode;
    caixa.classList.add("com-olho");

    var bt = document.createElement("button");
    bt.type = "button";            // sem isto, clicar ENVIARIA o formulario
    bt.className = "olho";
    bt.innerHTML = OLHO_ABERTO;
    bt.setAttribute("aria-label", "Mostrar a senha");
    bt.setAttribute("title", "Mostrar a senha");

    bt.addEventListener("click", function () {
      var mostrando = campo.type === "text";
      campo.type = mostrando ? "password" : "text";
      bt.innerHTML = mostrando ? OLHO_ABERTO : OLHO_FECHADO;
      var rot = mostrando ? "Mostrar a senha" : "Ocultar a senha";
      bt.setAttribute("aria-label", rot);
      bt.setAttribute("title", rot);
      
      campo.focus();
      var fim = campo.value.length;
      try { campo.setSelectionRange(fim, fim); } catch (e) {  }
    });

    caixa.appendChild(bt);
  }

  function iniciar() {
    var campos = document.querySelectorAll('.login-campo input[type="password"]');
    [].forEach.call(campos, equipar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
}());
