import * as THREE from 'three';

/**
 * Post-procesado propio: bright pass → blur separable → composite con viñeta,
 * grano, aberración cromática y curva filmica. Sin EffectComposer para
 * controlar exactamente el costo por frame.
 */

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 0.0001);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  sum += texture2D(tDiffuse, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
  sum += texture2D(tDiffuse, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
  sum += texture2D(tDiffuse, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
  sum += texture2D(tDiffuse, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FS = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform float uExposure;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  // Aberración cromática radial (sube con la velocidad)
  float ab = uAberration * r2;
  vec3 col;
  col.r = texture2D(tScene, uv + fromCenter * ab).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - fromCenter * ab).b;

  col += texture2D(tBloom, uv).rgb * uBloomStrength;

  // Color grading: sombras al azul, luces al magenta
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col * vec3(0.92, 0.90, 1.10), col * vec3(1.10, 1.00, 0.86), smoothstep(0.12, 0.80, l));

  col *= uExposure;
  col += uFlashColor * uFlash;

  // Curva filmica
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

  // Viñeta
  col *= 1.0 - uVignette * smoothstep(0.15, 0.75, r2);

  // Grano
  float n = hash(uv * 1024.0 + fract(uTime) * 91.7) - 0.5;
  col += n * uGrain;

  // linear → sRGB
  col = clamp(col, 0.0, 1.0);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface PostSettings {
  bloom: boolean;
  grain: number;
  aberration: number;
  vignette: number;
}

export class PostFX {
  private renderer: THREE.WebGLRenderer;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;

  private rtScene: THREE.WebGLRenderTarget;
  private rtBrightA: THREE.WebGLRenderTarget;
  private rtBrightB: THREE.WebGLRenderTarget;

  private matBright: THREE.ShaderMaterial;
  private matBlur: THREE.ShaderMaterial;
  private matComposite: THREE.ShaderMaterial;

  settings: PostSettings = { bloom: true, grain: 0.016, aberration: 0.0, vignette: 0.28 };
  flash = 0;
  flashColor = new THREE.Color(0xffb03a);

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;

    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtScene = new THREE.WebGLRenderTarget(width, height, opts);
    this.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const bw = Math.max(1, Math.floor(width / 4));
    const bh = Math.max(1, Math.floor(height / 4));
    this.rtBrightA = new THREE.WebGLRenderTarget(bw, bh, { ...opts, depthBuffer: false });
    this.rtBrightB = new THREE.WebGLRenderTarget(bw, bh, { ...opts, depthBuffer: false });

    this.matBright = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: BRIGHT_FS,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.86 } },
      depthTest: false,
      depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: BLUR_FS,
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.matComposite = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: COMPOSITE_FS,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloomStrength: { value: 0.7 },
        uVignette: { value: 0.35 },
        uGrain: { value: 0.025 },
        uAberration: { value: 0.0 },
        uExposure: { value: 1.35 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Vector3(0.13, 0.88, 1.0) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matBright);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get target(): THREE.WebGLRenderTarget {
    return this.rtScene;
  }

  setSize(width: number, height: number): void {
    this.rtScene.setSize(width, height);
    const bw = Math.max(1, Math.floor(width / 4));
    const bh = Math.max(1, Math.floor(height / 4));
    this.rtBrightA.setSize(bw, bh);
    this.rtBrightB.setSize(bw, bh);
  }

  private blit(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(time: number, speedFactor: number): void {
    const s = this.settings;

    if (s.bloom) {
      this.matBright.uniforms.tDiffuse.value = this.rtScene.texture;
      this.blit(this.matBright, this.rtBrightA);

      const bw = this.rtBrightA.width;
      const bh = this.rtBrightA.height;
      for (let i = 0; i < 2; i++) {
        this.matBlur.uniforms.tDiffuse.value = this.rtBrightA.texture;
        (this.matBlur.uniforms.uDirection.value as THREE.Vector2).set((1 / bw) * (1 + i), 0);
        this.blit(this.matBlur, this.rtBrightB);

        this.matBlur.uniforms.tDiffuse.value = this.rtBrightB.texture;
        (this.matBlur.uniforms.uDirection.value as THREE.Vector2).set(0, (1 / bh) * (1 + i));
        this.blit(this.matBlur, this.rtBrightA);
      }
    }

    const u = this.matComposite.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = s.bloom ? this.rtBrightA.texture : null;
    u.uBloomStrength.value = s.bloom ? 0.7 : 0;
    u.uVignette.value = s.vignette;
    u.uGrain.value = s.grain;
    u.uAberration.value = s.aberration * speedFactor;
    u.uTime.value = time;
    u.uFlash.value = this.flash;
    (u.uFlashColor.value as THREE.Vector3).set(
      this.flashColor.r * 0.45,
      this.flashColor.g * 0.45,
      this.flashColor.b * 0.45,
    );
    this.blit(this.matComposite, null);

    this.flash = Math.max(0, this.flash - 0.06);
  }

  dispose(): void {
    this.rtScene.dispose();
    this.rtBrightA.dispose();
    this.rtBrightB.dispose();
  }
}
