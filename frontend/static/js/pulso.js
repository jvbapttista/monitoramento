window.MON = window.MON || {};

class Pulso {

  constructor() {
    this.alvo = null;
  }

  static ler(resumo) {
    const problema = resumo.com_problema || 0;
    const criticos = resumo.criticos || 0;

    if (!problema) {
      return {
        tom: "ok", numero: 0, rotulo: "tudo tranquilo",
        sub: "nenhuma máquina com problema", clicavel: false
      };
    }

    return {
      tom: criticos ? "critico" : "alto",
      numero: problema,
      rotulo: problema === 1 ? "máquina com problema" : "máquinas com problema",
      
      sub: criticos
        ? (MON.fmt.inteiro(criticos) + " em estado crítico")
        : (MON.fmt.inteiro(resumo.problemas || 0) + " problemas abertos"),
      clicavel: true
    };
  }

  desenhar() {
    if (!this.alvo) return;
    const d = MON.estado.dados;

    if (!d || !d.resumo) {
      this.alvo.innerHTML = '<div class="esqueleto" style="height:52px"></div>';
      return;
    }

    const e = Pulso.ler(d.resumo);

    const recorte = JSON.stringify({ especial: "com_problema" });

    this.alvo.innerHTML =
      '<button class="pulso" data-tom="' + e.tom + '"'
      + (e.clicavel
          ? " data-lista='" + MON.fmt.esc(recorte) + "'"
            + ' data-lista-tit="Máquinas com problema"'
            + ' data-lista-sub="' + MON.fmt.esc(e.sub) + '"'
            + ' title="' + MON.fmt.esc(e.numero + " " + e.rotulo + " — clique para ver quais") + '"'
          : ' disabled title="Nenhuma máquina com problema agora"')
      + ">"
      +   '<span class="pulso-ponto" aria-hidden="true"></span>'
      +   (e.numero
            ? '<span class="pulso-num">' + MON.fmt.inteiro(e.numero) + "</span>"
            : '<span class="pulso-num pulso-ok" aria-hidden="true">&#10003;</span>')
      +   '<span class="pulso-txt">'
      +     '<span class="pulso-rot">' + MON.fmt.esc(e.rotulo) + "</span>"
      +     '<span class="pulso-sub">' + MON.fmt.esc(e.sub) + "</span>"
      +   "</span>"
      + "</button>";
  }

  iniciar() {
    this.alvo = document.getElementById("pulso");
    if (!this.alvo) return;
    this.desenhar();
    
    MON.estado.observar(() => this.desenhar());
  }
}

MON.pulso = new Pulso();
