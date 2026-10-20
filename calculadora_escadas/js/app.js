// Interface da calculadora: formulário, abas, desenhos, 3D e AR.

import { calcularEscada, PADRAO } from './calculo.js';
import { TIPOS } from './geometria.js';
import { SOBRECARGAS, ALVENARIAS, FORCAS_HORIZONTAIS } from './normas.js';
import { htmlResumo, htmlVerificacoes, htmlLances, htmlQuadro, htmlMemorial } from './relatorio.js';
import { svgPerfil, svgPlanta, svgDiagramas, svgBalanco } from './detalhamento.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CHAVE = 'calculadora-escadas:v1';

const ICONES = {
  longitudinal: '<path d="M8 50h18l40-34h26"/><path d="M26 50l40-34" opacity=".3"/>',
  plissada: '<path d="M8 50h14v-6h8v-6h8v-6h8v-6h8v-6h8v-6h22"/><path d="M22 56h10v-6h8v-6h8v-6h8v-6h8v-6h8v-6h14"/>',
  dois_lances: '<rect x="10" y="8" width="80" height="14"/><path d="M10 22v32h36V22M54 22v32h36V22"/><path d="M28 50V26M72 26v24" marker-end=""/>',
  L: '<path d="M10 54V10h80v26H40v18z"/><path d="M10 40h30M10 30h30M10 20h30M50 10v26M60 10v26M70 10v26"/>',
  U: '<path d="M8 56V8h84v48H66V30H34v26z"/><path d="M8 44h26M8 34h26M66 44h26M66 34h26M44 8v22M56 8v22"/>',
  autoportante: '<path d="M8 54l40-30h44"/><path d="M8 30l40-6"/><path d="M48 24v4h44" opacity=".4"/><path d="M92 24v6"/>',
  transversal: '<rect x="12" y="10" width="76" height="40"/><path d="M12 10v40M88 10v40" stroke-width="5"/><path d="M24 30h52" stroke-dasharray="4 3"/>',
  balanco: '<path d="M14 8v48" stroke-width="5"/><path d="M14 48h40M14 38h40M14 28h40M14 18h40"/>',
};

let estado = { ...PADRAO, disponivel: null };
let resultado = null;
let visualizador = null;
let threeMod = null;
let sessaoAR = null;

// ------------------------------------------------------------ montagem
function montarModelos() {
  const box = $('#modelos');
  box.innerHTML = Object.entries(TIPOS).map(([id, nome]) => `<button type="button" class="modelo" data-tipo="${id}" aria-pressed="false">`
    + `<svg viewBox="0 0 100 60" aria-hidden="true">${ICONES[id]}</svg><span>${nome}</span></button>`).join('');
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('.modelo');
    if (!b) return;
    estado.tipo = b.dataset.tipo;
    sincronizarFormulario();
    calcular();
  });
}

function preencherSelects() {
  $('#sel-sobrecarga').innerHTML = SOBRECARGAS.map((s) => `<option value="${s.id}">${s.nome} – ${s.q.toString().replace('.', ',')} kN/m²</option>`).join('');
  $('#sel-alvenaria').innerHTML = ALVENARIAS.map((a) => `<option value="${a.id}">${a.nome}</option>`).join('');
  $('#sel-forca').innerHTML = FORCAS_HORIZONTAIS.map((f) => `<option value="${f.id}">${f.nome} – ${f.h.toString().replace('.', ',')} kN/m</option>`).join('');
}

const obter = (obj, nome) => nome.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function definir(obj, nome, v) {
  const ks = nome.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = { ...(o[ks[i]] || {}) };
  o[ks[ks.length - 1]] = v;
}

function sincronizarFormulario() {
  const form = $('#form');
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = obter(estado, el.name);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : String(v);
  }
  $$('.modelo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === estado.tipo)));
  $$('[data-tipos]', form).forEach((el) => { el.hidden = !el.dataset.tipos.split(' ').includes(estado.tipo); });
  $$('[data-tipos-not]', form).forEach((el) => { el.hidden = el.dataset.tiposNot.split(' ').includes(estado.tipo); });
  $$('[data-parapeito]', form).forEach((el) => { el.hidden = !estado.parapeito.ativo; });
  $$('[data-solo]', form).forEach((el) => { el.hidden = estado.apoioInicial !== 'solo' || estado.tipo === 'balanco' || estado.tipo === 'transversal'; });
}

function lerFormulario() {
  const form = $('#form');
  const novo = JSON.parse(JSON.stringify(estado));
  for (const el of form.elements) {
    if (!el.name) continue;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
    else v = el.value;
    if (['fck', 'fyk', 'cobrimento', 'agregado', 'parapeito.revestFace', 'parapeito.lados'].includes(el.name)) v = Number(v);
    definir(novo, el.name, v);
  }
  estado = novo;
}

function salvarLocal() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* armazenamento indisponível */ }
}
function carregarLocal() {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) estado = { ...PADRAO, ...JSON.parse(s) };
  } catch { /* ignora */ }
}

// ------------------------------------------------------------ cálculo
function calcular() {
  try {
    resultado = calcularEscada(estado);
  } catch (e) {
    console.error(e);
    $('#res-resumo').innerHTML = `<div class="alerta alerta-erro"><p>Erro no cálculo: ${e.message}</p></div>`;
    return;
  }
  resultado.disponivel = verificarDisponivel(resultado);
  renderizar();
  salvarLocal();
}

function extensaoPlanta(g) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  const usa = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const t of g.trechos) {
    if (t.tipo === 'patamar') { usa(t.x0, t.y0); usa(t.x1, t.y1); continue; }
    const comp = Math.max(t.nE - 1, 0) * g.p;
    usa(t.x, t.y);
    usa(t.x + t.dir[0] * comp + t.perp[0] * t.b, t.y + t.dir[1] * comp + t.perp[1] * t.b);
  }
  return { x: x1 - x0, y: y1 - y0 };
}

function verificarDisponivel(res) {
  const ext = extensaoPlanta(res.g);
  const disp = estado.disponivel;
  const txt = `Projeção em planta (sem vigas): ${Math.round(ext.x)} × ${Math.round(ext.y)} cm.`;
  if (!disp) return `<p class="nota">${txt}</p>`;
  const ok = ext.y <= disp;
  return `<div class="alerta ${ok ? 'alerta-ok' : 'alerta-erro'}"><p>${ok ? '✔' : '✖'} ${txt} Comprimento disponível: ${disp} cm `
    + `${ok ? '— a escada cabe no local.' : '— a escada NÃO cabe: use patamar/lances em L ou U, ou reduza o piso.'}</p></div>`;
}

function renderizar() {
  const r = resultado;
  $('#res-resumo').innerHTML = htmlResumo(r);
  $('#res-verif').innerHTML = htmlVerificacoes(r);
  $('#res-lances').innerHTML = htmlLances(r);
  $('#res-quadro').innerHTML = htmlQuadro(r);
  $('#memorial').innerHTML = htmlMemorial(r);
  renderizarDesenhos(r);
  if (visualizador) atualizar3D();
}

function prancha(titulo, svg, id) {
  return `<article class="prancha"><header><h3>${titulo}</h3>`
    + `<button type="button" class="botao" data-baixar-svg="${id}">SVG</button></header><div id="${id}">${svg}</div></article>`;
}

function renderizarDesenhos(r) {
  const partes = [];
  partes.push(prancha('Planta', svgPlanta(r.g), 'dsn-planta'));
  partes.push('<p class="legenda"><span><i style="background:var(--barra-pos)"></i>Positiva</span><span><i style="background:var(--barra-neg)"></i>Negativa</span><span><i style="background:var(--barra-dist)"></i>Distribuição</span></p>');
  if (!r.erros.length) {
    if (r.especial && r.especial.tipo === 'balanco') {
      partes.push(prancha('Degrau em balanço – elevação', svgBalanco(r.especial, r.ent, r.g), 'dsn-balanco'));
    } else if (r.especial && r.especial.tipo === 'autoportante') {
      r.especial.lances.forEach((x, i) => {
        const barras = r.especial.barras.filter((b) => b.lance === x.ln.nome);
        partes.push(prancha(`${x.ln.nome} – corte longitudinal`, svgPerfil(x.perfil, barras, { titulo: x.ln.nome, hv: r.g.hv }), `dsn-l${i}`));
      });
    } else {
      r.lances.forEach((l, i) => {
        const titulo = l.perfil.transversal ? `${l.lance.nome} – seção transversal (armadura principal transversal)` : `${l.lance.nome} – corte longitudinal`;
        partes.push(prancha(titulo, svgPerfil(l.perfil, l.barras, { titulo: l.lance.nome, hv: r.g.hv }), `dsn-l${i}`));
        partes.push(prancha(`${l.lance.nome} – esforços característicos`, svgDiagramas(l.anK, l.Lcm / 100), `dsn-d${i}`));
      });
    }
  }
  $('#desenhos').innerHTML = partes.join('');
}

// ------------------------------------------------------------ 3D
async function carregarThree() {
  if (!threeMod) {
    const [m3d, oc] = await Promise.all([import('./modelo3d.js'), import('three/addons/controls/OrbitControls.js')]);
    threeMod = { ...m3d, OrbitControls: oc.OrbitControls };
  }
  return threeMod;
}

async function iniciar3D() {
  if (visualizador) return;
  try {
    const t = await carregarThree();
    visualizador = t.criarVisualizador($('#visualizador'), t.OrbitControls);
    atualizar3D();
  } catch (e) {
    console.error(e);
    $('#visualizador').innerHTML = `<p class="nota" style="padding:16px">Não foi possível carregar o 3D (${e.message}). Verifique a conexão.</p>`;
  }
}

function atualizar3D() {
  if (!visualizador || !resultado || resultado.erros.length) return;
  const tam = visualizador.atualizar(resultado, { armadura: $('#chk-armadura').checked });
  $('#dim-3d').textContent = `Modelo em escala real: ${tam.x.toFixed(2)} × ${tam.z.toFixed(2)} m em planta, ${tam.y.toFixed(2)} m de altura`;
}

// ------------------------------------------------------------ AR
async function abrirAR(modoInicial = 'posicionar') {
  if (!resultado || resultado.erros.length) {
    alert('Calcule uma escada válida antes de abrir a AR.');
    return;
  }
  const t = await carregarThree();
  const ar = await import('./ar.js');
  if (await ar.suporteWebXR()) {
    const overlay = $('#ar-overlay');
    overlay.hidden = false;
    const modelo = t.construirModelo(resultado, { opacidade: Number($('#ar-opac').value) });
    try {
      sessaoAR = await ar.iniciarWebXR({
        modelo,
        overlay,
        ui: {
          status: (txt) => { $('#ar-status').textContent = txt; },
          medida: (m) => {
            $('#ar-medida').hidden = false;
            $('#ar-medida-txt').innerHTML = `Horizontal: <b>${(m.horizontal * 100).toFixed(0)} cm</b> · Vertical: <b>${(m.vertical * 100).toFixed(0)} cm</b>`;
            sessaoAR.ultima = m;
          },
          fim: () => { overlay.hidden = true; $('#ar-medida').hidden = true; sessaoAR = null; },
        },
      });
      definirModoAR(modoInicial);
    } catch (e) {
      overlay.hidden = true;
      alert(`Não foi possível iniciar a AR: ${e.message}`);
    }
    return;
  }
  // iOS (Quick Look) ou navegador sem WebXR
  if (modoInicial === 'medir') {
    $('#nota-medir').textContent = 'A medição pela câmera requer Chrome no Android com ARCore. No iPhone, use o app “Medida” e digite os valores.';
    return;
  }
  const blob = await ar.exportarGLB(t.construirModelo(resultado));
  const cont = $('#mv-container');
  cont.hidden = false;
  await ar.abrirModelViewer(cont, blob);
  $('#ar-suporte').textContent = ar.ehIOS()
    ? 'iPhone/iPad: toque em “Ver no meu espaço (AR)” para abrir o AR Quick Look em escala real.'
    : 'Este navegador não suporta WebXR. Se o botão AR não aparecer, use o Chrome no Android (ARCore) ou Safari no iOS.';
  cont.scrollIntoView({ behavior: 'smooth' });
}

function definirModoAR(m) {
  if (!sessaoAR) return;
  sessaoAR.modo(m);
  $('#ar-modo-pos').setAttribute('aria-pressed', String(m === 'posicionar'));
  $('#ar-modo-med').setAttribute('aria-pressed', String(m === 'medir'));
  if (m !== 'medir') $('#ar-medida').hidden = true;
}

function usarMedida(campo) {
  if (!sessaoAR || !sessaoAR.ultima) return;
  const m = sessaoAR.ultima;
  if (campo === 'desnivel') estado.desnivel = Math.round(m.vertical * 1000) / 10;
  else estado.disponivel = Math.round(m.horizontal * 100);
  sincronizarFormulario();
  calcular();
  $('#ar-status').textContent = campo === 'desnivel'
    ? `Desnível atualizado para ${estado.desnivel} cm e escada recalculada.`
    : `Comprimento disponível = ${estado.disponivel} cm.`;
  $('#nota-medir').textContent = `Última medição AR: horizontal ${(m.horizontal * 100).toFixed(0)} cm, vertical ${(m.vertical * 100).toFixed(0)} cm.`;
}

// ------------------------------------------------------------ eventos
function trocarAba(id) {
  $$('.abas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === id)));
  $$('.aba').forEach((s) => s.classList.toggle('ativa', s.id === `aba-${id}`));
  if (id === 'ar') iniciar3D();
  try { sessionStorage.setItem(`${CHAVE}:aba`, id); } catch { /* ignora */ }
}

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ligarEventos() {
  let timer = null;
  const form = $('#form');
  form.addEventListener('input', () => {
    lerFormulario();
    sincronizarFormulario();
    clearTimeout(timer);
    timer = setTimeout(calcular, 250);
  });
  form.addEventListener('change', () => { lerFormulario(); sincronizarFormulario(); calcular(); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    lerFormulario();
    calcular();
    trocarAba('resultados');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $$('.abas button').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
  $('#chk-armadura').addEventListener('change', atualizar3D);
  $('#bt-ar').addEventListener('click', () => abrirAR('posicionar'));
  $('#bt-medir').addEventListener('click', () => abrirAR('medir'));
  $('#bt-glb').addEventListener('click', async () => {
    if (!resultado || resultado.erros.length) return;
    const t = await carregarThree();
    const ar = await import('./ar.js');
    baixar('escada.glb', await ar.exportarGLB(t.construirModelo(resultado, { armadura: $('#chk-armadura').checked })));
  });
  $('#ar-sair').addEventListener('click', () => sessaoAR && sessaoAR.sair());
  $('#ar-modo-pos').addEventListener('click', () => definirModoAR('posicionar'));
  $('#ar-modo-med').addEventListener('click', () => definirModoAR('medir'));
  $('#ar-girar-e').addEventListener('click', () => sessaoAR && sessaoAR.girar(15));
  $('#ar-girar-d').addEventListener('click', () => sessaoAR && sessaoAR.girar(-15));
  $('#ar-girar-1e').addEventListener('click', () => sessaoAR && sessaoAR.girar(1));
  $('#ar-girar-1d').addEventListener('click', () => sessaoAR && sessaoAR.girar(-1));
  $('#ar-opac').addEventListener('input', (ev) => sessaoAR && sessaoAR.opacidade(Number(ev.target.value)));
  $('#ar-usar-desnivel').addEventListener('click', () => usarMedida('desnivel'));
  $('#ar-usar-comp').addEventListener('click', () => usarMedida('comprimento'));
  $('#bt-salvar').addEventListener('click', () => baixar('escada.json', JSON.stringify(estado, null, 2), 'application/json'));
  $('#in-abrir').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      estado = { ...PADRAO, ...JSON.parse(await f.text()) };
      sincronizarFormulario();
      calcular();
    } catch (e) {
      alert(`Arquivo inválido: ${e.message}`);
    }
    ev.target.value = '';
  });
  $('#bt-imprimir').addEventListener('click', () => window.print());
  $('#desenhos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-baixar-svg]');
    if (!b) return;
    const el = document.getElementById(b.dataset.baixarSvg).querySelector('svg');
    const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } })
      .filter((t) => t.startsWith('.desenho') || t.startsWith(':root')).join('\n');
    const clone = el.cloneNode(true);
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = css;
    clone.insertBefore(st, clone.firstChild);
    baixar(`${b.dataset.baixarSvg}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  });
}

async function verificarSuporteAR() {
  const nota = $('#ar-suporte');
  if (!window.isSecureContext) {
    nota.textContent = 'A câmera/AR exige HTTPS (ex.: GitHub Pages). Abra a calculadora por um endereço https://.';
    return;
  }
  try {
    const ar = await import('./ar.js');
    if (await ar.suporteWebXR()) nota.textContent = 'WebXR disponível: posicionamento e medição em AR habilitados.';
    else if (ar.ehIOS()) nota.textContent = 'iPhone/iPad: a AR abre pelo AR Quick Look (posicionar e girar com os dedos).';
    else nota.textContent = 'WebXR AR não detectado neste navegador. No Android use o Chrome com Google Play Services for AR.';
  } catch { /* sem módulo */ }
}

// ------------------------------------------------------------ início
carregarLocal();
montarModelos();
preencherSelects();
sincronizarFormulario();
ligarEventos();
calcular();
verificarSuporteAR();
try {
  const aba = sessionStorage.getItem(`${CHAVE}:aba`);
  if (aba) trocarAba(aba);
} catch { /* ignora */ }
