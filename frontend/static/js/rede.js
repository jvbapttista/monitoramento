window.MON = window.MON || {};

class PainelRede {

  constructor() {
    this.alvo = null;
  }

  static ler(r) {
    const total = r.total || 0;
    const horas = r.horas || 24;
    
    const porHora = total / horas;

    let tom = "ok", veredito = "rede estável";
    if (porHora >= 8) { tom = "critico"; veredito = "rede instável"; }
    else if (porHora >= 3) { tom = "alto"; veredito = "rede oscilando"; }

    return { total, horas, tom, veredito };
  }

  desenhar() {
    if (!this.alvo) return;
    const d = MON.estado.dados;

    if (!d) { this.alvo.innerHTML = '<div class="esqueleto" style="height:230px"></div>'; return; }

    const r = d.rede;
    
    if (!r || !r.pontos || !r.pontos.length) {
      this.alvo.innerHTML =
        '<div class="estado-vazio">Sem leitura de estabilidade ainda — '
        + "ela é recolhida a cada 2 minutos.</div>";
      return;
    }

    const e = PainelRede.ler(r);

    const serieLink = r.pontos.map((p) => ({ t: p.t * 1000, v: p.link }));
    const serieAg = r.pontos.map((p) => ({ t: p.t * 1000, v: p.agente }));

    const grafico = MON.graf.linha(
      [{ nome: "Queda de link", cor: "var(--critico)", pontos: serieLink },
       { nome: "Sem contato", cor: "var(--medio)", pontos: serieAg }],
      { altura: 150, inteiro: true, unidade: "" }
    );

    this.alvo.innerHTML =
      '<div class="rede-cab" data-tom="' + e.tom + '">'
      +   '<span class="rede-num">' + MON.fmt.inteiro(e.total) + "</span>"
      +   '<span class="rede-txt"><b>' + MON.fmt.esc(e.veredito) + "</b>"
      +     "<small>oscilações nas últimas " + e.horas + " h</small></span>"
      +   (r.pior_hora
            ? '<span class="rede-pico">pior hora<b>'
              + PainelRede.hora(r.pior_hora.t) + "</b>" + r.pior_hora.n + " quedas</span>"
            : "")
      + "</div>"
      + (grafico || "")
      + this.ofensores(r)
      + this.nota(r);
  }

  ofensores(r) {
    const m = r.maquinas || [];
    if (!m.length) return "";
    return '<div class="rede-lista"><span class="rede-lista-tit">'
      + "Onde mais oscila</span>"
      + m.slice(0, 5).map((x) =>
          '<button class="rede-item" data-host="' + MON.fmt.esc(x.hostid) + '">'
          + '<span class="rede-item-n">' + MON.fmt.esc(x.hostname) + "</span>"
          + '<span class="rede-item-q">' + MON.fmt.inteiro(x.quedas) + "</span>"
          + "</button>").join("")
      + "</div>";
  }

  nota(r) {
    const desc = r.descartadas || {};
    const fora = (desc.longas || 0) + (desc.abertas || 0);
    if (!fora) return "";
    return '<p class="rede-nota">Conta só o que voltou sozinho em até '
      + (r.limite_piscada_min || 15) + " min. Outras <b>"
      + MON.fmt.inteiro(fora) + "</b> quedas ficaram de fora — são máquina "
      + "desligada ou problema que ainda está aberto, e aparecem em "
      + "<i>Principais problemas agora</i>.</p>";
  }

  static hora(t) {
    const d = new Date(t * 1000);
    return String(d.getHours()).padStart(2, "0") + "h";
  }

  iniciar() {
    this.alvo = document.getElementById("rede");
    if (!this.alvo) return;
    this.desenhar();
    MON.estado.observar(() => this.desenhar());
  }
}

MON.painelRede = new PainelRede();
