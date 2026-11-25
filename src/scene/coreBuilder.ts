import * as THREE from 'three';
import { MAX_SHOCKWAVES, SpectrumPalette, hexToRgbNormalized } from '../core/spectra';
import { ProceduralTextureSet } from './textures';

export interface CoreUniformState {
  uTime: { value: number };
  uEnergy: { value: number };
  uPulseBoost: { value: number };
  uObsidianColor: { value: THREE.Color };
  uFissureDeep: { value: THREE.Color };
  uFissureCore: { value: THREE.Color };
  uRimColor: { value: THREE.Color };
}

export interface StarCoreAssembly {
  group: THREE.Group;
  coreUniforms: CoreUniformState;
  coronaUniforms: {
    uTime: { value: number };
    uEnergy: { value: number };
    uPulseBoost: { value: number };
    uGlowColor: { value: THREE.Color };
    uRimColor: { value: THREE.Color };
  };
  armorMaterial: THREE.MeshPhysicalMaterial;
  collarMaterial: THREE.MeshPhysicalMaterial;
  accentGemMaterial: THREE.MeshStandardMaterial;
  waveMeshes: THREE.Mesh[];
  update: (
    elapsed: number,
    dt: number,
    energy: number,
    pulseBoost: number,
    shockwaves: { active: boolean; radius: number; strength: number; maxRadius: number }[],
  ) => void;
  applySpectrum: (palette: SpectrumPalette, blendAlpha?: number) => void;
  dispose: () => void;
}

const SIMPLEX_NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * snoise(p);
    p = p * 2.07 + vec3(13.1, 7.7, 5.3);
    amp *= 0.5;
  }
  return value;
}

float ridgeFissure(vec3 p, float t) {
  vec3 warp = vec3(
    fbm(p * 1.15 + vec3(0.0, t * 0.045, 0.0)),
    fbm(p * 1.15 + vec3(4.2, -t * 0.035, 1.7)),
    fbm(p * 1.15 + vec3(-2.4, 1.9, t * 0.04))
  );
  vec3 q = p + warp * 0.58;
  float n1 = abs(snoise(q * 2.15));
  float n2 = abs(snoise(q * 4.45 + vec3(t * 0.03)));
  float ridgeA = 1.0 - smoothstep(0.02, 0.22, n1);
  float ridgeB = (1.0 - smoothstep(0.015, 0.14, n2)) * 0.55;
  return clamp(ridgeA + ridgeB * (0.4 + ridgeA), 0.0, 1.0);
}
`;

export function createStarCoreAssembly(
  initialPalette: SpectrumPalette,
  textures: ProceduralTextureSet,
): StarCoreAssembly {
  const group = new THREE.Group();
  group.name = 'StarCoreSanctuary';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  const coreUniforms: CoreUniformState = {
    uTime: { value: 0 },
    uEnergy: { value: 1.0 },
    uPulseBoost: { value: 0.0 },
    uObsidianColor: { value: new THREE.Color(initialPalette.obsidianBase) },
    uFissureDeep: { value: new THREE.Color(initialPalette.fissureDeep) },
    uFissureCore: { value: new THREE.Color(initialPalette.fissureCore) },
    uRimColor: { value: new THREE.Color(initialPalette.rimLightColor) },
  };

  // 1. Primary Obsidian & Molten Fractal Fissure Core
  const coreGeo = new THREE.IcosahedronGeometry(1.48, 48);
  geometriesToDispose.push(coreGeo);

  const coreMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPalette.obsidianBase),
    metalness: 0.58,
    roughness: 0.52,
    clearcoat: 0.14,
    clearcoatRoughness: 0.5,
    bumpMap: textures.armorBumpMap,
    bumpScale: 0.026,
    roughnessMap: textures.armorRoughnessMap,
    envMapIntensity: 0.78,
  });

  coreMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = coreUniforms.uTime;
    shader.uniforms.uEnergy = coreUniforms.uEnergy;
    shader.uniforms.uPulseBoost = coreUniforms.uPulseBoost;
    shader.uniforms.uObsidianColor = coreUniforms.uObsidianColor;
    shader.uniforms.uFissureDeep = coreUniforms.uFissureDeep;
    shader.uniforms.uFissureCore = coreUniforms.uFissureCore;
    shader.uniforms.uRimColor = coreUniforms.uRimColor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uEnergy;
        varying vec3 vCoreLocalPos;
        varying vec3 vCoreWorldNormal;
        ${SIMPLEX_NOISE_GLSL}
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCoreLocalPos = normalize(position);
        float fissureMask = ridgeFissure(vCoreLocalPos * 1.35, uTime * (0.6 + uEnergy * 0.4));
        float crustNoise = fbm(vCoreLocalPos * 3.8);
        // Carve fissures inward while giving obsidian tectonic plates subtle relief
        float disp = crustNoise * 0.038 - fissureMask * 0.072;
        transformed += normal * disp;
        vCoreWorldNormal = normalize(mat3(modelMatrix) * normal);
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uEnergy;
        uniform float uPulseBoost;
        uniform vec3 uObsidianColor;
        uniform vec3 uFissureDeep;
        uniform vec3 uFissureCore;
        uniform vec3 uRimColor;
        varying vec3 vCoreLocalPos;
        varying vec3 vCoreWorldNormal;
        ${SIMPLEX_NOISE_GLSL}
        `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 sampleDir = normalize(vCoreLocalPos);
        float tFlow = uTime * (0.45 + uEnergy * 0.45);
        float fissure = ridgeFissure(sampleDir * 1.35, tFlow);
        float microGrain = fbm(sampleDir * 8.5);
        // Rich dark obsidian basalt contrast with carved charred shoulders
        vec3 darkObsidian = uObsidianColor * (0.7 + 0.48 * smoothstep(-0.4, 0.5, microGrain));
        float shoulder = smoothstep(0.06, 0.36, fissure) * (1.0 - smoothstep(0.36, 0.72, fissure));
        diffuseColor.rgb = mix(darkObsidian, darkObsidian * 0.25, shoulder * 0.8);
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float fRough = ridgeFissure(normalize(vCoreLocalPos) * 1.35, uTime * (0.45 + uEnergy * 0.45));
        float rockVar = fbm(normalize(vCoreLocalPos) * 6.0);
        roughnessFactor = clamp(mix(0.42, 0.82, smoothstep(-0.3, 0.4, rockVar)) + fRough * 0.18, 0.28, 0.94);
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 eDir = normalize(vCoreLocalPos);
        float eTime = uTime * (0.45 + uEnergy * 0.45);
        float fMask = ridgeFissure(eDir * 1.35, eTime);
        float magmaFlow = 0.5 + 0.5 * snoise(eDir * 4.5 + vec3(0.0, -eTime * 0.35, eTime * 0.2));
        float smolderEdge = smoothstep(0.14, 0.52, fMask);
        float heatCore = smoothstep(0.55, 0.94, fMask);
        float energyScale = (0.7 + uEnergy * 0.45 + uPulseBoost * 0.75);
        // Three-tier thermal gradient: charred crust -> deep ember -> molten inner core
        vec3 moltenGlow = mix(uFissureDeep * 0.95, uFissureCore * 1.45, heatCore * (0.62 + 0.38 * magmaFlow));
        totalEmissiveRadiance += moltenGlow * smolderEdge * energyScale;

        // Subtle cool cyan grazing silhouette rim on obsidian edges
        vec3 vDir = normalize(vViewPosition);
        float grazing = pow(1.0 - clamp(abs(dot(normalize(normal), vDir)), 0.0, 1.0), 3.8);
        totalEmissiveRadiance += uRimColor * grazing * (0.2 + uPulseBoost * 0.25) * (1.0 - smolderEdge * 0.7);
        `,
      );
  };
  materialsToDispose.push(coreMat);

  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.name = 'ObsidianStarCore';
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  group.add(coreMesh);

  // 2. Sculpted Equatorial Containment Collar (LatheGeometry with chamfered profile)
  const collarProfile = [
    new THREE.Vector2(1.50, -0.14),
    new THREE.Vector2(1.64, -0.11),
    new THREE.Vector2(1.68, -0.06),
    new THREE.Vector2(1.61, -0.02),
    new THREE.Vector2(1.61, 0.02),
    new THREE.Vector2(1.68, 0.06),
    new THREE.Vector2(1.64, 0.11),
    new THREE.Vector2(1.50, 0.14),
  ];
  const collarGeo = new THREE.LatheGeometry(collarProfile, 72);
  geometriesToDispose.push(collarGeo);

  const collarMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPalette.armorMetal),
    metalness: 0.92,
    roughness: 0.26,
    anisotropy: 0.65,
    bumpMap: textures.ringBumpMap,
    bumpScale: 0.015,
    roughnessMap: textures.ringRoughnessMap,
    emissive: new THREE.Color(initialPalette.ringInlay),
    emissiveMap: textures.ringEmissiveMask,
    emissiveIntensity: 0.55,
    envMapIntensity: 1.15,
  });
  materialsToDispose.push(collarMaterial);

  const collarMesh = new THREE.Mesh(collarGeo, collarMaterial);
  collarMesh.name = 'EquatorialCollar';
  collarMesh.rotation.z = 0.18;
  collarMesh.rotation.x = 0.1;
  collarMesh.castShadow = true;
  collarMesh.receiveShadow = true;
  group.add(collarMesh);

  // 3 & 4. Upper & Lower Fluted Polar Sanctuary Crowns (LatheGeometry)
  const crownProfile = [
    new THREE.Vector2(0.46, 0.0),
    new THREE.Vector2(0.56, 0.06),
    new THREE.Vector2(0.76, 0.08),
    new THREE.Vector2(0.84, 0.01),
    new THREE.Vector2(0.74, -0.07),
    new THREE.Vector2(0.48, -0.05),
  ];
  const crownGeo = new THREE.LatheGeometry(crownProfile, 48);
  geometriesToDispose.push(crownGeo);

  const armorMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPalette.armorMetal),
    metalness: 0.88,
    roughness: 0.42,
    clearcoat: 0.2,
    bumpMap: textures.armorBumpMap,
    bumpScale: 0.018,
    roughnessMap: textures.armorRoughnessMap,
    envMapIntensity: 1.0,
  });
  materialsToDispose.push(armorMaterial);

  const northCrown = new THREE.Mesh(crownGeo, armorMaterial);
  northCrown.position.y = 1.34;
  northCrown.name = 'NorthPolarCrown';
  northCrown.castShadow = true;
  group.add(northCrown);

  const southCrown = new THREE.Mesh(crownGeo, armorMaterial);
  southCrown.position.y = -1.34;
  southCrown.rotation.x = Math.PI;
  southCrown.name = 'SouthPolarCrown';
  southCrown.castShadow = true;
  group.add(southCrown);

  // 5. Four Interlocking Meridian Containment Ribs (ExtrudeGeometry curved arcs)
  const ribShape = new THREE.Shape();
  const innerR = 1.50;
  const outerR = 1.62;
  const arcSpan = Math.PI * 0.44;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = -arcSpan * 0.5 + (i / steps) * arcSpan;
    const x = Math.cos(a) * outerR;
    const y = Math.sin(a) * outerR;
    if (i === 0) ribShape.moveTo(x, y);
    else ribShape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -arcSpan * 0.5 + (i / steps) * arcSpan;
    const x = Math.cos(a) * innerR;
    const y = Math.sin(a) * innerR;
    ribShape.lineTo(x, y);
  }
  ribShape.closePath();

  const ribGeo = new THREE.ExtrudeGeometry(ribShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 24,
  });
  ribGeo.translate(0, 0, -0.0375);
  geometriesToDispose.push(ribGeo);

  const accentGemMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialPalette.fissureCore),
    emissive: new THREE.Color(initialPalette.fissureCore),
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.1,
  });
  materialsToDispose.push(accentGemMaterial);

  const nodeGeo = new THREE.OctahedronGeometry(0.065, 1);
  geometriesToDispose.push(nodeGeo);

  const ribsGroup = new THREE.Group();
  ribsGroup.name = 'MeridianRibs';
  for (let i = 0; i < 4; i++) {
    const ribHolder = new THREE.Group();
    ribHolder.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;

    const ribMesh = new THREE.Mesh(ribGeo, collarMaterial);
    ribMesh.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.34;
    ribMesh.castShadow = true;
    ribHolder.add(ribMesh);

    const gemMesh = new THREE.Mesh(nodeGeo, accentGemMaterial);
    gemMesh.position.set(1.66, 0, 0);
    ribMesh.add(gemMesh);

    ribsGroup.add(ribHolder);
  }
  group.add(ribsGroup);

  // 6. Volumetric Fresnel Corona / Light Scattering Halo (subtle, preserves dark center)
  const coronaUniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 1.0 },
    uPulseBoost: { value: 0.0 },
    uGlowColor: { value: new THREE.Color(initialPalette.fissureCore) },
    uRimColor: { value: new THREE.Color(initialPalette.rimLightColor) },
  };

  const coronaGeo = new THREE.SphereGeometry(2.08, 48, 48);
  geometriesToDispose.push(coronaGeo);

  const coronaMat = new THREE.ShaderMaterial({
    uniforms: coronaUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vLocalDir;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uEnergy;
      uniform float uPulseBoost;
      uniform vec3 uGlowColor;
      uniform vec3 uRimColor;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vLocalDir;

      void main() {
        float ndotv = clamp(dot(normalize(vNormalView), normalize(vViewDir)), 0.0, 1.0);
        // Corona peaks near core edge and fades gently outward; dark center keeps obsidian sharp
        float limb = pow(1.0 - ndotv, 2.8) * smoothstep(0.0, 0.38, ndotv);
        float shimmer = 0.85 + 0.15 * sin(vLocalDir.y * 7.0 + uTime * 1.4) * cos(vLocalDir.x * 6.0 - uTime * 1.1);
        vec3 col = mix(uRimColor, uGlowColor, 0.62);
        float alpha = limb * shimmer * (0.28 + uEnergy * 0.14 + uPulseBoost * 0.35);
        gl_FragColor = vec4(col * (0.9 + uEnergy * 0.25), clamp(alpha, 0.0, 0.72));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  materialsToDispose.push(coronaMat);

  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
  coronaMesh.name = 'VolumetricCorona';
  group.add(coronaMesh);

  // 7. Resonance Shockwave Shells (3 reusable expanding spherical waves)
  const waveGeo = new THREE.SphereGeometry(1.0, 48, 32);
  geometriesToDispose.push(waveGeo);

  const waveMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < MAX_SHOCKWAVES; i++) {
    const waveMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(initialPalette.fissureCore) },
        uRimColor: { value: new THREE.Color(initialPalette.rimLightColor) },
        uStrength: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          vLocalPos = position;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uRimColor;
        uniform float uStrength;
        uniform float uTime;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;

        void main() {
          float ndv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
          // Soft gossamer energy wave that fades smoothly at outer silhouette and interior
          float rimBand = pow(1.0 - ndv, 3.2) * smoothstep(0.0, 0.24, ndv);
          float ripple = 0.55 + 0.45 * sin(vLocalPos.y * 10.0 + vLocalPos.x * 6.0 - uTime * 3.5);
          vec3 col = mix(uColor, uRimColor, 0.38);
          float alpha = rimBand * ripple * uStrength * 0.34;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(col * 1.25, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    materialsToDispose.push(waveMat);

    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    waveMesh.visible = false;
    waveMesh.name = `ResonanceWave_${i}`;
    group.add(waveMesh);
    waveMeshes.push(waveMesh);
  }

  const targetObsidian = new THREE.Color();
  const targetArmor = new THREE.Color();
  const targetDeep = new THREE.Color();
  const targetCore = new THREE.Color();
  const targetRim = new THREE.Color();
  const targetInlay = new THREE.Color();

  const applySpectrum = (palette: SpectrumPalette, blendAlpha = 1.0) => {
    targetObsidian.set(palette.obsidianBase);
    targetArmor.set(palette.armorMetal);
    targetDeep.set(palette.fissureDeep);
    targetCore.set(palette.fissureCore);
    targetRim.set(palette.rimLightColor);
    targetInlay.set(palette.ringInlay);

    coreUniforms.uObsidianColor.value.lerp(targetObsidian, blendAlpha);
    coreUniforms.uFissureDeep.value.lerp(targetDeep, blendAlpha);
    coreUniforms.uFissureCore.value.lerp(targetCore, blendAlpha);
    coreUniforms.uRimColor.value.lerp(targetRim, blendAlpha);

    coreMat.color.lerp(targetObsidian, blendAlpha);
    armorMaterial.color.lerp(targetArmor, blendAlpha);
    collarMaterial.color.lerp(targetArmor, blendAlpha);
    collarMaterial.emissive.lerp(targetInlay, blendAlpha);
    accentGemMaterial.color.lerp(targetCore, blendAlpha);
    accentGemMaterial.emissive.lerp(targetCore, blendAlpha);

    coronaUniforms.uGlowColor.value.lerp(targetCore, blendAlpha);
    coronaUniforms.uRimColor.value.lerp(targetRim, blendAlpha);

    for (const wm of waveMeshes) {
      const mat = wm.material as THREE.ShaderMaterial;
      mat.uniforms.uColor.value.lerp(targetCore, blendAlpha);
      mat.uniforms.uRimColor.value.lerp(targetRim, blendAlpha);
    }
  };

  // Verify initial colors
  const _check = hexToRgbNormalized(initialPalette.fissureCore);
  void _check;

  const update = (
    elapsed: number,
    dt: number,
    energy: number,
    pulseBoost: number,
    shockwaves: { active: boolean; radius: number; strength: number; maxRadius: number }[],
  ) => {
    coreUniforms.uTime.value = elapsed;
    coreUniforms.uEnergy.value = energy;
    coreUniforms.uPulseBoost.value = pulseBoost;

    coronaUniforms.uTime.value = elapsed;
    coronaUniforms.uEnergy.value = energy;
    coronaUniforms.uPulseBoost.value = pulseBoost;

    const rotScale = 0.35 + energy * 0.55;
    coreMesh.rotation.y += dt * 0.08 * rotScale;
    coreMesh.rotation.x = Math.sin(elapsed * 0.16) * 0.06;

    collarMesh.rotation.y -= dt * 0.14 * rotScale;
    ribsGroup.rotation.y += dt * 0.05 * rotScale;

    collarMaterial.emissiveIntensity = 0.45 + energy * 0.32 + pulseBoost * 0.65;
    accentGemMaterial.emissiveIntensity = 0.9 + energy * 0.5 + pulseBoost * 0.8;

    for (let i = 0; i < waveMeshes.length; i++) {
      const w = shockwaves[i];
      const wm = waveMeshes[i];
      if (!w || !w.active) {
        wm.visible = false;
        continue;
      }
      wm.visible = true;
      wm.scale.setScalar(w.radius);
      const mat = wm.material as THREE.ShaderMaterial;
      mat.uniforms.uStrength.value = w.strength;
      mat.uniforms.uTime.value = elapsed;
    }
  };

  return {
    group,
    coreUniforms,
    coronaUniforms,
    armorMaterial,
    collarMaterial,
    accentGemMaterial,
    waveMeshes,
    update,
    applySpectrum,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    },
  };
}
