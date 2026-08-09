import * as THREE from 'three';

const VS = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVel;
attribute float aBirth;
attribute float aSeed;
attribute vec3 aColor;

uniform float uTime;
uniform float uLife;
uniform float uSizeStart;
uniform float uSizeEnd;
uniform float uGravity;
uniform float uDrag;
uniform float uProj;
uniform float uNearFade;

varying float vAlpha;
varying vec3 vColor;
varying float vRot;

void main() {
  float age = uTime - aBirth;
  float t = age / uLife;
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(0.0, 0.0, -10.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    vColor = vec3(0.0);
    vRot = 0.0;
    return;
  }

  // Integración analítica con drag exponencial
  float k = uDrag;
  float f = (1.0 - exp(-k * age)) / k;
  vec3 pos = aStart + aVel * f;
  pos.y += uGravity * age * age * 0.5;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = mix(uSizeStart, uSizeEnd, t) * (0.75 + aSeed * 0.5);
  gl_PointSize = max(1.0, size * uProj / max(0.001, -mv.z));

  // En tercera persona la cámara va 6 m detrás del auto y el humo sale justo
  // ahí: sin este fade, una partícula tapa la pantalla entera.
  float depth = -mv.z;
  vAlpha = (1.0 - t * t) * smoothstep(0.6, uNearFade, depth);
  vColor = aColor;
  vRot = aSeed * 6.283 + age * (aSeed - 0.5) * 2.0;
}
`;

const FS = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot);
  float s = sin(vRot);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  vec4 tex = texture2D(uMap, uv);
  gl_FragColor = vec4(vColor, tex.a * vAlpha * uOpacity);
  if (gl_FragColor.a < 0.01) discard;
}
`;

export interface ParticleOptions {
  count: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  gravity: number;
  drag: number;
  opacity: number;
  additive: boolean;
  map: THREE.Texture;
}

/** Sistema de partículas por GPU: la CPU solo escribe el slot nuevo. */
export class Particles {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private cursor = 0;
  private count: number;
  private aStart: THREE.BufferAttribute;
  private aVel: THREE.BufferAttribute;
  private aBirth: THREE.BufferAttribute;
  private aSeed: THREE.BufferAttribute;
  private aColor: THREE.BufferAttribute;
  private time = 0;
  private dirtyFrom = Infinity;
  private dirtyTo = -1;

  constructor(opts: ParticleOptions) {
    this.count = opts.count;
    this.geo = new THREE.BufferGeometry();

    const n = opts.count;
    this.aStart = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aBirth = new THREE.BufferAttribute(new Float32Array(n).fill(-1e6), 1);
    this.aSeed = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.aColor = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
    for (let i = 0; i < n; i++) this.aSeed.setX(i, Math.random());

    this.geo.setAttribute('position', this.aStart);
    this.geo.setAttribute('aStart', this.aStart);
    this.geo.setAttribute('aVel', this.aVel);
    this.geo.setAttribute('aBirth', this.aBirth);
    this.geo.setAttribute('aSeed', this.aSeed);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: opts.life },
        uSizeStart: { value: opts.sizeStart },
        uSizeEnd: { value: opts.sizeEnd },
        uGravity: { value: opts.gravity },
        uDrag: { value: opts.drag },
        uProj: { value: 800 },
        uNearFade: { value: 9.0 },
        uMap: { value: opts.map },
        uOpacity: { value: opts.opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r = 1, g = 1, b = 1,
  ): void {
    const i = this.cursor;
    this.aStart.setXYZ(i, x, y, z);
    this.aVel.setXYZ(i, vx, vy, vz);
    this.aBirth.setX(i, this.time);
    this.aSeed.setX(i, Math.random());
    this.aColor.setXYZ(i, r, g, b);
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
    this.cursor = (this.cursor + 1) % this.count;
  }

  update(dt: number, projScale: number): void {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uProj.value = projScale;
    if (this.dirtyTo >= 0) {
      for (const attr of [this.aStart, this.aVel, this.aBirth, this.aSeed, this.aColor]) {
        attr.needsUpdate = true;
      }
      this.dirtyFrom = Infinity;
      this.dirtyTo = -1;
    }
  }

  setOpacity(v: number): void {
    this.mat.uniforms.uOpacity.value = v;
  }

  setNearFade(v: number): void {
    this.mat.uniforms.uNearFade.value = v;
  }

  clear(): void {
    this.aBirth.array.fill(-1e6);
    this.aBirth.needsUpdate = true;
  }
}
