// Desenhos em SVG: corte longitudinal com armaduras, planta, degrau em
// balanço e diagramas de esforços. Unidades do desenho: cm.

const f1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const fphi = (phi) => phi.toFixed(1).replace('.', ',');
const pts2 = (pts) => pts.map(([s, z]) => `${s.toFixed(2)},${(-z).toFixed(2)}`).join(' ');

function caixa(listas, margem) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const l of listas) {
    for (const [s, z] of l) {
      x0 = Math.min(x0, s); x1 = Math.max(x1, s);
      y0 = Math.min(y0, -z); y1 = Math.max(y1, -z);
    }
  }
  return { x: x0 - margem, y: y0 - margem, w: x1 - x0 + 2 * margem, h: y1 - y0 + 2 * margem };
}

function svg(bb, corpo, titulo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="desenho" viewBox="${bb.x.toFixed(1)} ${bb.y.toFixed(1)} ${bb.w.toFixed(1)} ${bb.h.toFixed(1)}" role="img" aria-label="${titulo}"><title>${titulo}</title>${corpo}</svg>`;
}

function texto(x, y, t, fs, cls = 'rotulo', anchor = 'middle') {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${t}</text>`;
}

function cota(xa, xb, y, t, fs) {
  const tk = fs * 0.5;
  return `<g class="cota"><line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}"/>`
    + `<line x1="${xa}" y1="${y - tk}" x2="${xa}" y2="${y + tk}"/><line x1="${xb}" y1="${y - tk}" x2="${xb}" y2="${y + tk}"/>`
    + `</g>${texto((xa + xb) / 2, y - fs * 0.35, t, fs, 'rotulo-cota')}`;
}

function meioPoligonal(pts) {
  // ponto médio do maior segmento
  let melhor = 0; let idx = 1;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (l > melhor) { melhor = l; idx = i; }
  }
  const a = pts[idx - 1]; const b = pts[idx];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// Corte longitudinal genérico de um perfil com as barras indicadas.
export function svgPerfil(perfil, barras, { titulo = 'Corte', mostrarCotas = true, hv = 40 } = {}) {
  const listas = [perfil.acabado, perfil.fundo];
  const apoiosSvg = [];
  for (const a of perfil.apoios) {
    const zFundo = Math.min(...perfil.fundo.filter(([s]) => s >= a.s0 - 1 && s <= a.s1 + 1).map((p) => p[1]), a.z - perfil.h);
    if (a.apoio === 'viga') {
      const r = [[a.s0, a.z], [a.s1, a.z], [a.s1, zFundo - hv * 0.6], [a.s0, zFundo - hv * 0.6]];
      listas.push(r);
      apoiosSvg.push(`<polygon class="viga" points="${pts2(r)}"/>`);
    } else if (a.apoio === 'solo') {
      const esp = a.s1 - a.s0;
      const r = [[a.s0, a.z], [a.s1, a.z], [a.s1, a.z - 100], [a.s1 + 25, a.z - 100], [a.s1 + 25, a.z - 100 - esp],
        [a.s0 - 25, a.z - 100 - esp], [a.s0 - 25, a.z - 100], [a.s0, a.z - 100]];
      listas.push(r);
      apoiosSvg.push(`<polygon class="viga" points="${pts2(r)}"/>`);
    } else {
      const r = [[a.s0, a.z], [a.s1, a.z], [a.s1, a.z - perfil.h], [a.s0, a.z - perfil.h]];
      apoiosSvg.push(`<polygon class="apoio-lance" points="${pts2(r)}"/>`);
    }
  }
  const bb0 = caixa(listas, 10);
  const fs = Math.max(5, bb0.w / 55);
  const bb = { ...bb0, y: bb0.y - fs * 3, h: bb0.h + fs * 9 };
  let c = apoiosSvg.join('');
  const concreto = perfil.acabado.concat(perfil.fundo.slice().reverse());
  c += `<polygon class="concreto" points="${pts2(concreto)}"/>`;
  for (const a of perfil.apoios) {
    c += `<line class="eixo" x1="${a.eixo}" y1="${-a.z + fs * 2}" x2="${a.eixo}" y2="${-a.z - fs * 2}"/>`;
    c += texto(a.eixo, -a.z - fs * 2.4, a.nome, fs * 0.9, 'rotulo-apoio');
  }
  // barras
  const rotulos = [];
  const rotuladas = new Set();
  for (const b of barras) {
    if (b.pts) {
      c += `<polyline class="barra barra-${b.desenho}" points="${pts2(b.pts)}"/>`;
      // cada posição (N) é rotulada uma única vez
      if (b.pos && rotuladas.has(b.pos)) continue;
      rotuladas.add(b.pos);
      const [ms, mz] = meioPoligonal(b.pts);
      const dy = b.desenho === 'neg' ? -fs * 1.1 : fs * 1.6;
      rotulos.push(texto(ms, -mz + dy, `${b.pos || ''} φ${fphi(b.phi)}${b.s ? ` c/${b.s}` : ''} C=${b.comp}`, fs * 0.8, `rotulo-barra rb-${b.desenho}`));
    }
    if (b.pontos) {
      const r = Math.max(0.5, b.phi / 18);
      for (const [s, z] of b.pontos) c += `<circle class="barra-dist" cx="${s.toFixed(1)}" cy="${(-z).toFixed(1)}" r="${r}"/>`;
      if (b.pontos.length) {
        const [s, z] = b.pontos[Math.floor(b.pontos.length / 2)];
        rotulos.push(texto(s, -z + (b.desenho === 'distneg' ? -fs * 2.2 : fs * 2.8), `${b.pos || ''} φ${fphi(b.phi)}${b.s ? ` c/${b.s}` : ''}`, fs * 0.75, 'rotulo-barra rb-dist'));
      }
    }
  }
  c += rotulos.join('');
  if (mostrarCotas && perfil.apoios.length >= 2) {
    const a0 = perfil.apoios[0]; const a1 = perfil.apoios[perfil.apoios.length - 1];
    const y = bb.y + bb.h - fs * 1.5;
    c += cota(a0.eixo, a1.eixo, y, `L = ${f1(a1.eixo - a0.eixo)} cm (vão de cálculo)`, fs * 0.85);
  }
  return svg(bb, c, titulo);
}

// Planta da escada (layout em planta a partir dos trechos 3D)
export function svgPlanta(g) {
  const listas = [];
  let corpo = '';
  const fsBase = [];
  let num = 0;
  const P = (x, y) => [x, y]; // y em planta para cima → usa -y no SVG via pts2
  for (const v of g.vigas) {
    const r = [P(v.x0, v.y0), P(v.x1, v.y0), P(v.x1, v.y1), P(v.x0, v.y1)];
    listas.push(r);
    corpo += `<polygon class="viga-planta" points="${pts2(r)}"/>`;
  }
  const textos = [];
  for (const t of g.trechos) {
    if (t.tipo === 'patamar') {
      const r = [P(t.x0, t.y0), P(t.x1, t.y0), P(t.x1, t.y1), P(t.x0, t.y1)];
      listas.push(r);
      corpo += `<polygon class="patamar-planta" points="${pts2(r)}"/>`;
      textos.push({ x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2, t: `patamar +${f1(t.z)}` });
    } else {
      const [dx, dy] = t.dir; const [px, py] = t.perp;
      const comp = Math.max(t.nE - 1, 0) * g.p;
      const A = P(t.x, t.y);
      const B = P(t.x + dx * comp, t.y + dy * comp);
      const C = P(B[0] + px * t.b, B[1] + py * t.b);
      const D = P(A[0] + px * t.b, A[1] + py * t.b);
      listas.push([A, B, C, D]);
      corpo += `<polygon class="lance-planta" points="${pts2([A, B, C, D])}"/>`;
      for (let k = 0; k < t.nE; k++) {
        num++;
        const s = k * g.p;
        const a = P(t.x + dx * s, t.y + dy * s);
        const b2 = P(a[0] + px * t.b, a[1] + py * t.b);
        corpo += `<line class="degrau-planta" x1="${a[0]}" y1="${-a[1]}" x2="${b2[0]}" y2="${-b2[1]}"/>`;
        if (k < t.nE - 1) {
          const m = P(t.x + dx * (s + g.p / 2) + px * t.b * 0.12, t.y + dy * (s + g.p / 2) + py * t.b * 0.12);
          fsBase.push(m);
          textos.push({ x: m[0], y: m[1], t: String(num), cls: 'num-degrau' });
        }
      }
      // seta de subida
      const m0 = P(t.x + px * t.b / 2, t.y + py * t.b / 2);
      const m1 = P(m0[0] + dx * comp * 0.85, m0[1] + dy * comp * 0.85);
      corpo += `<line class="seta" x1="${m0[0]}" y1="${-m0[1]}" x2="${m1[0]}" y2="${-m1[1]}" marker-end="url(#seta)"/>`;
      textos.push({ x: m0[0] + dx * comp * 0.45 + px * t.b * 0.22, y: m0[1] + dy * comp * 0.45 + py * t.b * 0.22, t: `${t.lance} SOBE`, cls: 'rotulo-lance' });
    }
  }
  const bb0 = caixa(listas.map((l) => l.map(([x, y]) => [x, y])), 20);
  const fs = Math.max(6, Math.max(bb0.w, bb0.h) / 45);
  const defs = `<defs><marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${fs * 0.8}" markerHeight="${fs * 0.8}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="seta-ponta"/></marker></defs>`;
  for (const t of textos) corpo += texto(t.x, -t.y + fs * 0.3, t.t, t.cls === 'num-degrau' ? fs * 0.7 : fs * 0.8, t.cls || 'rotulo');
  for (const v of g.vigas) corpo += texto((v.x0 + v.x1) / 2, -(v.y0 + v.y1) / 2 + fs * 0.3, v.nome, fs * 0.6, 'rotulo-viga');
  return svg(bb0, defs + corpo, 'Planta da escada');
}

// Diagramas de momento fletor e cortante (característicos)
export function svgDiagramas(an, Lm) {
  const W = 300; const Hm = 70;
  const Mmax = Math.max(...an.diag.map((d) => Math.abs(d[1])), 1e-6);
  const Vmax = Math.max(...an.diag.map((d) => Math.abs(d[2])), 1e-6);
  const X = (x) => 20 + (x / Lm) * W;
  const pm = an.diag.map(([x, m]) => `${X(x).toFixed(1)},${(20 + (m / Mmax) * Hm).toFixed(1)}`).join(' ');
  const yV = 20 + Hm + 50;
  const pv = an.diag.map(([x, , v]) => `${X(x).toFixed(1)},${(yV - (v / Vmax) * 35).toFixed(1)}`).join(' ');
  const corpo = `<line class="eixo-diag" x1="20" y1="20" x2="${20 + W}" y2="20"/>`
    + `<polygon class="diag-m" points="20,20 ${pm} ${20 + W},20"/>`
    + texto(X(an.xM), 20 + Hm + 12, `Mk,máx = ${f1(an.Mmax)} kN·m/m (x = ${f1(an.xM)} m)`, 9)
    + `<line class="eixo-diag" x1="20" y1="${yV}" x2="${20 + W}" y2="${yV}"/>`
    + `<polygon class="diag-v" points="20,${yV} ${pv} ${20 + W},${yV}"/>`
    + texto(20, yV - 38, `RA = ${f1(an.RA)} kN/m`, 8, 'rotulo', 'start')
    + texto(20 + W, yV + 46, `RB = ${f1(an.RB)} kN/m`, 8, 'rotulo', 'end')
    + texto(4, 24, 'M', 9, 'rotulo', 'start') + texto(4, yV + 4, 'V', 9, 'rotulo', 'start');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="desenho diag" viewBox="0 0 ${W + 40} ${yV + 55}" role="img" aria-label="Diagramas de esforços"><title>Diagramas</title>${corpo}</svg>`;
}

// Degrau em balanço: elevação de um degrau engastado na viga lateral.
export function svgBalanco(r, ent, g) {
  const tv = g.tv; const hv = g.hv; const hd = r.hd; const c = ent.cobrimento;
  const L = ent.largura;
  const fs = Math.max(5, (L + tv) / 40);
  let corpo = '';
  const viga = [[-tv, hd], [0, hd], [0, hd - hv], [-tv, hd - hv]];
  const deg = [[0, hd], [L, hd], [L, 0], [0, 0]];
  corpo += `<polygon class="viga" points="${pts2(viga)}"/>`;
  corpo += `<polygon class="concreto" points="${pts2(deg)}"/>`;
  const sup = r.barras[0]; const inf = r.barras[1]; const est = r.barras[2];
  const yS = hd - c - r.bar.phi / 20;
  const anc = Math.max(r.anc.lbNec, tv - c);
  const ptsSup = [[L - c, c], [L - c, yS], [-tv + c, yS], [-tv + c, yS - Math.max(anc - (tv - 2 * c), 5)]];
  corpo += `<polyline class="barra barra-neg" points="${pts2(ptsSup)}"/>`;
  const yI = c + 0.3;
  corpo += `<polyline class="barra barra-pos" points="${pts2([[-tv + c, yI], [L - c, yI]])}"/>`;
  for (let x = c; x <= L - c + 0.1; x += r.sEst) {
    corpo += `<line class="estribo" x1="${x}" y1="${-(c)}" x2="${x}" y2="${-(hd - c)}"/>`;
  }
  corpo += texto(L / 2, -hd - fs * 1.2, `${sup.pos} ${r.bar.n} φ${fphi(r.bar.phi)} por degrau C=${sup.comp}`, fs * 0.8, 'rotulo-barra rb-neg');
  corpo += texto(L / 2, fs * 1.6, `${inf.pos} 2 φ6,3 C=${inf.comp}`, fs * 0.8, 'rotulo-barra rb-pos');
  corpo += texto(L / 2, fs * 3, `${est.pos} estribos φ5,0 c/${r.sEst} C=${est.comp}`, fs * 0.8, 'rotulo-barra');
  corpo += texto(-tv / 2, -(hd - hv) + fs * 1.2, 'Viga lateral', fs * 0.7, 'rotulo-apoio');
  const bb = { x: -tv - 15, y: -hd - fs * 3, w: L + tv + 30, h: hv + hd + fs * 6 };
  corpo += cota(-tv / 2, L, -(hd - hv) + fs * 3, `L = ${f1(r.Lcm)} cm (balanço)`, fs * 0.8);
  return svg(bb, corpo, 'Degrau em balanço');
}
