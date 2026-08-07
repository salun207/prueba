import * as THREE from 'three';

/**
 * Marcas de goma: una tira de quads por rueda trasera, en un solo draw call.
 * Buffer circular — al llenarse se sobrescriben las más viejas.
 */
export class TireMarks {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private alphas: Float32Array;
  private geo: THREE.BufferGeometry;
  private maxQuads: number;
  private cursor = 0;
  private last: { x: number; z: number; hasPrev: boolean; px: number[]; pz: number[] }[] = [];
  private width = 0.22;

  constructor(maxQuads = 4096) {
    this.maxQuads = maxQuads;
    this.positions = new Float32Array(maxQuads * 4 * 3);
    this.alphas = new Float32Array(maxQuads * 4);

    const indices = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const b = q * 4;
      indices.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha * 0.55);
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;

    for (let i = 0; i < 2; i++) {
      this.last.push({ x: 0, z: 0, hasPrev: false, px: [0, 0], pz: [0, 0] });
    }
  }

  /** `wheel` 0 = izquierda, 1 = derecha. */
  addPoint(wheel: number, x: number, z: number, dirX: number, dirZ: number, intensity: number): void {
    const s = this.last[wheel];
    const dx = x - s.x;
    const dz = z - s.z;
    if (s.hasPrev && dx * dx + dz * dz < 0.12 * 0.12) return;

    const nx = -dirZ * this.width;
    const nz = dirX * this.width;
    const ax = x + nx;
    const az = z + nz;
    const bx = x - nx;
    const bz = z - nz;

    if (s.hasPrev) {
      const q = this.cursor;
      const o = q * 12;
      const p = this.positions;
      const y = 0.045;
      p[o] = s.px[0]; p[o + 1] = y; p[o + 2] = s.pz[0];
      p[o + 3] = s.px[1]; p[o + 4] = y; p[o + 5] = s.pz[1];
      p[o + 6] = bx; p[o + 7] = y; p[o + 8] = bz;
      p[o + 9] = ax; p[o + 10] = y; p[o + 11] = az;

      const a = Math.min(1, intensity);
      const ao = q * 4;
      this.alphas[ao] = a;
      this.alphas[ao + 1] = a;
      this.alphas[ao + 2] = a;
      this.alphas[ao + 3] = a;

      this.cursor = (this.cursor + 1) % this.maxQuads;
      // Desvanece los siguientes para que el borde del buffer no se corte seco
      const fade = this.cursor * 4;
      for (let i = 0; i < 4; i++) this.alphas[fade + i] *= 0.5;

      this.geo.attributes.position.needsUpdate = true;
      (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    }

    s.px[0] = ax; s.pz[0] = az;
    s.px[1] = bx; s.pz[1] = bz;
    s.x = x;
    s.z = z;
    s.hasPrev = true;
  }

  breakStrip(wheel: number): void {
    this.last[wheel].hasPrev = false;
  }

  clear(): void {
    this.alphas.fill(0);
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    this.cursor = 0;
    for (const s of this.last) s.hasPrev = false;
  }
}
