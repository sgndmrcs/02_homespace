// Geometria da escada: degraus (NBR 9050), lances estruturais e
// layout em planta/3D para cada modelo de escada.
// Unidades: cm.

import { NBR9050, espessuraTabela } from './normas.js';

export const TIPOS = {
  longitudinal: 'Longitudinal (lance reto, com ou sem patamares)',
  plissada: 'Plissada (cascata)',
  dois_lances: 'Dois lances com patamar (meia-volta)',
  L: 'Em “L” (lances apoiados em lances)',
  U: 'Em “U” (três lances)',
  autoportante: 'Autoportante (patamar em balanço)',
  transversal: 'Transversal (apoiada em vigas laterais)',
  balanco: 'Degraus em balanço',
};

const arred = (v, passo = 0.1) => Math.round(v / passo) * passo;

// Define número de espelhos, altura do espelho e piso.
export function dimensionarDegraus({ desnivel, espelhoAlvo = 17.5, piso = null }) {
  const H = desnivel;
  const nMin = Math.ceil(H / NBR9050.espelhoMax);
  const nMax = Math.floor(H / NBR9050.espelhoMin);
  let n = Math.round(H / espelhoAlvo);
  if (nMin <= nMax) n = Math.min(Math.max(n, nMin), nMax);
  n = Math.max(n, 2);
  const e = H / n;
  let p = piso;
  if (!p) {
    // Blondel com alvo central de 64 cm
    p = arred(64 - 2 * e, 0.5);
    p = Math.min(Math.max(p, NBR9050.pisoMin), NBR9050.pisoMax);
  }
  const alpha = Math.atan(e / p);
  return { n, e, p, alpha, tanA: e / p, cosA: Math.cos(alpha), sinA: Math.sin(alpha), blondel: p + 2 * e };
}

// Divide n espelhos em k lances o mais igual possível.
function dividir(n, k) {
  const base = Math.floor(n / k);
  const resto = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
}

function verificacoesNBR9050(g, ent, lancesEspelhos, patamarIntermediario) {
  const v = [];
  const add = (item, valor, limite, ok, nivel = ok ? 'ok' : 'erro') => v.push({ item, valor, limite, ok, nivel });
  add('Fórmula de Blondel (p + 2e)', `${g.blondel.toFixed(1)} cm`, '63 a 65 cm',
    g.blondel >= NBR9050.blondelMin - 0.05 && g.blondel <= NBR9050.blondelMax + 0.05);
  add('Piso (p)', `${g.p.toFixed(1)} cm`, '28 a 32 cm', g.p >= NBR9050.pisoMin && g.p <= NBR9050.pisoMax);
  add('Espelho (e)', `${g.e.toFixed(2)} cm`, '16 a 18 cm',
    g.e >= NBR9050.espelhoMin - 0.005 && g.e <= NBR9050.espelhoMax + 0.005);
  const graus = (g.alpha * 180) / Math.PI;
  add('Inclinação (α)', `${graus.toFixed(1)}°`, '26° a 32°', graus >= 25.5 && graus <= 32.5, graus >= 25.5 && graus <= 32.5 ? 'ok' : 'aviso');
  if (ent.tipo !== 'balanco') {
    const okL = ent.largura >= NBR9050.larguraMin;
    v.push({
      item: 'Largura da escada', valor: `${ent.largura} cm`, limite: '≥ 120 cm (recomendado 150 cm)', ok: okL,
      nivel: !okL ? 'erro' : ent.largura < NBR9050.larguraRecomendada ? 'info' : 'ok',
    });
  }
  lancesEspelhos.forEach((nE, i) => {
    const desn = nE * g.e;
    add(`Desnível vencido pelo lance ${i + 1}`, `${desn.toFixed(0)} cm`, '≤ 320 cm (patamar a cada 3,20 m)',
      desn <= NBR9050.desnivelMaxPorLance);
  });
  if (patamarIntermediario != null) {
    const min = Math.max(NBR9050.patamarMin, ent.largura);
    add('Comprimento do patamar', `${patamarIntermediario} cm`, `≥ ${min} cm (120 cm ou largura)`, patamarIntermediario >= min);
  }
  return v;
}

// Monta os lances estruturais e o layout 3D.
// Cada lance estrutural é descrito por "peças" em sequência:
//   { tipo: 'apoio', larg, apoio: 'viga'|'solo'|'lance', ref }
//   { tipo: 'patamar', comp }
//   { tipo: 'lance', nE }
export function montarGeometria(ent) {
  const g = dimensionarDegraus(ent);
  const { e, p } = g;
  const b = ent.largura;
  const tv = ent.apoioViga ?? 14;
  const hv = ent.alturaViga ?? 40;
  const H = g.n * e;
  const Lf = (nE) => Math.max(nE - 1, 0) * p;
  const apoioIni = ent.apoioInicial === 'solo' ? 'solo' : 'viga';
  const lances = [];
  const trechos = []; // layout 3D
  const vigas = [];
  let espelhos = [g.n];
  let patamarInt = null;
  const tipo = ent.tipo;

  const viga = (x0, y0, x1, y1, ztop, nome) => vigas.push({ x0, y0, x1, y1, ztop, alt: hv, nome });

  if (tipo === 'longitudinal' || tipo === 'plissada') {
    const a = ent.patamarInf || 0;
    const c = ent.patamarSup || 0;
    const L1 = Lf(g.n);
    const pecas = [{ tipo: 'apoio', larg: tv, apoio: apoioIni, nome: apoioIni === 'solo' ? 'Pé' : 'V1' }];
    if (a > 0) pecas.push({ tipo: 'patamar', comp: a });
    pecas.push({ tipo: 'lance', nE: g.n });
    if (c > 0) pecas.push({ tipo: 'patamar', comp: c });
    pecas.push({ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' });
    lances.push({ id: 'L1', nome: 'Lance 1', z0: 0, b, pecas, recebe: [] });
    if (a > 0) trechos.push({ tipo: 'patamar', x0: 0, y0: -a, x1: b, y1: 0, z: 0, lance: 'L1' });
    trechos.push({ tipo: 'lance', x: 0, y: 0, z: 0, dir: [0, 1], perp: [1, 0], b, nE: g.n, lance: 'L1' });
    if (c > 0) trechos.push({ tipo: 'patamar', x0: 0, y0: L1, x1: b, y1: L1 + c, z: H, lance: 'L1' });
    if (apoioIni === 'viga') viga(0, -a - tv, b, -a, 0, 'V1');
    viga(0, L1 + c, b, L1 + c + tv, H, 'V2');
  } else if (tipo === 'dois_lances' || tipo === 'autoportante') {
    const [n1, n2] = dividir(g.n, 2);
    espelhos = [n1, n2];
    const pl = ent.patamar ?? Math.max(120, b);
    patamarInt = pl;
    const gap = ent.vazio ?? 10;
    const z1 = n1 * e;
    const l1 = Lf(n1);
    const l2 = Lf(n2);
    const auto = tipo === 'autoportante';
    const fimL1 = auto ? [] : [{ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VE' }];
    lances.push({
      id: 'L1', nome: 'Lance 1', z0: 0, b, recebe: [],
      pecas: [{ tipo: 'apoio', larg: tv, apoio: apoioIni, nome: apoioIni === 'solo' ? 'Pé' : 'V1' },
        { tipo: 'lance', nE: n1 }, { tipo: 'patamar', comp: pl }, ...fimL1],
    });
    lances.push({
      id: 'L2', nome: 'Lance 2', z0: z1, b, recebe: [],
      pecas: [...(auto ? [] : [{ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VE' }]),
        { tipo: 'patamar', comp: pl }, { tipo: 'lance', nE: n2 }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' }],
    });
    trechos.push({ tipo: 'lance', x: 0, y: 0, z: 0, dir: [0, 1], perp: [1, 0], b, nE: n1, lance: 'L1' });
    trechos.push({ tipo: 'patamar', x0: 0, y0: l1, x1: 2 * b + gap, y1: l1 + pl, z: z1, lance: 'L1' });
    trechos.push({ tipo: 'lance', x: 2 * b + gap, y: l1, z: z1, dir: [0, -1], perp: [-1, 0], b, nE: n2, lance: 'L2' });
    if (apoioIni === 'viga') viga(0, -tv, b, 0, 0, 'V1');
    if (!auto) viga(0, l1 + pl, 2 * b + gap, l1 + pl + tv, z1, 'VE');
    viga(b + gap, l1 - l2 - tv, 2 * b + gap, l1 - l2, H, 'V2');
    g.autoportante = auto ? { p: pl, bp: 2 * b + gap, bl: b } : null;
  } else if (tipo === 'L') {
    const [n1, n2] = dividir(g.n, 2);
    espelhos = [n1, n2];
    const z1 = n1 * e;
    const l1 = Lf(n1);
    const l2 = Lf(n2);
    // Dois arranjos possíveis (Figura 27): o cálculo escolhe o mais eficiente.
    const arranjos = {
      A: [
        { id: 'L1', nome: 'Lance 1', z0: 0, b, recebe: [{ de: 'L2', fracao: 0.5 }],
          pecas: [{ tipo: 'apoio', larg: tv, apoio: apoioIni, nome: apoioIni === 'solo' ? 'Pé' : 'V1' },
            { tipo: 'lance', nE: n1 }, { tipo: 'patamar', comp: b }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VP' }] },
        { id: 'L2', nome: 'Lance 2', z0: z1, b, recebe: [],
          pecas: [{ tipo: 'apoio', larg: b, apoio: 'lance', ref: 'L1', nome: 'L1' },
            { tipo: 'lance', nE: n2 }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' }] },
      ],
      B: [
        { id: 'L1', nome: 'Lance 1', z0: 0, b, recebe: [],
          pecas: [{ tipo: 'apoio', larg: tv, apoio: apoioIni, nome: apoioIni === 'solo' ? 'Pé' : 'V1' },
            { tipo: 'lance', nE: n1 }, { tipo: 'apoio', larg: b, apoio: 'lance', ref: 'L2', nome: 'L2' }] },
        { id: 'L2', nome: 'Lance 2', z0: z1, b, recebe: [{ de: 'L1', fracao: 0.5 }],
          pecas: [{ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VP' }, { tipo: 'patamar', comp: b },
            { tipo: 'lance', nE: n2 }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' }] },
      ],
    };
    g.arranjos = arranjos;
    lances.push(...arranjos.A);
    trechos.push({ tipo: 'lance', x: 0, y: 0, z: 0, dir: [0, 1], perp: [1, 0], b, nE: n1, lance: 'L1' });
    trechos.push({ tipo: 'patamar', x0: 0, y0: l1, x1: b, y1: l1 + b, z: z1, lance: 'L1' });
    trechos.push({ tipo: 'lance', x: b, y: l1 + b, z: z1, dir: [1, 0], perp: [0, -1], b, nE: n2, lance: 'L2' });
    if (apoioIni === 'viga') viga(0, -tv, b, 0, 0, 'V1');
    viga(b + l2, l1, b + l2 + tv, l1 + b, H, 'V2');
    g.vigasArranjo = {
      A: { x0: 0, y0: l1 + b, x1: b, y1: l1 + b + tv, ztop: z1, alt: hv, nome: 'VP' },
      B: { x0: -tv, y0: l1, x1: 0, y1: l1 + b, ztop: z1, alt: hv, nome: 'VP' },
    };
  } else if (tipo === 'U') {
    const [n1, n2, n3] = dividir(g.n, 3);
    espelhos = [n1, n2, n3];
    const z1 = n1 * e;
    const z2 = (n1 + n2) * e;
    const l1 = Lf(n1);
    const l2 = Lf(n2);
    const l3 = Lf(n3);
    lances.push({ id: 'L1', nome: 'Lance 1', z0: 0, b, recebe: [{ de: 'L2', fracao: 0.5 }],
      pecas: [{ tipo: 'apoio', larg: tv, apoio: apoioIni, nome: apoioIni === 'solo' ? 'Pé' : 'V1' },
        { tipo: 'lance', nE: n1 }, { tipo: 'patamar', comp: b }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VP1' }] });
    lances.push({ id: 'L2', nome: 'Lance 2', z0: z1, b, recebe: [],
      pecas: [{ tipo: 'apoio', larg: b, apoio: 'lance', ref: 'L1', nome: 'L1' }, { tipo: 'lance', nE: n2 },
        { tipo: 'apoio', larg: b, apoio: 'lance', ref: 'L3', nome: 'L3' }] });
    lances.push({ id: 'L3', nome: 'Lance 3', z0: z2, b, recebe: [{ de: 'L2', fracao: 0.5 }],
      pecas: [{ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'VP2' }, { tipo: 'patamar', comp: b },
        { tipo: 'lance', nE: n3 }, { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' }] });
    const xr = 2 * b + l2;
    trechos.push({ tipo: 'lance', x: 0, y: 0, z: 0, dir: [0, 1], perp: [1, 0], b, nE: n1, lance: 'L1' });
    trechos.push({ tipo: 'patamar', x0: 0, y0: l1, x1: b, y1: l1 + b, z: z1, lance: 'L1' });
    trechos.push({ tipo: 'lance', x: b, y: l1 + b, z: z1, dir: [1, 0], perp: [0, -1], b, nE: n2, lance: 'L2' });
    trechos.push({ tipo: 'patamar', x0: b + l2, y0: l1, x1: xr, y1: l1 + b, z: z2, lance: 'L3' });
    trechos.push({ tipo: 'lance', x: xr, y: l1, z: z2, dir: [0, -1], perp: [-1, 0], b, nE: n3, lance: 'L3' });
    if (apoioIni === 'viga') viga(0, -tv, b, 0, 0, 'V1');
    viga(0, l1 + b, b, l1 + b + tv, z1, 'VP1');
    viga(b + l2, l1 + b, xr, l1 + b + tv, z2, 'VP2');
    viga(b + l2, l1 - l3 - tv, xr, l1 - l3, H, 'V2');
  } else if (tipo === 'transversal' || tipo === 'balanco') {
    const L1 = Lf(g.n);
    lances.push({ id: 'L1', nome: 'Lance 1', z0: 0, b, recebe: [],
      pecas: [{ tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V1' }, { tipo: 'lance', nE: g.n },
        { tipo: 'apoio', larg: tv, apoio: 'viga', nome: 'V2' }] });
    trechos.push({ tipo: tipo === 'balanco' ? 'degraus_balanco' : 'lance', x: 0, y: 0, z: 0, dir: [0, 1], perp: [1, 0],
      b, nE: g.n, lance: 'L1', hd: ent.espessuraDegrau ?? 12 });
    // vigas laterais inclinadas
    const vi = (x0, x1) => vigas.push({ inclinada: true, x0, x1, y0: -p / 2, y1: L1 + p / 2, z0: 0, z1: H, alt: hv, nome: 'VI' });
    vi(-tv, 0);
    if (tipo === 'transversal') vi(b, b + tv);
  }

  g.verificacoes = verificacoesNBR9050(g, ent, espelhos, patamarInt);
  g.lancesEspelhos = espelhos;
  g.H = H;
  g.lances = lances;
  g.trechos = trechos;
  g.vigas = vigas;
  g.tv = tv;
  g.hv = hv;
  return g;
}

// Comprimento horizontal ocupado por uma peça (cm)
export function compPeca(peca, p) {
  if (peca.tipo === 'apoio') return peca.larg;
  if (peca.tipo === 'patamar') return peca.comp;
  return Math.max(peca.nE - 1, 0) * p;
}

// Vão de cálculo do lance (centro a centro dos apoios), em cm.
export function vaoCalculo(lance, p) {
  const pecas = lance.pecas;
  let total = pecas.reduce((s, pc) => s + compPeca(pc, p), 0);
  const ini = pecas[0];
  const fim = pecas[pecas.length - 1];
  if (ini.tipo === 'apoio') total -= ini.larg / 2;
  if (fim.tipo === 'apoio') total -= fim.larg / 2;
  return total;
}

// Espessura de pré-dimensionamento (eq. 1.4 e Tabela 1.1)
export function espessuraPre(vaoCm) {
  const vaoM = vaoCm / 100;
  return Math.max(10, Math.ceil(0.03 * vaoCm), espessuraTabela(vaoM));
}
