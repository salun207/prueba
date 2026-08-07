import * as THREE from 'three';

interface Slot {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  life: number;
  maxLife: number;
  baseY: number;
}

/** Texto flotante en el mundo (billboard sobre el auto). Pool fijo, sin allocs. */
export class FloatingText {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private next = 0;

  constructor(count = 8) {
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      sprite.scale.set(12, 3, 1);
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.slots.push({ sprite, canvas, ctx, texture, life: 0, maxLife: 1, baseY: 0 });
    }
  }

  show(text: string, sub: string, color: string, x: number, y: number, z: number, scale = 1): void {
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;

    const { ctx, canvas } = slot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 62px system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, 256, sub ? 48 : 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 256, sub ? 48 : 64);

    if (sub) {
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(sub, 256, 100);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sub, 256, 100);
    }

    slot.texture.needsUpdate = true;
    slot.sprite.position.set(x, y, z);
    slot.sprite.scale.set(12 * scale, 3 * scale, 1);
    slot.sprite.visible = true;
    slot.life = 0;
    slot.maxLife = 1.1;
    slot.baseY = y;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.sprite.visible) continue;
      s.life += dt;
      const t = s.life / s.maxLife;
      if (t >= 1) {
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.y = s.baseY + t * 2.4;
      (s.sprite.material as THREE.SpriteMaterial).opacity = 1 - t * t;
    }
  }
}
