import * as THREE from 'three';
import { CARS, getCar } from '../data/cars';
import type { CarCosmetics } from '../save/types';
import { CarView } from './CarView';

/**
 * "Fotos" de los autos para el garage: se renderiza el mismo modelo 3D que
 * manejás, en 3/4 y con luz de estudio, y se guarda como data URL. Nada de
 * imágenes externas — la foto ES el auto.
 */

const W = 320;
const H = 200;
const cache = new Map<string, string>();

function studioScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe0c0, 0x35302c, 2.2));

  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(4, 5, 6);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffa860, 2.0);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.8);
  fill.position.set(-3, 2, 5);
  scene.add(fill);

  // Piso: un disco con degradado para que el auto no flote
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 40),
    new THREE.MeshBasicMaterial({ color: 0x2a231d }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  scene.add(floor);

  return scene;
}

function cosmeticsFor(paint: string): CarCosmetics {
  return {
    paintColor: paint,
    paintType: 'metallic',
    wheelColor: '#25211d',
    caliperColor: '#ff4d3a',
    bodyKit: 0,
    smokeColor: null,
  };
}

/**
 * Renderiza un auto y devuelve un data URL PNG. Usa el renderer principal con
 * un render target para no abrir un segundo contexto WebGL.
 */
export function renderCarPreview(
  renderer: THREE.WebGLRenderer,
  carId: string,
  paint?: string,
): string {
  const key = `${carId}|${paint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const def = getCar(carId);
  const scene = studioScene();
  const view = new CarView(def.body, cosmeticsFor(paint ?? def.defaultPaint));
  scene.add(view.group);

  // Encuadre 3/4 apretado: el auto tiene que llenar la ficha.
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 60);
  const reach = Math.max(def.body.length, def.body.width) * 1.2;
  camera.position.set(reach * 1.0, reach * 0.52, reach * 1.05);
  camera.lookAt(0, def.body.height * 0.3, 0);

  const target = new THREE.WebGLRenderTarget(W, H, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);

  const pixels = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);

  // WebGL entrega las filas al revés respecto del canvas 2D
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4;
    img.data.set(pixels.subarray(src, src + W * 4), y * W * 4);
  }
  ctx.putImageData(img, 0, 0);

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);

  target.dispose();
  scene.clear();
  return url;
}

/** Genera todas las fotos de una. Se llama una sola vez al abrir el garage. */
export function warmCarPreviews(renderer: THREE.WebGLRenderer): void {
  for (const def of CARS) renderCarPreview(renderer, def.id);
}

export function previewFor(carId: string, paint?: string): string | null {
  return cache.get(`${carId}|${paint ?? ''}`) ?? cache.get(`${carId}|`) ?? null;
}
