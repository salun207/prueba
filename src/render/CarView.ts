import * as THREE from 'three';
import type { BodyParams } from '../data/cars';
import type { CarCosmetics } from '../save/types';
import type { CarState } from '../sim/types';
import { radialTexture, shadowTexture } from './Textures';

const WHEEL_SEGMENTS = 14;

/**
 * Auto procedural. 300–800 tris, silueta clara y techo de color saturado: desde
 * arriba, la legibilidad importa más que el detalle.
 */
export class CarView {
  readonly group = new THREE.Group();
  private wheelPivots: THREE.Object3D[] = [];
  private wheelMeshes: THREE.Mesh[] = [];
  private brakeLights: THREE.Mesh[] = [];
  private headlightPool: THREE.Mesh;
  private shadow: THREE.Mesh;
  private paintMat: THREE.MeshStandardMaterial;
  private wheelMat: THREE.MeshStandardMaterial;
  private caliperMat: THREE.MeshStandardMaterial;
  private brakeMat: THREE.MeshBasicMaterial;
  private body: BodyParams;

  constructor(body: BodyParams, cosmetics: CarCosmetics) {
    this.body = body;
    this.paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.35 });
    this.wheelMat = new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.2, roughness: 0.8 });
    this.caliperMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, metalness: 0.4, roughness: 0.5 });
    this.brakeMat = new THREE.MeshBasicMaterial({ color: 0x3a0808, toneMapped: false });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e16,
      metalness: 0.6,
      roughness: 0.18,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14171f, metalness: 0.3, roughness: 0.6 });

    const L = body.length;
    const W = body.width;
    const wheelY = body.wheelRadius;
    const bodyH = 0.46;
    const bodyY = wheelY + 0.06;

    // Cuerpo principal
    const main = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L * 0.94), this.paintMat);
    main.position.y = bodyY + bodyH / 2;
    main.castShadow = true;
    this.group.add(main);

    // Trompa más baja (cuña)
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.94, bodyH * 0.55, L * 0.26),
      this.paintMat,
    );
    nose.position.set(0, bodyY + bodyH * 0.32 - body.noseDrop * 0.5, L * 0.37);
    nose.castShadow = true;
    this.group.add(nose);

    // Cabina (vidrios)
    const cabinLen = L * (body.cabinEnd - body.cabinStart);
    const cabinZ = L * (0.5 - (body.cabinStart + body.cabinEnd) / 2);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.86, body.cabinHeight, cabinLen),
      glassMat,
    );
    cabin.position.set(0, bodyY + bodyH + body.cabinHeight / 2 - 0.02, cabinZ);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Techo: el color más saturado de la pantalla, es lo que más se ve
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.78, 0.06, cabinLen * 0.72),
      this.paintMat,
    );
    roof.position.set(0, bodyY + bodyH + body.cabinHeight - 0.01, cabinZ - cabinLen * 0.05);
    this.group.add(roof);

    // Aletines
    if (body.fenderFlare > 0.01) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const flare = new THREE.Mesh(
            new THREE.BoxGeometry(body.fenderFlare * 2 + 0.06, 0.3, L * 0.26),
            darkMat,
          );
          flare.position.set(
            sx * (W / 2 + body.fenderFlare),
            wheelY + 0.14,
            sz * L * 0.29,
          );
          this.group.add(flare);
        }
      }
    }

    // Zócalos laterales y difusor: en tercera persona el auto ocupa media
    // pantalla, así que la silueta necesita más de tres cajas.
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, L * 0.42), darkMat);
      skirt.position.set(sx * (W / 2 - 0.02), wheelY - 0.06, 0);
      this.group.add(skirt);
    }
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.16, 0.3), darkMat);
    diffuser.position.set(0, wheelY - 0.06, -L * 0.46);
    this.group.add(diffuser);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.2, 0.22), darkMat);
    bumper.position.set(0, bodyY + 0.06, L * 0.49);
    this.group.add(bumper);

    // Escapes
    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.06, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35 }),
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.22, wheelY - 0.02, -L * 0.5);
      this.group.add(pipe);
    }

    // Alerón
    this.buildSpoiler(body, L, W, bodyY, bodyH, darkMat);

    // Luces
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.24, 0.1, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false }),
      );
      head.position.set(sx * W * 0.3, bodyY + bodyH * 0.55, L * 0.485);
      this.group.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.26, 0.09, 0.06), this.brakeMat);
      tail.position.set(sx * W * 0.29, bodyY + bodyH * 0.62, -L * 0.475);
      this.brakeLights.push(tail);
      this.group.add(tail);
    }

    // Ruedas
    const wheelGeo = new THREE.CylinderGeometry(
      body.wheelRadius, body.wheelRadius, body.wheelWidth, WHEEL_SEGMENTS,
    );
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.BoxGeometry(body.wheelWidth * 1.02, body.wheelRadius * 1.1, body.wheelRadius * 0.22);
    const trackHalf = W / 2 - body.wheelWidth * 0.35 + body.fenderFlare;
    const axleF = L * 0.31;
    const axleR = -L * 0.31;

    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as [number, number][]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(sx * trackHalf, wheelY, sz > 0 ? axleF : axleR);
      this.group.add(pivot);

      const wheel = new THREE.Mesh(wheelGeo, this.wheelMat);
      wheel.castShadow = true;
      pivot.add(wheel);

      const rim = new THREE.Mesh(rimGeo, this.caliperMat);
      pivot.add(rim);
      const rim2 = new THREE.Mesh(rimGeo, this.caliperMat);
      rim2.rotation.x = Math.PI / 2;
      pivot.add(rim2);

      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(wheel);
    }

    // Conos de faro proyectados en el piso
    this.headlightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(),
        color: 0xfff0cc,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.headlightPool.rotation.x = -Math.PI / 2;
    this.headlightPool.position.set(0, 0.06, L * 0.9);
    this.headlightPool.scale.set(W * 3.2, L * 2.6, 1);
    this.headlightPool.renderOrder = 3;
    this.group.add(this.headlightPool);

    // Sombra dura tipo blob: se lee mejor que una sombra real desde arriba
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    // Orden YXZ: primero el yaw sobre Y, después el -90° que la acuesta.
    // Con el orden por defecto el quad terminaba parado y se veía como una línea.
    this.shadow.rotation.order = 'YXZ';
    this.shadow.rotation.set(-Math.PI / 2, 0, 0);
    this.shadow.scale.set(W * 2.1, L * 1.5, 1);
    this.shadow.renderOrder = 1;

    this.group.rotation.order = 'YXZ';
    this.applyCosmetics(cosmetics);
  }

  private buildSpoiler(
    body: BodyParams, L: number, W: number, bodyY: number, bodyH: number, dark: THREE.Material,
  ): void {
    const z = -L * 0.46;
    if (body.spoiler === 'none') return;
    if (body.spoiler === 'lip' || body.spoiler === 'ducktail') {
      const h = body.spoiler === 'ducktail' ? 0.13 : 0.06;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, h, 0.22), this.paintMat);
      lip.position.set(0, bodyY + bodyH + h / 2 - 0.02, z);
      this.group.add(lip);
      return;
    }
    const big = body.spoiler === 'bigwing';
    const height = big ? 0.42 : 0.28;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.14), dark);
      post.position.set(sx * W * 0.32, bodyY + bodyH + height / 2, z + 0.05);
      this.group.add(post);
    }
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(W * (big ? 1.02 : 0.9), 0.05, big ? 0.42 : 0.3),
      this.paintMat,
    );
    wing.position.set(0, bodyY + bodyH + height, z + 0.02);
    this.group.add(wing);
  }

  /** El blob de sombra va suelto en la escena: no debe heredar el roll del auto. */
  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  applyCosmetics(c: CarCosmetics): void {
    this.paintMat.color.set(c.paintColor);
    switch (c.paintType) {
      case 'matte': this.paintMat.metalness = 0.0; this.paintMat.roughness = 0.85; break;
      case 'metallic': this.paintMat.metalness = 0.65; this.paintMat.roughness = 0.3; break;
      case 'pearl': this.paintMat.metalness = 0.4; this.paintMat.roughness = 0.15; break;
      case 'chrome': this.paintMat.metalness = 1.0; this.paintMat.roughness = 0.06; break;
      default: this.paintMat.metalness = 0.3; this.paintMat.roughness = 0.35;
    }
    this.wheelMat.color.set(c.wheelColor);
    this.caliperMat.color.set(c.caliperColor);
  }

  update(car: CarState, steerAngle: number, braking: boolean, dt: number): void {
    this.group.position.set(car.posX, 0, car.posZ);
    this.group.rotation.y = car.yaw;
    this.group.rotation.x = car.visualPitch;
    this.group.rotation.z = car.visualRoll;

    // Ruedas delanteras: el ángulo visible es enorme para la legibilidad del drift
    this.wheelPivots[0].rotation.y = steerAngle;
    this.wheelPivots[1].rotation.y = steerAngle;
    for (const w of this.wheelMeshes) w.rotation.x = car.wheelSpin;

    const c = braking ? 0xff2a1a : 0x3a0808;
    for (const t of this.brakeLights) (t.material as THREE.MeshBasicMaterial).color.setHex(c);

    this.shadow.position.set(car.posX, 0.03, car.posZ);
    this.shadow.rotation.y = car.yaw;
    const stretch = 1 + Math.min(0.35, car.speed * 0.008);
    this.shadow.scale.set(this.body.width * 2.1, this.body.length * 1.5 * stretch, 1);

    void dt;
  }
}
