import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { Surface, type MapDefinition } from '../sim/World';
import { asphaltTexture, radialTexture } from './Textures';

const COL = {
  // Separación por TONO, no solo por brillo: la calle es gris frío y todo lo
  // que la rodea es tierra cálida. Así el asfalto se lee aunque el sol rasante
  // deje media cuadra en sombra.
  ground: 0xb3a084,
  asphalt: 0x8b8d90,
  wet: 0x7f8894,
  concrete: 0xa8a49c,
  dirt: 0xa87a45,
  grass: 0x7f8a4e,
  water: 0xd4783f,
  curb: 0xc9bda6,
  buildings: [0xa89880, 0x9c6b52, 0x8a8f92, 0xb5a48c, 0x7d6a58, 0xc0a882],
  roof: 0x6f6558,
  container: [0x2f6f7a, 0xa8452f, 0xc08a2a, 0x3f7a4a, 0x7a4a8a],
  // Ventanas encendidas al atardecer, no neón: el sol todavía está.
  neon: [0xffd98a, 0xffb35c, 0xffe9c0, 0x9fd8ff],
};

interface QuadSink {
  pos: number[];
  norm: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

function sink(): QuadSink {
  return { pos: [], norm: [], uv: [], col: [], idx: [] };
}

function pushQuad(
  s: QuadSink,
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
  y: number, color: THREE.Color, uScale: number, vScale: number,
): void {
  const base = s.pos.length / 3;
  const pts = [ax, az, bx, bz, cx, cz, dx, dz];
  const uvs = [0, 0, uScale, 0, uScale, vScale, 0, vScale];
  for (let i = 0; i < 4; i++) {
    s.pos.push(pts[i * 2], y, pts[i * 2 + 1]);
    s.norm.push(0, 1, 0);
    s.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
    s.col.push(color.r, color.g, color.b);
  }
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function buildGeometry(s: QuadSink): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  g.computeBoundingSphere();
  return g;
}

export class WorldView {
  readonly group = new THREE.Group();
  private destructibleMeshes = new Map<string, { mesh: THREE.InstancedMesh; slots: number[] }>();
  private destructibleIndex = new Map<number, { kind: string; slot: number }>();
  private dummy = new THREE.Object3D();

  constructor(def: MapDefinition) {
    const rng = new Rng(4242);

    this.buildGround(def);
    this.buildRoads(def);
    this.buildBuildings(def, rng);
    this.buildProps(def, rng);
    this.buildDestructibles(def);
    this.buildLightPools(def);
  }

  // ─────────────────────────── suelo y zonas ───────────────────────────

  private buildGround(def: MapDefinition): void {
    const tex = asphaltTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(60, 60);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(def.half * 2 + 200, def.half * 2 + 200),
      new THREE.MeshLambertMaterial({ color: COL.ground, map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Agua alrededor del mapa
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshBasicMaterial({ color: COL.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1.5;
    this.group.add(water);

    // Parches de zona
    const s = sink();
    const c = new THREE.Color();
    let layer = 0;
    for (const zone of def.zones) {
      let color: number | null = null;
      if (zone.name === 'Plaza') color = COL.grass;
      else if (zone.name === 'Obra') color = COL.dirt;
      else if (zone.name === 'Puerto') color = COL.concrete;
      if (color === null) continue;
      c.setHex(color);
      layer++;
      pushQuad(
        s,
        zone.x - zone.hw, zone.z - zone.hd,
        zone.x + zone.hw, zone.z - zone.hd,
        zone.x + zone.hw, zone.z + zone.hd,
        zone.x - zone.hw, zone.z + zone.hd,
        0.005 + layer * 0.001, c, zone.hw / 6, zone.hd / 6,
      );
    }
    if (s.pos.length > 0) {
      const mesh = new THREE.Mesh(
        buildGeometry(s),
        new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
      );
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // ─────────────────────────── calles ───────────────────────────

  private buildRoads(def: MapDefinition): void {
    const s = sink();
    const dashes = sink();
    const c = new THREE.Color();
    const white = new THREE.Color(0xf0e6d2);

    def.roads.forEach((r, i) => {
      const dx = r.bx - r.ax;
      const dz = r.bz - r.az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) return;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz * r.width * 0.5;
      const pz = ux * r.width * 0.5;
      // Se extienden medio ancho a cada punta para cerrar las intersecciones.
      const ex = ux * r.width * 0.5;
      const ez = uz * r.width * 0.5;
      const ax = r.ax - ex;
      const az = r.az - ez;
      const bx = r.bx + ex;
      const bz = r.bz + ez;

      c.setHex(
        r.surface === Surface.WetAsphalt ? COL.wet
        : r.surface === Surface.Concrete ? COL.concrete
        : COL.asphalt,
      );
      // Cada segmento a una altura levemente distinta: evita z-fighting en los cruces.
      const y = 0.02 + i * 0.0008;
      pushQuad(
        s,
        ax + px, az + pz, bx + px, bz + pz,
        bx - px, bz - pz, ax - px, az - pz,
        y, c, 1, (len + r.width) / 8,
      );

      // Línea central discontinua
      if (r.width >= 14 && len > 40) {
        const step = 9;
        for (let d = 6; d < len - 6; d += step) {
          const t0 = d / len;
          const t1 = Math.min(1, (d + 3.5) / len);
          const hx = -uz * 0.16;
          const hz = ux * 0.16;
          const p0x = r.ax + dx * t0;
          const p0z = r.az + dz * t0;
          const p1x = r.ax + dx * t1;
          const p1z = r.az + dz * t1;
          pushQuad(
            dashes,
            p0x + hx, p0z + hz, p1x + hx, p1z + hz,
            p1x - hx, p1z - hz, p0x - hx, p0z - hz,
            y + 0.004, white, 1, 1,
          );
        }
      }
    });

    const tex = asphaltTexture();
    const roadMesh = new THREE.Mesh(
      buildGeometry(s),
      new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
    );
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    const dashMesh = new THREE.Mesh(
      buildGeometry(dashes),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 }),
    );
    this.group.add(dashMesh);
  }

  // ─────────────────────────── edificios ───────────────────────────

  private buildBuildings(def: MapDefinition, rng: Rng): void {
    const buildings = def.obstacles.filter((o) => o.kind === 'building');
    if (buildings.length === 0) return;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const bodies = new THREE.InstancedMesh(box, bodyMat, buildings.length);
    bodies.castShadow = true;
    bodies.receiveShadow = true;

    const roofs = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      buildings.length,
    );

    const neonCount = Math.max(1, Math.floor(buildings.length * 0.4));
    const neons = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      neonCount,
    );

    const unitCount = Math.max(1, Math.floor(buildings.length * 0.8));
    const units = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({ color: 0x2a3040 }),
      unitCount,
    );

    const color = new THREE.Color();
    let ni = 0;
    let ui = 0;

    buildings.forEach((b, i) => {
      const h = b.height;
      this.dummy.position.set(b.x, h / 2, b.z);
      this.dummy.rotation.set(0, -b.rot, 0);
      this.dummy.scale.set(b.hw * 2, h, b.hd * 2);
      this.dummy.updateMatrix();
      bodies.setMatrixAt(i, this.dummy.matrix);
      color.setHex(COL.buildings[Math.floor(b.colorSeed * COL.buildings.length) % COL.buildings.length]);
      color.offsetHSL(0, 0, (b.colorSeed - 0.5) * 0.06);
      bodies.setColorAt(i, color);

      // Losa de techo: es lo que más se ve desde arriba
      this.dummy.position.set(b.x, h + 0.06, b.z);
      this.dummy.scale.set(b.hw * 2 + 0.5, 0.35, b.hd * 2 + 0.5);
      this.dummy.updateMatrix();
      roofs.setMatrixAt(i, this.dummy.matrix);
      color.setHex(COL.roof);
      color.offsetHSL(0, 0, (b.colorSeed - 0.5) * 0.08);
      roofs.setColorAt(i, color);

      // Banda de neón en la fachada
      if (ni < neonCount && rng.chance(0.42)) {
        const bandY = h * rng.range(0.45, 0.9);
        this.dummy.position.set(b.x, bandY, b.z);
        this.dummy.scale.set(b.hw * 2 + 0.35, 0.5, b.hd * 2 + 0.35);
        this.dummy.updateMatrix();
        neons.setMatrixAt(ni, this.dummy.matrix);
        color.setHex(rng.pick(COL.neon));
        neons.setColorAt(ni, color);
        ni++;
      }

      // Equipamiento de techo
      if (ui < unitCount && rng.chance(0.7)) {
        const sw = Math.min(b.hw, b.hd) * rng.range(0.25, 0.5);
        this.dummy.position.set(
          b.x + rng.range(-b.hw * 0.4, b.hw * 0.4),
          h + rng.range(1, 2.4),
          b.z + rng.range(-b.hd * 0.4, b.hd * 0.4),
        );
        this.dummy.rotation.set(0, rng.next() * Math.PI, 0);
        this.dummy.scale.set(sw, rng.range(1.5, 3.5), sw);
        this.dummy.updateMatrix();
        units.setMatrixAt(ui, this.dummy.matrix);
        ui++;
      }
    });

    neons.count = ni;
    units.count = ui;
    this.dummy.rotation.set(0, 0, 0);
    this.group.add(bodies, roofs, neons, units);
  }

  // ─────────────────────────── props ───────────────────────────

  private buildProps(def: MapDefinition, rng: Rng): void {
    const groups: Record<string, typeof def.obstacles> = {};
    for (const o of def.obstacles) {
      if (o.kind === 'building') continue;
      (groups[o.kind] ??= []).push(o);
    }

    const box = new THREE.BoxGeometry(1, 1, 1);

    const add = (
      kind: string,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      colorFor: (seed: number) => number,
      yOffset = 0.5,
    ): void => {
      const list = groups[kind];
      if (!list || list.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = kind !== 'wall';
      mesh.receiveShadow = true;
      const c = new THREE.Color();
      list.forEach((o, i) => {
        this.dummy.position.set(o.x, o.height * yOffset, o.z);
        this.dummy.rotation.set(0, -o.rot, 0);
        this.dummy.scale.set(o.hw * 2, o.height, o.hd * 2);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        c.setHex(colorFor(o.colorSeed));
        mesh.setColorAt(i, c);
      });
      this.dummy.rotation.set(0, 0, 0);
      this.group.add(mesh);
    };

    add('container', box, new THREE.MeshLambertMaterial({ color: 0xffffff }), (s) =>
      COL.container[Math.floor(s * COL.container.length) % COL.container.length],
    );
    add('barrier', box, new THREE.MeshLambertMaterial({ color: 0xffffff }), (s) =>
      s > 0.5 ? 0xd9a441 : 0x9aa3b5,
    );
    add('planter', box, new THREE.MeshLambertMaterial({ color: 0xffffff }), () => 0x24303a);
    add('wall', box, new THREE.MeshLambertMaterial({ color: 0xffffff }), () => 0x1c2130);
    add(
      'pole',
      new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      () => 0x3a4150,
    );

    // Autos estacionados: dos cajas para que la silueta se lea desde arriba
    const parked = groups['parked'];
    if (parked && parked.length > 0) {
      const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(
        bodyGeo,
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        parked.length,
      );
      const cabins = new THREE.InstancedMesh(
        bodyGeo,
        new THREE.MeshLambertMaterial({ color: 0x0e1118 }),
        parked.length,
      );
      const c = new THREE.Color();
      const palette = [0xb0503c, 0x4a6f9a, 0x8a857e, 0xc9c2b4, 0x3f7a68, 0xc9a33a];
      parked.forEach((o, i) => {
        this.dummy.position.set(o.x, o.height * 0.5, o.z);
        this.dummy.rotation.set(0, -o.rot, 0);
        this.dummy.scale.set(o.hw * 2, o.height, o.hd * 2);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        c.setHex(palette[Math.floor(o.colorSeed * palette.length) % palette.length]);
        mesh.setColorAt(i, c);

        this.dummy.position.set(o.x, o.height * 1.05, o.z);
        this.dummy.scale.set(o.hw * 1.7, o.height * 0.5, o.hd * 1.05);
        this.dummy.updateMatrix();
        cabins.setMatrixAt(i, this.dummy.matrix);
      });
      this.dummy.rotation.set(0, 0, 0);
      this.group.add(mesh, cabins);
    }

    // Lámparas de los postes
    const poles = groups['pole'];
    if (poles && poles.length > 0) {
      const lamp = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }),
        poles.length,
      );
      poles.forEach((o, i) => {
        this.dummy.position.set(o.x, o.height - 0.4, o.z);
        this.dummy.scale.set(0.5, 0.28, 1.6);
        this.dummy.rotation.set(0, rng.next() * Math.PI, 0);
        this.dummy.updateMatrix();
        lamp.setMatrixAt(i, this.dummy.matrix);
      });
      this.dummy.rotation.set(0, 0, 0);
      this.group.add(lamp);
    }
  }

  // ─────────────────────────── destructibles ───────────────────────────

  private buildDestructibles(def: MapDefinition): void {
    const byKind: Record<string, number[]> = {};
    def.destructibles.forEach((d, i) => {
      (byKind[d.kind] ??= []).push(i);
    });

    const specs: Record<string, { geo: THREE.BufferGeometry; mat: THREE.Material; y: number }> = {
      cone: {
        geo: new THREE.ConeGeometry(0.32, 0.75, 6),
        mat: new THREE.MeshLambertMaterial({ color: 0xff6a2a }),
        y: 0.38,
      },
      bin: {
        geo: new THREE.CylinderGeometry(0.42, 0.36, 1.05, 8),
        mat: new THREE.MeshLambertMaterial({ color: 0x2f4a3a }),
        y: 0.52,
      },
      sign: {
        geo: new THREE.BoxGeometry(0.18, 1.5, 1.1),
        mat: new THREE.MeshLambertMaterial({ color: 0xd8b45a, emissive: 0x3a2a10 }),
        y: 2.4,
      },
      hydrant: {
        geo: new THREE.CylinderGeometry(0.22, 0.26, 0.8, 6),
        mat: new THREE.MeshLambertMaterial({ color: 0xff3b30 }),
        y: 0.4,
      },
    };

    for (const [kind, indices] of Object.entries(byKind)) {
      const s = specs[kind] ?? specs.cone;
      const mesh = new THREE.InstancedMesh(s.geo, s.mat, indices.length);
      indices.forEach((globalIndex, slot) => {
        const d = def.destructibles[globalIndex];
        this.dummy.position.set(d.x, s.y, d.z);
        this.dummy.rotation.set(0, (d.x + d.z) % Math.PI, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(slot, this.dummy.matrix);
        this.destructibleIndex.set(globalIndex, { kind, slot });
      });
      this.dummy.rotation.set(0, 0, 0);
      mesh.instanceMatrix.needsUpdate = true;
      this.destructibleMeshes.set(kind, { mesh, slots: indices });
      this.group.add(mesh);
    }
  }

  setDestructibleVisible(globalIndex: number, visible: boolean, def: MapDefinition): void {
    const entry = this.destructibleIndex.get(globalIndex);
    if (!entry) return;
    const group = this.destructibleMeshes.get(entry.kind);
    if (!group) return;
    const d = def.destructibles[globalIndex];
    if (visible) {
      const specY = entry.kind === 'sign' ? 3.2 : entry.kind === 'bin' ? 0.52 : 0.38;
      this.dummy.position.set(d.x, specY, d.z);
      this.dummy.rotation.set(0, (d.x + d.z) % Math.PI, 0);
      this.dummy.scale.set(1, 1, 1);
    } else {
      this.dummy.position.set(d.x, -50, d.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(0.001, 0.001, 0.001);
    }
    this.dummy.updateMatrix();
    group.mesh.setMatrixAt(entry.slot, this.dummy.matrix);
    group.mesh.instanceMatrix.needsUpdate = true;
    this.dummy.rotation.set(0, 0, 0);
  }

  // ─────────────────────────── charcos de luz ───────────────────────────

  private buildLightPools(def: MapDefinition): void {
    if (def.lights.length === 0) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: radialTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, def.lights.length);
    mesh.renderOrder = 2;
    const c = new THREE.Color();
    def.lights.forEach((l, i) => {
      this.dummy.position.set(l.x, 0.12, l.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      const s = 9 + ((l.x * 7 + l.z * 13) % 6);
      this.dummy.scale.set(s, s, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      c.setHex(l.color);
      c.multiplyScalar(0.16);
      mesh.setColorAt(i, c);
    });
    this.dummy.rotation.set(0, 0, 0);
    this.group.add(mesh);
  }
}
