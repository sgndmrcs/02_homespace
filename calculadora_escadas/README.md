# 🪜 Calculadora de Escadas de Concreto Armado

Aplicação web (mobile-first, sem build) que dimensiona escadas residenciais de concreto armado a partir dos dados de entrada e do modelo de escada escolhido. Ela gera:

- **Geometria dos degraus** (NBR 9050:2020): número de espelhos, espelho, piso, fórmula de Blondel, inclinação, largura, patamares a cada 3,20 m.
- **Cargas** (NBR 6120:2019): peso próprio com espessura média (eq. 2.2 / 2.4), revestimento, sobrecarga (Quadro 2.1), parapeito (eq. 2.7, Tabela 2.1) e força horizontal (Tabela 2.2).
- **Esforços** em modelo biapoiado (M = qL²/8, V = R·cos α, N = R·sen α), com transferência de carga entre lances apoiados em lances (escadas em L e U).
- **Dimensionamento** (NBR 6118:2014): flexão simples / flexo-tração, armaduras principal, secundária e negativa, cortante (VRd1), tensão normal, flecha (Branson + fluência) e ancoragem / traspasse.
- **Espessura otimizada**: parte de h = 0,03·L (Tabela 1.1) e aumenta 1 cm até atender L/250 e x/d ≤ 0,45.
- **Detalhamento**: planta, corte longitudinal com as barras (e barras cruzadas nos “joelhos”), diagramas de M e V, quadro de ferros, resumo do aço, volume de concreto, formas e fundação “pé” (eq. 4.1).
- **Memorial de cálculo** passo a passo, para imprimir ou salvar em PDF.
- **3D e Realidade Aumentada**: visualize a escada em escala real e posicione-a no local com a câmera do celular.

Roteiro seguido: *Projetos de Escadas de Concreto Armado – Parte 1* (IBEE, Enson Portela). A Parte 1 cobre os capítulos 1 a 4. Dimensionamento, ELS, ancoragem e detalhamento seguem diretamente a NBR 6118:2014.

## Modelos disponíveis

| Modelo | Como é calculado |
|---|---|
| Longitudinal (com ou sem patamares) | Lance biapoiado, cargas por trecho |
| Plissada (cascata) | hm = h + tg α·h, armadura que acompanha os degraus |
| Dois lances com patamar (meia-volta) | Dois lances biapoiados na viga do patamar (VE) |
| Em “L” | Um lance apoiado no outro; o arranjo de menor momento é escolhido automaticamente |
| Em “U” (três lances) | Lances 1 e 3 nas vigas, lance 2 apoiado neles (½ da carga para cada) |
| Autoportante | Myp, Mxp, Ml−, Ml+, Nl (item 3.4), lance superior em flexo-tração |
| Transversal | Laje entre vigas laterais inclinadas |
| Degraus em balanço | Casos (a) qL²/2 e (b) qL²/2 + 2,5 kN·L (NBR 6120) |

## Realidade Aumentada no celular

| Aparelho | O que funciona |
|---|---|
| **Android** (Chrome + Google Play Services for AR) | WebXR: aponte para o piso, toque para posicionar a escada em escala real, gire em passos de 15° ou 1°, ajuste a transparência. No modo **Medir**, toque em dois pontos para medir o **desnível** e o **comprimento disponível** e enviar os valores para o cálculo. |
| **iPhone / iPad** (Safari) | AR Quick Look via `<model-viewer>`: posicionar e girar com os dedos, em escala real. Para medir, use o app *Medida* e digite os valores. |
| Desktop | Visualizador 3D e download do modelo `.glb`. |

> A câmera / AR só funciona em **HTTPS**. A forma mais simples é publicar o repositório no **GitHub Pages** (Settings → Pages → branch) e abrir `https://<usuario>.github.io/02_homespace/calculadora_escadas/` no celular.

## Como rodar localmente

```bash
cd calculadora_escadas
npx http-server . -p 8080      # ou: python3 -m http.server 8080
# abra http://localhost:8080
```

Testes do motor de cálculo (Node 18+), validados com os exemplos numéricos do roteiro:

```bash
cd calculadora_escadas
npm test
```

## Estrutura

```plaintext
📦 calculadora_escadas
 ┣ 📜 index.html            → interface (abas Dados, 3D/AR, Resultados, Detalhamento, Memorial)
 ┣ 📂 css/style.css         → estilos (claro/escuro, impressão)
 ┣ 📂 js
 ┃ ┣ normas.js              → tabelas NBR 9050, 6120, 6118 e bitolas
 ┃ ┣ geometria.js           → degraus, lances estruturais e layout em planta
 ┃ ┣ perfil.js              → corte do lance e traçado das armaduras
 ┃ ┣ calculo.js             → cargas, esforços, dimensionamento, ELS, quadro de ferros
 ┃ ┣ detalhamento.js        → desenhos SVG
 ┃ ┣ relatorio.js           → resultados e memorial de cálculo
 ┃ ┣ modelo3d.js            → modelo three.js em escala real
 ┃ ┣ ar.js                  → WebXR (Android) e Quick Look (iOS)
 ┃ ┗ app.js                 → ligação da interface
 ┗ 📂 tests/calculo.test.mjs
```

⚠️ Ferramenta de apoio ao projeto: confira os resultados e o detalhamento final com o engenheiro responsável.
