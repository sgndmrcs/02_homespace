// Perfil longitudinal (corte) de um lance estrutural e traçado das
// armaduras. Coordenadas (s, z) em cm: s ao longo do lance, z vertical.

import { compPeca } from './geometria.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
// normal à direita (lado do concreto para a face superior)
const nDir = (d) => [d[1], -d[0]];
const nEsq = (d) => [-d[1], d[0]];

export function comprimento(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += len(sub(pts[i], pts[i - 1]));
  return t;
}

function limpar(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  // remove vértices colineares
  const r = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = unit(sub(out[i], r[r.length - 1]));
    const b = unit(sub(out[i + 1], out[i]));
    if (Math.abs(cross(a, b)) < 1e-9 && dot(a, b) > 0) continue;
    r.push(out[i]);
  }
  if (out.length > 1) r.push(out[out.length - 1]);
  return r;
}

// Desloca a poligonal de uma distância d para o lado direito.
export function deslocar(pts, d) {
  const n = pts.length;
  const res = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      res.push(add(pts[0], mul(nDir(unit(sub(pts[1], pts[0]))), d)));
    } else if (i === n - 1) {
      res.push(add(pts[n - 1], mul(nDir(unit(sub(pts[n - 1], pts[n - 2]))), d)));
    } else {
      const n1 = nDir(unit(sub(pts[i], pts[i - 1])));
      const n2 = nDir(unit(sub(pts[i + 1], pts[i])));
      const k = d / (1 + dot(n1, n2));
      res.push(add(pts[i], mul(add(n1, n2), k)));
    }
  }
  return res;
}

// Recorta a poligonal para s entre sMin e sMax (extremidades).
function recortarS(pts, sMin, sMax) {
  let r = pts.slice();
  while (r.length > 2 && r[1][0] <= sMin) r.shift();
  if (r[0][0] < sMin && r[1][0] > r[0][0]) {
    const t = (sMin - r[0][0]) / (r[1][0] - r[0][0]);
    r[0] = add(r[0], mul(sub(r[1], r[0]), t));
  }
  while (r.length > 2 && r[r.length - 2][0] >= sMax) r.pop();
  const m = r.length - 1;
  if (r[m][0] > sMax && r[m][0] > r[m - 1][0]) {
    const t = (sMax - r[m - 1][0]) / (r[m][0] - r[m - 1][0]);
    r[m] = add(r[m - 1], mul(sub(r[m], r[m - 1]), t));
  }
  return r;
}

// Interseção do raio P + t·d (t > eps) com a poligonal.
function raioPoligonal(P, d, poli) {
  let melhor = null;
  for (let i = 1; i < poli.length; i++) {
    const A = poli[i - 1];
    const B = poli[i];
    const e = sub(B, A);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(A, P);
    const t = cross(w, e) / den;
    const u = cross(w, d) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && (!melhor || t < melhor.t)) melhor = { t, i, u };
  }
  return melhor;
}

// Caminha sobre a poligonal a partir do ponto de índice de segmento i/u.
function caminhar(poli, i, u, sentido, comp) {
  const pts = [];
  let P = add(poli[i - 1], mul(sub(poli[i], poli[i - 1]), u));
  let resta = comp;
  let k = sentido > 0 ? i : i - 1;
  while (resta > 1e-9 && k >= 0 && k < poli.length) {
    const alvo = poli[k];
    const dist = len(sub(alvo, P));
    if (dist >= resta) {
      pts.push(add(P, mul(unit(sub(alvo, P)), resta)));
      return pts;
    }
    pts.push(alvo);
    resta -= dist;
    P = alvo;
    k += sentido;
  }
  return pts;
}

// Prolonga a barra a partir de K na direção d por "comp"; se atingir a
// face superior (cobrimento), dobra e acompanha essa face.
function prolongar(K, d, comp, topo, sentido) {
  const hit = raioPoligonal(K, d, topo);
  if (!hit || hit.t >= comp) return [add(K, mul(d, comp))];
  const H = add(K, mul(d, hit.t));
  return [H, ...caminhar(topo, hit.i, hit.u, sentido, comp - hit.t)];
}

// Caminha desde uma extremidade da poligonal por um comprimento.
function trechoInicial(poli, comp) {
  return [poli[0], ...caminhar(poli, 1, 0, +1, comp)];
}
function trechoFinal(poli, comp) {
  const n = poli.length;
  return [poli[n - 1], ...caminhar(poli, n - 1, 1, -1, comp)].reverse();
}

// Constrói a geometria do corte do lance.
export function construirPerfil(lance, g, h, plissada) {
  const { e, p } = g;
  const tanA = e / p;
  let s = 0;
  let z = lance.z0;
  const topo = [[0, z]];
  const acabado = [[0, z]];
  const apoios = [];
  const zonas = [];
  for (const pc of lance.pecas) {
    const c = compPeca(pc, p);
    if (pc.tipo === 'lance') {
      const sF = s;
      const zF = z;
      const nE = pc.nE;
      for (let k = 0; k < nE; k++) {
        acabado.push([sF + k * p, zF + k * e], [sF + k * p, zF + (k + 1) * e]);
        if (k < nE - 1) acabado.push([sF + (k + 1) * p, zF + (k + 1) * e]);
      }
      if (plissada) {
        for (let k = 0; k < nE; k++) {
          topo.push([sF + k * p, zF + k * e], [sF + k * p, zF + (k + 1) * e]);
          if (k < nE - 1) topo.push([sF + (k + 1) * p, zF + (k + 1) * e]);
        }
      } else {
        topo.push([sF, zF], [sF + nE * p, zF + nE * e]);
      }
      zonas.push({ tipo: 'lance', s0: sF, s1: sF + c, nE });
      s = sF + c;
      z = zF + nE * e;
    } else {
      if (pc.tipo === 'apoio') {
        apoios.push({ nome: pc.nome, apoio: pc.apoio, ref: pc.ref, s0: s, s1: s + c, eixo: s + c / 2, z });
      } else {
        zonas.push({ tipo: 'patamar', s0: s, s1: s + c });
      }
      s += c;
      const ult = topo[topo.length - 1];
      if (s > ult[0]) topo.push([s, z]);
      acabado.push([s, z]);
    }
  }
  const sTotal = s;
  // Recorta a linha superior estrutural se ela ultrapassar o fim
  let topoR = recortarS(limpar(topo), 0, sTotal);
  const ult = topoR[topoR.length - 1];
  if (ult[0] < sTotal - 1e-6) topoR.push([sTotal, ult[1] + (sTotal - ult[0]) * (plissada ? 0 : tanA)]);
  topoR = limpar(topoR);
  const fundo = deslocar(topoR, h);
  return {
    topo: topoR,
    acabado: limpar(acabado),
    fundo,
    apoios,
    zonas,
    sTotal,
    h,
    vao: apoios.length >= 2 ? apoios[apoios.length - 1].eixo - apoios[0].eixo : null,
  };
}

// Traça as armaduras do lance no corte.
// arm = { c, phi1, phiNeg, lbExt, compNeg }
export function tracarArmaduras(perfil, arm) {
  const { topo, sTotal, h } = perfil;
  const c = arm.c;
  const f1 = arm.phi1 / 10;
  const fn = arm.phiNeg / 10;
  const linhaInf = recortarS(deslocar(topo, h - c - f1 / 2), c, sTotal - c);
  const linhaSup = recortarS(deslocar(topo, c + fn / 2), c, sTotal - c);
  const coberturaSup = deslocar(topo, c);
  const perna = Math.max(h - 2 * c - f1, 5);

  // Divide a armadura positiva nos "joelhos" em que a resultante de
  // tração empurraria a barra para fora do concreto (barras cruzadas).
  const pedacos = [];
  let atual = [linhaInf[0]];
  const joelhos = [];
  for (let i = 1; i < linhaInf.length - 1; i++) {
    atual.push(linhaInf[i]);
    const d1 = unit(sub(linhaInf[i], linhaInf[i - 1]));
    const d2 = unit(sub(linhaInf[i + 1], linhaInf[i]));
    if (cross(d1, d2) < -1e-9) {
      joelhos.push(linhaInf[i]);
      pedacos.push(atual);
      atual = [linhaInf[i]];
    }
  }
  atual.push(linhaInf[linhaInf.length - 1]);
  pedacos.push(atual);

  const barrasPos = pedacos.map((pts, idx) => {
    let r = pts.slice();
    if (idx < pedacos.length - 1) {
      const K = r[r.length - 1];
      const d = unit(sub(K, r[r.length - 2]));
      r = r.concat(prolongar(K, d, arm.lbExt, coberturaSup, +1));
    }
    if (idx > 0) {
      const K = r[0];
      const d = mul(unit(sub(r[1], K)), -1);
      r = prolongar(K, d, arm.lbExt, coberturaSup, -1).reverse().concat(r);
    }
    // ganchos nas extremidades livres (apoios)
    if (idx === 0) {
      const d = unit(sub(r[1], r[0]));
      r.unshift(add(r[0], mul(nEsq(d), perna)));
    }
    if (idx === pedacos.length - 1) {
      const m = r.length - 1;
      const d = unit(sub(r[m], r[m - 1]));
      r.push(add(r[m], mul(nEsq(d), perna)));
    }
    return limpar(r);
  });

  // Armaduras negativas nos apoios extremos
  const negs = [];
  const negativa = (a, inicio) => {
    const comp = (inicio ? a.s1 : sTotal - a.s0) - c + arm.compNeg;
    let r = inicio ? trechoInicial(linhaSup, comp) : trechoFinal(linhaSup, comp);
    let d = unit(sub(r[1], r[0]));
    r.unshift(add(r[0], mul(nDir(d), perna)));
    const m = r.length - 1;
    d = unit(sub(r[m], r[m - 1]));
    r.push(add(r[m], mul(nDir(d), perna)));
    negs.push({ apoio: a.nome, pts: limpar(r), compReto: comp });
  };
  for (const a of perfil.apoios) {
    if (a.s0 < 1e-6) negativa(a, true);
    else if (a.s1 > sTotal - 1e-6) negativa(a, false);
  }

  return {
    linhaInf,
    linhaSup,
    barrasPos,
    negativas: negs,
    joelhos,
    compLinhaInf: comprimento(linhaInf),
    perna,
  };
}

// Posições (pontos) das barras de distribuição ao longo de uma poligonal,
// deslocadas para o interior.
export function pontosDistribuicao(pts, espac, desloc) {
  const total = comprimento(pts);
  const n = Math.max(Math.floor(total / espac) + 1, 2);
  const passo = total / (n - 1);
  const out = [];
  let acum = 0;
  let k = 0;
  for (let i = 1; i < pts.length && k < n; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const segL = len(sub(B, A));
    const d = unit(sub(B, A));
    const nn = nEsq(d);
    while (k < n && k * passo <= acum + segL + 1e-6) {
      const t = k * passo - acum;
      out.push(add(add(A, mul(d, t)), mul(nn, desloc)));
      k++;
    }
    acum += segL;
  }
  return out;
}
