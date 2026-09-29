window.MON = window.MON || {};

MON.graf = (function () {
  "use strict";

  var _reg = {};
  var _seq = 0;

  function teto(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var x = v / mag;
    var passo = x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10;
    return passo * mag;
  }

  function linha(series, opc) {
    opc = opc || {};
    // Os pisos aqui sao apenas guarda contra caixa degenerada (zero, negativa).
    // Quem garante espaco legivel e o CSS - se o piso brigasse com a caixa
    // medida, o preserveAspectRatio compensaria e voltariam as faixas vazias.
    var W = Math.max(240, Math.round(opc.largura || 720));
    var H = Math.max(60, Math.round(opc.altura || 180));
    var L = 42, R = 14, T = 12, B = 22;
    var iw = W - L - R, ih = H - T - B;

    var todos = [];
    series.forEach(function (s) { s.pontos.forEach(function (p) { todos.push(p.v); }); });
    if (!todos.length) return null;

    var max;
    if (opc.inteiro) {
      
      max = Math.max(4, Math.ceil(Math.max.apply(null, todos) * 1.15 / 4) * 4);
    } else {
      max = teto(Math.max.apply(null, todos) * 1.15);
      if (opc.sufixo === "%") max = Math.min(100, max);
    }

    var ts = [];
    series.forEach(function (s) { s.pontos.forEach(function (p) { ts.push(p.t); }); });
    var t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts);
    if (t1 === t0) t1 = t0 + 1;

    var x = function (t) { return L + (t - t0) / (t1 - t0) * iw; };
    var y = function (v) { return T + ih - v / max * ih; };
    
    var id = opc.id || ("g" + (++_seq));

    _reg[id] = {
      series: series, t0: t0, t1: t1, L: L, R: R, T: T, B: B,
      W: W, H: H, iw: iw, ih: ih, max: max,
      sufixo: opc.sufixo || "", inteiro: !!opc.inteiro, unidade: opc.unidade || "",
    };

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" ' +
            'role="img" aria-label="' +
            MON.fmt.esc(opc.descricao || "Série no tempo") + '"><defs>';
    series.forEach(function (se, i) {
      s += '<linearGradient id="' + id + i + '" x1="0" x2="0" y1="0" y2="1">' +
           '<stop offset="0%" stop-color="' + se.cor + '" stop-opacity=".28"/>' +
           '<stop offset="100%" stop-color="' + se.cor + '" stop-opacity="0"/></linearGradient>';
    });
    s += '</defs>';

    for (var g = 0; g <= 4; g++) {
      var vy = max * g / 4, py = y(vy);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py + '" y2="' + py +
           '" style="stroke:var(--grade)" stroke-width="1"/>' +
           '<text x="' + (L - 6) + '" y="' + (py + 3.5) + '" style="fill:var(--txt-3)" font-size="10" ' +
           'text-anchor="end">' + (max >= 10 ? Math.round(vy) : Math.round(vy * 10) / 10) +
           (opc.sufixo || "") + '</text>';
    }
    var marcas = W > 900 ? 8 : W > 600 ? 6 : 4;
    for (var k = 0; k <= marcas; k++) {
      var tt = t0 + (t1 - t0) * k / marcas;
      s += '<text x="' + x(tt) + '" y="' + (H - 6) + '" style="fill:var(--txt-3)" font-size="10" ' +
           'text-anchor="middle">' + MON.fmt.hora(tt) + '</text>';
    }

    series.forEach(function (se, i) {
      if (!se.pontos.length) return;
      var d = "";
      se.pontos.forEach(function (p, j) {
        d += (j ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1) + " ";
      });
      var area = "M" + x(se.pontos[0].t).toFixed(1) + " " + (T + ih) + " " + d.slice(1) +
                 "L" + x(se.pontos[se.pontos.length - 1].t).toFixed(1) + " " + (T + ih) + " Z";
      s += '<path d="' + area + '" fill="url(#' + id + i + ')"/>';
      s += '<path d="' + d + '" fill="none" stroke="' + se.cor +
           '" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>';
    });

    s += '<g class="graf-cursor" style="display:none">'
       + '<line class="graf-cursor-l" y1="' + T + '" y2="' + (T + ih) + '"/>'
       + series.map(function (se) {
           return '<circle class="graf-cursor-p" r="3.5" style="fill:' + se.cor + '"/>';
         }).join("")
       + "</g>";
    s += '<rect class="graf-captura" x="' + L + '" y="' + T + '" width="' + iw +
         '" height="' + ih + '" fill="transparent"/>';
    s += '</svg>';

    var leg = '<div class="legenda">' + series.map(function (se) {
      var m = se.pontos.length
        ? Math.round(se.pontos.reduce(function (a, p) { return a + p.v; }, 0) / se.pontos.length * 10) / 10
        : null;
      // contagem de maquinas nao tem casa decimal: "media 14,6 maq." nao se le.
      var texto = opc.inteiro
        ? MON.fmt.n(Math.round(m), 0, opc.unidade || "")
        : MON.fmt.n(m, 1, opc.sufixo || "");
      return '<span><i style="background:' + se.cor + '"></i>' + MON.fmt.esc(se.nome) +
             (m != null ? ' média <b style="color:' + se.cor + '">' + texto + '</b>' : '') +
             '</span>';
    }).join("") + '</div>';

    // partes = true devolve svg e legenda separados. Serve para quem precisa
    // MEDIR a caixa antes de gerar: monta a estrutura vazia, mede, e so entao
    // injeta o desenho no tamanho exato dela.
    if (opc.partes) return { svg: s, legenda: leg };

    var caixa = '<div class="grafico' + (opc.preencher ? " preenche" : "") +
                '" data-graf="' + id + '">' + s +
                '<div class="graf-tip" hidden></div></div>';
    return caixa + leg;
  }

  function quando(t) {
    var d = new Date(t);
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " "
         + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function valorTexto(v, r) {
    if (r.inteiro) return MON.fmt.n(Math.round(v), 0, r.unidade || "");
    return MON.fmt.n(v, 1, r.sufixo);
  }

  function maisPerto(pontos, t) {
    var melhor = null, dist = Infinity;
    for (var i = 0; i < pontos.length; i++) {
      var d = Math.abs(pontos[i].t - t);
      if (d < dist) { dist = d; melhor = pontos[i]; }
    }
    return melhor;
  }

  function mover(ev) {
    var caixa = ev.target.closest ? ev.target.closest(".grafico[data-graf]") : null;
    if (!caixa) return;
    var r = _reg[caixa.getAttribute("data-graf")];
    var svg = caixa.querySelector("svg");
    var tip = caixa.querySelector(".graf-tip");
    if (!r || !svg || !tip || !svg.getScreenCTM) return;

    var m = svg.getScreenCTM();
    if (!m) return;
    var pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var loc = pt.matrixTransform(m.inverse());
    if (loc.x < r.L - 2 || loc.x > r.L + r.iw + 2) return esconder(caixa);

    var frac = (loc.x - r.L) / r.iw;
    var t = r.t0 + frac * (r.t1 - r.t0);

    var cursor = caixa.querySelector(".graf-cursor");
    var linhas = "", ancora = null;
    var pontos = cursor ? cursor.querySelectorAll(".graf-cursor-p") : [];

    r.series.forEach(function (se, i) {
      var p = se.pontos.length ? maisPerto(se.pontos, t) : null;
      if (!p) { if (pontos[i]) pontos[i].style.display = "none"; return; }
      if (!ancora) ancora = p;
      var px = r.L + (p.t - r.t0) / (r.t1 - r.t0) * r.iw;
      var py = r.T + r.ih - p.v / r.max * r.ih;
      if (pontos[i]) {
        pontos[i].style.display = "";
        pontos[i].setAttribute("cx", px.toFixed(1));
        pontos[i].setAttribute("cy", py.toFixed(1));
      }
      linhas += '<div class="graf-tip-l"><i style="background:' + se.cor + '"></i>'
              + '<span>' + MON.fmt.esc(se.nome) + "</span>"
              + "<b>" + valorTexto(p.v, r) + "</b></div>";
    });
    if (!ancora) return esconder(caixa);

    if (cursor) {
      var lx = r.L + (ancora.t - r.t0) / (r.t1 - r.t0) * r.iw;
      var l = cursor.querySelector(".graf-cursor-l");
      if (l) { l.setAttribute("x1", lx.toFixed(1)); l.setAttribute("x2", lx.toFixed(1)); }
      cursor.style.display = "";
    }

    tip.innerHTML = '<div class="graf-tip-t">' + quando(ancora.t) + "</div>" + linhas;
    tip.hidden = false;

    var cr = caixa.getBoundingClientRect();
    var rel = ev.clientX - cr.left;
    var larg = tip.offsetWidth || 190;
    var esq = rel > cr.width / 2 ? rel - larg - 14 : rel + 14;
    tip.style.left = Math.max(4, Math.min(cr.width - larg - 4, esq)) + "px";
    tip.style.top = Math.max(4, ev.clientY - cr.top - tip.offsetHeight - 10) + "px";
  }

  function esconder(caixa) {
    var tip = caixa.querySelector(".graf-tip");
    var cursor = caixa.querySelector(".graf-cursor");
    if (tip) tip.hidden = true;
    if (cursor) cursor.style.display = "none";
  }

  document.addEventListener("mousemove", mover, { passive: true });
  document.addEventListener("mouseout", function (ev) {
    var caixa = ev.target.closest ? ev.target.closest(".grafico[data-graf]") : null;
    if (caixa && !caixa.contains(ev.relatedTarget)) esconder(caixa);
  }, { passive: true });

  function mini(pontos, cor, altura) {
    if (!pontos || pontos.length < 2) return "";
    var W = 300, H = altura || 46;
    var vs = pontos.map(function (p) { return p.v; });
    var mx = Math.max.apply(null, vs), mn = Math.min.apply(null, vs);
    if (mx === mn) { mx = mn + 1; }

    var d = "";
    pontos.forEach(function (p, i) {
      var px = i / (pontos.length - 1) * W;
      var py = H - 3 - (p.v - mn) / (mx - mn) * (H - 8);
      d += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
           'style="height:' + H + 'px;display:block" aria-hidden="true">' +
           '<path d="M0 ' + H + ' ' + d.slice(1) + 'L' + W + ' ' + H + ' Z" fill="' + cor + '" fill-opacity=".14"/>' +
           '<path d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="1.5"/></svg>';
  }

  return { linha: linha, mini: mini, teto: teto };
})();
