import * as THREE from 'three';
import type { BodyParams } from '../data/cars';
import type { CarCosmetics } from '../save/types';
import type { CarState } from '../sim/types';
import { buildCarBody, buildWheel } from './CarBody';
import { radialTexture, shadowTexture } from './Textures';

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

    this.paintMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.45, roughness: 0.3, envMapIntensity: 1.1,
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

    // ── Paragolpes y zócalos ──
    const front = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.2, 0.24), trimMat);
    front.position.set(0, 0.36, L * 0.485);
    this.group.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.22, 0.26), trimMat);
    rear.position.set(0, 0.36, -L * 0.485);
    this.group.add(rear);
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, L * 0.44), trimMat);
      skirt.position.set(sx * (W / 2 - 0.03), 0.27, 0);
      this.group.add(skirt);
    }

    // ── Aletines ──
    if (body.fenderFlare > 0.01) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const flare = new THREE.Mesh(
            new THREE.BoxGeometry(body.fenderFlare * 2 + 0.07, 0.3, L * 0.24),
            trimMat,
          );
          flare.position.set(sx * (W / 2 + body.fenderFlare * 0.7), body.wheelRadius + 0.12, sz * L * 0.3);
          this.group.add(flare);
        }
      }
    }

    // ── Espejos ──
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), trimMat);
      arm.position.set(sx * (W / 2 + 0.06), meshes.roofY * 0.72, meshes.cabinCenterZ + L * 0.16);
      this.group.add(arm);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), this.paintMat);
      cap.position.set(sx * (W / 2 + 0.14), meshes.roofY * 0.72, meshes.cabinCenterZ + L * 0.16);
      this.group.add(cap);
    }

    // ── Ópticas ──
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6e0, emissive: 0xffe9b8, emissiveIntensity: 1.4, roughness: 0.2,
    });
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(W * 0.26, 0.11, 0.1), headMat);
      head.position.set(sx * W * 0.3, 0.62, L * 0.47);
      this.headLights.push(head);
      this.group.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.28, 0.1, 0.07), this.brakeMat);
      tail.position.set(sx * W * 0.3, 0.66, -L * 0.478);
      this.brakeLights.push(tail);
      this.group.add(tail);
    }

    // ── Escapes ──
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.95, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.18, 10), pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.24, 0.3, -L * 0.5);
      this.group.add(pipe);
    }

    this.buildSpoiler(body, L, W, meshes.roofY, trimMat);

    // ── Ruedas ──
    const { tire, rim } = buildWheel(body.wheelRadius, body.wheelWidth, 5);
    const trackHalf = W / 2 - body.wheelWidth * 0.32 + body.fenderFlare;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as [number, number][]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(sx * trackHalf, body.wheelRadius, sz * L * 0.31);
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
    this.headlightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(), color: 0xfff0cc, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    this.headlightPool.rotation.x = -Math.PI / 2;
    this.headlightPool.position.set(0, 0.06, L * 0.95);
    this.headlightPool.scale.set(W * 3.4, L * 2.8, 1);
    this.headlightPool.renderOrder = 3;
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
      case 'matte': this.paintMat.metalness = 0.05; this.paintMat.roughness = 0.8; break;
      case 'metallic': this.paintMat.metalness = 0.75; this.paintMat.roughness = 0.26; break;
      case 'pearl': this.paintMat.metalness = 0.5; this.paintMat.roughness = 0.12; break;
      case 'chrome': this.paintMat.metalness = 1.0; this.paintMat.roughness = 0.04; break;
      default: this.paintMat.metalness = 0.45; this.paintMat.roughness = 0.3;
    }
    this.rimMat.color.set(c.wheelColor);
  }

  update(car: CarState, steerAngle: number, braking: boolean, dt: number): void {
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
