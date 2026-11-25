import * as THREE from 'three';
import {
  MAX_SHOCKWAVES,
  SpectrumPalette,
  generateParticleBuffers,
} from '../core/spectra';

export interface ParticleSystemAssembly {
  points: THREE.Points;
  totalCount: number;
  update: (
    elapsed: number,
    pixelRatio: number,
    viewportHeight: number,
    focusDistance: number,
    energy: number,
    mouseWorld: THREE.Vector3,
    mouseVelocity: THREE.Vector3,
    mouseActive: number,
    shockwaves: { active: boolean; radius: number; strength: number }[],
  ) => void;
  applySpectrum: (palette: SpectrumPalette, blendAlpha?: number) => void;
  dispose: () => void;
}

export function createParticleSystem(initialPalette: SpectrumPalette): ParticleSystemAssembly {
  const buffers = generateParticleBuffers();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('aParams', new THREE.BufferAttribute(buffers.attributesA, 4));
  geometry.setAttribute('aMeta', new THREE.BufferAttribute(buffers.attributesB, 4));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uViewportHeight: { value: 900 },
    uFocusDistance: { value: 11.5 },
    uEnergy: { value: 1.0 },
    uMouseWorld: { value: new THREE.Vector3(0, 0, 0) },
    uMouseVel: { value: new THREE.Vector3(0, 0, 0) },
    uMouseActive: { value: 0 },
    uWaveRadii: { value: new THREE.Vector3(0, 0, 0) },
    uWaveStrengths: { value: new THREE.Vector3(0, 0, 0) },
    uColorInner: { value: new THREE.Color(initialPalette.particleInner) },
    uColorMid: { value: new THREE.Color(initialPalette.particleMid) },
    uColorOuter: { value: new THREE.Color(initialPalette.particleOuter) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aParams; // x: baseSize, y: phase, z: layerType, w: orbitalSpeedScale
      attribute vec4 aMeta;   // x: radialMix, y: colorSeed, z: verticalSpread/ringIdx, w: brightness

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uViewportHeight;
      uniform float uFocusDistance;
      uniform float uEnergy;
      uniform vec3 uMouseWorld;
      uniform vec3 uMouseVel;
      uniform float uMouseActive;
      uniform vec3 uWaveRadii;
      uniform vec3 uWaveStrengths;

      varying float vRadialMix;
      varying float vColorSeed;
      varying float vLayerType;
      varying float vBrightness;
      varying float vBlurFactor;
      varying float vExcitation;

      mat3 rotateAxisY(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat3(
          c, 0.0, s,
          0.0, 1.0, 0.0,
          -s, 0.0, c
        );
      }

      void main() {
        float baseSize = aParams.x;
        float phase = aParams.y;
        float layerType = aParams.z;
        float speedScale = aParams.w;

        vec3 pos = position;
        float spinRate = (0.28 + uEnergy * 0.36);

        if (layerType < 0.5) {
          // Spiral accretion stardust disk: differential Keplerian rotation + subtle vertical breathing
          float angle = uTime * speedScale * spinRate;
          pos = rotateAxisY(angle) * pos;
          pos.y += sin(uTime * 0.8 + phase) * 0.06 * (0.4 + uEnergy * 0.6);
        } else if (layerType < 1.8) {
          // Orbital light streams aligned to the 3 tilted ring planes
          // Gently rotate around core origin with subtle helical flutter
          float angle = uTime * speedScale * (0.65 + uEnergy * 0.55);
          vec3 axis = normalize(vec3(
            sin(layerType * 7.3),
            1.0,
            cos(layerType * 5.1)
          ));
          // Rodrigues rotation
          float c = cos(angle * 0.25);
          float s = sin(angle * 0.25);
          pos = pos * c + cross(axis, pos) * s + axis * dot(axis, pos) * (1.0 - c);
          pos += normalize(pos) * sin(uTime * 2.2 + phase) * 0.035;
        } else {
          // Deep parallax starfield: ultra-slow celestial drift
          float angle = uTime * speedScale * 0.18;
          pos = rotateAxisY(angle) * pos;
        }

        float excitation = 0.0;

        // Interactive Mouse 3D Perturbation (repulsion + tangential vortex swirl + luminance)
        if (uMouseActive > 0.01 && layerType < 1.8) {
          vec3 toParticle = pos - uMouseWorld;
          float mDist = length(toParticle);
          float influenceRadius = 3.2;
          if (mDist < influenceRadius && mDist > 0.001) {
            float falloff = pow(1.0 - mDist / influenceRadius, 2.0) * uMouseActive;
            vec3 pushDir = toParticle / mDist;
            // Swirl perpendicular to camera/up vector + mouse velocity drag
            vec3 swirlDir = normalize(cross(pushDir, vec3(0.0, 1.0, 0.25)) + vec3(0.0001));
            pos += pushDir * falloff * 0.95;
            pos += swirlDir * falloff * (0.85 + length(uMouseVel) * 0.45);
            pos += uMouseVel * falloff * 0.35;
            excitation += falloff * 1.15;
          }
        }

        // Expanding 3D Resonance Shockwaves (up to 3 simultaneous pulses)
        float distFromCore = length(pos);
        vec3 radialDir = distFromCore > 0.001 ? pos / distFromCore : vec3(0.0, 1.0, 0.0);

        for (int i = 0; i < 3; i++) {
          float wRad = i == 0 ? uWaveRadii.x : (i == 1 ? uWaveRadii.y : uWaveRadii.z);
          float wStr = i == 0 ? uWaveStrengths.x : (i == 1 ? uWaveStrengths.y : uWaveStrengths.z);
          if (wStr > 0.005) {
            float bandDist = abs(distFromCore - wRad);
            float waveBand = exp(-(bandDist * bandDist) / 1.45) * wStr;
            pos += radialDir * waveBand * (layerType < 1.8 ? 0.92 : 0.22);
            excitation += waveBand * 1.45;
          }
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float viewDepth = max(0.35, -mvPosition.z);

        // True Depth of Field (DOF) Bokeh:
        // Near particles (< focusDistance) expand into soft blurred circles;
        // Far stars remain crisp pinpoints.
        float signedDefocus = (uFocusDistance - viewDepth);
        float nearDefocus = clamp(signedDefocus / (uFocusDistance * 0.65), 0.0, 1.0);
        float farDefocus = clamp((-signedDefocus) / 38.0, 0.0, 0.55);
        float blurFactor = layerType > 1.5 ? 0.04 : clamp(nearDefocus * 1.15 + farDefocus * 0.35, 0.0, 1.0);

        float dofScale = 1.0 + nearDefocus * 3.4;
        float shimmer = 0.85 + 0.15 * sin(uTime * (1.2 + aParams.w) + phase);
        float pointSize = baseSize * dofScale * (1.0 + excitation * 0.55) * (uViewportHeight * 0.0175) * uPixelRatio / viewDepth;

        // Clamp starfield min/max so distant stars remain sharp cosmic dust
        float minPx = layerType > 1.5 ? 1.0 * uPixelRatio : 1.35 * uPixelRatio;
        float maxPx = layerType > 1.5 ? 3.5 * uPixelRatio : 38.0 * uPixelRatio;

        gl_PointSize = clamp(pointSize * shimmer, minPx, maxPx);
        gl_Position = projectionMatrix * mvPosition;

        vRadialMix = aMeta.x;
        vColorSeed = aMeta.y;
        vLayerType = layerType;
        vBrightness = aMeta.w;
        vBlurFactor = blurFactor;
        vExcitation = clamp(excitation, 0.0, 1.5);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorInner;
      uniform vec3 uColorMid;
      uniform vec3 uColorOuter;
      uniform float uEnergy;

      varying float vRadialMix;
      varying float vColorSeed;
      varying float vLayerType;
      varying float vBrightness;
      varying float vBlurFactor;
      varying float vExcitation;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv) * 2.0;
        if (d > 1.0) discard;

        // Sharp core for in-focus / distant stars; creamy bokeh disc for near out-of-focus dust
        float sharpness = mix(0.3, 0.92, vBlurFactor);
        float coreFalloff = 1.0 - smoothstep(0.0, sharpness, d);
        float softHalo = pow(1.0 - d, mix(2.4, 1.3, vBlurFactor));
        float shapeAlpha = mix(coreFalloff * 0.8 + softHalo * 0.5, softHalo * 0.58, vBlurFactor);

        // Spectral color gradient across radial distance + organic tint variance
        vec3 baseCol = mix(uColorInner, uColorMid, smoothstep(0.0, 0.48, vRadialMix));
        baseCol = mix(baseCol, uColorOuter, smoothstep(0.32, 1.0, vRadialMix) * (0.55 + 0.45 * vColorSeed));

        if (vLayerType > 1.5) {
          // Deep stars: cool-white / pale astral tint
          baseCol = mix(baseCol, vec3(0.86, 0.92, 1.0), 0.58 + 0.35 * vColorSeed);
        }

        // Excitation boosts toward luminous spectral core color without hard clipping
        vec3 excitedCol = mix(baseCol, uColorInner * 1.35 + vec3(0.18), clamp(vExcitation * 0.7, 0.0, 1.0));

        float energyAlpha = 0.78 + uEnergy * 0.28;
        // Out-of-focus near bokeh particles have softer translucent opacity
        float dofOpacityAtten = mix(1.0, 0.48, vBlurFactor);
        float layerOpacity = vLayerType > 1.5 ? 0.88 : (vLayerType > 0.5 ? 0.84 : 0.74);
        float alpha = shapeAlpha * vBrightness * layerOpacity * energyAlpha * dofOpacityAtten * (1.0 + vExcitation * 0.85);

        gl_FragColor = vec4(excitedCol * (1.08 + vExcitation * 0.42), clamp(alpha, 0.0, 0.92));
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'CosmicStardustField';
  points.frustumCulled = false;

  const targetInner = new THREE.Color();
  const targetMid = new THREE.Color();
  const targetOuter = new THREE.Color();

  const applySpectrum = (palette: SpectrumPalette, blendAlpha = 1.0) => {
    targetInner.set(palette.particleInner);
    targetMid.set(palette.particleMid);
    targetOuter.set(palette.particleOuter);

    uniforms.uColorInner.value.lerp(targetInner, blendAlpha);
    uniforms.uColorMid.value.lerp(targetMid, blendAlpha);
    uniforms.uColorOuter.value.lerp(targetOuter, blendAlpha);
  };

  const update = (
    elapsed: number,
    pixelRatio: number,
    viewportHeight: number,
    focusDistance: number,
    energy: number,
    mouseWorld: THREE.Vector3,
    mouseVelocity: THREE.Vector3,
    mouseActive: number,
    shockwaves: { active: boolean; radius: number; strength: number }[],
  ) => {
    uniforms.uTime.value = elapsed;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uViewportHeight.value = viewportHeight;
    uniforms.uFocusDistance.value = focusDistance;
    uniforms.uEnergy.value = energy;
    uniforms.uMouseWorld.value.copy(mouseWorld);
    uniforms.uMouseVel.value.copy(mouseVelocity);
    uniforms.uMouseActive.value = mouseActive;

    const r = uniforms.uWaveRadii.value;
    const s = uniforms.uWaveStrengths.value;
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const w = shockwaves[i];
      const rad = w && w.active ? w.radius : 0;
      const str = w && w.active ? w.strength : 0;
      if (i === 0) {
        r.x = rad;
        s.x = str;
      } else if (i === 1) {
        r.y = rad;
        s.y = str;
      } else {
        r.z = rad;
        s.z = str;
      }
    }
  };

  return {
    points,
    totalCount: buffers.totalCount,
    update,
    applySpectrum,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
