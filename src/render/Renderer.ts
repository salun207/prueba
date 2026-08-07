import * as THREE from 'three';
import { PostFX } from './PostFX';
import { CameraRig } from './CameraRig';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  smoke: number;
  marks: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  grain: number;
  aberration: number;
  maxDpr: number;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { smoke: 400, marks: 800, shadows: false, shadowSize: 0, bloom: false, grain: 0, aberration: 0, maxDpr: 1 },
  medium: { smoke: 900, marks: 2000, shadows: false, shadowSize: 0, bloom: true, grain: 0, aberration: 0, maxDpr: 1.25 },
  high: { smoke: 2048, marks: 4096, shadows: true, shadowSize: 1024, bloom: true, grain: 0.02, aberration: 0.022, maxDpr: 1.75 },
  ultra: { smoke: 4096, marks: 8192, shadows: true, shadowSize: 2048, bloom: true, grain: 0.02, aberration: 0.03, maxDpr: 2 },
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly post: PostFX;
  private sun: THREE.DirectionalLight;
  private canvas: HTMLCanvasElement;
  quality: Quality = 'high';
  private frameTimes: number[] = [];
  private autoQualityCooldown = 5;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x0b0d14, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.FogExp2(0x0b0d14, 0.0022);

    // Ojo: un color sRGB oscuro como 0x1a1d24 en lineal vale ~0.01. Para que la
    // noche se vea (y no sea negro puro) las luces van fuertes y frías.
    const hemi = new THREE.HemisphereLight(0x8b9ac9, 0x4a5266, 3.0);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xbcc9f0, 0.8);
    this.sun.position.set(-60, 90, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    // Solo el auto proyecta sombra real: el resto usa blobs. Si los edificios
    // proyectan, la caja del shadow map deja media pantalla a oscuras.
    cam.left = -12;
    cam.right = 12;
    cam.top = 12;
    cam.bottom = -12;
    cam.near = 10;
    cam.far = 220;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || window.innerWidth);
    const h = Math.max(1, rect.height || window.innerHeight);
    this.rig = new CameraRig(w / h);
    this.post = new PostFX(this.renderer, 1, 1);
    this.resize();
    this.setQuality('high');
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const p = QUALITY[q];
    this.renderer.shadowMap.enabled = p.shadows;
    this.sun.castShadow = p.shadows;
    if (p.shadows) this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
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

  /** Baja la calidad sola si el framerate no da. */
  private autoQuality(dt: number): void {
    this.autoQualityCooldown -= dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 180) this.frameTimes.shift();
    if (this.autoQualityCooldown > 0 || this.frameTimes.length < 150) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1 / avg;
    const order: Quality[] = ['low', 'medium', 'high', 'ultra'];
    const idx = order.indexOf(this.quality);
    if (fps < 50 && idx > 0) {
      this.setQuality(order[idx - 1]);
      this.autoQualityCooldown = 12;
      this.frameTimes.length = 0;
    }
  }

  render(time: number, dt: number, focusX: number, focusZ: number, speed: number): void {
    this.autoQuality(dt);

    // La sombra sigue al auto: un solo shadow map chico alcanza
    this.sun.target.position.set(focusX, 0, focusZ);
    this.sun.position.set(focusX - 60, 90, focusZ + 60);

    this.renderer.setRenderTarget(this.post.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    this.post.render(time, Math.min(1.6, speed / 40));
  }
}
