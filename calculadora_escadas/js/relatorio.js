// Geração dos resultados e do memorial de cálculo em HTML.

import { TIPOS } from './geometria.js';

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const kgf = (kN, d = 0) => `${fmt(kN * 100, d)} kgf`;
const fphi = (phi) => fmt(phi, 1);
const grau = (rad) => fmt((rad * 180) / Math.PI, 1);
const icone = (nivel) => ({ ok: '✔', aviso: '⚠', info: 'ℹ', erro: '✖' }[nivel] || '');

function tabela(cab, linhas, cls = '') {
  return `<div class="tabela-rolagem"><table class="${cls}"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`
    + `<tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const status = (ok) => `<span class="selo ${ok ? 'selo-ok' : 'selo-erro'}">${ok ? 'OK' : 'NÃO ATENDE'}</span>`;

export function htmlVerificacoes(res) {
  const linhas = res.g.verificacoes.map((v) => [`<span class="nivel nivel-${v.nivel}">${icone(v.nivel)}</span> ${v.item}`, v.valor, v.limite]);
  return tabela(['Verificação (NBR 9050:2020)', 'Valor', 'Limite'], linhas, 'verif');
}

export function htmlResumo(res) {
  const { g, h, ent } = res;
  const cards = [
    ['Modelo', TIPOS[ent.tipo]],
    ['Degraus', `${g.n} espelhos de ${fmt(g.e)} cm`],
    ['Piso', `${fmt(g.p, 1)} cm`],
    ['Inclinação α', `${grau(g.alpha)}°`],
    ['Blondel', `${fmt(g.blondel, 1)} cm`],
    ['Espessura h', `${h} cm${res.otimizada ? ' (otimizada)' : ''}`],
    ['Concreto', `${fmt(res.volume, 2)} m³ · C${ent.fck}`],
    ['Aço', res.quadro ? `${fmt(res.quadro.massaPerdas, 1)} kg (+10%)` : '–'],
    ['Formas', `${fmt(res.forma, 1)} m²`],
  ];
  if (res.taxaAco) cards.push(['Taxa de aço', `${fmt(res.taxaAco, 0)} kg/m³`]);
  let html = `<div class="cartoes">${cards.map(([t, v]) => `<div class="cartao"><span>${t}</span><strong>${v}</strong></div>`).join('')}</div>`;
  if (res.erros.length) html += `<div class="alerta alerta-erro">${res.erros.map((e) => `<p>✖ ${e}</p>`).join('')}</div>`;
  const avisos = [...res.avisos];
  res.lances.forEach((l) => (l.avisos || []).forEach((a) => avisos.push(`${l.lance.nome}: ${a}`)));
  if (res.especial) (res.especial.avisos || []).forEach((a) => avisos.push(a));
  if (avisos.length) html += `<div class="alerta alerta-aviso">${avisos.map((a) => `<p>⚠ ${a}</p>`).join('')}</div>`;
  if (res.disponivel) html += res.disponivel;
  return html;
}

export function htmlLances(res) {
  if (res.especial && res.especial.tipo === 'balanco') return htmlBalancoResumo(res);
  if (res.especial && res.especial.tipo === 'autoportante') return htmlAutoResumo(res);
  const linhas = [];
  const add = (rot, f) => linhas.push([rot, ...res.lances.map((l) => (l.erro ? '–' : f(l)))]);
  add('Vão de cálculo L', (l) => `${fmt(l.Lcm / 100)} m`);
  add('Carga total no lance (q)', (l) => `${fmt(l.cargas.qLance)} kN/m² <small>(${kgf(l.cargas.qLance)}/m²)</small>`);
  add('Mk', (l) => `${fmt(l.Mk)} kN·m/m`);
  add('Md = 1,4·Mk', (l) => `${fmt(l.Md / 100)} kN·m/m`);
  add('Altura útil d', (l) => `${fmt(l.d, 1)} cm`);
  add('x/d (domínio)', (l) => `${fmt(l.flex.xd, 3)} (D${l.flex.dominio})`);
  add('As calculada / As,mín', (l) => `${fmt(l.AsCalc)} / ${fmt(l.AsMin)} cm²/m`);
  add('<b>Armadura principal (Asx)</b>', (l) => `<b>φ${fphi(l.barP.phi)} c/${l.barP.s}</b> <small>(${fmt(l.barP.AsEf)} cm²/m)</small>`);
  add('<b>Armadura secundária (Asy)</b>', (l) => `<b>φ${fphi(l.barS.phi)} c/${l.barS.s}</b> <small>(${fmt(l.Asy)} cm²/m nec.)</small>`);
  add('<b>Armadura negativa (Asneg)</b>', (l) => `<b>φ${fphi(l.barN.phi)} c/${l.barN.s}</b> <small>(${fmt(l.Asneg)} cm²/m nec.)</small>`);
  add('VSd / VRd1', (l) => `${fmt(l.Vsd, 1)} / ${fmt(l.cort.VRd1, 1)} kN/m ${status(l.cort.ok)}`);
  add('Flecha total / limite L/250', (l) => `${fmt(l.flecha.fInf)} / ${fmt(l.flecha.lim)} cm ${status(l.flecha.ok)}`);
  add('Comprimento de ancoragem lb,nec', (l) => `${fmt(l.anc.lbNec, 0)} cm`);
  let html = tabela(['', ...res.lances.map((l) => l.lance.nome)], linhas, 'lances');
  if (res.arranjo) {
    html += `<p class="nota">Escada em “L”: arranjo <b>${res.arranjo}</b> escolhido (${res.arranjo === 'A' ? 'lance 2 apoiado no lance 1' : 'lance 1 apoiado no lance 2'}) – `
      + `Md,máx A = ${fmt(res.comparacaoL.A / 100)} e B = ${fmt(res.comparacaoL.B / 100)} kN·m/m.</p>`;
  }
  if (res.pe) {
    html += `<h4>Fundação “Pé” (item 4.1.2)</h4>${tabela(['Item', 'Valor'], [
      ['Carga no pé qp (½ da carga do lance)', `${fmt(res.pe.qp, 0)} kgf`],
      ['Comprimento Lp (= largura do lance)', `${fmt(res.pe.Lp, 0)} cm`],
      ['Largp = qp / (Lp · σadm) (eq. 4.1)', `${fmt(res.pe.larg, 1)} cm → adotado <b>${res.pe.adot} cm</b>`],
      ['Altura do pé', `${res.pe.altura} cm`],
      ['Espessura (= espessura da escada)', `${res.pe.esp} cm`],
    ])}`;
  }
  return html;
}

function htmlBalancoResumo(res) {
  const e = res.especial;
  if (e.erro) return '';
  return tabela(['Degrau em balanço', 'Valor'], [
    ['Vão do balanço L (até o eixo da viga)', `${fmt(e.Lcm / 100)} m`],
    ['Carga distribuída q (por degrau)', `${fmt(e.q)} kN/m`],
    ['(a) Mk = qL²/2 (eq. 3.9)', `${fmt(e.Ma)} kN·m`],
    ['(b) Mk = q\'L²/2 + 2,5·L (eq. 3.11)', `${fmt(e.Mb)} kN·m`],
    ['Situação crítica', e.caso],
    ['As calculada / As,mín', `${fmt(e.flex.As)} / ${fmt(e.AsMin)} cm²`],
    ['<b>Armadura superior por degrau</b>', `<b>${e.bar.n} φ${fphi(e.bar.phi)}</b> (${fmt(e.bar.AsEf)} cm²)`],
    ['VSd / VRd1 / VRd2', `${fmt(e.Vsd)} / ${fmt(e.VRd1)} / ${fmt(e.VRd2)} kN`],
    ['<b>Estribos</b>', `<b>φ5,0 c/${e.sEst}</b> ${e.construtivo ? '(construtivos)' : '(calculados)'}`],
    ['Flecha na ponta / limite 2L/250', `${fmt(e.flecha.fInf)} / ${fmt(e.flecha.lim)} cm ${status(e.flecha.ok)}`],
  ]);
}

function htmlAutoResumo(res) {
  const e = res.especial;
  if (e.erro) return '';
  const s = e.esf;
  const arm = (x) => `φ${fphi(x.br.phi)} c/${x.br.s} <small>(${fmt(x.As)} cm²/m)</small>`;
  return tabela(['Escada autoportante', 'Valor'], [
    ['Qp (patamar) / Ql (lance)', `${fmt(s.Qp)} / ${fmt(s.Ql)} kN/m²`],
    ['Myp = Qp·bp²/8', `${fmt(s.Myp)} kN·m/m`],
    ['Mxp = Qp·p²/2', `${fmt(s.Mxp)} kN·m/m`],
    ['Ml- = Mxp·bp/(2·bl)', `${fmt(s.MlNeg)} kN·m/m`],
    ['Ml+ = Ql·l²/14,22', `${fmt(s.MlPos)} kN·m/m`],
    ['Vp = Qp·p·bp/(2·bl)', `${fmt(s.Vp)} kN/m`],
    ['Nl = Vp/sen α (tração no lance superior)', `${fmt(s.Nl)} kN/m`],
    ['<b>Lance inferior – positiva</b>', arm(e.inferiorPos)],
    ['<b>Lance superior – positiva (flexo-tração)</b>', arm(e.superiorPos)],
    ['<b>Negativa lance/patamar (Ml-, Mxp)</b>', arm(e.neg)],
    ['<b>Patamar – transversal superior (Myp)</b>', arm(e.pat)],
    ['Flecha na ponta do patamar / limite (l+p)/125', `${fmt(e.flecha.fInf)} / ${fmt(e.flecha.lim)} cm ${status(e.flecha.ok)}`],
  ]);
}

export function htmlQuadro(res) {
  const q = res.quadro;
  if (!q) return '<p>Sem quadro de ferros (corrija os erros acima).</p>';
  const linhas = q.linhas.map((l) => [l.pos, l.tipo, `φ${fphi(l.phi)}`, l.n, fmt(l.comp, 0), fmt(l.total, 2), fmt(l.massa, 2)]);
  let html = tabela(['N', 'Descrição', 'φ (mm)', 'Quant.', 'C. unit. (cm)', 'C. total (m)', 'Massa (kg)'], linhas, 'quadro');
  const r = q.resumo.map((x) => [`φ${fphi(x.phi)}`, fmt(x.total, 2), fmt(x.massa, 2), fmt(x.massa * 1.1, 2)]);
  r.push(['<b>Total</b>', '', `<b>${fmt(q.massa, 2)}</b>`, `<b>${fmt(q.massaPerdas, 2)}</b>`]);
  html += `<h4>Resumo do aço (CA-50 / CA-60)</h4>${tabela(['Bitola', 'Comprimento (m)', 'Massa (kg)', 'Massa +10% (kg)'], r)}`;
  html += `<p class="nota">Concreto C${res.ent.fck}: <b>${fmt(res.volume, 3)} m³</b> · Formas: <b>${fmt(res.forma, 2)} m²</b>`
    + `${res.taxaAco ? ` · Taxa: <b>${fmt(res.taxaAco, 0)} kg/m³</b>` : ''}</p>`;
  html += tabela(['φ (mm)', 'lb (boa ader.)', 'lb (má ader.)', 'Traspasse l0t (100% emendadas)'],
    res.tabAnc.map((a) => [fphi(a.phi), `${fmt(a.boa.lb, 0)} cm`, `${fmt(a.ma.lb, 0)} cm`, `${fmt(a.trasp.l0t, 0)} cm`]));
  return html;
}

// ------------------------------------------------------------ memorial
export function htmlMemorial(res) {
  const { g, mat, h, ent, comuns } = res;
  const L = [];
  const sec = (t) => L.push(`<h3>${t}</h3>`);
  const p = (t) => L.push(`<p>${t}</p>`);
  const eq = (t, ref = '') => L.push(`<div class="eq"><span>${t}</span>${ref ? `<em>${ref}</em>` : ''}</div>`);

  sec('1. Dados de entrada');
  p(`Modelo: <b>${TIPOS[ent.tipo]}</b>. Desnível a vencer H = ${fmt(ent.desnivel, 1)} cm; largura b = ${ent.largura} cm; `
    + `vigas de apoio com ${ent.apoioViga} cm de largura; apoio inicial: ${ent.apoioInicial === 'solo' ? 'direto no solo (“pé”)' : 'viga'}.`);
  p(`Concreto C${ent.fck} (γc = ${ent.gammaC} kN/m³), aço CA-${ent.fyk / 10}, cobrimento c = ${fmt(ent.cobrimento, 1)} cm.`);
  p(`Uso: ${comuns.sc.nome} → sobrecarga ${fmt(comuns.sc.q, 1)} kN/m² (Quadro 2.1, NBR 6120:2019); ψ2 = ${comuns.sc.psi2}.`);

  sec('2. Geometria dos degraus (Cap. 1 – NBR 9050:2020)');
  eq(`n = H / e<sub>alvo</sub> = ${fmt(ent.desnivel, 1)} / ${fmt(ent.espelhoAlvo, 1)} → <b>n = ${g.n} espelhos</b>`);
  eq(`e = H / n = ${fmt(ent.desnivel, 1)} / ${g.n} = <b>${fmt(g.e)} cm</b>`, '(1.3) 16 ≤ e ≤ 18 cm');
  eq(`p = ${fmt(g.p, 1)} cm`, '(1.2) 28 ≤ p ≤ 32 cm');
  eq(`p + 2e = ${fmt(g.p, 1)} + 2·${fmt(g.e)} = <b>${fmt(g.blondel, 1)} cm</b>`, '(1.1) Blondel 63 a 65 cm');
  eq(`tg α = e / p = ${fmt(g.tanA, 4)} → <b>α = ${grau(g.alpha)}°</b>`, '(2.6)');
  if (g.lancesEspelhos.length > 1) p(`Espelhos por lance: ${g.lancesEspelhos.join(' + ')}.`);
  L.push(htmlVerificacoes(res));

  sec('3. Espessura (item 1.4)');
  eq(`h ≈ 0,03 · L (eq. 1.4) e Tabela 1.1 → h<sub>pré</sub> = ${res.hPre} cm`, '(1.4)');
  if (res.otimizada) p(`A espessura foi aumentada automaticamente para <b>h = ${h} cm</b> para atender à flecha (L/250) e à ductilidade (x/d ≤ 0,45).`);
  else p(`Espessura adotada: <b>h = ${h} cm</b>${ent.espessura ? ' (informada pelo usuário)' : ''}.`);

  sec('4. Materiais (NBR 6118:2014)');
  eq(`f<sub>cd</sub> = f<sub>ck</sub>/1,4 = ${fmt(mat.fcd)} MPa; f<sub>yd</sub> = f<sub>yk</sub>/1,15 = ${fmt(mat.fyd)} MPa`);
  eq(`f<sub>ctm</sub> = 0,3·f<sub>ck</sub><sup>2/3</sup> = ${fmt(mat.fctm)} MPa; f<sub>ctk,inf</sub> = 0,7·f<sub>ctm</sub> = ${fmt(mat.fctkInf)} MPa`, '(3.5)');
  eq(`f<sub>ctd</sub> = f<sub>ctk,inf</sub>/γc = ${fmt(mat.fctd)} MPa; τ<sub>Rd</sub> = 0,25·f<sub>ctd</sub> = ${fmt(mat.tauRd, 3)} MPa`, '(3.3)/(3.4)');
  eq(`E<sub>ci</sub> = α<sub>E</sub>·5600·√f<sub>ck</sub> = ${fmt(mat.Eci, 0)} MPa; E<sub>cs</sub> = α<sub>i</sub>·E<sub>ci</sub> = ${fmt(mat.alphaI, 3)}·E<sub>ci</sub> = ${fmt(mat.Ecs, 0)} MPa`);

  if (res.especial && res.especial.tipo === 'balanco') memorialBalanco(res, sec, p, eq);
  else if (res.especial && res.especial.tipo === 'autoportante') memorialAuto(res, sec, p, eq);
  else res.lances.forEach((l, i) => memorialLance(l, i, res, sec, p, eq));

  if (res.pe) {
    sec('Fundação direta – “Pé” (item 4.1.2)');
    eq(`q<sub>p</sub> = R<sub>A</sub>·b = ${fmt(res.pe.qp, 0)} kgf`);
    eq(`Larg<sub>p</sub> = q<sub>p</sub> / (L<sub>p</sub>·σ<sub>adm</sub>) = ${fmt(res.pe.qp, 0)} / (${res.pe.Lp}·${fmt(ent.tensaoSolo, 2)}) = ${fmt(res.pe.larg, 1)} cm → <b>${res.pe.adot} cm</b>`, '(4.1)');
    p(`Altura do pé = ${res.pe.altura} cm (profundidade mínima recomendada); espessura = ${res.pe.esp} cm. Confirmar σadm por sondagem.`);
  }

  sec('Quantitativos');
  L.push(htmlQuadro(res));
  p('<small>Observações: o roteiro (Parte 1) cobre os capítulos 1 a 4 (geometria, cargas, análise e tipos). O dimensionamento, ELS, ancoragem e detalhamento seguem a NBR 6118:2014 '
    + '(flexão simples com diagrama retangular, armaduras mínimas da Tab. 17.3/19.1, flecha com Branson e fluência αf, ancoragem item 9.4). '
    + 'Os resultados devem ser conferidos por engenheiro responsável.</small>');
  return L.join('');
}

function memorialLance(l, i, res, sec, p, eq) {
  const { g, h, ent, comuns } = res;
  const n = i + 5;
  sec(`${n}. ${l.lance.nome}`);
  if (l.erro) { p(`<b>Erro:</b> ${l.erro}`); return; }
  const c = l.cargas;
  p('<b>Cargas (Cap. 2)</b>');
  if (c.inclinada) {
    eq(`Escada transversal: cargas por m² de superfície inclinada (× cos α = ${fmt(g.cosA, 3)})`);
  }
  if (ent.tipo === 'plissada') eq(`h<sub>m</sub> = h + tg α·h = ${h} + ${fmt(g.tanA, 3)}·${h} = ${fmt(c.hm)} cm`, '(2.4)');
  else eq(`h<sub>m</sub> = h/cos α + e/2 = ${h}/${fmt(g.cosA, 3)} + ${fmt(g.e)}/2 = ${fmt(c.hm)} cm`, '(2.2)');
  eq(`Peso próprio g<sub>pp</sub> = γc·h<sub>m</sub> = ${ent.gammaC}·${fmt(c.hm / 100, 4)} = ${fmt(c.ppLance)} kN/m²${ent.ppLanceEmTudo ? ' (adotado em toda a escada)' : `; patamar: γc·h = ${fmt(c.ppPat)} kN/m²`}`, '(2.1)');
  eq(`Revestimento = ${fmt(c.rev)} kN/m² (mín. recomendado 1,0 kN/m² = 100 kgf/m²)`);
  eq(`Sobrecarga = ${fmt(c.sc)} kN/m²`, 'Quadro 2.1');
  if (c.qPar) eq(`Parapeito Q<sub>pp</sub> = γ<sub>alv</sub>·h<sub>alv</sub>·L<sub>alv</sub>/A<sub>esc</sub> = ${fmt(comuns.gAlv)}·${fmt(comuns.par.altura)}·${fmt(c.Lalv)}·${comuns.par.lados}/(${fmt(l.Lcm / 100)}·${fmt(l.b / 100)}) = ${fmt(c.qPar)} kN/m²`, '(2.7)');
  if (c.adicG || c.adicQ) eq(`Carga do lance apoiado (½ da carga total efetiva): g = ${fmt(c.adicG)} kN/m², q = ${fmt(c.adicQ)} kN/m²`, 'item 4.2.1');
  eq(`<b>q total = ${fmt(c.qLance)} kN/m² (${kgf(c.qLance)}/m²)</b>`);
  p('<b>Esforços (Cap. 3) – modelo biapoiado</b>');
  eq(`L = ${fmt(l.Lcm / 100)} m (centro a centro dos apoios)`);
  eq(`M<sub>k</sub> = ${fmt(l.Mk)} kN·m/m ${Math.abs(l.Mk - (c.qLance * (l.Lcm / 100) ** 2) / 8) < 0.01 ? `= q·L²/8` : '(cargas por trecho)'} ; R<sub>A</sub> = ${fmt(l.anK.RA)} kN/m; R<sub>B</sub> = ${fmt(l.anK.RB)} kN/m`, '(3.8)');
  eq(`V<sub>k</sub> = R·cos α = ${fmt(l.Vk)} kN/m; N<sub>k</sub> = R·sen α = ${fmt(l.normal.Nk)} kN/m`);
  p('<b>Cortante (item 3.1)</b>');
  eq(`k = 1,6 − d = ${fmt(l.cort.k, 3)} ≥ 1; ρ<sub>1</sub> = 0 (a favor da segurança); σ<sub>cp</sub> = 0`);
  eq(`V<sub>Rd1</sub> = τ<sub>Rd</sub>·k·(1,2 + 40ρ<sub>1</sub>)·b<sub>w</sub>·d = ${fmt(l.cort.VRd1)} kN/m ${l.cort.ok ? '≥' : '<'} V<sub>Sd</sub> = 1,4·V<sub>k</sub> = ${fmt(l.Vsd)} kN/m ${status(l.cort.ok)}`, '(3.2)');
  p('<b>Normal (item 3.2)</b>');
  eq(`σ<sub>n</sub> = N<sub>d</sub>/(b<sub>w</sub>·h) = ${fmt(l.normal.sigmaN, 3)} MPa ≪ f<sub>cd</sub> = ${fmt(l.normal.fcd)} MPa (${fmt(l.normal.razao, 0)} vezes)`);
  p('<b>Flexão – ELU</b>');
  eq(`M<sub>d</sub> = 1,4·M<sub>k</sub> = ${fmt(l.Md)} kN·cm/m; d = h − c − φ/2 = ${fmt(l.d, 2)} cm`);
  eq(`x = 1,25·d·[1 − √(1 − M<sub>d</sub>/(0,425·b<sub>w</sub>·d²·f<sub>cd</sub>))] = ${fmt(l.flex.x, 2)} cm; x/d = ${fmt(l.flex.xd, 3)} (domínio ${l.flex.dominio}) ${l.flex.ductil ? '≤ 0,45 ✔' : '> 0,45 ✖'}`);
  if (l.flex.Ms != null) eq(`Flexo-tração: M<sub>s</sub> = M<sub>d</sub> − N<sub>d</sub>·(d − h/2) = ${fmt(l.flex.Ms)} kN·cm/m; A<sub>s</sub> = A<sub>s,M</sub> + N<sub>d</sub>/f<sub>yd</sub>`);
  eq(`A<sub>s</sub> = M<sub>d</sub>/(f<sub>yd</sub>·(d − 0,4x)) = ${fmt(l.AsCalc)} cm²/m; A<sub>s,mín</sub> = ρ<sub>mín</sub>·b·h = ${fmt(l.AsMin)} cm²/m`);
  eq(`<b>A<sub>sx</sub>: φ${fphi(l.barP.phi)} c/${l.barP.s} (${fmt(l.barP.AsEf)} cm²/m)</b> — s ≤ min(2h; 20 cm) = ${Math.min(2 * h, 20)} cm`);
  eq(`A<sub>sy</sub> ≥ máx(0,2·A<sub>sx</sub>; 0,9 cm²/m; 0,5·ρ<sub>mín</sub>·b·h) = ${fmt(l.Asy)} cm²/m → <b>φ${fphi(l.barS.phi)} c/${l.barS.s}</b>`);
  eq(`A<sub>s,neg</sub> ≥ 0,67·ρ<sub>mín</sub>·b·h = ${fmt(l.Asneg)} cm²/m → <b>φ${fphi(l.barN.phi)} c/${l.barN.s}</b>, comprimento ${fmt(ent.comprimentoNegativa * 100, 0)}% de L além do apoio`);
  const alt = l.barP.alternativas.map((a) => `φ${fphi(a.phi)} c/${a.s}`).join(', ');
  p(`<small>Alternativas para A<sub>sx</sub>: ${alt}.</small>`);
  p('<b>Flecha – ELS (combinação quase permanente)</b>');
  const f = l.flecha;
  eq(`I<sub>c</sub> = ${fmt(f.Ic, 0)} cm⁴; M<sub>r</sub> = 1,5·f<sub>ctm</sub>·I<sub>c</sub>/y<sub>t</sub> = ${fmt(f.Mr / 100)} kN·m/m; M<sub>a</sub> = ${fmt(l.anS.Mmax)} kN·m/m → estádio ${f.estadio}`);
  eq(`I<sub>II</sub> = ${fmt(f.III, 0)} cm⁴; (EI)<sub>eq</sub> = E<sub>cs</sub>·{(M<sub>r</sub>/M<sub>a</sub>)³·I<sub>c</sub> + [1 − (M<sub>r</sub>/M<sub>a</sub>)³]·I<sub>II</sub>} → I<sub>eq</sub> = ${fmt(f.Ieq, 0)} cm⁴`);
  eq(`f<sub>0</sub> = 5·p·L⁴/(384·EI) = ${fmt(f.f0)} cm; α<sub>f</sub> = Δξ = ${fmt(f.alphaF, 2)}; f<sub>∞</sub> = f<sub>0</sub>·(1 + α<sub>f</sub>) = <b>${fmt(f.fInf)} cm</b> ${f.ok ? '≤' : '>'} L/250 = ${fmt(f.lim)} cm ${status(f.ok)}`);
  p('<b>Ancoragem (Cap. 7)</b>');
  eq(`f<sub>bd</sub> = η1·η2·η3·f<sub>ctd</sub> = ${fmt(l.anc.fbd)} MPa; l<sub>b</sub> = (φ/4)·(f<sub>yd</sub>/f<sub>bd</sub>) = ${fmt(l.anc.lb, 0)} cm; l<sub>b,nec</sub> = ${fmt(l.anc.lbNec, 0)} cm`);
  if (l.arm.joelhos.length) p(`Nos ${l.arm.joelhos.length} “joelho(s)” côncavos a armadura positiva é interrompida e cruzada, prolongando-se l<sub>b,nec</sub> = ${fmt(l.anc.lbNec, 0)} cm além do vértice (evita o arrancamento do cobrimento).`);
}

function memorialBalanco(res, sec, p, eq) {
  const e = res.especial;
  sec('5. Degraus em balanço (itens 2.2.2 e 3.3.2)');
  if (e.erro) { p(`<b>Erro:</b> ${e.erro}`); return; }
  eq(`L = largura + t<sub>v</sub>/2 = ${fmt(e.Lcm, 1)} cm; b<sub>piso</sub> = ${fmt(e.bp, 1)} cm; h<sub>degrau</sub> = ${e.hd} cm`);
  eq(`q = (γc·h + revest. + sobrecarga)·b<sub>piso</sub> = (${fmt(e.cargas.pp)} + ${fmt(e.cargas.rev)} + ${fmt(e.cargas.sc)})·${fmt(e.bp / 100)} = ${fmt(e.q)} kN/m`);
  if (e.P) eq(`Parapeito na ponta: P = ${fmt(e.P)} kN; força horizontal ${fmt(e.Fh)} kN a 1,10 m → M<sub>h</sub> = ${fmt(e.Mh)} kN·m`);
  eq(`(a) M<sub>k</sub> = q·L²/2 = ${fmt(e.Ma)} kN·m; V<sub>k</sub> = q·L = ${fmt(e.Va)} kN`, '(3.9)/(3.10)');
  eq(`(b) M<sub>k</sub> = q'·L²/2 + 2,5·L = ${fmt(e.Mb)} kN·m; V<sub>k</sub> = q'·L + 2,5 = ${fmt(e.Vb)} kN`, '(3.11)/(3.12)');
  p(`Situação crítica: ${e.caso}. A reação no apoio deve ser a da sobrecarga distribuída.`);
  eq(`M<sub>d</sub> = ${fmt(e.Md)} kN·cm; d = ${fmt(e.d)} cm; x/d = ${fmt(e.flex.xd, 3)}; A<sub>s</sub> = ${fmt(e.flex.As)} cm² (mín. ${fmt(e.AsMin)}) → <b>${e.bar.n} φ${fphi(e.bar.phi)}</b> (superior)`);
  eq(`V<sub>Sd</sub> = ${fmt(e.Vsd)} kN; V<sub>Rd1</sub> = ${fmt(e.VRd1)} kN; V<sub>Rd2</sub> = ${fmt(e.VRd2)} kN → estribos φ5,0 c/${e.sEst} ${e.construtivo ? '(construtivos: VSd ≤ VRd1)' : '(modelo I)'}`);
  eq(`Flecha na ponta f<sub>∞</sub> = ${fmt(e.flecha.fInf)} cm ≤ 2L/250 = ${fmt(e.flecha.lim)} cm ${status(e.flecha.ok)}`);
  eq(`Ancoragem na viga (gancho, má aderência): l<sub>b,nec</sub> = ${fmt(e.anc.lbNec, 0)} cm`);
  p('Para a viga de apoio recomenda-se base mínima de 20 cm por conta da torção.');
}

function memorialAuto(res, sec, p, eq) {
  const e = res.especial;
  sec('5. Escada autoportante (item 3.4)');
  if (e.erro) { p(`<b>Erro:</b> ${e.erro}`); return; }
  const s = e.esf;
  eq(`Q<sub>p</sub> = ${fmt(s.Qp)} kN/m²; Q<sub>l</sub> = ${fmt(s.Ql)} kN/m²; p = ${fmt(s.p)} m; b<sub>p</sub> = ${fmt(s.bp)} m; b<sub>l</sub> = ${fmt(s.bl)} m; l = ${fmt(s.l)} m`);
  eq(`V<sub>p</sub> = Q<sub>p</sub>·p·(b<sub>p</sub>/2b<sub>l</sub>) = ${fmt(s.Vp)} kN/m; N<sub>l</sub> = V<sub>p</sub>/sen α = ${fmt(s.Nl)} kN/m`);
  eq(`M<sub>yp</sub> = Q<sub>p</sub>·b<sub>p</sub>²/8 = ${fmt(s.Myp)}; M<sub>xp</sub> = Q<sub>p</sub>·p²/2 = ${fmt(s.Mxp)} kN·m/m`);
  eq(`M<sub>l−</sub> = M<sub>xp</sub>·b<sub>p</sub>/(2b<sub>l</sub>) = ${fmt(s.MlNeg)}; M<sub>l+</sub> = Q<sub>l</sub>·l²/14,22 = ${fmt(s.MlPos)} kN·m/m`);
  p('O lance inferior trabalha à flexo-compressão (compressão desprezada a favor da segurança) e o superior à flexo-tração. Adota-se a pior armação nos dois lances.');
  const arm = (t, x) => eq(`${t}: d = ${fmt(x.d)} cm; A<sub>s</sub> = ${fmt(x.As)} cm²/m → <b>φ${fphi(x.br.phi)} c/${x.br.s}</b>${x.fl.caso ? ` (${x.fl.caso})` : ''}`);
  arm('Lance inferior (Ml+)', e.inferiorPos);
  arm('Lance superior (Ml+ com Nl)', e.superiorPos);
  arm('Negativa (Ml− / Mxp com Nl)', e.neg);
  arm('Patamar transversal (Myp)', e.pat);
  eq(`f = (1/E<sub>cs</sub>·I<sub>c</sub>)·(Q<sub>p</sub>·p⁴/8 + M<sub>l−</sub>·l·p/(3·cos α)) = ${fmt(e.flecha.f0)} cm; f<sub>∞</sub> = ${fmt(e.flecha.fInf)} cm ≤ (l+p)/125 = ${fmt(e.flecha.lim)} cm ${status(e.flecha.ok)}`, '(8.1)');
}
