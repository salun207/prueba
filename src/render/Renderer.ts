import * as THREE from 'three';
import { PostFX } from './PostFX';
import { CameraRig } from './CameraRig';
import { DUSK, Sky } from './Sky';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  smoke: number;
  marks: number;
  shadows: boolean;
  shadowSize: number;
  shadowRange: number;
  bloom: boolean;
  grain: number;
  aberration: number;
  maxDpr: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { smoke: 500, marks: 900, shadows: false, shadowSize: 0, shadowRange: 0, bloom: false, grain: 0, aberration: 0, maxDpr: 1 },
  medium: { smoke: 1100, marks: 2200, shadows: true, shadowSize: 1024, shadowRange: 45, bloom: true, grain: 0, aberration: 0, maxDpr: 1.25 },
  high: { smoke: 2200, marks: 4096, shadows: true, shadowSize: 2048, shadowRange: 70, bloom: true, grain: 0.016, aberration: 0.02, maxDpr: 1.75 },
  ultra: { smoke: 4096, marks: 8192, shadows: true, shadowSize: 2048, shadowRange: 95, bloom: true, grain: 0.016, aberration: 0.026, maxDpr: 2 },
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly post: PostFX;
  readonly sky: Sky;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private canvas: HTMLCanvasElement;
  quality: Quality = 'high';
  private frameTimes: number[] = [];
  private autoQualityCooldown = 6;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x2e2a5c, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.sky = new Sky(DUSK);
    this.scene.add(this.sky.mesh);

    // La niebla toma el color del horizonte: lo lejano se funde con el cielo.
    this.scene.fog = new THREE.FogExp2(0xff8a3d, 0.0022);

    // Atardecer: el rebote del cielo es cálido y fuerte, así que la sombra
    // nunca es negra y todo se sigue leyendo aunque el sol esté rasante.
    this.hemi = new THREE.HemisphereLight(0xffd0a8, 0x8a7460, 3.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffcb8a, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.06;
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 400;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Mapa de entorno sacado del propio cielo: los autos reflejan el atardecer
    // en vez de verse planos. Se calcula una sola vez.
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const skyScene = new THREE.Scene();
      const skyCopy = this.sky.mesh.clone();
      skyCopy.scale.setScalar(400);
      skyScene.add(skyCopy);
      this.scene.environment = pmrem.fromScene(skyScene, 0, 1, 900).texture;
      this.scene.environmentIntensity = 0.9;
      pmrem.dispose();
    } catch {
      // Sin env map el juego sigue andando, solo con autos más mate.
    }

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    this.rig = new CameraRig(w / h);
    this.post = new PostFX(this.renderer, 1, 1);
    this.setQuality('high');
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const p = QUALITY[q];
    this.renderer.shadowMap.enabled = p.shadows;
    this.sun.castShadow = p.shadows;
    if (p.shadows) {
      this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      const cam = this.sun.shadow.camera;
      cam.left = -p.shadowRange;
      cam.right = p.shadowRange;
      cam.top = p.shadowRange;
      cam.bottom = -p.shadowRange;
      cam.updateProjectionMatrix();
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.post.settings.bloom = p.bloom;
    this.post.settings.grain = p.grain;
    this.post.settings.aberration = p.aberration;
    this.resize();
  }

  resize(): void {
    const p = QUALITY[this.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, p.maxDpr);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
    this.post.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
  }

  private autoQuality(dt: number): void {
    this.autoQualityCooldown -= dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 180) this.frameTimes.shift();
    if (this.autoQualityCooldown > 0 || this.frameTimes.length < 150) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const order: Quality[] = ['low', 'medium', 'high', 'ultra'];
    const idx = order.indexOf(this.quality);
    if (1 / avg < 50 && idx > 0) {
      this.setQuality(order[idx - 1]);
      this.autoQualityCooldown = 14;
      this.frameTimes.length = 0;
    }
  }

  render(time: number, dt: number, focusX: number, focusZ: number, speed: number): void {
    this.autoQuality(dt);

    // El sol acompaña al auto para que el shadow map siempre lo cubra.
    const d = this.sky.sunDirection;
    this.sun.target.position.set(focusX, 0, focusZ);
    this.sun.position.set(focusX + d.x * 150, d.y * 150 + 30, focusZ + d.z * 150);

    this.sky.follow(this.rig.camera);

    this.renderer.setRenderTarget(this.post.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    this.post.render(time, Math.min(1.6, speed / 45));
  }
}
