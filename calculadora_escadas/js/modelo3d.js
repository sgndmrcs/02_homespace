// Modelo 3D da escada (three.js), em metros e em escala real – usado no
// visualizador e na Realidade Aumentada.
// Eixos: planta (x, y) e cota z [cm] → three (X = x, Y = z, Z = -y) [m].

import * as THREE from 'three';
import { construirPerfil } from './perfil.js';
import { compPeca } from './geometria.js';

const M = 0.01;
const CORES = {
  concreto: 0xc9c4bb,
  viga: 0x8d8a85,
  pos: 0xd9480f,
  neg: 0x1971c2,
  dist: 0x2f9e44,
};

const vec3 = (x, y, z) => new THREE.Vector3(x * M, z * M, -y * M);

// Matriz que leva o plano local (s, z, w) do lance para o mundo.
function matrizLance(origem, dir, perp) {
  const ex = new THREE.Vector3(dir[0], 0, -dir[1]);
  const ey = new THREE.Vector3(0, 1, 0);
  const ez = new THREE.Vector3(perp[0], 0, -perp[1]);
  const m = new THREE.Matrix4().makeBasis(ex, ey, ez);
  m.setPosition(origem[0] * M, 0, -origem[1] * M);
  return m;
}

function malhaPerfil(poligono, largura, material) {
  const shape = new THREE.Shape(poligono.map(([s, z]) => new THREE.Vector2(s * M, z * M)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: largura * M, bevelEnabled: false });
  return new THREE.Mesh(geo, material);
}

function caixa(x0, y0, z0, x1, y1, z1, material) {
  const geo = new THREE.BoxGeometry(Math.abs(x1 - x0) * M, Math.abs(z1 - z0) * M, Math.abs(y1 - y0) * M);
  const m = new THREE.Mesh(geo, material);
  m.position.set(((x0 + x1) / 2) * M, ((z0 + z1) / 2) * M, (-(y0 + y1) / 2) * M);
  return m;
}

function inicioDoLance(lance, p) {
  let s = 0;
  for (const pc of lance.pecas) {
    if (pc.tipo === 'lance') return s;
    s += compPeca(pc, p);
  }
  return 0;
}

// Constrói o grupo 3D a partir do resultado do cálculo.
export function construirModelo(res, { armadura = false, opacidade = 1, arestas = false } = {}) {
  const { g, h, ent } = res;
  const grupo = new THREE.Group();
  grupo.name = 'Escada';
  const transp = opacidade < 1;
  const matC = new THREE.MeshStandardMaterial({ color: CORES.concreto, roughness: 0.9, side: THREE.DoubleSide, transparent: transp || armadura, opacity: armadura ? Math.min(opacidade, 0.45) : opacidade, depthWrite: !(transp || armadura) });
  const matV = new THREE.MeshStandardMaterial({ color: CORES.viga, roughness: 0.9, side: THREE.DoubleSide, transparent: transp || armadura, opacity: armadura ? Math.min(opacidade, 0.45) : opacidade, depthWrite: !(transp || armadura) });
  const plissada = ent.tipo === 'plissada';
  const tipo = ent.tipo;

  if (tipo === 'balanco') {
    const t = g.trechos[0];
    const hd = t.hd;
    for (let k = 0; k < g.n - 1; k++) {
      grupo.add(caixa(0, k * g.p, (k + 1) * g.e - hd, ent.largura, (k + 1) * g.p, (k + 1) * g.e, matC));
    }
  } else {
    for (const lance of g.lances) {
      const t = g.trechos.find((tr) => (tr.tipo === 'lance') && tr.lance === lance.id);
      if (!t) continue;
      // no 3D, apoios sobre outro lance não são repetidos (evita sobreposição)
      const l3d = { ...lance, pecas: lance.pecas.map((pc) => (pc.apoio === 'lance' ? { ...pc, larg: 0.5 } : pc)) };
      const perf = construirPerfil(l3d, g, h, plissada);
      const sF = inicioDoLance(l3d, g.p);
      const origem = [t.x - t.dir[0] * sF, t.y - t.dir[1] * sF];
      const pol = perf.acabado.concat(perf.fundo.slice().reverse());
      const mesh = malhaPerfil(pol, t.b, matC);
      mesh.applyMatrix4(matrizLance(origem, t.dir, t.perp));
      grupo.add(mesh);

      if (armadura) {
        const lr = res.lances.find((x) => x.lance && x.lance.id === lance.id);
        const barras = lr ? lr.barras : res.especial?.barras?.filter((b) => b.lance === lance.nome);
        if (barras) {
          const sF2 = inicioDoLance(lance, g.p);
          const origem2 = [t.x - t.dir[0] * sF2, t.y - t.dir[1] * sF2];
          adicionarArmaduras(grupo, barras, matrizLance(origem2, t.dir, t.perp), t.b, ent.cobrimento);
        }
      }
    }
    // preenchimento do vazio entre lances no patamar (meia-volta)
    for (const t of g.trechos) {
      if (t.tipo !== 'patamar' || (tipo !== 'dois_lances' && tipo !== 'autoportante')) continue;
      const gap = ent.vazio ?? 10;
      if (gap > 0) grupo.add(caixa(ent.largura, t.y0, t.z - h, ent.largura + gap, t.y1, t.z, matC));
    }
  }
  for (const v of g.vigas) {
    if (v.inclinada) {
      const shape = new THREE.Shape([
        new THREE.Vector2(v.y0 * M, (v.z0 + (v.y0) * g.tanA) * M),
        new THREE.Vector2(v.y1 * M, (v.z0 + (v.y1) * g.tanA) * M),
        new THREE.Vector2(v.y1 * M, (v.z0 + (v.y1) * g.tanA - v.alt) * M),
        new THREE.Vector2(v.y0 * M, (v.z0 + (v.y0) * g.tanA - v.alt) * M),
      ]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: (v.x1 - v.x0) * M, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, matV);
      mesh.applyMatrix4(matrizLance([v.x0, 0], [0, 1], [1, 0]));
      grupo.add(mesh);
    } else {
      grupo.add(caixa(v.x0, v.y0, v.ztop - v.alt, v.x1, v.y1, v.ztop, matV));
    }
  }
  const matA = new THREE.LineBasicMaterial({ color: 0x3d3a36 });
  grupo.children.slice().forEach((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (arestas && (o.material === matC || o.material === matV)) {
      const linhas = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), matA);
      o.updateMatrix();
      linhas.applyMatrix4(o.matrix);
      grupo.add(linhas);
    }
  });
  return grupo;
}

function adicionarArmaduras(grupo, barras, matriz, largura, c) {
  const mats = {
    pos: new THREE.MeshStandardMaterial({ color: CORES.pos, roughness: 0.5 }),
    neg: new THREE.MeshStandardMaterial({ color: CORES.neg, roughness: 0.5 }),
    dist: new THREE.MeshStandardMaterial({ color: CORES.dist, roughness: 0.5 }),
  };
  for (const b of barras) {
    const r = Math.max(b.phi / 2000, 0.003);
    if (b.pts && b.s) {
      const curva = new THREE.CurvePath();
      for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1]; const d = b.pts[i];
        curva.add(new THREE.LineCurve3(new THREE.Vector3(a[0] * M, a[1] * M, 0), new THREE.Vector3(d[0] * M, d[1] * M, 0)));
      }
      const geo = new THREE.TubeGeometry(curva, Math.max(b.pts.length * 4, 8), r, 6, false);
      const n = Math.floor((largura - 2 * c) / b.s) + 1;
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, b.desenho === 'neg' ? mats.neg : mats.pos);
        m.position.z = (c + k * b.s) * M;
        m.applyMatrix4(matriz);
        grupo.add(m);
      }
    } else if (b.pontos) {
      const geo = new THREE.CylinderGeometry(r, r, (largura - 2 * c) * M, 6);
      geo.rotateX(Math.PI / 2);
      for (const [s, z] of b.pontos) {
        const m = new THREE.Mesh(geo, mats.dist);
        m.position.set(s * M, z * M, (largura / 2) * M);
        m.applyMatrix4(matriz);
        grupo.add(m);
      }
    }
  }
}

// Dimensões totais (m) do modelo.
export function dimensoes(grupo) {
  const bb = new THREE.Box3().setFromObject(grupo);
  const t = new THREE.Vector3();
  bb.getSize(t);
  return { bb, tamanho: t };
}

// ------------------------------------------------------------ visualizador
export function criarVisualizador(container, OrbitControls) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  camera.position.set(5, 4, 5);
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.enableDamping = true;
  cena.add(new THREE.HemisphereLight(0xffffff, 0x7a7a7a, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(4, 8, 3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0005;
  sol.shadow.normalBias = 0.02;
  cena.add(sol);
  const grade = new THREE.GridHelper(20, 40, 0x888888, 0xcccccc);
  grade.material.transparent = true;
  grade.material.opacity = 0.5;
  cena.add(grade);
  let modelo = null;

  const redimensionar = () => {
    const w = container.clientWidth || 300;
    const hh = container.clientHeight || 300;
    renderer.setSize(w, hh, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(redimensionar).observe(container);
  redimensionar();

  renderer.setAnimationLoop(() => {
    controles.update();
    renderer.render(cena, camera);
  });

  return {
    atualizar(res, opts) {
      if (modelo) {
        cena.remove(modelo);
        modelo.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      modelo = construirModelo(res, { arestas: true, ...opts });
      cena.add(modelo);
      const { bb, tamanho } = dimensoes(modelo);
      const centro = bb.getCenter(new THREE.Vector3());
      const raio = Math.max(tamanho.x, tamanho.y, tamanho.z);
      controles.target.copy(centro);
      if (!this._enquadrado) {
        camera.position.set(centro.x + raio * 1.2, centro.y + raio * 0.9, centro.z + raio * 1.4);
        this._enquadrado = true;
      }
      grade.position.y = bb.min.y - 0.001;
      return tamanho;
    },
    enquadrar() { this._enquadrado = false; },
    modelo: () => modelo,
    renderer,
  };
}
