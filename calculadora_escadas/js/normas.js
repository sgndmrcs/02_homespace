// Tabelas normativas usadas pela calculadora.
// Fontes: NBR 9050:2020, NBR 6120:2019 e NBR 6118:2014, conforme
// "Projetos de Escadas de Concreto Armado" (IBEE) – Parte 1.

// NBR 9050:2020 – item 6.8 (Cap. 1.3 / 1.5 do roteiro)
export const NBR9050 = {
  blondelMin: 63, // cm  (eq. 1.1)
  blondelMax: 65,
  pisoMin: 28, // cm  (eq. 1.2)
  pisoMax: 32,
  espelhoMin: 16, // cm  (eq. 1.3)
  espelhoMax: 18,
  larguraMin: 120, // cm
  larguraRecomendada: 150,
  desnivelMaxPorLance: 320, // cm – patamar a cada 3,20 m
  patamarMin: 120, // cm
  alturaLivreMin: 210, // cm
};

// Quadro 2.1 – Sobrecarga em escadas (NBR 6120:2019, Tabela 10)
// psi2: fator de combinação quase permanente (NBR 6118:2014, Tabela 11.2)
export const SOBRECARGAS = [
  { id: 'res_unid', nome: 'Residenciais, hotéis (dentro de unidades autônomas)', q: 2.5, psi2: 0.3 },
  { id: 'res_comum', nome: 'Residências, hotéis (uso comum)', q: 3.0, psi2: 0.3 },
  { id: 'sem_publico', nome: 'Sem acesso público', q: 2.5, psi2: 0.3 },
  { id: 'com_publico', nome: 'Com acesso público', q: 3.0, psi2: 0.4 },
  { id: 'hospitais', nome: 'Hospitais', q: 3.0, psi2: 0.4 },
  { id: 'comercial', nome: 'Edifícios comerciais, clubes, escritórios, bibliotecas', q: 3.0, psi2: 0.4 },
  { id: 'escolas', nome: 'Escolas', q: 3.0, psi2: 0.4 },
  { id: 'cinemas', nome: 'Cinemas, centros comerciais, shopping centers', q: 4.0, psi2: 0.6 },
  { id: 'exposicao', nome: 'Centros de exposição', q: 5.0, psi2: 0.6 },
  { id: 'convencoes', nome: 'Centros de convenções, teatros, igrejas', q: 5.0, psi2: 0.6 },
  { id: 'arquibancadas', nome: 'Servindo arquibancadas', q: 5.0, psi2: 0.6 },
];

// Tabela 2.1 – Carga de alvenarias (NBR 6120:2019, item 5.4)
// Peso por área (kN/m²) para revestimento por face de 0, 1 e 2 cm.
export const ALVENARIAS = [
  { id: 'est_conc_14', nome: 'Estrutural – bloco de concreto vazado 14 cm', v: [2.0, 2.3, 2.7] },
  { id: 'est_conc_19', nome: 'Estrutural – bloco de concreto vazado 19 cm', v: [2.7, 3.0, 3.4] },
  { id: 'est_cer_mac_14', nome: 'Estrutural – bloco cerâmico (paredes maciças) 14 cm', v: [2.0, 2.3, 2.7] },
  { id: 'est_cer_9', nome: 'Estrutural – bloco cerâmico (paredes vazadas) 9 cm', v: [1.1, 1.5, 1.9] },
  { id: 'est_cer_115', nome: 'Estrutural – bloco cerâmico (paredes vazadas) 11,5 cm', v: [1.4, 1.8, 2.2] },
  { id: 'est_cer_14', nome: 'Estrutural – bloco cerâmico (paredes vazadas) 14 cm', v: [1.7, 2.1, 2.5] },
  { id: 'est_cer_19', nome: 'Estrutural – bloco cerâmico (paredes vazadas) 19 cm', v: [2.3, 2.7, 3.1] },
  { id: 'tij_mac_9', nome: 'Tijolo cerâmico maciço 9 cm', v: [1.6, 2.0, 2.4] },
  { id: 'tij_mac_115', nome: 'Tijolo cerâmico maciço 11,5 cm', v: [2.1, 2.5, 2.9] },
  { id: 'tij_mac_14', nome: 'Tijolo cerâmico maciço 14 cm', v: [2.5, 2.9, 3.3] },
  { id: 'tij_mac_19', nome: 'Tijolo cerâmico maciço 19 cm', v: [3.4, 3.8, 4.2] },
  { id: 'ved_conc_9', nome: 'Vedação – bloco de concreto vazado 9 cm', v: [1.1, 1.5, 1.9] },
  { id: 'ved_conc_14', nome: 'Vedação – bloco de concreto vazado 14 cm', v: [1.4, 1.8, 2.2] },
  { id: 'ved_cer_9', nome: 'Vedação – bloco cerâmico furo horizontal 9 cm', v: [0.7, 1.1, 1.6] },
  { id: 'ved_cer_115', nome: 'Vedação – bloco cerâmico furo horizontal 11,5 cm', v: [0.9, 1.3, 1.7] },
  { id: 'ved_cer_14', nome: 'Vedação – bloco cerâmico furo horizontal 14 cm', v: [1.1, 1.5, 1.9] },
  { id: 'ved_cer_19', nome: 'Vedação – bloco cerâmico furo horizontal 19 cm', v: [1.4, 1.8, 2.3] },
  { id: 'celular_10', nome: 'Concreto celular autoclavado 10 cm', v: [0.6, 1.0, 1.4] },
  { id: 'celular_15', nome: 'Concreto celular autoclavado 15 cm', v: [0.9, 1.3, 1.7] },
  { id: 'vidro_8', nome: 'Bloco de vidro 8 cm', v: [0.8, 0.8, 0.8] },
];

// Tabela 2.2 – Cargas horizontais em parapeitos (NBR 6120:2019)
// Aplicada a 1,10 m do piso acabado.
export const FORCAS_HORIZONTAIS = [
  { id: 'privada', nome: 'Escadas privativas ou sem acesso público', h: 1.0 },
  { id: 'areas_privativas', nome: 'Áreas privativas residenciais, escritórios, hotéis', h: 1.0 },
  { id: 'publico', nome: 'Áreas com acesso público', h: 1.0 },
  { id: 'fluxo_paralelo', nome: 'Fluxo de pessoas – barreira paralela ao fluxo', h: 2.0 },
  { id: 'fluxo_perpendicular', nome: 'Fluxo de pessoas – barreira perpendicular ao fluxo', h: 3.0 },
  { id: 'panoramica', nome: 'Escadas panorâmicas', h: 2.0 },
  { id: 'multidoes', nome: 'Acolhimento de multidões, shopping centers', h: 3.0 },
  { id: 'inspecao', nome: 'Passarelas apenas para inspeção e manutenção', h: 0.4 },
];

export const ALTURA_FORCA_HORIZONTAL = 1.1; // m

// Barras comerciais CA-50 / CA-60 (φ em mm, área em cm², massa em kg/m)
export const BITOLAS = [
  { phi: 5.0, area: 0.196, massa: 0.154 },
  { phi: 6.3, area: 0.312, massa: 0.245 },
  { phi: 8.0, area: 0.503, massa: 0.395 },
  { phi: 10.0, area: 0.785, massa: 0.617 },
  { phi: 12.5, area: 1.227, massa: 0.963 },
  { phi: 16.0, area: 2.011, massa: 1.578 },
  { phi: 20.0, area: 3.142, massa: 2.466 },
];

// NBR 6118:2014, Tabela 17.3 – taxa mínima de armadura de flexão (%)
const RHO_MIN = [
  [20, 0.150], [25, 0.150], [30, 0.150], [35, 0.164],
  [40, 0.179], [45, 0.194], [50, 0.208],
];

export function rhoMin(fck) {
  if (fck <= RHO_MIN[0][0]) return RHO_MIN[0][1] / 100;
  for (let i = 1; i < RHO_MIN.length; i++) {
    const [f1, r1] = RHO_MIN[i - 1];
    const [f2, r2] = RHO_MIN[i];
    if (fck <= f2) return (r1 + ((fck - f1) / (f2 - f1)) * (r2 - r1)) / 100;
  }
  return RHO_MIN[RHO_MIN.length - 1][1] / 100;
}

// Tabela 1.1 – Vãos x espessura (pré-dimensionamento)
export function espessuraTabela(vaoM) {
  if (vaoM <= 3) return 10;
  if (vaoM <= 4) return 12;
  return 15;
}
