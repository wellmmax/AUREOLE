import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SpectrumPalette } from '../core/spectra';

export interface AtmosphereAssembly {
  nebulaDome: THREE.Mesh;
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  corePointLight: THREE.PointLight;
  applySpectrum: (palette: SpectrumPalette, blendAlpha?: number) => void;
  update: (elapsed: number, energy: number, pulseBoost: number) => void;
  dispose: () => void;
}

export function createAtmosphereAssembly(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialPalette: SpectrumPalette,
  isSoftwareGl: boolean,
): AtmosphereAssembly {
  // Deep blue-black cosmic background & exponential volumetric fog
  const bgColor = new THREE.Color(initialPalette.fogColor);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.0115);

  // Studio / metallic PMREM environment reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.72;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // 1. Restrained Deep-Space Nebula & Volumetric Scattering Dome
  const nebulaUniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 1.0 },
    uVoidColor: { value: new THREE.Color(initialPalette.fogColor) },
    uNebulaPrimary: { value: new THREE.Color(initialPalette.nebulaPrimary) },
    uNebulaSecondary: { value: new THREE.Color(initialPalette.nebulaSecondary) },
    uScatterColor: { value: new THREE.Color(initialPalette.fissureCore) },
  };

  const domeGeo = new THREE.SphereGeometry(88, 36, 24);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: nebulaUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uEnergy;
      uniform vec3 uVoidColor;
      uniform vec3 uNebulaPrimary;
      uniform vec3 uNebulaSecondary;
      uniform vec3 uScatterColor;
      varying vec3 vDir;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm3(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise3(p);
          p = p * 2.05 + vec3(3.1, 1.7, 2.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        // Subtle galactic band along inclined plane
        float band = exp(-pow(d.y * 2.2 + d.x * 0.42, 2.0) * 1.5);
        float cloudA = fbm3(d * 2.4 + vec3(uTime * 0.005, 0.0, -uTime * 0.004));
        float cloudB = fbm3(d * 4.2 + vec3(-2.0, uTime * 0.004, 1.5));

        vec3 col = uVoidColor;
        col = mix(col, uNebulaPrimary, smoothstep(0.26, 0.82, cloudA) * (0.55 + band * 0.55));
        col = mix(col, uNebulaSecondary, smoothstep(0.38, 0.88, cloudB) * band * 0.45);

        // Restrained volumetric light scattering glow near galactic horizon
        float horizonHaze = pow(band, 1.4) * smoothstep(0.22, 0.72, cloudA) * 0.16 * (0.7 + uEnergy * 0.3);
        col += uScatterColor * horizonHaze;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const nebulaDome = new THREE.Mesh(domeGeo, domeMat);
  nebulaDome.name = 'CosmicNebulaDome';
  scene.add(nebulaDome);

  // 2. Three-Point Warm/Cool Studio + Cosmic Lighting Rig
  const keyLight = new THREE.DirectionalLight(initialPalette.keyLightColor, 2.15);
  keyLight.position.set(6.5, 5.2, 6.0);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    const frustum = 6.5;
    keyLight.shadow.camera.left = -frustum;
    keyLight.shadow.camera.right = frustum;
    keyLight.shadow.camera.top = frustum;
    keyLight.shadow.camera.bottom = -frustum;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  // Cool sky/ground hemisphere fill
  const hemiLight = new THREE.HemisphereLight('#7dd3fc', '#050814', 0.65);
  scene.add(hemiLight);

  // Crisp silhouette rim light from behind-left
  const rimLight = new THREE.DirectionalLight(initialPalette.rimLightColor, 2.45);
  rimLight.position.set(-7.5, -2.5, -6.5);
  scene.add(rimLight);

  // Dynamic core internal point light illuminating inner faces of the 3 orbital rings
  const corePointLight = new THREE.PointLight(initialPalette.fissureCore, 4.2, 16, 1.6);
  corePointLight.position.set(0, 0, 0);
  scene.add(corePointLight);

  const targetVoid = new THREE.Color();
  const targetNebPrimary = new THREE.Color();
  const targetNebSecondary = new THREE.Color();
  const targetKey = new THREE.Color();
  const targetRim = new THREE.Color();
  const targetCore = new THREE.Color();

  const applySpectrum = (palette: SpectrumPalette, blendAlpha = 1.0) => {
    targetVoid.set(palette.fogColor);
    targetNebPrimary.set(palette.nebulaPrimary);
    targetNebSecondary.set(palette.nebulaSecondary);
    targetKey.set(palette.keyLightColor);
    targetRim.set(palette.rimLightColor);
    targetCore.set(palette.fissureCore);

    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(targetVoid, blendAlpha);
    }
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.lerp(targetVoid, blendAlpha);
    }

    nebulaUniforms.uVoidColor.value.lerp(targetVoid, blendAlpha);
    nebulaUniforms.uNebulaPrimary.value.lerp(targetNebPrimary, blendAlpha);
    nebulaUniforms.uNebulaSecondary.value.lerp(targetNebSecondary, blendAlpha);
    nebulaUniforms.uScatterColor.value.lerp(targetCore, blendAlpha);

    keyLight.color.lerp(targetKey, blendAlpha);
    rimLight.color.lerp(targetRim, blendAlpha);
    corePointLight.color.lerp(targetCore, blendAlpha);
  };

  const update = (elapsed: number, energy: number, pulseBoost: number) => {
    nebulaUniforms.uTime.value = elapsed;
    nebulaUniforms.uEnergy.value = energy;
    corePointLight.intensity = 3.2 + energy * 2.1 + pulseBoost * 5.2;
  };

  return {
    nebulaDome,
    keyLight,
    rimLight,
    hemiLight,
    corePointLight,
    applySpectrum,
    update,
    dispose: () => {
      domeGeo.dispose();
      domeMat.dispose();
      envTarget.dispose();
    },
  };
}
