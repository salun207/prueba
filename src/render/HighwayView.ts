import * as THREE from 'three';
import { Rng } from '../core/Rng';
import type { HighwayWorld, TrafficCar } from '../sim/Highway';
import { buildCarBody, mergeGeometries, type Silhouette } from './CarBody';
import { asphaltTexture, concreteTexture, dirtTexture, grassTexture, highwayTexture } from './Textures';

/**
 * Autopista infinita por cinta transportadora: la geometría cubre un tramo fijo
 * alrededor del jugador y se reescribe cuando este avanza. Nunca se construye
 * un mapa entero, así que el camino no tiene final.
 */

const STATIONS = 160;
const STEP = 10; // metros entre estaciones
const BACK = 220; // metros visibles hacia atrás
const TRAFFIC_CAP = 64; // instancias por tipo de carrocería

const TRAFFIC_COLORS = [
  0xd8d4cc, 0x2f3540, 0xb0503c, 0x3f6f9a, 0x8a857e,
  0xc9a33a, 0x3f7a68, 0x7a4a8a, 0xe0e0e0, 0x5a4438,
];

export class HighwayView {
  readonly group = new THREE.Group();
  private world: HighwayWorld;

  private road!: THREE.Mesh;
  private shoulder!: THREE.Mesh;
  private railL!: THREE.Mesh;
  private railR!: THREE.Mesh;
  private railPosts!: THREE.InstancedMesh;
  private ground!: THREE.Mesh;
  private scenery!: THREE.InstancedMesh;
  private posts!: THREE.InstancedMesh;

  private traffic: THREE.InstancedMesh[] = [];
  private trafficGlass: THREE.InstancedMesh[] = [];
  private trafficUnder: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private baseZ = -1e9;
  private rng = new Rng(9090);

  constructor(world: HighwayWorld) {
    this.world = world;
    this.buildStrips();
    this.buildScenery();
    this.buildTrafficMeshes();
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.group.clear();
  }

  // ─────────────────────────── cintas ───────────────────────────

  /**
   * Una tira de quads a lo largo del camino; se reposiciona en cada avance.
   *
   * La normal se escribe a mano y constante: sin atributo `normal` el material
   * PBR recibe (0,0,0) y la tira sale NEGRA, que es exactamente lo que pasaba.
   * Va con DoubleSide porque el orden de vértices de una cinta horizontal deja
   * la cara mirando hacia abajo según de qué lado se la mire.
   */
  private makeStrip(
    material: THREE.Material, uRepeat: number, normal: [number, number, number],
  ): THREE.Mesh {
    const verts = STATIONS * 2;
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let i = 0; i < STATIONS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    for (let i = 0; i < STATIONS; i++) {
      uv[i * 4] = 0;
      uv[i * 4 + 1] = i * uRepeat;
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = i * uRepeat;
      for (const v of [i * 2, i * 2 + 1]) {
        nor[v * 3] = normal[0];
        nor[v * 3 + 1] = normal[1];
        nor[v * 3 + 2] = normal[2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private buildStrips(): void {
    const w = this.world;

    // Suelo bien ancho, con textura de terreno
    const gtex = grassTexture().clone();
    gtex.needsUpdate = true;
    gtex.repeat.set(60, 60);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshLambertMaterial({ map: gtex }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.06;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    // Banquina de ripio, apenas más ancha que la calzada
    const dtex = dirtTexture().clone();
    dtex.needsUpdate = true;
    dtex.repeat.set(3, 1);
    this.shoulder = this.makeStrip(
      // El tinte gris saca el rojo del ripio: si no, la banquina compite con el
      // cielo del atardecer y el camino deja de leerse.
      new THREE.MeshLambertMaterial({ map: dtex, color: 0xa9a294, side: THREE.DoubleSide }),
      0.25,
      [0, 1, 0],
    );
    this.shoulder.position.y = 0.005;

    // Calzada: las líneas van pintadas EN la textura, así no hace falta
    // geometría aparte para cada raya.
    const lanes = w.cfg.lanes * (w.cfg.twoWay ? 2 : 1);
    this.road = this.makeStrip(
      new THREE.MeshStandardMaterial({
        map: highwayTexture(lanes, w.cfg.twoWay, w.cfg.laneWidth),
        roughness: 0.92,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
      0.25,
      [0, 1, 0],
    );
    this.road.position.y = 0.02;

    // Guardarraíles. Poco metálicos y con poco reflejo del entorno: con
    // metalness alto la chapa se comía el naranja del atardecer y quedaba una
    // pared rosa lisa al costado del camino.
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a8, metalness: 0.3, roughness: 0.55,
      envMapIntensity: 0.35, side: THREE.DoubleSide,
    });
    this.railL = this.makeStrip(railMat, 1, [1, 0.35, 0]);
    this.railR = this.makeStrip(railMat, 1, [-1, 0.35, 0]);
    this.railL.castShadow = true;
    this.railR.castShadow = true;

    // Postes del guardarraíl: le dan ritmo y profundidad a la cinta, que si no
    // se lee como una pared pintada.
    const postGeo = new THREE.BoxGeometry(0.1, 0.95, 0.14);
    postGeo.translate(0, 0.475, 0);
    this.railPosts = new THREE.InstancedMesh(
      postGeo,
      new THREE.MeshStandardMaterial({ color: 0x5d6169, metalness: 0.4, roughness: 0.6 }),
      STATIONS * 2,
    );
    this.railPosts.frustumCulled = false;
    this.railPosts.castShadow = true;
    this.group.add(this.railPosts);

    void asphaltTexture();
    void concreteTexture();
  }

  private buildScenery(): void {
    const count = 260;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.scenery = new THREE.InstancedMesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      count,
    );
    this.scenery.castShadow = true;
    this.scenery.frustumCulled = false;
    this.group.add(this.scenery);

    // Faroles: mástil + brazo curvo + luminaria, para que se lean como
    // alumbrado de autopista y no como palos clavados al costado.
    const mast = new THREE.CylinderGeometry(0.13, 0.19, 9, 6);
    mast.translate(0, 4.5, 0); // el cilindro nace centrado; lo apoyamos en el piso
    const arm = new THREE.BoxGeometry(0.14, 0.14, 2.2);
    arm.translate(0, 4.4, -1.0);
    const head = new THREE.BoxGeometry(0.5, 0.18, 1.0);
    head.translate(0, 4.3, -2.0);
    this.posts = new THREE.InstancedMesh(
      mergeGeometries([mast, arm, head]),
      new THREE.MeshStandardMaterial({ color: 0x585c62, metalness: 0.6, roughness: 0.5 }),
      STATIONS,
    );
    this.posts.frustumCulled = false;
    this.group.add(this.posts);
  }

  /**
   * Camión: cabina baja adelante y caja de carga atrás, armado con cajas.
   * El loft de siluetas está pensado para autos — estirado a 10 m sale una
   * gota deforme, así que el camión se construye aparte.
   */
  private buildTruck(len: number, wid: number, hei: number): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
    const half = len / 2;
    const cabLen = 3.0;
    const cargoLen = len - cabLen - 0.3;
    const cargoZ = -half + cargoLen / 2;
    const cabZ = half - cabLen / 2;

    const cargo = new THREE.BoxGeometry(wid, hei - 0.7, cargoLen);
    cargo.translate(0, 0.7 + (hei - 0.7) / 2, cargoZ);
    const cab = new THREE.BoxGeometry(wid * 0.96, 1.95, cabLen);
    cab.translate(0, 0.55 + 1.95 / 2, cabZ);
    const chassis = new THREE.BoxGeometry(wid * 0.8, 0.55, len * 0.94);
    chassis.translate(0, 0.4, 0);

    const glass = new THREE.BoxGeometry(wid * 0.82, 0.85, 0.08);
    glass.translate(0, 1.85, cabZ + cabLen / 2 - 0.02);

    return { body: mergeGeometries([cargo, cab, chassis]), glass };
  }

  private buildTrafficMeshes(): void {
    // Cuatro carrocerías: chico, sedán, utilitario y camión. Los índices
    // coinciden con `kind` en la sim (0–3), y el 3 es el camión.
    const shapes: [Silhouette, number, number, number][] = [
      ['hatch', 4.0, 1.8, 1.46],
      ['sedan', 4.8, 1.9, 1.44],
      ['van', 5.4, 2.0, 2.15],
      ['truck', 10.5, 2.5, 3.4],
    ];
    for (const [sil, len, wid, hei] of shapes) {
      const built = sil === 'truck'
        ? this.buildTruck(len, wid, hei)
        : buildCarBody(
          {
            silhouette: sil,
            length: len, width: wid, height: hei,
            cabinStart: 0.3, cabinEnd: 0.72, cabinHeight: 0.42,
            noseDrop: 0.1, wedge: 0.05, spoiler: 'none',
            wheelRadius: 0.34, wheelWidth: 0.24, fenderFlare: 0.02,
          },
          sil,
        );
      const mesh = new THREE.InstancedMesh(
        built.body,
        new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.4 }),
        TRAFFIC_CAP,
      );
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.traffic.push(mesh);
      this.group.add(mesh);

      const glass = new THREE.InstancedMesh(
        built.glass,
        new THREE.MeshStandardMaterial({
          color: 0x0c1014, metalness: 0.9, roughness: 0.1, side: THREE.DoubleSide,
        }),
        TRAFFIC_CAP,
      );
      glass.frustumCulled = false;
      glass.count = 0;
      this.trafficGlass.push(glass);
      this.group.add(glass);

      // Bajos: una caja oscura que hace de ruedas y sombra de contacto. A la
      // distancia a la que se ven estos autos alcanza y sobra.
      const under = new THREE.InstancedMesh(
        new THREE.BoxGeometry(wid * 0.94, 0.36, len * 0.78),
        new THREE.MeshLambertMaterial({ color: 0x14151a }),
        TRAFFIC_CAP,
      );
      under.frustumCulled = false;
      under.count = 0;
      this.trafficUnder.push(under);
      this.group.add(under);
    }
  }

  // ─────────────────────────── actualización ───────────────────────────

  update(playerZ: number, cars: readonly TrafficCar[]): void {
    const base = Math.floor((playerZ - BACK) / STEP) * STEP;
    if (base !== this.baseZ) {
      this.baseZ = base;
      this.rewriteStrips(base);
      this.rewriteScenery(base);
    }
    this.ground.position.set(this.world.centerX(playerZ), -0.06, playerZ);
    this.updateTraffic(cars);
  }

  private writeStrip(mesh: THREE.Mesh, base: number, halfFn: (z: number) => [number, number], y: number): void {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < STATIONS; i++) {
      const z = base + i * STEP;
      const cx = this.world.centerX(z);
      const [l, r] = halfFn(z);
      pos.setXYZ(i * 2, cx + l, y, z);
      pos.setXYZ(i * 2 + 1, cx + r, y, z);
    }
    pos.needsUpdate = true;
  }

  private rewriteStrips(base: number): void {
    const hw = this.world.halfWidth;
    const rail = this.world.railOffset;

    this.writeStrip(this.road, base, () => [-hw, hw], 0);
    this.writeStrip(this.shoulder, base, () => [-rail - 1.5, rail + 1.5], 0);

    // Los guardarraíles son cintas verticales: se escriben con dos alturas
    for (const [mesh, side] of [[this.railL, -1], [this.railR, 1]] as [THREE.Mesh, number][]) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < STATIONS; i++) {
        const z = base + i * STEP;
        const x = this.world.centerX(z) + rail * side;
        pos.setXYZ(i * 2, x, 0.45, z);
        pos.setXYZ(i * 2 + 1, x, 1.05, z);
      }
      pos.needsUpdate = true;
    }

    // Postes del guardarraíl, a los dos lados de cada estación
    for (let i = 0; i < STATIONS; i++) {
      const z = base + i * STEP;
      const cx = this.world.centerX(z);
      for (let s = 0; s < 2; s++) {
        this.dummy.position.set(cx + rail * (s === 0 ? -1 : 1), 0, z);
        this.dummy.rotation.set(0, this.world.heading(z), 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.railPosts.setMatrixAt(i * 2 + s, this.dummy.matrix);
      }
    }
    this.railPosts.instanceMatrix.needsUpdate = true;

    // Faroles
    for (let i = 0; i < STATIONS; i++) {
      const z = base + i * STEP;
      const side = i % 4 === 0 ? 1 : i % 4 === 2 ? -1 : 0;
      if (side === 0) {
        this.dummy.position.set(0, -500, 0);
        this.dummy.scale.set(0.001, 0.001, 0.001);
      } else {
        this.dummy.position.set(this.world.centerX(z) + (rail + 2.4) * side, 0, z);
        this.dummy.scale.set(1, 1, 1);
      }
      // El brazo del farol apunta al centro de la calzada.
      this.dummy.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      this.dummy.updateMatrix();
      this.posts.setMatrixAt(i, this.dummy.matrix);
    }
    this.posts.instanceMatrix.needsUpdate = true;
  }

  private rewriteScenery(base: number): void {
    const rng = new Rng(Math.abs(Math.floor(base / STEP)) + 1);
    const rail = this.world.railOffset;
    const n = this.scenery.count;
    for (let i = 0; i < n; i++) {
      const z = base + rng.range(0, STATIONS * STEP);
      const side = rng.chance(0.5) ? 1 : -1;
      const dist = rail + 8 + Math.pow(rng.next(), 1.6) * 190;
      const h = rng.range(3, 16);
      const w = rng.range(2, 7);
      this.dummy.position.set(this.world.centerX(z) + dist * side, h / 2, z);
      this.dummy.rotation.set(0, rng.next() * Math.PI, 0);
      this.dummy.scale.set(w, h, w * rng.range(0.7, 1.4));
      this.dummy.updateMatrix();
      this.scenery.setMatrixAt(i, this.dummy.matrix);
      this.color.setHSL(0.09 + rng.next() * 0.06, 0.22 + rng.next() * 0.2, 0.32 + rng.next() * 0.22);
      this.scenery.setColorAt(i, this.color);
    }
    this.scenery.instanceMatrix.needsUpdate = true;
    if (this.scenery.instanceColor) this.scenery.instanceColor.needsUpdate = true;
    void this.rng;
  }

  private updateTraffic(cars: readonly TrafficCar[]): void {
    const counts = [0, 0, 0, 0];
    for (const c of cars) {
      if (!c.active) continue;
      const k = Math.min(3, c.kind);
      const i = counts[k];
      if (i >= TRAFFIC_CAP) continue;
      counts[k] = i + 1;

      // Los autos siguen la curvatura del camino: con yaw fijo se ven cruzados
      // en cuanto la autopista dobla.
      const head = this.world.heading(c.z);
      this.dummy.position.set(c.x, 0, c.z);
      this.dummy.rotation.set(0, c.dir > 0 ? head : head + Math.PI, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.traffic[k].setMatrixAt(i, this.dummy.matrix);
      this.trafficGlass[k].setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = 0.2;
      this.dummy.updateMatrix();
      this.trafficUnder[k].setMatrixAt(i, this.dummy.matrix);
      this.color.setHex(TRAFFIC_COLORS[Math.floor(c.colorSeed * TRAFFIC_COLORS.length) % TRAFFIC_COLORS.length]);
      this.traffic[k].setColorAt(i, this.color);
    }
    for (let k = 0; k < 4; k++) {
      this.traffic[k].count = counts[k];
      this.trafficGlass[k].count = counts[k];
      this.trafficUnder[k].count = counts[k];
      this.traffic[k].instanceMatrix.needsUpdate = true;
      this.trafficGlass[k].instanceMatrix.needsUpdate = true;
      this.trafficUnder[k].instanceMatrix.needsUpdate = true;
      if (this.traffic[k].instanceColor) this.traffic[k].instanceColor!.needsUpdate = true;
    }
  }
}
