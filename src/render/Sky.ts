import * as THREE from 'three';

/**
 * Cielo de atardecer: degradado horizonte → cenit con el sol bajo dibujado en
 * el propio shader. Una esfera y un draw call; nada de cubemaps ni archivos.
 */

const VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // siempre al fondo
}
`;

const FS = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  // Degradado vertical con dos tramos: el de abajo es el que da el atardecer
  vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  sky = mix(sky, uZenith, smoothstep(0.12, 0.55, h));
  sky = mix(uGround, sky, smoothstep(-0.06, 0.015, h));

  // Sol: disco duro + halo ancho, ambos anclados al horizonte
  float cosA = dot(d, normalize(uSunDir));
  float disc = smoothstep(0.9986, 0.9993, cosA);
  float halo = pow(max(cosA, 0.0), 240.0) * 0.55 + pow(max(cosA, 0.0), 14.0) * 0.22;
  sky += uSunColor * (disc * 2.4 + halo);

  // Bruma cálida pegada al horizonte
  sky = mix(sky, uHorizon * 1.05, exp(-abs(h) * 16.0) * 0.35);

  gl_FragColor = vec4(sky, 1.0);
}
`;

export interface SkyPreset {
  horizon: number;
  mid: number;
  zenith: number;
  ground: number;
  sun: number;
  /** Dirección del sol (se normaliza). Y bajo = atardecer. */
  sunDir: [number, number, number];
}

/** Atardecer sobre el puerto: ámbar en el horizonte, violeta arriba. */
export const DUSK: SkyPreset = {
  horizon: 0xff8a3d,
  mid: 0xe0577a,
  zenith: 0x2e2a5c,
  ground: 0x1d1a2e,
  sun: 0xffd98a,
  sunDir: [-0.72, 0.44, -0.54],
};

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sunDirection = new THREE.Vector3();
  readonly horizonColor = new THREE.Color();
  private mat: THREE.ShaderMaterial;

  constructor(preset: SkyPreset = DUSK) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uHorizon: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.apply(preset);
  }

  apply(p: SkyPreset): void {
    const u = this.mat.uniforms;
    (u.uHorizon.value as THREE.Color).setHex(p.horizon);
    (u.uMid.value as THREE.Color).setHex(p.mid);
    (u.uZenith.value as THREE.Color).setHex(p.zenith);
    (u.uGround.value as THREE.Color).setHex(p.ground);
    (u.uSunColor.value as THREE.Color).setHex(p.sun);
    this.sunDirection.set(...p.sunDir).normalize();
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDirection);
    this.horizonColor.setHex(p.horizon);
  }

  /** La esfera viaja con la cámara: el cielo nunca se acerca. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(1200);
  }
}
