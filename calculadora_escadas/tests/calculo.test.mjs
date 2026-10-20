// Testes do motor de cálculo: `node --test tests/` (Node 18+).
// Os valores de referência vêm dos exemplos do roteiro IBEE (Parte 1).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularEscada, materiais, cortanteLaje, biapoiada, calcularPe, flexaoSimples, ancoragem,
} from '../js/calculo.js';
import { dimensionarDegraus } from '../js/geometria.js';
import { TIPOS } from '../js/geometria.js';

const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('materiais C30 – item 3.1 (fctk,inf = 2,03; fctd = 1,45; τRd = 0,36 MPa)', () => {
  const m = materiais({ fck: 30, fyk: 500, agregado: 1, gammaC: 25 });
  perto(m.fctkInf, 2.03, 0.01);
  perto(m.fctd, 1.45, 0.01);
  perto(m.tauRd, 0.36, 0.005);
});

test('VRd1 do exemplo do item 3.1 (d = 9,5 cm, C30) ≈ 61,77 kN/m', () => {
  const m = materiais({ fck: 30, fyk: 500, agregado: 1, gammaC: 25 });
  const r = cortanteLaje(0, 9.5, 100, m);
  perto(r.k, 1.505, 1e-9);
  perto(r.VRd1, 61.77, 0.5); // o livro arredonda τRd para 0,36
});

test('Curiosidade do item 3.1 (C25, d = 5 cm) → VRd1 ≈ 29,81 kN/m', () => {
  const m = materiais({ fck: 25, fyk: 500, agregado: 1, gammaC: 25 });
  perto(cortanteLaje(0, 5, 100, m).VRd1, 29.81, 0.1);
});

test('Momento da escada plissada (item 3.3.1): 1 tf/m², L = 3,92 m → 1,921 tf·m', () => {
  perto(biapoiada(3.92, [{ a: 0, b: 3.92, q: 10 }]).Mmax, 19.208, 0.001);
});

test('Cortante e normal do exemplo do item 3.1/3.2 (q = 1000 kgf/m², L = 3,30 m, α = 29°)', () => {
  const R = biapoiada(3.3, [{ a: 0, b: 3.3, q: 10 }]).RA;
  const a = (29 * Math.PI) / 180;
  perto(R * Math.cos(a) * 100, 1443, 2); // Vk ≈ 1450 kgf/m
  perto(R * Math.sin(a) * 100, 799.94, 0.5); // Nk ≈ 800 kgf/m
});

test('Largura do pé (eq. 4.1): 2375 kgf, Lp = 120 cm, σ = 0,3 kgf/cm² → 65,97 cm', () => {
  const pe = calcularPe(23.75 / 1.2, 120, 12, 0.3);
  perto(pe.larg, 65.97, 0.01);
  assert.equal(pe.adot, 70);
});

test('Degraus respeitam NBR 9050 (Blondel, piso e espelho)', () => {
  for (const H of [150, 252, 280, 306, 320]) {
    const g = dimensionarDegraus({ desnivel: H, espelhoAlvo: 17.5 });
    assert.ok(g.e >= 16 && g.e <= 18, `e = ${g.e}`);
    assert.ok(g.p >= 28 && g.p <= 32, `p = ${g.p}`);
    assert.ok(g.blondel >= 63 - 0.05 && g.blondel <= 65 + 0.05, `Blondel = ${g.blondel}`);
  }
});

test('Flexão simples: As cresce com Md e x/d dentro do domínio 2/3', () => {
  const r1 = flexaoSimples(1500, 100, 9.5, 25 / 1.4, 500 / 1.15);
  const r2 = flexaoSimples(3000, 100, 9.5, 25 / 1.4, 500 / 1.15);
  assert.ok(r1.ok && r2.ok && r2.As > r1.As);
  assert.ok(r2.xd < 0.45);
  assert.equal(flexaoSimples(1e6, 100, 9.5, 25 / 1.4, 500 / 1.15).ok, false);
});

test('Ancoragem básica φ10, C25, boa aderência ≥ 25φ', () => {
  const m = materiais({ fck: 25, fyk: 500, agregado: 1, gammaC: 25 });
  const a = ancoragem(10, m);
  assert.ok(a.lb >= 25);
  perto(a.lb, 38, 1);
});

for (const tipo of Object.keys(TIPOS)) {
  test(`modelo "${tipo}" calcula sem erros e gera quadro de ferros`, () => {
    const r = calcularEscada({ tipo, desnivel: 280, parapeito: { ativo: true } });
    assert.deepEqual(r.erros, []);
    assert.ok(r.quadro && r.quadro.massa > 0);
    assert.ok(r.volume > 0);
    const itens = r.especial ? [r.especial] : r.lances;
    for (const it of itens) assert.ok(it.flecha.ok, `${tipo}: flecha ${it.flecha.fInf} > ${it.flecha.lim}`);
    for (const l of r.quadro.linhas) assert.ok(l.n > 0 && l.comp > 0);
  });
}

test('espessura informada pelo usuário é respeitada', () => {
  const r = calcularEscada({ tipo: 'longitudinal', desnivel: 280, espessura: 20 });
  assert.equal(r.h, 20);
  assert.equal(r.otimizada, false);
});

test('escada reta: armadura positiva sem "joelho" e negativas nos dois apoios', () => {
  const r = calcularEscada({ tipo: 'longitudinal', desnivel: 280 });
  const l = r.lances[0];
  assert.equal(l.arm.barrasPos.length, 1);
  assert.equal(l.arm.negativas.length, 2);
});

test('lance com patamar superior: barra positiva interrompida e cruzada no joelho', () => {
  const r = calcularEscada({ tipo: 'longitudinal', desnivel: 280, patamarSup: 120 });
  const l = r.lances[0];
  assert.equal(l.arm.joelhos.length, 1);
  assert.equal(l.arm.barrasPos.length, 2);
});

test('escada em U: lances 1 e 3 recebem metade da carga do lance 2', () => {
  const r = calcularEscada({ tipo: 'U', desnivel: 300 });
  const [l1, l2, l3] = r.lances;
  const metade = (0.5 * l2.anG.total * (l2.b / 100)) / ((l1.Lcm / 100) * (l1.b / 100));
  perto(l1.cargas.adicG, metade, 1e-9);
  assert.ok(l3.cargas.adicG > 0);
  assert.equal(l2.cargas.adicG, 0);
});
