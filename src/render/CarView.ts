import * as THREE from 'three';
import type { BodyParams } from '../data/cars';
import type { CarCosmetics } from '../save/types';
import type { CarState } from '../sim/types';
import { buildCarBody, buildWheel } from './CarBody';
import { carPaintTexture, radialTexture, shadowTexture } from './Textures';

/**
 * Auto en 3D. La carrocería es una cáscara loftada (ver CarBody.ts) y encima
 * van las piezas que la silueta no puede dar: ruedas, ópticas, espejos, alerón
 * y paragolpes.
 */
export class CarView {
  readonly group = new THREE.Group();
  private wheelPivots: THREE.Object3D[] = [];
  private wheelMeshes: THREE.Object3D[] = [];
  private brakeLights: THREE.Mesh[] = [];
  private headLights: THREE.Mesh[] = [];
  private headlightPool: THREE.Mesh;
  private shadow: THREE.Mesh;
  private paintMat: THREE.MeshStandardMaterial;
  private tireMat: THREE.MeshStandardMaterial;
  private rimMat: THREE.MeshStandardMaterial;
  private brakeMat: THREE.MeshStandardMaterial;
  private body: BodyParams;

  constructor(body: BodyParams, cosmetics: CarCosmetics) {
    this.body = body;

    // La pintura de auto es un DIELÉCTRICO con barniz, no un metal. Con
    // `metalness` alto el F0 se dispara y la chapa devuelve las luces como si
    // fuera cromo: el costado plano se quemaba en una franja blanca que borraba
    // toda la forma. El brillo metalizado sale del barniz y de la escarcha de
    // la textura, no de `metalness`.
    this.paintMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.04, roughness: 0.32, envMapIntensity: 0.7,
      map: carPaintTexture(),
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0c1014, metalness: 0.9, roughness: 0.08,
      transparent: true, opacity: 0.86, envMapIntensity: 1.4,
      side: THREE.DoubleSide,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x181a1e, metalness: 0.5, roughness: 0.55,
    });
    this.tireMat = new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.05, roughness: 0.92 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 0.95, roughness: 0.22 });
    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x5a0f0c, emissive: 0x2a0402, roughness: 0.4,
    });

    const L = body.length;
    const W = body.width;
    const meshes = buildCarBody(body, body.silhouette);

    const shell = new THREE.Mesh(meshes.body, this.paintMat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.group.add(shell);

    const glass = new THREE.Mesh(meshes.glass, glassMat);
    glass.castShadow = false;
    this.group.add(glass);

    const axleZ = L * 0.31;
    const trackHalf = W / 2 - body.wheelWidth * 0.32 + body.fenderFlare;

    // ── Paragolpes ──
    // Pegados al cuerpo y a la altura de la trompa: antes eran losas de 0.9·W
    // flotando delante del auto y se leían como una caja negra atornillada.
    const front = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.26, 0.18), trimMat);
    front.position.set(0, 0.34, L * 0.47);
    this.group.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.28, 0.2), trimMat);
    rear.position.set(0, 0.34, -L * 0.47);
    this.group.add(rear);

    // ── Zócalos: finitos y bajos, entre las dos ruedas ──
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, axleZ * 1.5), trimMat);
      skirt.position.set(sx * (W / 2 - 0.02), 0.23, 0);
      this.group.add(skirt);
    }

    // ── Arcos de rueda ──
    // Un arco por rueda en vez de las cajas de antes: hace que la rueda se lea
    // metida en el guardabarros y no apoyada al costado de la carrocería.
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x141519, metalness: 0.2, roughness: 0.75,
    });
    const arch = new THREE.TorusGeometry(body.wheelRadius + 0.05, 0.05, 5, 16, Math.PI);
    arch.rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a = new THREE.Mesh(arch, archMat);
        a.position.set(sx * (trackHalf + body.wheelWidth * 0.5), body.wheelRadius, sz * axleZ);
        a.scale.set(1, 1, 1.12);
        this.group.add(a);
      }
    }

    // ── Aletines ──
    // Solo cuando el kit los pide de verdad, y siguiendo el arco de la rueda.
    if (body.fenderFlare > 0.03) {
      const flare = new THREE.TorusGeometry(
        body.wheelRadius + 0.02, body.fenderFlare * 0.9 + 0.05, 5, 14, Math.PI,
      );
      flare.rotateY(Math.PI / 2);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const f = new THREE.Mesh(flare, this.paintMat);
          f.position.set(sx * (W / 2 + body.fenderFlare * 0.35), body.wheelRadius + 0.05, sz * axleZ);
          f.scale.set(1, 1.05, 1.2);
          this.group.add(f);
        }
      }
    }

    // ── Espejos ──
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.04), trimMat);
      arm.position.set(sx * (W / 2 + 0.02), meshes.roofY * 0.66, meshes.cabinCenterZ + L * 0.14);
      this.group.add(arm);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.13), this.paintMat);
      cap.position.set(sx * (W / 2 + 0.08), meshes.roofY * 0.66, meshes.cabinCenterZ + L * 0.14);
      this.group.add(cap);
    }

    // ── Ópticas ──
    // A la altura del hombro y metidas en la trompa, no colgando en el aire.
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6e0, emissive: 0xffe9b8, emissiveIntensity: 1.4, roughness: 0.2,
    });
    const lightY = 0.26 + (meshes.roofY - 0.26) * 0.42;
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(W * 0.24, 0.1, 0.08), headMat);
      head.position.set(sx * W * 0.28, lightY, L * 0.455);
      this.headLights.push(head);
      this.group.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.26, 0.09, 0.06), this.brakeMat);
      tail.position.set(sx * W * 0.28, lightY + 0.04, -L * 0.462);
      this.brakeLights.push(tail);
      this.group.add(tail);
    }

    // ── Escapes ──
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.95, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.16, 10), pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.22, 0.26, -L * 0.49);
      this.group.add(pipe);
    }

    this.buildSpoiler(body, L, W, meshes.roofY, trimMat);

    // ── Ruedas ──
    const { tire, rim } = buildWheel(body.wheelRadius, body.wheelWidth, 5);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as [number, number][]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(sx * trackHalf, body.wheelRadius, sz * axleZ);
      this.group.add(pivot);

      const spin = new THREE.Object3D();
      pivot.add(spin);

      const t = new THREE.Mesh(tire, this.tireMat);
      t.castShadow = true;
      spin.add(t);
      const r = new THREE.Mesh(rim, this.rimMat);
      spin.add(r);

      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(spin);
    }

    // ── Luz de faros proyectada ──
    // Un charco chico y tenue DELANTE del auto. Antes medía 3.4·W × 2.8·L con
    // opacidad 0.28 y, siendo aditivo, lavaba la carrocería entera.
    this.headlightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(), color: 0xfff0cc, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    this.headlightPool.rotation.x = -Math.PI / 2;
    this.headlightPool.position.set(0, 0.04, L * 1.15);
    this.headlightPool.scale.set(W * 2.0, L * 1.5, 1);
    this.headlightPool.renderOrder = 3;
    this.headlightPool.visible = false;
    this.group.add(this.headlightPool);

    // ── Sombra de contacto ──
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(), transparent: true, opacity: 0.5, depthWrite: false,
      }),
    );
    this.shadow.rotation.order = 'YXZ';
    this.shadow.rotation.set(-Math.PI / 2, 0, 0);
    this.shadow.scale.set(W * 2.0, L * 1.4, 1);
    this.shadow.renderOrder = 1;

    this.group.rotation.order = 'YXZ';
    this.applyCosmetics(cosmetics);
  }

  private buildSpoiler(
    body: BodyParams, L: number, W: number, roofY: number, dark: THREE.Material,
  ): void {
    const z = -L * 0.45;
    if (body.spoiler === 'none') return;
    if (body.spoiler === 'lip' || body.spoiler === 'ducktail') {
      const h = body.spoiler === 'ducktail' ? 0.14 : 0.06;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, h, 0.24), this.paintMat);
      lip.position.set(0, roofY * 0.62 + h / 2, z);
      lip.rotation.x = -0.12;
      this.group.add(lip);
      return;
    }
    const big = body.spoiler === 'bigwing';
    const height = big ? 0.44 : 0.3;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, 0.16), dark);
      post.position.set(sx * W * 0.3, roofY * 0.6 + height / 2, z + 0.04);
      this.group.add(post);
    }
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(W * (big ? 1.0 : 0.88), 0.05, big ? 0.4 : 0.28),
      this.paintMat,
    );
    wing.position.set(0, roofY * 0.6 + height, z + 0.02);
    wing.rotation.x = 0.14;
    this.group.add(wing);
  }

  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  applyCosmetics(c: CarCosmetics): void {
    this.paintMat.color.set(c.paintColor);
    switch (c.paintType) {
      // Solo el cromo es metal de verdad; el resto son barnices sobre color.
      //
      // La rugosidad se mantiene alta a propósito. Un panel de auto es casi
      // plano y grande: con barniz muy pulido el lóbulo especular lo cubre
      // ENTERO de una vez y el costado se convierte en una plancha blanca sin
      // forma. Con el lóbulo ancho, el brillo se degrada a lo largo de la chapa.
      case 'matte': this.paintMat.metalness = 0.0; this.paintMat.roughness = 0.85; break;
      case 'metallic': this.paintMat.metalness = 0.18; this.paintMat.roughness = 0.44; break;
      case 'pearl': this.paintMat.metalness = 0.1; this.paintMat.roughness = 0.36; break;
      case 'chrome': this.paintMat.metalness = 1.0; this.paintMat.roughness = 0.22; break;
      default: this.paintMat.metalness = 0.04; this.paintMat.roughness = 0.5;
    }
    this.rimMat.color.set(c.wheelColor);
  }

  update(car: CarState, steerAngle: number, braking: boolean, dt: number): void {
    // El charco de faros solo existe en juego: en las fotos del garage tapaba
    // el auto con un velo blanco.
    this.headlightPool.visible = true;
    this.group.position.set(car.posX, 0, car.posZ);
    this.group.rotation.y = car.yaw;
    this.group.rotation.x = car.visualPitch;
    this.group.rotation.z = car.visualRoll;

    this.wheelPivots[0].rotation.y = steerAngle;
    this.wheelPivots[1].rotation.y = steerAngle;
    for (const w of this.wheelMeshes) w.rotation.x = car.wheelSpin;

    const on = braking;
    for (const t of this.brakeLights) {
      const m = t.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(on ? 0xff2a10 : 0x2a0402);
      m.emissiveIntensity = on ? 2.4 : 0.6;
    }
    for (const h of this.headLights) {
      (h.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
    }

    this.shadow.position.set(car.posX, 0.03, car.posZ);
    this.shadow.rotation.y = car.yaw;
    const stretch = 1 + Math.min(0.3, car.speed * 0.007);
    this.shadow.scale.set(this.body.width * 2.0, this.body.length * 1.4 * stretch, 1);
    void dt;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
