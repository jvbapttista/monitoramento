window.MON = window.MON || {};

class Menu {

  constructor() {
    this.CHAVE = "monitoramento:menu-fixo";
    
    this.ESTREITO = window.matchMedia("(max-width: 900px)");
    this.espiando = false;
    this.gaveta = false;      
    this.travado = false;     
  }

  get fixo() {
    try { return localStorage.getItem(this.CHAVE) === "1"; }
    catch (e) { return false; }
  }

  set fixo(v) {
    try { localStorage.setItem(this.CHAVE, v ? "1" : "0"); }
    catch (e) {  }
  }

  aplicar() {
    const estreito = this.ESTREITO.matches;
    const fixo = this.fixo && !estreito;
    const aberto = this.travado || fixo
                 || (estreito ? this.gaveta : this.espiando);

    document.body.classList.toggle("menu-fixo", fixo);
    if (this.aside) this.aside.classList.toggle("aberto", aberto);

    const veu = document.getElementById("menu-veu");
    if (veu) veu.hidden = !(estreito && aberto);

    this.pintarBotao();
  }

  pintarBotao() {
    const bt = document.getElementById("bt-menu");
    if (!bt) return;
    const fixo = this.fixo && !this.ESTREITO.matches;
    bt.innerHTML = fixo ? Menu.SETA_ESQ : Menu.SETA_DIR;
    const rotulo = fixo
      ? "Minimizar o menu — fica só a barra de ícones"
      : "Fixar o menu aberto";
    bt.setAttribute("aria-label", rotulo);
    bt.setAttribute("title", rotulo);
    bt.setAttribute("aria-pressed", fixo ? "true" : "false");
  }

  alternarFixo() {
    if (this.ESTREITO.matches) { this.alternarGaveta(); return; }
    this.fixo = !this.fixo;
    this.espiando = false;
    this.aplicar();
  }

  alternarGaveta() {
    this.gaveta = !this.gaveta;
    this.aplicar();
  }

  fecharGaveta() {
    if (!this.gaveta) return;
    this.gaveta = false;
    this.aplicar();
  }

  espiar(v) {
    
    if (this.ESTREITO.matches) return;
    if (this.espiando === v) return;
    this.espiando = v;
    this.aplicar();
  }

  travar(v) {
    this.travado = !!v;
    this.aplicar();
  }

  iniciar() {
    this.aside = document.getElementById("menu-lateral");
    if (!this.aside) return;

    const bt = document.getElementById("bt-menu");
    if (bt) bt.addEventListener("click", () => this.alternarFixo());

    const gav = document.getElementById("bt-menu-gaveta");
    if (gav) gav.addEventListener("click", () => this.alternarGaveta());

    const veu = document.getElementById("menu-veu");
    if (veu) veu.addEventListener("click", () => this.fecharGaveta());

    this.aside.addEventListener("mouseenter", () => this.espiar(true));
    this.aside.addEventListener("mouseleave", () => this.espiar(false));

    this.aside.addEventListener("focusin", () => this.espiar(true));
    this.aside.addEventListener("focusout", (ev) => {
      if (!this.aside.contains(ev.relatedTarget)) this.espiar(false);
    });

    this.aside.addEventListener("click", (ev) => {
      if (!this.ESTREITO.matches) return;
      if (ev.target.closest && ev.target.closest("[data-vista]")) {
        this.fecharGaveta();
      }
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (this.gaveta) this.fecharGaveta();
      else this.espiar(false);
    });

    const mudou = () => { this.gaveta = false; this.espiando = false; this.aplicar(); };
    if (this.ESTREITO.addEventListener) this.ESTREITO.addEventListener("change", mudou);
    else if (this.ESTREITO.addListener) this.ESTREITO.addListener(mudou);

    this.aplicar();
  }
}

Menu.SETA_ESQ =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M15 5l-7 7 7 7"/></svg>';
Menu.SETA_DIR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M9 5l7 7-7 7"/></svg>';

MON.menu = new Menu();
MON.menu.iniciar();
