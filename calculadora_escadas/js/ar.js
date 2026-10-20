// Realidade Aumentada no celular.
// • Android (Chrome + ARCore): WebXR "immersive-ar" com hit-test –
//   posicionar a escada em escala real no local e medir desnível/vão.
// • iPhone/iPad: AR Quick Look via <model-viewer> (USDZ gerado na hora).

import * as THREE from 'three';

export async function suporteWebXR() {
  try {
    return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')));
  } catch {
    return false;
  }
}

export function ehIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function reticulo() {
  const geo = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const cruz = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
  m.add(cruz);
  m.matrixAutoUpdate = false;
  m.visible = false;
  return m;
}

function marcador(cor) {
  return new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: cor }));
}

/**
 * Inicia a sessão WebXR.
 * @param {object} op
 *  - modelo: THREE.Object3D da escada (em metros)
 *  - overlay: elemento HTML usado como DOM overlay
 *  - ui: { status(texto), medida({horizontal, vertical, distancia}) }
 */
export async function iniciarWebXR({ modelo, overlay, ui }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.classList.add('xr-canvas');
  document.body.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.0));
  const luz = new THREE.DirectionalLight(0xffffff, 1.2);
  luz.position.set(1, 3, 1);
  cena.add(luz);

  const ret = reticulo();
  cena.add(ret);
  const ancora = new THREE.Group();
  ancora.visible = false;
  ancora.add(modelo);
  cena.add(ancora);

  const medicao = { pts: [], objetos: [] };
  const estado = { modo: 'posicionar', rot: 0 };

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: { root: overlay },
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({ space: viewerSpace });

  // toques nos botões do overlay não devem disparar "select"
  overlay.addEventListener('beforexrselect', (ev) => {
    if (ev.target.closest('button, input, select, label')) ev.preventDefault();
  });

  const limparMedicao = () => {
    medicao.objetos.forEach((o) => cena.remove(o));
    medicao.objetos = [];
    medicao.pts = [];
  };

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (!ret.visible) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(ret.matrix);
    if (estado.modo === 'posicionar') {
      // a escada "sai" do ponto marcado e sobe afastando-se do usuário
      const f = new THREE.Vector3();
      renderer.xr.getCamera().getWorldDirection(f);
      estado.base = Math.atan2(-f.x, -f.z);
      ancora.position.copy(pos);
      ancora.rotation.set(0, estado.base + estado.rot, 0);
      ancora.visible = true;
      ui.status('Escada posicionada. Toque novamente para reposicionar ou use os botões para girar.');
    } else {
      if (medicao.pts.length >= 2) limparMedicao();
      medicao.pts.push(pos);
      const mk = marcador(medicao.pts.length === 1 ? 0x40c057 : 0xfa5252);
      mk.position.copy(pos);
      cena.add(mk);
      medicao.objetos.push(mk);
      if (medicao.pts.length === 2) {
        const [a, b] = medicao.pts;
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        const linha = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd43b }));
        cena.add(linha);
        medicao.objetos.push(linha);
        const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
        const vertical = Math.abs(b.y - a.y);
        ui.medida({ horizontal, vertical, distancia: a.distanceTo(b) });
      } else {
        ui.status('Ponto 1 marcado. Marque o ponto 2 (ex.: piso superior / outra extremidade).');
      }
    }
  });
  cena.add(controller);

  renderer.setAnimationLoop((t, frame) => {
    if (frame) {
      const ref = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(ref);
        ret.visible = true;
        ret.matrix.fromArray(pose.transform.matrix);
      } else {
        ret.visible = false;
      }
    }
    renderer.render(cena, camera);
  });

  let encerrado = false;
  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    renderer.setAnimationLoop(null);
    hitSource.cancel?.();
    renderer.domElement.remove();
    renderer.dispose();
  };
  session.addEventListener('end', () => {
    encerrar();
    ui.fim?.();
  });

  return {
    modo(m) {
      estado.modo = m;
      if (m === 'medir') ui.status('Medir: aponte para o ponto 1 (ex.: piso inferior) e toque na tela.');
      else ui.status('Aponte para o piso onde nasce o 1º degrau e toque na tela.');
    },
    girar(graus) {
      estado.rot += (graus * Math.PI) / 180;
      ancora.rotation.set(0, (estado.base || 0) + estado.rot, 0);
    },
    opacidade(v) {
      modelo.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = v < 1;
          o.material.opacity = v;
          o.material.depthWrite = v >= 1;
        }
      });
    },
    limparMedicao,
    sair: () => session.end(),
  };
}

// --------------------------------------------- iOS / fallback: model-viewer
let mvCarregado = null;
function carregarModelViewer() {
  if (!mvCarregado) {
    mvCarregado = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
      s.onload = ok;
      s.onerror = erro;
      document.head.appendChild(s);
    });
  }
  return mvCarregado;
}

export async function exportarGLB(objeto) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const exp = new GLTFExporter();
  const clone = objeto.clone(true);
  clone.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = false;
      o.material.opacity = 1;
      o.material.depthWrite = true;
    }
  });
  const buf = await exp.parseAsync(clone, { binary: true });
  return new Blob([buf], { type: 'model/gltf-binary' });
}

// Abre o <model-viewer> com AR (Quick Look no iOS, Scene Viewer/WebXR no Android)
export async function abrirModelViewer(container, glbBlob) {
  await carregarModelViewer();
  const url = URL.createObjectURL(glbBlob);
  container.innerHTML = '';
  const mv = document.createElement('model-viewer');
  mv.setAttribute('src', url);
  mv.setAttribute('ar', '');
  mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
  mv.setAttribute('ar-scale', 'fixed');
  mv.setAttribute('ar-placement', 'floor');
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('shadow-intensity', '1');
  mv.setAttribute('alt', 'Modelo 3D da escada em escala real');
  const bt = document.createElement('button');
  bt.slot = 'ar-button';
  bt.className = 'botao primario botao-ar-mv';
  bt.textContent = 'Ver no meu espaço (AR)';
  mv.appendChild(bt);
  container.appendChild(mv);
  return mv;
}
