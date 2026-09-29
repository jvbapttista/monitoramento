window.MON = window.MON || {};

MON.usuarios = (function () {
  "use strict";

  var CABECALHO = "X-Monitoramento";
  var lista = [];
  var eu = null;
  var recado = null;   // {tipo, texto, senha}

  function chamar(caminho, metodo, corpo) {
    var opc = {
      method: metodo || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    };
    
    opc.headers[CABECALHO] = "1";
    if (corpo) opc.body = JSON.stringify(corpo);
    return fetch(caminho, opc).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (j) {
          if (!r.ok) throw new Error(j.erro || ("falha HTTP " + r.status));
          return j;
        });
    });
  }

  function carregar() {
    return chamar("/api/usuarios").then(function (j) {
      lista = j.usuarios || [];
      eu = j.eu;
      desenhar();
    }).catch(function (e) {
      recado = { tipo: "erro", texto: e.message };
      desenhar();
    });
  }

  function criar() {
    var nome = (document.getElementById("novo-usuario") || {}).value || "";
    var master = !!(document.getElementById("novo-master") || {}).checked;
    if (!nome.trim()) {
      recado = { tipo: "erro", texto: "Informe o nome do usuário." };
      return desenhar();
    }
    chamar("/api/usuarios", "POST", { usuario: nome.trim(), master: master })
      .then(function (j) {
        recado = {
          tipo: "senha",
          texto: "Conta " + j.usuario + " criada" + (j.master ? " como master" : "")
                 + ". Passe esta senha para a pessoa — ela vai trocá-la no primeiro acesso.",
          senha: j.senha_temporaria
        };
        return carregar();
      })
      .catch(function (e) { recado = { tipo: "erro", texto: e.message }; desenhar(); });
  }

  function redefinir(nome) {
    if (!confirm("Gerar senha temporária nova para " + nome + "?\n\n"
                 + "A senha atual dela deixa de funcionar na hora.")) return;
    chamar("/api/usuarios/" + encodeURIComponent(nome) + "/senha", "POST")
      .then(function (j) {
        recado = {
          tipo: "senha",
          texto: "Senha de " + j.usuario + " redefinida. Ela vai trocá-la no próximo acesso.",
          senha: j.senha_temporaria
        };
        return carregar();
      })
      .catch(function (e) { recado = { tipo: "erro", texto: e.message }; desenhar(); });
  }

  function alternarMaster(nome, virar) {
    chamar("/api/usuarios/" + encodeURIComponent(nome) + "/master", "POST",
           { master: virar })
      .then(function () {
        recado = { tipo: "ok", texto: nome + (virar ? " agora é master." : " deixou de ser master.") };
        return carregar();
      })
      .catch(function (e) { recado = { tipo: "erro", texto: e.message }; desenhar(); });
  }

  function remover(nome) {
    if (!confirm("Remover a conta " + nome + "?\n\nIsso não pode ser desfeito.")) return;
    chamar("/api/usuarios/" + encodeURIComponent(nome), "DELETE")
      .then(function () {
        recado = { tipo: "ok", texto: "Conta " + nome + " removida." };
        return carregar();
      })
      .catch(function (e) { recado = { tipo: "erro", texto: e.message }; desenhar(); });
  }

  function quando(seg) {
    if (!seg) return "nunca";
    return MON.fmt.dataHora(seg);
  }

  function desenhar() {
    var alvo = document.getElementById("vista");
    if (!alvo) return;

    var caixaRecado = "";
    if (recado) {
      if (recado.tipo === "senha") {
        caixaRecado =
          '<div class="us-senha">'
          + "<p>" + MON.fmt.esc(recado.texto) + "</p>"
          + '<code class="us-senha-valor">' + MON.fmt.esc(recado.senha) + "</code>"
          + '<p class="us-senha-nota">Esta senha aparece <b>uma única vez</b>. '
          + "Ela não fica guardada em nenhum lugar — se perder, é só redefinir de novo.</p>"
          + '<button class="botao" data-us-acao="fechar-recado">Entendi, já anotei</button>'
          + "</div>";
      } else {
        caixaRecado = '<div class="' + (recado.tipo === "erro" ? "login-erro" : "login-aviso")
          + '">' + MON.fmt.esc(recado.texto) + "</div>";
      }
    }

    var linhas = lista.map(function (u) {
      var souEu = u.usuario === eu;
      return "<tr>"
        + "<td><b>" + MON.fmt.esc(u.usuario) + "</b>"
        +   (souEu ? ' <span class="us-eu">você</span>' : "") + "</td>"
        + "<td>" + (u.master ? '<span class="selo-master">master</span>' : "—") + "</td>"
        + "<td>" + (u.trocar ? '<span class="us-pendente">senha temporária</span>' : "ativa") + "</td>"
        + "<td>" + MON.fmt.esc(quando(u.ultimo_acesso)) + "</td>"
        + "<td>" + MON.fmt.esc(u.criado_por || "—") + "</td>"
        + '<td class="us-acoes">'
        +   '<button class="botao botao-p" data-us-acao="senha" data-us-nome="'
        +     MON.fmt.esc(u.usuario) + '">Redefinir senha</button>'
        +   '<button class="botao botao-p" data-us-acao="master" data-us-nome="'
        +     MON.fmt.esc(u.usuario) + '" data-us-valor="' + (u.master ? "0" : "1") + '">'
        +     (u.master ? "Tirar master" : "Tornar master") + "</button>"
        +   (souEu ? ""
              : '<button class="botao botao-p botao-perigo" data-us-acao="remover"'
                + ' data-us-nome="' + MON.fmt.esc(u.usuario) + '">Remover</button>')
        + "</td></tr>";
    }).join("");

    alvo.innerHTML =
      '<div class="vista-cab">'
      +   '<a class="vista-voltar" href="#" data-vista="null">&#8592; Painel</a>'
      +   '<h2 class="vista-tit">Usuários</h2>'
      +   '<span class="vista-sub">' + lista.length
      +     (lista.length === 1 ? " conta" : " contas") + " · "
      +     lista.filter(function (u) { return u.master; }).length + " master</span>"
      + "</div>"
      + caixaRecado
      + '<div class="painel"><div class="painel-corpo">'
      +   '<div class="us-novo">'
      +     '<input class="campo" id="novo-usuario" type="text" autocomplete="off"'
      +       ' spellcheck="false" placeholder="nome.sobrenome">'
      +     '<label class="us-check"><input type="checkbox" id="novo-master"> master</label>'
      +     '<button class="botao" data-us-acao="criar">Criar conta</button>'
      +     '<span class="us-dica">A senha é gerada pelo sistema e trocada pela pessoa no primeiro acesso.</span>'
      +   "</div>"
      +   '<div class="tabela-caixa"><table class="tabela"><thead><tr>'
      +     "<th>Usuário</th><th>Papel</th><th>Senha</th><th>Último acesso</th>"
      +     "<th>Criado por</th><th></th>"
      +   "</tr></thead><tbody>" + linhas + "</tbody></table></div>"
      + "</div></div>";
  }

  function ligarCliques() {
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-us-acao]") : null;
      if (!b) return;
      ev.preventDefault();
      var acao = b.getAttribute("data-us-acao");
      var nome = b.getAttribute("data-us-nome");
      if (acao === "criar") return criar();
      if (acao === "senha") return redefinir(nome);
      if (acao === "master") return alternarMaster(nome, b.getAttribute("data-us-valor") === "1");
      if (acao === "remover") return remover(nome);
      if (acao === "fechar-recado") { recado = null; return desenhar(); }
    });
  }

  return { carregar: carregar, desenhar: desenhar, ligarCliques: ligarCliques,
           limparRecado: function () { recado = null; } };
})();
