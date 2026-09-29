window.MON = window.MON || {};

class Tema {

  constructor() {
    
    this.CHAVE = "monitoramento:tema";

    this.ESCURO = "escuro";
    this.CLARO = "claro";

    this.raiz = document.documentElement;
  }

  get escolhido() {
    try {
      const v = localStorage.getItem(this.CHAVE);
      return (v === this.CLARO || v === this.ESCURO) ? v : null;
    } catch (e) {
      return null;
    }
  }

  set escolhido(valor) {
    try { localStorage.setItem(this.CHAVE, valor); }
    catch (e) {  }
  }

  get doSistema() {
    return (window.matchMedia
            && window.matchMedia("(prefers-color-scheme: light)").matches)
      ? this.CLARO : this.ESCURO;
  }

  get atual() {
    return this.escolhido || this.doSistema;
  }

  aplicar(nome) {
    
    if (nome === this.CLARO) this.raiz.setAttribute("data-tema", this.CLARO);
    else this.raiz.removeAttribute("data-tema");
    this.pintarBotao(nome);
  }

  alternar() {
    const novo = this.atual === this.CLARO ? this.ESCURO : this.CLARO;
    this.escolhido = novo;
    this.aplicar(novo);
    return novo;
  }

  pintarBotao(nome) {
    const bt = document.getElementById("bt-tema");
    if (!bt) return;
    const paraClaro = nome !== this.CLARO;
    bt.innerHTML = paraClaro ? Tema.SOL : Tema.LUA;
    const rotulo = paraClaro ? "Mudar para o tema claro"
                             : "Mudar para o tema escuro";
    bt.setAttribute("aria-label", rotulo);
    bt.setAttribute("title", rotulo);
  }

  ligarBotao() {
    const bt = document.getElementById("bt-tema");
    if (!bt) return;
    this.pintarBotao(this.atual);
    bt.addEventListener("click", () => this.alternar());
  }

  iniciar() {
    this.aplicar(this.atual);

    if (window.matchMedia) {
      const consulta = window.matchMedia("(prefers-color-scheme: light)");
      const reagir = () => { if (!this.escolhido) this.aplicar(this.doSistema); };
      
      if (consulta.addEventListener) consulta.addEventListener("change", reagir);
      else if (consulta.addListener) consulta.addListener(reagir);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.ligarBotao());
    } else {
      this.ligarBotao();
    }
  }
}

Tema.SOL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
  + ' stroke-linecap="round" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="4.2"/>'
  + '<path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2'
  + 'M6.5 6.5 4.9 4.9M19.1 19.1l-1.6-1.6M17.5 6.5l1.6-1.6M4.9 19.1l1.6-1.6"/></svg>';

Tema.LUA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';

MON.tema = new Tema();
MON.tema.iniciar();
