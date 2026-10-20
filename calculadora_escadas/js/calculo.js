// Motor de cálculo de escadas de concreto armado.
// Roteiro: "Projetos de Escadas de Concreto Armado" (IBEE) e NBR 6118:2014.
// Unidades internas: cm, kN, MPa (convertidos quando indicado).

import { SOBRECARGAS, ALVENARIAS, FORCAS_HORIZONTAIS, ALTURA_FORCA_HORIZONTAL, BITOLAS, rhoMin } from './normas.js';
import { montarGeometria, vaoCalculo, espessuraPre, compPeca } from './geometria.js';
import { construirPerfil, tracarArmaduras, comprimento, pontosDistribuicao } from './perfil.js';

export const PADRAO = {
  tipo: 'longitudinal',
  desnivel: 280,
  espelhoAlvo: 17.5,
  piso: null,
  largura: 120,
  patamarInf: 0,
  patamarSup: 0,
  patamar: 120,
  vazio: 10,
  apoioViga: 14,
  alturaViga: 40,
  apoioInicial: 'viga',
  espessura: null,
  espessuraDegrau: 12,
  fck: 25,
  fyk: 500,
  cobrimento: 2.5,
  gammaC: 25,
  agregado: 1.0,
  sobrecargaId: 'res_unid',
  revestimento: 1.0,
  parapeito: { ativo: false, alvenariaId: 'ved_cer_9', revestFace: 1, altura: 1.1, lados: 1 },
  forcaHorizontalId: 'privada',
  ppLanceEmTudo: true,
  tensaoSolo: 0.3,
  arranjoL: 'auto',
  comprimentoNegativa: 0.25,
};

export function normalizar(ent) {
  const r = { ...PADRAO, ...ent };
  r.parapeito = { ...PADRAO.parapeito, ...(ent && ent.parapeito) };
  for (const k of ['desnivel', 'espelhoAlvo', 'largura', 'patamarInf', 'patamarSup', 'patamar', 'vazio', 'apoioViga',
    'alturaViga', 'espessuraDegrau', 'fck', 'fyk', 'cobrimento', 'gammaC', 'revestimento', 'tensaoSolo', 'agregado']) {
    r[k] = Number(r[k]);
  }
  r.piso = r.piso ? Number(r.piso) : null;
  r.espessura = r.espessura ? Number(r.espessura) : null;
  return r;
}

// ---------------------------------------------------------------- materiais
export function materiais(ent) {
  const fck = ent.fck;
  const fyk = ent.fyk;
  const gc = 1.4;
  const gs = 1.15;
  const fctm = 0.3 * Math.pow(fck, 2 / 3); // eq. 3.5 (fctm)
  const fctkInf = 0.7 * fctm;
  const fctd = fctkInf / gc; // eq. 3.4
  const Eci = ent.agregado * 5600 * Math.sqrt(fck);
  const alphaI = Math.min(0.8 + (0.2 * fck) / 80, 1);
  const Ecs = alphaI * Eci;
  return {
    fck, fyk, gc, gs,
    fcd: fck / gc,
    fyd: fyk / gs,
    fctm, fctkInf, fctd,
    tauRd: 0.25 * fctd, // eq. 3.3
    Eci, alphaI, Ecs,
    Es: 210000,
    gammaC: ent.gammaC,
  };
}

// ------------------------------------------------------------ análise linear
// Viga biapoiada (vão L em m) com cargas uniformes por trecho [a, b] (m), q em kN/m.
export function biapoiada(L, cargas, nPts = 200) {
  let total = 0;
  let momA = 0;
  for (const c of cargas) {
    const F = c.q * (c.b - c.a);
    total += F;
    momA += F * (c.a + c.b) / 2;
  }
  const RB = momA / L;
  const RA = total - RB;
  const M = (x) => {
    let m = RA * x;
    for (const c of cargas) {
      if (x <= c.a) continue;
      const fim = Math.min(x, c.b);
      const F = c.q * (fim - c.a);
      m -= F * (x - (c.a + fim) / 2);
    }
    return m;
  };
  const V = (x) => {
    let v = RA;
    for (const c of cargas) {
      if (x <= c.a) continue;
      v -= c.q * (Math.min(x, c.b) - c.a);
    }
    return v;
  };
  let Mmax = 0;
  let xM = 0;
  const diag = [];
  for (let i = 0; i <= nPts; i++) {
    const x = (L * i) / nPts;
    const m = M(x);
    diag.push([x, m, V(x)]);
    if (m > Mmax) { Mmax = m; xM = x; }
  }
  return { RA, RB, total, Mmax, xM, diag };
}

// --------------------------------------------------------- flexão (ELU)
// Md em kN·cm, bw e d em cm, fcd/fyd em MPa. Retorna As em cm².
export function flexaoSimples(Md, bw, d, fcd, fyd) {
  const fcdk = fcd / 10; // kN/cm²
  const fydk = fyd / 10;
  const rad = 1 - Md / (0.425 * bw * d * d * fcdk);
  if (rad < 0) return { ok: false, motivo: 'Seção insuficiente: aumente a espessura.' };
  const x = 1.25 * d * (1 - Math.sqrt(rad));
  const xd = x / d;
  const z = d - 0.4 * x;
  const As = Md / (fydk * z);
  const dominio = xd <= 0.259 ? 2 : xd <= 0.628 ? 3 : 4;
  return { ok: true, x, xd, z, As, dominio, ductil: xd <= 0.45 };
}

// Flexo-tração (N de tração no centro da seção). Md kN·cm, Nd kN.
export function flexoTracao(Md, Nd, bw, h, d, dl, fcd, fyd) {
  const fydk = fyd / 10;
  const ys = d - h / 2;
  const e = Nd > 0 ? Md / Nd : Infinity;
  if (e <= ys) {
    // pequena excentricidade (domínio 1): duas armaduras tracionadas
    const dd = d - dl;
    const As1 = (Nd * (dd / 2 + e)) / (fydk * dd);
    const As2 = (Nd * (dd / 2 - e)) / (fydk * dd);
    return { ok: true, caso: 'pequena excentricidade (domínio 1)', As: As1, As2, e };
  }
  const Ms = Md - Nd * ys;
  const fs = flexaoSimples(Ms, bw, d, fcd, fyd);
  if (!fs.ok) return fs;
  return { ...fs, caso: 'grande excentricidade (domínios 2/3)', As: fs.As + Nd / fydk, Ms, e };
}

// ---------------------------------------------------- escolha das barras
// As em cm²/m. Retorna bitola, espaçamento e alternativas.
export function barrasLaje(As, { smax, phiMin = 6.3, phiMax = 16, sPref = 10, sMin = 7 }) {
  const alt = [];
  for (const b of BITOLAS) {
    if (b.phi < phiMin - 1e-9 || b.phi > phiMax + 1e-9) continue;
    let s = Math.floor((100 * b.area) / As);
    s = Math.min(s, smax);
    if (s < sMin) continue;
    alt.push({ phi: b.phi, s, AsEf: (100 * b.area) / s, massa: b.massa, area: b.area });
  }
  if (!alt.length) return { ok: false, alternativas: [] };
  const escolhida = alt.find((a) => a.s >= sPref) || alt[alt.length - 1];
  return { ok: true, ...escolhida, alternativas: alt };
}

// Barras em elemento linear (degrau em balanço): número de barras.
export function barrasViga(As, bw, c, { phiMin = 6.3, phiMax = 16, phiEstribo = 5 } = {}) {
  const alt = [];
  for (const b of BITOLAS) {
    if (b.phi < phiMin - 1e-9 || b.phi > phiMax + 1e-9) continue;
    const n = Math.max(2, Math.ceil(As / b.area - 1e-9));
    const ah = Math.max(2, b.phi / 10, 1.2 * 1.9);
    const cabe = Math.floor((bw - 2 * c - 2 * phiEstribo / 10 + ah) / (b.phi / 10 + ah));
    if (n <= cabe) alt.push({ phi: b.phi, n, AsEf: n * b.area, massa: b.massa, area: b.area });
  }
  if (!alt.length) return { ok: false, alternativas: [] };
  const escolhida = alt.find((a) => a.n <= 4) || alt[alt.length - 1];
  return { ok: true, ...escolhida, alternativas: alt };
}

const bitola = (phi) => BITOLAS.find((b) => Math.abs(b.phi - phi) < 1e-9);

// ------------------------------------------------------------ ancoragem
export function ancoragem(phi, mat, { boaAderencia = true, AsCalc = 1, AsEf = 1, gancho = false } = {}) {
  const eta1 = 2.25;
  const eta2 = boaAderencia ? 1.0 : 0.7;
  const eta3 = phi <= 32 ? 1.0 : (132 - phi) / 100;
  const fbd = eta1 * eta2 * eta3 * mat.fctd; // MPa
  const lb = Math.max((phi / 4) * (mat.fyd / fbd), 25 * phi); // mm
  const alpha = gancho ? 0.7 : 1.0;
  const lbMin = Math.max(0.3 * lb, 10 * phi, 100);
  const lbNec = Math.max(alpha * lb * (AsCalc / AsEf), lbMin);
  return { phi, fbd, lb: lb / 10, lbNec: lbNec / 10, lbMin: lbMin / 10, alpha };
}

export function traspasse(phi, mat, { boaAderencia = true, proporcao = 1.0 } = {}) {
  const a = ancoragem(phi, mat, { boaAderencia });
  const a0t = proporcao <= 0.2 ? 1.2 : proporcao <= 0.25 ? 1.4 : proporcao <= 0.33 ? 1.6 : proporcao <= 0.5 ? 1.8 : 2.0;
  const l0tMin = Math.max(0.3 * a0t * a.lb * 10, 15 * phi, 200) / 10;
  return { phi, alpha0t: a0t, l0t: Math.max(a0t * a.lbNec, l0tMin) };
}

// ----------------------------------------------------- cisalhamento (laje)
export function cortanteLaje(Vsd, d, bw, mat, rho1 = 0) {
  const dm = d / 100;
  const k = Math.max(1.6 - dm, 1);
  const tau = mat.tauRd; // MPa
  const VRd1 = tau * k * (1.2 + 40 * Math.min(rho1, 0.02)) * (bw / 100) * dm * 1000; // kN
  return { k, tauRd: tau, VRd1, ok: Vsd <= VRd1 };
}

// ----------------------------------------------------------- flecha (ELS)
function xiT(t) {
  return t <= 70 ? 0.68 * Math.pow(0.996, t) * Math.pow(t, 0.32) : 2;
}

export function flechaBiapoiada({ Lcm, qSer, Mser, h, d, As, mat, bw = 100, t0 = 1, coef = 5 / 384, limiteDiv = 250 }) {
  const fctm = mat.fctm / 10; // kN/cm²
  const Ecs = mat.Ecs / 10;
  const Ic = (bw * h ** 3) / 12;
  const Mr = (1.5 * fctm * Ic) / (h / 2); // kN·cm
  const ae = mat.Es / mat.Ecs;
  const a = bw / 2;
  const bq = ae * As;
  const cq = -ae * As * d;
  const xII = (-bq + Math.sqrt(bq * bq - 4 * a * cq)) / (2 * a);
  const III = (bw * xII ** 3) / 3 + ae * As * (d - xII) ** 2;
  const Ma = Mser; // kN·cm
  let Ieq = Ic;
  if (Ma > Mr) {
    const r3 = (Mr / Ma) ** 3;
    Ieq = Math.min(r3 * Ic + (1 - r3) * III, Ic);
  }
  const EI = Ecs * Ieq;
  const f0 = (coef * (qSer / 100) * Lcm ** 4) / EI; // qSer em kN/m → kN/cm
  const alphaF = xiT(70.1) - xiT(t0);
  const fInf = f0 * (1 + alphaF);
  const lim = Lcm / limiteDiv;
  return { Ic, Mr, ae, xII, III, Ieq, estadio: Ma > Mr ? 'II (fissurado)' : 'I', f0, alphaF, fInf, lim, ok: fInf <= lim };
}

// ------------------------------------------------------------- cargas
function cargasComuns(ent) {
  const sc = SOBRECARGAS.find((s) => s.id === ent.sobrecargaId) || SOBRECARGAS[0];
  const fh = FORCAS_HORIZONTAIS.find((f) => f.id === ent.forcaHorizontalId) || FORCAS_HORIZONTAIS[0];
  const par = ent.parapeito;
  const alv = ALVENARIAS.find((a) => a.id === par.alvenariaId) || ALVENARIAS[0];
  return { sc, fh, par, alv, gAlv: alv.v[par.revestFace] ?? alv.v[0] };
}

function ppEspessuraMedia(g, h, plissada) {
  // eq. 2.2 (convencional) e 2.4 (plissada)
  return plissada ? h + g.tanA * h : h / g.cosA + g.e / 2;
}

// ------------------------------------------------- lance longitudinal
function calcularLance(lance, ctx) {
  const { g, ent, mat, h, plissada, comuns, extras } = ctx;
  const perfil = construirPerfil(lance, g, h, plissada);
  const apoios = perfil.apoios;
  const eixoA = apoios[0].eixo;
  const eixoB = apoios[apoios.length - 1].eixo;
  const Lcm = eixoB - eixoA;
  const L = Lcm / 100;
  const b = lance.b;
  const gc = ent.gammaC;
  const hm = ppEspessuraMedia(g, h, plissada);
  const ppLance = (gc * hm) / 100;
  const ppPat = ent.ppLanceEmTudo ? ppLance : (gc * h) / 100;
  const rev = ent.revestimento;
  const sc = comuns.sc.q;

  // parapeito (eq. 2.7)
  let qPar = 0;
  let Lalv = 0;
  if (comuns.par.ativo) {
    for (const pc of lance.pecas) {
      if (pc.tipo === 'lance') Lalv += compPeca(pc, g.p) / g.cosA;
      else if (pc.tipo === 'patamar') Lalv += pc.comp;
    }
    Lalv /= 100;
    qPar = (comuns.gAlv * comuns.par.altura * Lalv * comuns.par.lados) / (L * (b / 100));
  }
  const add = extras[lance.id] || { g: 0, q: 0 };

  // intervalos de carga (m, a partir do eixo do apoio A)
  const fronteiras = new Set([eixoA, eixoB]);
  for (const z of perfil.zonas) {
    if (z.s0 > eixoA && z.s0 < eixoB) fronteiras.add(z.s0);
    if (z.s1 > eixoA && z.s1 < eixoB) fronteiras.add(z.s1);
  }
  const fr = [...fronteiras].sort((a, b) => a - b);
  const intervalos = [];
  for (let i = 1; i < fr.length; i++) {
    const meio = (fr[i - 1] + fr[i]) / 2;
    const zona = perfil.zonas.find((z) => meio >= z.s0 && meio <= z.s1);
    const pp = zona && zona.tipo === 'lance' ? ppLance : ppPat;
    intervalos.push({ a: (fr[i - 1] - eixoA) / 100, b: (fr[i] - eixoA) / 100, g: pp + rev + qPar + add.g, q: sc + add.q });
  }
  const anK = biapoiada(L, intervalos.map((t) => ({ a: t.a, b: t.b, q: t.g + t.q })));
  const anG = biapoiada(L, intervalos.map((t) => ({ a: t.a, b: t.b, q: t.g })));
  const anQ = biapoiada(L, intervalos.map((t) => ({ a: t.a, b: t.b, q: t.q })));
  const psi2 = comuns.sc.psi2;
  const anS = biapoiada(L, intervalos.map((t) => ({ a: t.a, b: t.b, q: t.g + psi2 * t.q })));

  const qTotLance = ppLance + rev + qPar + add.g + sc + add.q;
  const cargas = {
    hm, ppLance, ppPat, rev, sc, qPar, Lalv, adicG: add.g, adicQ: add.q,
    qLance: qTotLance, qPatamar: ppPat + rev + qPar + add.g + sc + add.q, psi2,
  };

  return finalizarLaje({
    lance, perfil, ctx, Lcm, b, anK, anG, anQ, anS, cargas,
    Vk: Math.max(anK.RA, anK.RB) * g.cosA,
    Nk: Math.max(anK.RA, anK.RB) * g.sinA,
  });
}

// Dimensionamento, detalhamento e ELS de uma laje (lance) armada numa direção.
function finalizarLaje({ lance, perfil, ctx, Lcm, b, anK, anS, cargas, Vk, Nk, anG, anQ, flexoT }) {
  const { ent, mat, h } = ctx;
  const c = ent.cobrimento;
  const Mk = anK.Mmax; // kN·m/m
  const Md = 1.4 * Mk * 100; // kN·cm/m
  const avisos = [];
  const phiMaxLaje = Math.min(16, (h * 10) / 8);
  const smaxP = Math.min(2 * h, 20);
  const rmin = rhoMin(ent.fck);
  const AsMin = rmin * 100 * h;

  // iteração da altura útil com a bitola escolhida
  let phi = 10;
  let d = 0;
  let flex = null;
  let barP = null;
  let AsCalc = 0;
  let Asx = 0;
  for (let it = 0; it < 3; it++) {
    d = h - c - phi / 20;
    if (flexoT) {
      flex = flexoTracao(Md, flexoT.Nd, 100, h, d, c + 0.5, mat.fcd, mat.fyd);
    } else {
      flex = flexaoSimples(Md, 100, d, mat.fcd, mat.fyd);
    }
    if (!flex.ok) break;
    AsCalc = flex.As;
    Asx = Math.max(AsCalc, AsMin);
    barP = barrasLaje(Asx, { smax: smaxP, phiMin: 6.3, phiMax: phiMaxLaje });
    if (!barP.ok) break;
    if (Math.abs(barP.phi - phi) < 1e-9) break;
    phi = barP.phi;
  }
  if (!flex.ok) {
    return { lance, perfil, erro: flex.motivo, Lcm, cargas, anK };
  }
  if (!barP || !barP.ok) {
    return { lance, perfil, erro: 'Não há bitola/espaçamento que atenda à armadura: aumente a espessura.', Lcm, cargas, anK };
  }
  if (flex.ductil === false) avisos.push(`x/d = ${flex.xd.toFixed(2)} > 0,45: aumente a espessura para garantir ductilidade.`);

  // armadura secundária (NBR 6118, Tab. 19.1)
  const Asy = Math.max(0.2 * barP.AsEf, 0.9, 0.5 * rmin * 100 * h);
  const barS = barrasLaje(Asy, { smax: 33, phiMin: 5.0, phiMax: phiMaxLaje, sPref: 15 });
  // armadura negativa de borda (0,67 ρmin)
  const Asneg = 0.67 * rmin * 100 * h;
  const barN = barrasLaje(Asneg, { smax: smaxP, phiMin: 6.3, phiMax: phiMaxLaje, sPref: 15 });

  // cortante (eq. 3.1 e 3.2) e normal
  const Vsd = 1.4 * Vk;
  const cort = cortanteLaje(Vsd, d, 100, mat, 0);
  if (!cort.ok) avisos.push('VSd > VRd1: necessária armadura transversal ou aumento da espessura.');
  const Nd = 1.4 * Nk;
  const sigmaN = Nd / (100 * h) * 10; // MPa
  const normal = { Nk, Nd, sigmaN, fcd: mat.fcd, razao: mat.fcd / Math.max(sigmaN, 1e-9) };

  // ancoragem (prolongamento nos joelhos)
  const anc = ancoragem(barP.phi, mat, { AsCalc: Asx, AsEf: barP.AsEf });
  const arm = tracarArmaduras(perfil, {
    c, phi1: barP.phi, phiNeg: barN.ok ? barN.phi : 6.3, lbExt: anc.lbNec, compNeg: ent.comprimentoNegativa * Lcm,
  });

  // ELS – flecha
  const flecha = flechaBiapoiada({ Lcm, qSer: (8 * anS.Mmax) / (Lcm / 100) ** 2, Mser: anS.Mmax * 100, h, d, As: barP.AsEf, mat });
  if (!flecha.ok) avisos.push('Flecha total acima de L/250: aumente a espessura.');

  // quantitativos
  const larg = b - 2 * c;
  const nP = Math.floor(larg / barP.s) + 1;
  const barras = [];
  arm.barrasPos.forEach((pts, i) => barras.push({
    tipo: 'Positiva (principal)', phi: barP.phi, s: barP.s, n: nP, comp: Math.ceil(comprimento(pts)), pts, desenho: 'pos', i,
  }));
  const dist = pontosDistribuicao(arm.linhaInf, barS.s, (barP.phi + barS.phi) / 20);
  barras.push({ tipo: 'Distribuição (secundária)', phi: barS.phi, s: barS.s, n: dist.length, comp: Math.ceil(larg), pontos: dist, desenho: 'dist' });
  const nN = Math.floor(larg / barN.s) + 1;
  arm.negativas.forEach((ng) => {
    barras.push({ tipo: `Negativa (apoio ${ng.apoio})`, phi: barN.phi, s: barN.s, n: nN, comp: Math.ceil(comprimento(ng.pts)), pts: ng.pts, desenho: 'neg' });
    const reto = ng.pts.slice(1, -1);
    const pd = pontosDistribuicao(reto, barS.s, -(barN.phi + barS.phi) / 20);
    barras.push({ tipo: `Distribuição negativa (${ng.apoio})`, phi: barS.phi, s: barS.s, n: pd.length, comp: Math.ceil(larg), pontos: pd, desenho: 'distneg' });
  });

  // concreto e formas
  const poli = perfil.acabado.concat(perfil.fundo.slice().reverse());
  const area = Math.abs(areaPoligono(poli)); // cm²
  const volume = (area * b) / 1e6; // m³
  const forma = (comprimento(perfil.fundo) * b + 2 * area) / 1e4; // m²

  return {
    lance, perfil, arm, Lcm, b, cargas, anK, anG, anQ, anS,
    Mk, Md, d, flex, AsCalc, AsMin, Asx, barP, Asy, barS, Asneg, barN,
    Vk, Vsd, cort, normal, anc, flecha, barras, volume, forma, avisos,
  };
}

function areaPoligono(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Calcula um conjunto de lances respeitando as transferências de carga
function calcularConjunto(lances, ctx) {
  const extras = {};
  const res = {};
  const pendentes = lances.slice();
  let guarda = 0;
  while (pendentes.length && guarda++ < 10) {
    for (let i = 0; i < pendentes.length; i++) {
      const l = pendentes[i];
      // só calcula quando todos que o descarregam já foram calculados
      if (!l.recebe.every((r) => res[r.de])) continue;
      const add = { g: 0, q: 0 };
      for (const r of l.recebe) {
        // metade da carga total efetiva do lance apoiado, distribuída
        // na área do lance que o suporta (item 4.2.1)
        const o = res[r.de];
        const areaMeu = (vaoCalculo(l, ctx.g.p) / 100) * (l.b / 100);
        add.g += (r.fracao * o.anG.total * (o.b / 100)) / areaMeu;
        add.q += (r.fracao * o.anQ.total * (o.b / 100)) / areaMeu;
      }
      extras[l.id] = add;
      res[l.id] = calcularLance(l, { ...ctx, extras });
      pendentes.splice(i, 1);
      i--;
    }
  }
  return lances.map((l) => res[l.id]);
}

// --------------------------------------------- escada transversal
function calcularTransversal(lance, ctx) {
  const { g, ent, h, comuns } = ctx;
  const b = lance.b;
  const tv = g.tv;
  const Lcm = b + tv; // eixo a eixo das vigas laterais
  const L = Lcm / 100;
  const hm = ppEspessuraMedia(g, h, false);
  // cargas por m² de superfície inclinada
  const pp = ((ent.gammaC * hm) / 100) * g.cosA;
  const rev = ent.revestimento * g.cosA;
  const sc = comuns.sc.q * g.cosA;
  const psi2 = comuns.sc.psi2;
  const iv = (q) => [{ a: 0, b: L, q }];
  const anK = biapoiada(L, iv(pp + rev + sc));
  const anG = biapoiada(L, iv(pp + rev));
  const anQ = biapoiada(L, iv(sc));
  const anS = biapoiada(L, iv(pp + rev + psi2 * sc));
  const cargas = { hm, ppLance: pp, ppPat: pp, rev, sc, qPar: 0, adicG: 0, adicQ: 0, qLance: pp + rev + sc, psi2, inclinada: true };
  // perfil transversal: laje plana de largura b + 2 tv
  const sTotal = b + 2 * tv;
  const z0 = 0;
  const perfil = {
    topo: [[0, z0], [sTotal, z0]],
    acabado: [[0, z0], [sTotal, z0]],
    fundo: [[0, z0 - h], [sTotal, z0 - h]],
    apoios: [
      { nome: 'VI', apoio: 'viga', s0: 0, s1: tv, eixo: tv / 2, z: z0 },
      { nome: 'VI', apoio: 'viga', s0: b + tv, s1: sTotal, eixo: b + 1.5 * tv, z: z0 },
    ],
    zonas: [{ tipo: 'patamar', s0: tv, s1: tv + b }],
    sTotal, h, vao: Lcm, transversal: true,
  };
  const r = finalizarLaje({ lance, perfil, ctx, Lcm, b, anK, anG, anQ, anS, cargas, Vk: anK.RA, Nk: 0 });
  if (r.erro) return r;
  // as barras principais são distribuídas ao longo do comprimento inclinado
  const compInc = Math.hypot(Math.max(g.n - 1, 0) * g.p, g.H);
  const util = compInc - 2 * ent.cobrimento;
  for (const br of r.barras) {
    if (br.desenho === 'pos') br.n = Math.floor(util / r.barP.s) + 1;
    else if (br.desenho === 'neg') br.n = Math.floor(util / r.barN.s) + 1;
    else br.comp = Math.ceil(util);
  }
  r.compInclinado = compInc;
  r.volume = (b * h * compInc + (g.n * g.p * g.e * b) / 2) / 1e6;
  r.forma = (compInc * b) / 1e4;
  return r;
}

// --------------------------------------------- degraus em balanço
function calcularBalanco(ctx) {
  const { g, ent, mat, comuns } = ctx;
  const hd = ent.espessuraDegrau;
  const bp = g.p; // largura da base do degrau (cm)
  const tv = g.tv;
  const Lcm = ent.largura + tv / 2;
  const L = Lcm / 100;
  const c = ent.cobrimento;
  const bpm = bp / 100;
  const pp = (ent.gammaC * hd) / 100;
  const rev = ent.revestimento;
  const sc = comuns.sc.q;
  const q = (pp + rev + sc) * bpm; // kN/m
  const qSemSc = (pp + rev) * bpm;
  // parapeito na ponta: peso concentrado e força horizontal a 1,10 m
  const P = comuns.par.ativo ? comuns.gAlv * comuns.par.altura * bpm : 0;
  const Fh = comuns.par.ativo ? comuns.fh.h * bpm : 0;
  const Mh = Fh * (ALTURA_FORCA_HORIZONTAL + hd / 200);
  const Ma = (q * L * L) / 2 + P * L + Mh; // eq. 3.9 (+ parapeito)
  const Mb = (qSemSc * L * L) / 2 + 2.5 * L + P * L + Mh; // eq. 3.11
  const Va = q * L + P; // eq. 3.10
  const Vb = qSemSc * L + 2.5 + P; // eq. 3.12
  const Mk = Math.max(Ma, Mb);
  const Vk = Math.max(Va, Vb);
  const caso = Ma >= Mb ? '(a) sobrecarga distribuída' : '(b) carga concentrada de 2,5 kN';
  const Md = 1.4 * Mk * 100;
  const avisos = [];
  let phi = 10;
  let d;
  let flex;
  let bar;
  const rmin = rhoMin(ent.fck);
  const AsMin = rmin * bp * hd;
  for (let it = 0; it < 3; it++) {
    d = hd - c - 0.5 - phi / 20;
    flex = flexaoSimples(Md, bp, d, mat.fcd, mat.fyd);
    if (!flex.ok) break;
    bar = barrasViga(Math.max(flex.As, AsMin), bp, c);
    if (!bar.ok) break;
    if (Math.abs(bar.phi - phi) < 1e-9) break;
    phi = bar.phi;
  }
  if (!flex.ok) return { tipo: 'balanco', erro: flex.motivo, Mk, Lcm };
  if (!bar || !bar.ok) return { tipo: 'balanco', erro: 'Armadura não cabe no degrau: aumente a espessura do degrau.', Mk, Lcm };
  if (!flex.ductil) avisos.push(`x/d = ${flex.xd.toFixed(2)} > 0,45: aumente a espessura do degrau.`);
  const As = Math.max(flex.As, AsMin);

  // cisalhamento – elemento linear (bw < 5d): modelo I da NBR 6118
  const Vsd = 1.4 * Vk;
  const fcdk = mat.fcd / 10;
  const av2 = 1 - mat.fck / 250;
  const VRd2 = 0.27 * av2 * fcdk * bp * d;
  const Vc = 0.6 * (mat.fctd / 10) * bp * d;
  const fywd = Math.min(mat.fyd, 435) / 10;
  const AswS = Math.max(0, (Vsd - Vc) / (0.9 * d * fywd)); // cm²/cm
  const rhoSw = (0.2 * mat.fctm) / 500;
  const AswSmin = rhoSw * bp;
  const AswAdot = Math.max(AswS, AswSmin);
  const est = bitola(5.0);
  // Se VSd ≤ VRd1 (verificação de laje com bw = piso) os estribos são
  // apenas construtivos (φ5 c/15); caso contrário, dimensiona como viga.
  const VRd1 = cortanteLaje(Vsd, d, bp, mat, 0).VRd1;
  const construtivo = Vsd <= VRd1;
  const smaxEst = Vsd <= 0.67 * VRd2 ? Math.min(0.6 * d, 30) : Math.min(0.3 * d, 20);
  const sEst = construtivo ? 15 : Math.max(5, Math.min(Math.floor((2 * est.area) / AswAdot), Math.floor(smaxEst)));
  if (Vsd > VRd2) avisos.push('VSd > VRd2: esmagamento da biela – aumente a seção do degrau.');
  if (tv < 20) avisos.push('Recomenda-se base mínima de 20 cm para a viga de apoio (torção).');

  const anc = ancoragem(bar.phi, mat, { AsCalc: As, AsEf: bar.AsEf, gancho: true, boaAderencia: false });
  const perna = hd - 2 * c;
  const compSup = Math.ceil((ent.largura - c) + Math.max(anc.lbNec, tv - c) + perna);
  const nEst = Math.floor((ent.largura - c) / sEst) + 1;
  const compEst = Math.ceil(2 * (bp - 2 * c) + 2 * (hd - 2 * c) + 2 * 5);
  const nDeg = g.n - 1; // o último "degrau" é o piso superior
  const barras = [
    { tipo: 'Superior (principal) – por degrau', phi: bar.phi, n: bar.n * nDeg, comp: compSup, desenho: 'neg' },
    { tipo: 'Inferior (porta-estribo) – por degrau', phi: 6.3, n: 2 * nDeg, comp: Math.ceil(ent.largura - c + tv - c), desenho: 'pos' },
    { tipo: 'Estribos φ5.0', phi: 5.0, n: nEst * nDeg, comp: compEst, desenho: 'est' },
  ];
  const fl = flechaBiapoiada({ Lcm, qSer: 0, Mser: 1, h: hd, d, As: bar.AsEf, mat, bw: bp });
  // flecha de balanço: f = q L⁴/(8EI) + P L³/(3EI)
  const qS = (pp + rev + comuns.sc.psi2 * sc) * bpm;
  const Ma2 = ((qS * L * L) / 2 + P * L) * 100;
  const fctm = mat.fctm / 10;
  const Ic = (bp * hd ** 3) / 12;
  const Mr = (1.5 * fctm * Ic) / (hd / 2);
  let Ieq = Ic;
  if (Ma2 > Mr) {
    const r3 = (Mr / Ma2) ** 3;
    Ieq = Math.min(r3 * Ic + (1 - r3) * fl.III, Ic);
  }
  const EI = (mat.Ecs / 10) * Ieq;
  const f0 = ((qS / 100) * Lcm ** 4) / (8 * EI) + (P * Lcm ** 3) / (3 * EI);
  const fInf = f0 * (1 + fl.alphaF);
  const flecha = { f0, fInf, lim: (2 * Lcm) / 250, ok: fInf <= (2 * Lcm) / 250, Ieq, Mr, estadio: Ma2 > Mr ? 'II (fissurado)' : 'I', alphaF: fl.alphaF };

  const volume = (nDeg * bp * hd * ent.largura) / 1e6;
  return {
    tipo: 'balanco', Lcm, L, hd, bp, q, qSemSc, P, Fh, Mh, Ma, Mb, Va, Vb, Mk, Vk, caso, Md, d, flex, As, AsMin, bar,
    Vsd, VRd1, VRd2, Vc, AswS, AswSmin, sEst, construtivo, anc, barras, flecha, avisos, volume, nDeg,
    forma: (nDeg * (bp * ent.largura + 2 * bp * hd + ent.largura * hd)) / 1e4,
    cargas: { pp, rev, sc, psi2: comuns.sc.psi2 },
  };
}

// --------------------------------------------- escada autoportante
function calcularAutoportante(ctx) {
  const { g, ent, mat, h, comuns } = ctx;
  const ap = g.autoportante;
  const gc = ent.gammaC;
  const hm = ppEspessuraMedia(g, h, false);
  const ppL = (gc * hm) / 100;
  const ppP = (gc * h) / 100;
  const rev = ent.revestimento;
  const sc = comuns.sc.q;
  const psi2 = comuns.sc.psi2;
  const Qp = ppP + rev + sc;
  const QpS = ppP + rev + psi2 * sc;
  const Ql = ppL + rev + sc;
  const p = ap.p / 100;
  const bp = ap.bp / 100;
  const bl = ap.bl / 100;
  const nE = g.lancesEspelhos[0];
  const lcm = Math.max(nE - 1, 0) * g.p + g.tv / 2;
  const l = lcm / 100;
  // esforços (Cap. 3.4)
  const Myp = (Qp * bp * bp) / 8;
  const Mxp = (Qp * p * p) / 2;
  const MlNeg = Mxp * (bp / (2 * bl));
  const MlPos = (Ql * l * l) / 14.22;
  const Vp = Qp * p * (bp / (2 * bl));
  const Nl = Vp / g.sinA;
  const esf = { Qp, Ql, p, bp, bl, l, Myp, Mxp, MlNeg, MlPos, Vp, Nl, ppL, ppP, rev, sc };

  const c = ent.cobrimento;
  const rmin = rhoMin(ent.fck);
  const AsMin = rmin * 100 * h;
  const smax = Math.min(2 * h, 20);
  const phiMax = Math.min(16, (h * 10) / 8);
  const avisos = [];
  const dimen = (MkNm, NkTr = 0) => {
    let phi = 10;
    let out = null;
    for (let it = 0; it < 3; it++) {
      const d = h - c - phi / 20;
      const Md = 1.4 * MkNm * 100;
      const fl = NkTr > 0 ? flexoTracao(Md, 1.4 * NkTr, 100, h, d, c + 0.5, mat.fcd, mat.fyd) : flexaoSimples(Md, 100, d, mat.fcd, mat.fyd);
      if (!fl.ok) return { erro: fl.motivo };
      const As = Math.max(fl.As, AsMin);
      const br = barrasLaje(As, { smax, phiMin: 6.3, phiMax });
      if (!br.ok) return { erro: 'Armadura excessiva: aumente a espessura.' };
      out = { d, Md, fl, As, br };
      if (Math.abs(br.phi - phi) < 1e-9) break;
      phi = br.phi;
    }
    if (out.fl.ductil === false) avisos.push(`x/d > 0,45 (M = ${MkNm.toFixed(1)} kN·m/m): aumente a espessura.`);
    return out;
  };
  const inferiorPos = dimen(MlPos);
  const superiorPos = dimen(MlPos, Nl); // lance superior em flexo-tração
  const neg = dimen(Math.max(MlNeg, Mxp), Nl);
  const pat = dimen(Myp);
  const erros = [inferiorPos, superiorPos, neg, pat].filter((x) => x.erro);
  if (erros.length) return { tipo: 'autoportante', erro: erros[0].erro, esf };

  // flecha (eq. 8.1) – combinação quase permanente
  const MlNegS = ((QpS * p * p) / 2) * (bp / (2 * bl));
  const Ic = (100 * h ** 3) / 12;
  const EI = (mat.Ecs / 10) * Ic; // kN·cm²
  const f0 = ((QpS / 100) * (p * 100) ** 4) / (8 * EI) + (MlNegS * 100 * lcm * (p * 100)) / (3 * g.cosA * EI);
  const alphaF = xiT(70.1) - xiT(1);
  const fInf = f0 * (1 + alphaF);
  const lim = (lcm + ap.p) / 125;
  const flecha = { f0, fInf, lim, ok: fInf <= lim, alphaF, Ic };
  if (!flecha.ok) avisos.push('Flecha da ponta do patamar acima de (l + p)/125.');

  // cortante no lance
  const Vk = Math.max(Ql * l / 2 + Vp, Vp) * g.cosA;
  const cort = cortanteLaje(1.4 * Vk, inferiorPos.d, 100, mat, 0);
  if (!cort.ok) avisos.push('VSd > VRd1 no lance: verificar armadura transversal.');

  // perfis para desenho e quantitativos
  const lances = g.lances.map((ln, idx) => {
    const perfil = construirPerfil(ln, g, h, false);
    const pos = idx === 0 ? inferiorPos : superiorPos;
    const anc = ancoragem(pos.br.phi, mat, { AsCalc: pos.As, AsEf: pos.br.AsEf });
    const arm = tracarArmaduras(perfil, { c, phi1: pos.br.phi, phiNeg: neg.br.phi, lbExt: anc.lbNec, compNeg: 0.25 * lcm });
    return { ln, perfil, arm, pos, anc };
  });
  const barras = [];
  const larg = ap.bl - 2 * c;
  const ancN = ancoragem(neg.br.phi, mat, { boaAderencia: false });
  lances.forEach(({ ln, arm, pos }, idx) => {
    const nP = Math.floor(larg / pos.br.s) + 1;
    arm.barrasPos.forEach((pts) => barras.push({ lance: ln.nome, tipo: 'Positiva (principal)', phi: pos.br.phi, s: pos.br.s, n: nP, comp: Math.ceil(comprimento(pts)), pts, desenho: 'pos' }));
    // negativa no apoio do lance (viga)
    arm.negativas.forEach((ng) => barras.push({ lance: ln.nome, tipo: `Negativa (apoio ${ng.apoio})`, phi: neg.br.phi, s: neg.br.s, n: Math.floor(larg / neg.br.s) + 1, comp: Math.ceil(comprimento(ng.pts)), pts: ng.pts, desenho: 'neg' }));
    // negativa sobre o patamar, prolongada no lance (Ml- e Mxp)
    const sup = arm.linhaSup;
    const ext = ap.p + Math.max(0.25 * lcm, ancN.lbNec);
    const ptsNeg = idx === 0 ? trechoFim(sup, ext) : trechoIni(sup, ext);
    barras.push({ lance: ln.nome, tipo: 'Negativa do patamar (Ml- / Mxp)', phi: neg.br.phi, s: neg.br.s, n: Math.floor(larg / neg.br.s) + 1, comp: Math.ceil(comprimento(ptsNeg)), pts: ptsNeg, desenho: 'neg' });
  });
  const sDist = barrasLaje(Math.max(0.2 * inferiorPos.br.AsEf, 0.9), { smax: 33, phiMin: 5, phiMax, sPref: 15 });
  const compLance = lances.reduce((s, x) => s + x.arm.compLinhaInf, 0);
  barras.push({ tipo: 'Distribuição (secundária) dos lances', phi: sDist.phi, n: Math.floor(compLance / sDist.s) + 2, comp: Math.ceil(larg), desenho: 'dist' });
  barras.push({ tipo: 'Patamar – transversal superior (Myp)', phi: pat.br.phi, n: Math.floor((ap.p - c) / pat.br.s) + 1, comp: Math.ceil(ap.bp - 2 * c + 2 * (h - 2 * c)), desenho: 'neg' });
  barras.push({ tipo: 'Patamar – transversal inferior (construtiva)', phi: sDist.phi, n: Math.floor((ap.p - c) / sDist.s) + 1, comp: Math.ceil(ap.bp - 2 * c), desenho: 'dist' });
  const volume = lances.reduce((s, x) => s + Math.abs(areaPoligono(x.perfil.acabado.concat(x.perfil.fundo.slice().reverse()))) * ap.bl, 0) / 1e6
    + ((ap.bp - 2 * ap.bl) * ap.p * h) / 1e6;
  return {
    tipo: 'autoportante', esf, inferiorPos, superiorPos, neg, pat, flecha, cort, Vk, lances, barras, avisos, volume,
    forma: lances.reduce((s, x) => s + comprimento(x.perfil.fundo) * ap.bl, 0) / 1e4 + (ap.bp * ap.p) / 1e4,
    h, cargas: { ppL, ppP, rev, sc, psi2, hm },
  };
}

function trechoIni(poli, comp) {
  const out = [poli[0]];
  let resta = comp;
  for (let i = 1; i < poli.length && resta > 0; i++) {
    const [x0, y0] = poli[i - 1];
    const [x1, y1] = poli[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l >= resta) { out.push([x0 + ((x1 - x0) * resta) / l, y0 + ((y1 - y0) * resta) / l]); break; }
    out.push(poli[i]);
    resta -= l;
  }
  return out;
}
function trechoFim(poli, comp) {
  return trechoIni(poli.slice().reverse(), comp).reverse();
}

// ----------------------------------------------------------- quadro de ferros
export function quadroFerros(barras) {
  const linhas = [];
  for (const b of barras) {
    const ex = linhas.find((l) => Math.abs(l.phi - b.phi) < 1e-9 && l.comp === b.comp && l.tipoBase === b.tipo.split(' (')[0]);
    if (ex) { ex.n += b.n; ex.refs.push(b); continue; }
    linhas.push({ phi: b.phi, comp: b.comp, n: b.n, tipo: b.tipo, tipoBase: b.tipo.split(' (')[0], refs: [b] });
  }
  linhas.forEach((l, i) => {
    l.pos = `N${i + 1}`;
    l.refs.forEach((r) => { r.pos = l.pos; });
    l.total = (l.n * l.comp) / 100; // m
    l.massa = l.total * bitola(l.phi).massa;
  });
  const resumo = [];
  for (const l of linhas) {
    let r = resumo.find((x) => Math.abs(x.phi - l.phi) < 1e-9);
    if (!r) { r = { phi: l.phi, total: 0, massa: 0 }; resumo.push(r); }
    r.total += l.total;
    r.massa += l.massa;
  }
  resumo.sort((a, b) => a.phi - b.phi);
  const massa = resumo.reduce((s, r) => s + r.massa, 0);
  return { linhas, resumo, massa, massaPerdas: massa * 1.1 };
}

// ----------------------------------------------------------- fundação "pé"
export function calcularPe(R, b, h, tensaoSolo) {
  // R: reação característica no apoio inicial (kN/m); b: largura (cm)
  const qp = R * (b / 100) * 100; // kgf
  const Lp = b; // cm
  const larg = qp / (Lp * tensaoSolo); // eq. 4.1
  const adot = Math.max(Math.ceil(larg / 5) * 5, h + 20);
  return { qp, Lp, larg, adot, altura: 100, esp: h };
}

// ================================================================ principal
export function calcularEscada(entrada) {
  const ent = normalizar(entrada || {});
  const g = montarGeometria(ent);
  const mat = materiais(ent);
  const comuns = cargasComuns(ent);
  const plissada = ent.tipo === 'plissada';
  const tipo = ent.tipo;
  const avisos = [];

  // espessura (eq. 1.4 / Tabela 1.1)
  let hPre;
  if (tipo === 'transversal') hPre = espessuraPre(ent.largura + g.tv);
  else if (tipo === 'balanco') hPre = ent.espessuraDegrau;
  else if (tipo === 'autoportante') {
    const l = vaoCalculo(g.lances[0], g.p) + g.tv / 2;
    hPre = Math.max(espessuraPre(l), 15);
  } else hPre = Math.max(...g.lances.map((l) => espessuraPre(vaoCalculo(l, g.p))));
  if (ent.espessura && ent.espessura < 10 && tipo !== 'balanco') avisos.push('Não se recomenda espessura menor que 10 cm.');

  const calcular = (h) => {
    const ctx = { g, ent, mat, h, plissada, comuns, extras: {} };
    const out = { h, lances: [], especial: null, arranjo: null, comparacaoL: null };
    if (tipo === 'balanco') out.especial = calcularBalanco(ctx);
    else if (tipo === 'autoportante') out.especial = calcularAutoportante(ctx);
    else if (tipo === 'transversal') out.lances = [calcularTransversal(g.lances[0], ctx)];
    else if (tipo === 'L') {
      const rA = calcularConjunto(g.arranjos.A, ctx);
      const rB = calcularConjunto(g.arranjos.B, ctx);
      const maxMd = (r) => (r.some((x) => x.erro) ? Infinity : Math.max(...r.map((x) => x.Md)));
      out.comparacaoL = { A: maxMd(rA), B: maxMd(rB) };
      out.arranjo = ent.arranjoL === 'A' || ent.arranjoL === 'B' ? ent.arranjoL
        : out.comparacaoL.A <= out.comparacaoL.B * (1 + 1e-9) ? 'A' : 'B';
      out.lances = out.arranjo === 'A' ? rA : rB;
    } else out.lances = calcularConjunto(g.lances, ctx);
    const itens = out.especial ? [out.especial] : out.lances;
    out.passa = itens.every((x) => !x.erro && x.flecha && x.flecha.ok && !(x.avisos || []).some((a) => a.startsWith('x/d')));
    return out;
  };

  // Sem espessura informada: parte do pré-dimensionamento e aumenta 1 cm
  // até atender flecha (L/250) e ductilidade (x/d ≤ 0,45).
  let res = calcular(ent.espessura || hPre);
  let otimizada = false;
  if (!ent.espessura && tipo !== 'balanco' && !res.passa) {
    for (let h = hPre + 1; h <= hPre + 20; h++) {
      const r = calcular(h);
      res = r;
      if (r.passa) { otimizada = true; break; }
    }
    if (!res.passa) avisos.push('Nenhuma espessura até +20 cm atendeu a todas as verificações.');
  }
  const { h, lances, especial, arranjo, comparacaoL } = res;
  if (tipo === 'L') {
    g.lances = g.arranjos[arranjo];
    g.vigas.push(g.vigasArranjo[arranjo]);
  }

  // fundação direta no solo
  let pe = null;
  if (ent.apoioInicial === 'solo' && lances.length && !lances[0].erro) {
    pe = calcularPe(lances[0].anK.RA, lances[0].b, h, ent.tensaoSolo);
  }

  const erros = [];
  lances.forEach((l) => l.erro && erros.push(`${l.lance.nome}: ${l.erro}`));
  if (especial && especial.erro) erros.push(especial.erro);

  let barras = [];
  if (!erros.length) {
    if (especial) barras = especial.barras;
    else lances.forEach((l) => l.barras.forEach((b) => barras.push({ ...b, lance: l.lance.nome, ref: b })));
  }
  const quadro = erros.length ? null : quadroFerros(barras);
  if (quadro && !especial) {
    // propaga a posição (N) às barras usadas no desenho
    barras.forEach((b) => { if (b.ref) b.ref.pos = b.pos; });
  }
  const volume = especial ? especial.volume || 0 : lances.reduce((s, l) => s + (l.volume || 0), 0);
  const forma = especial ? especial.forma || 0 : lances.reduce((s, l) => s + (l.forma || 0), 0);

  // tabela de ancoragem/traspasse para as bitolas usadas
  const phis = [...new Set(barras.map((b) => b.phi))].sort((a, b) => a - b);
  const tabAnc = phis.map((phi) => ({
    phi,
    boa: ancoragem(phi, mat, { boaAderencia: true }),
    ma: ancoragem(phi, mat, { boaAderencia: false }),
    trasp: traspasse(phi, mat, { boaAderencia: true, proporcao: 1 }),
  }));

  return {
    ent, g, mat, h, hPre, otimizada, comuns, lances, especial, arranjo, comparacaoL, pe, quadro, volume, forma,
    taxaAco: quadro && volume ? quadro.massa / volume : null, tabAnc, erros, avisos,
  };
}
