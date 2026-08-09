import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { Surface, type MapDefinition, type Obstacle } from '../sim/World';
import {
  asphaltTexture, concreteTexture, dirtTexture, facadeTexture, grassTexture,
  radialTexture, ribbedTexture, stripeTexture,
} from './Textures';

const COL = {
  // Separación por TONO, no solo por brillo: la calle es gris frío y todo lo
  // que la rodea es tierra cálida. Así el asfalto se lee aunque el sol rasante
  // deje media cuadra en sombra.
  asphalt: 0x93989f,
  wet: 0x8b939c,
  concrete: 0xb4aca0,
  buildings: [0xa89880, 0x9c6b52, 0x8a8f92, 0xb5a48c, 0x7d6a58, 0xc0a882],
  roof: 0x8d8579,
  container: [0x3f8896, 0xc0553a, 0xd8a13a, 0x4f9159, 0x8f5aa0],
  parked: [0xb0503c, 0x4a6f9a, 0x8a857e, 0xc9c2b4, 0x3f7a68, 0xc9a33a],
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

/**
 * Escala las UV de un material instanciado según el tamaño real de cada
 * instancia. Sin esto, una fachada de 40 m y una de 12 m muestran la misma
 * cantidad de ventanas y las ventanas quedan de tamaños distintos.
 */
function instanceScaledUv(material: THREE.Material, metersPerTile: number): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #if defined( USE_MAP ) && defined( USE_INSTANCING )
        vec3 iScale = vec3(
          length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz),
          length(instanceMatrix[2].xyz));
        vMapUv = uv * vec2(max(iScale.x, iScale.z), iScale.y) / ${metersPerTile.toFixed(1)};
      #endif`,
    );
  };
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

  /** Libera todo: se llama al cambiar de mapa. */
  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.group.clear();
    this.destructibleMeshes.clear();
    this.destructibleIndex.clear();
  }

  // ─────────────────────────── suelo y zonas ───────────────────────────

  private terrainTexture(def: MapDefinition): THREE.Texture {
    if (def.terrain === 'grass') return grassTexture();
    if (def.terrain === 'dirt') return dirtTexture();
    return concreteTexture();
  }

  private buildGround(def: MapDefinition): void {
    const tex = this.terrainTexture(def).clone();
    tex.needsUpdate = true;
    tex.repeat.set((def.half * 2 + 200) / 12, (def.half * 2 + 200) / 12);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(def.half * 2 + 200, def.half * 2 + 200),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Parches de zona, uno por material
    const groups: Record<string, { s: QuadSink; tex: THREE.Texture }> = {};
    const c = new THREE.Color(0xffffff);
    let layer = 0;
    for (const zone of def.zones) {
      let key: string | null = null;
      if (zone.name === 'Plaza') key = 'grass';
      else if (zone.name === 'Obra') key = 'dirt';
      else if (zone.name === 'Puerto') key = 'concrete';
      if (!key) continue;
      const g = (groups[key] ??= {
        s: sink(),
        tex: key === 'grass' ? grassTexture() : key === 'dirt' ? dirtTexture() : concreteTexture(),
      });
      layer++;
      pushQuad(
        g.s,
        zone.x - zone.hw, zone.z - zone.hd,
        zone.x + zone.hw, zone.z - zone.hd,
        zone.x + zone.hw, zone.z + zone.hd,
        zone.x - zone.hw, zone.z + zone.hd,
        0.005 + layer * 0.001, c, (zone.hw * 2) / 12, (zone.hd * 2) / 12,
      );
    }
    for (const g of Object.values(groups)) {
      const mesh = new THREE.Mesh(
        buildGeometry(g.s),
        new THREE.MeshLambertMaterial({ vertexColors: true, map: g.tex }),
      );
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // ─────────────────────────── calles ───────────────────────────

  private buildRoads(def: MapDefinition): void {
    // Los segmentos se extienden y se pisan entre sí para cerrar las juntas, y
    // cada uno va a una altura distinta para no hacer z-fighting. Por eso las
    // líneas tienen que ir por ENCIMA de todos: si no, el segmento siguiente
    // tapa las marcas del anterior.
    const topY = 0.02 + def.roads.length * 0.0007;
    // Los cordones son de circuito; en ciudad ya están las veredas.
    const wantKerbs = def.lanes.length === 0;
    const s = sink();
    const dashes = sink();
    const kerbs = sink();
    const c = new THREE.Color();
    const white = new THREE.Color(0xf4ecdc);
    const kerbColor = new THREE.Color(0xd8cdb8);

    def.roads.forEach((r, i) => {
      const dx = r.bx - r.ax;
      const dz = r.bz - r.az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) return;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz * r.width * 0.5;
      const pz = ux * r.width * 0.5;
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
      const y = 0.02 + i * 0.0007;
      pushQuad(
        s,
        ax + px, az + pz, bx + px, bz + pz,
        bx - px, bz - pz, ax - px, az - pz,
        y, c, r.width / 4, (len + r.width) / 4,
      );

      // Cordón claro al borde: marca dónde termina la pista
      if (wantKerbs) for (const side of [1, -1]) {
        const ox = px * side;
        const oz = pz * side;
        const kx = (-uz * 0.55) * side;
        const kz = (ux * 0.55) * side;
        pushQuad(
          kerbs,
          ax + ox, az + oz, bx + ox, bz + oz,
          bx + ox + kx, bz + oz + kz, ax + ox + kx, az + oz + kz,
          topY + 0.01, kerbColor, 1, len / 4,
        );
      }

      // Línea central discontinua
      if (r.width >= 13 && len > 9) {
        for (let d = 2; d < len - 2; d += 9) {
          const t0 = d / len;
          const t1 = Math.min(1, (d + 4.5) / len);
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
            topY + 0.02, white, 1, 1,
          );
        }
      }
    });

    const roadMesh = new THREE.Mesh(
      buildGeometry(s),
      new THREE.MeshLambertMaterial({ vertexColors: true, map: asphaltTexture() }),
    );
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    this.group.add(new THREE.Mesh(
      buildGeometry(kerbs),
      new THREE.MeshLambertMaterial({ vertexColors: true, map: concreteTexture() }),
    ));

    this.group.add(new THREE.Mesh(
      buildGeometry(dashes),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }),
    ));
  }

  // ─────────────────────────── edificios ───────────────────────────

  private buildBuildings(def: MapDefinition, rng: Rng): void {
    const buildings = def.obstacles.filter((o) => o.kind === 'building');
    if (buildings.length === 0) return;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const facadeMat = new THREE.MeshLambertMaterial({ map: facadeTexture() });
    instanceScaledUv(facadeMat, 14);

    const bodies = new THREE.InstancedMesh(box, facadeMat, buildings.length);
    bodies.castShadow = true;
    bodies.receiveShadow = true;

    const roofs = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({ map: concreteTexture() }),
      buildings.length,
    );
    roofs.receiveShadow = true;

    const unitCount = Math.max(1, Math.floor(buildings.length * 0.8));
    const units = new THREE.InstancedMesh(
      box,
      new THREE.MeshLambertMaterial({ color: 0x8a8074, map: concreteTexture() }),
      unitCount,
    );
    units.castShadow = true;

    const color = new THREE.Color();
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

      this.dummy.position.set(b.x, h + 0.1, b.z);
      this.dummy.scale.set(b.hw * 2 + 0.6, 0.4, b.hd * 2 + 0.6);
      this.dummy.updateMatrix();
      roofs.setMatrixAt(i, this.dummy.matrix);
      color.setHex(COL.roof);
      color.offsetHSL(0, 0, (b.colorSeed - 0.5) * 0.1);
      roofs.setColorAt(i, color);

      if (ui < unitCount && rng.chance(0.7)) {
        const sw = Math.min(b.hw, b.hd) * rng.range(0.25, 0.5);
        this.dummy.position.set(
          b.x + rng.range(-b.hw * 0.4, b.hw * 0.4),
          h + rng.range(1.2, 2.6),
          b.z + rng.range(-b.hd * 0.4, b.hd * 0.4),
        );
        this.dummy.rotation.set(0, rng.next() * Math.PI, 0);
        this.dummy.scale.set(sw, rng.range(1.5, 3.5), sw);
        this.dummy.updateMatrix();
        units.setMatrixAt(ui, this.dummy.matrix);
        ui++;
      }
    });

    units.count = ui;
    this.dummy.rotation.set(0, 0, 0);
    this.group.add(bodies, roofs, units);
  }

  // ─────────────────────────── props ───────────────────────────

  private buildProps(def: MapDefinition, rng: Rng): void {
    const groups: Record<string, Obstacle[]> = {};
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
    ): void => {
      const list = groups[kind];
      if (!list || list.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = kind !== 'wall';
      mesh.receiveShadow = true;
      const c = new THREE.Color();
      list.forEach((o, i) => {
        this.dummy.position.set(o.x, o.height * 0.5, o.z);
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

    const containerMat = new THREE.MeshLambertMaterial({ map: ribbedTexture() });
    instanceScaledUv(containerMat, 6);
    add('container', box, containerMat, (s) =>
      COL.container[Math.floor(s * COL.container.length) % COL.container.length]);

    const barrierMat = new THREE.MeshLambertMaterial({ map: stripeTexture() });
    instanceScaledUv(barrierMat, 3);
    add('barrier', box, barrierMat, () => 0xffffff);

    add('planter', box, new THREE.MeshLambertMaterial({ map: concreteTexture() }), () => 0x9a8f7d);
    add('wall', box, new THREE.MeshLambertMaterial({ map: concreteTexture() }), () => 0x8a8074);
    add(
      'pole',
      new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a4640, metalness: 0.6, roughness: 0.6 }),
      () => 0x4a4640,
    );

    // Autos estacionados
    const parked = groups['parked'];
    if (parked && parked.length > 0) {
      const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.45 }),
        parked.length,
      );
      const cabins = new THREE.InstancedMesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color: 0x1c1a18, metalness: 0.6, roughness: 0.2 }),
        parked.length,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const c = new THREE.Color();
      parked.forEach((o, i) => {
        this.dummy.position.set(o.x, o.height * 0.5, o.z);
        this.dummy.rotation.set(0, -o.rot, 0);
        this.dummy.scale.set(o.hw * 2, o.height, o.hd * 2);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        c.setHex(COL.parked[Math.floor(o.colorSeed * COL.parked.length) % COL.parked.length]);
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
        geo: new THREE.ConeGeometry(0.32, 0.78, 8),
        mat: new THREE.MeshLambertMaterial({ color: 0xff6a2a }),
        y: 0.39,
      },
      bin: {
        geo: new THREE.CylinderGeometry(0.42, 0.36, 1.05, 10),
        mat: new THREE.MeshLambertMaterial({ color: 0x3f5a45 }),
        y: 0.52,
      },
      sign: {
        geo: new THREE.BoxGeometry(0.18, 1.5, 1.1),
        mat: new THREE.MeshLambertMaterial({ color: 0xd8b45a, emissive: 0x3a2a10 }),
        y: 2.4,
      },
      hydrant: {
        geo: new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8),
        mat: new THREE.MeshLambertMaterial({ color: 0xd2453a }),
        y: 0.4,
      },
    };

    for (const [kind, indices] of Object.entries(byKind)) {
      const s = specs[kind] ?? specs.cone;
      const mesh = new THREE.InstancedMesh(s.geo, s.mat, indices.length);
      mesh.castShadow = true;
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
      const y = entry.kind === 'sign' ? 2.4 : entry.kind === 'bin' ? 0.52 : 0.39;
      this.dummy.position.set(d.x, y, d.z);
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
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      def.lights.length,
    );
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
