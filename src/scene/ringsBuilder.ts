import * as THREE from 'three';
import { RING_CONFIGS, SpectrumPalette } from '../core/spectra';
import { ProceduralTextureSet } from './textures';

export interface RingsAssembly {
  group: THREE.Group;
  update: (dt: number, energy: number, pulseBoost: number) => void;
  applySpectrum: (palette: SpectrumPalette, blendAlpha?: number) => void;
  dispose: () => void;
}

interface RingSpec {
  radius: number;
  width: number;
  thickness: number;
  segmentCount: number;
  gapAngle: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  speed: number;
  hasInnerRail: boolean;
}

const RING_SPECS: RingSpec[] = [
  {
    ...RING_CONFIGS[0],
    width: 0.21,
    thickness: 0.054,
    segmentCount: 3,
    gapAngle: 0.26,
    hasInnerRail: true,
  },
  {
    ...RING_CONFIGS[1],
    width: 0.26,
    thickness: 0.064,
    segmentCount: 4,
    gapAngle: 0.21,
    hasInnerRail: true,
  },
  {
    ...RING_CONFIGS[2],
    width: 0.15,
    thickness: 0.04,
    segmentCount: 5,
    gapAngle: 0.17,
    hasInnerRail: false,
  },
];

function createBeveledBandSegmentGeometry(
  radius: number,
  width: number,
  thickness: number,
  phiStart: number,
  phiLength: number,
  tubularSegments = 64,
): THREE.BufferGeometry {
  // LatheGeometry revolves around Y axis; profile points define radial cross-section
  const hw = width * 0.5;
  const ht = thickness * 0.5;
  const bevel = Math.min(width, thickness) * 0.28;

  const profile: THREE.Vector2[] = [
    new THREE.Vector2(radius - ht + bevel * 0.6, -hw),
    new THREE.Vector2(radius + ht - bevel * 0.6, -hw),
    new THREE.Vector2(radius + ht, -hw + bevel),
    new THREE.Vector2(radius + ht, -hw * 0.22),
    // Recessed central channel
    new THREE.Vector2(radius + ht * 0.65, -hw * 0.16),
    new THREE.Vector2(radius + ht * 0.65, hw * 0.16),
    new THREE.Vector2(radius + ht, hw * 0.22),
    new THREE.Vector2(radius + ht, hw - bevel),
    new THREE.Vector2(radius + ht - bevel * 0.6, hw),
    new THREE.Vector2(radius - ht + bevel * 0.6, hw),
    new THREE.Vector2(radius - ht, hw - bevel),
    new THREE.Vector2(radius - ht, -hw + bevel),
    new THREE.Vector2(radius - ht + bevel * 0.6, -hw),
  ];

  const geo = new THREE.LatheGeometry(profile, tubularSegments, phiStart, phiLength);
  geo.computeVertexNormals();
  return geo;
}

export function createRingsAssembly(
  initialPalette: SpectrumPalette,
  textures: ProceduralTextureSet,
): RingsAssembly {
  const group = new THREE.Group();
  group.name = 'CelestialOrbitalRings';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  // 1. Primary Engraved Dark Metallic Ring Material (anisotropic brushed + bump + glowing inlay)
  const mainRingMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPalette.ringMetal),
    metalness: 0.94,
    roughness: 0.28,
    anisotropy: 0.8,
    anisotropyRotation: Math.PI * 0.5,
    bumpMap: textures.ringBumpMap,
    bumpScale: 0.018,
    roughnessMap: textures.ringRoughnessMap,
    emissive: new THREE.Color(initialPalette.ringInlay),
    emissiveMap: textures.ringEmissiveMask,
    emissiveIntensity: 0.62,
    envMapIntensity: 1.35,
  });
  materialsToDispose.push(mainRingMat);

  // 2. Crisp Polished Bevel Trim / End-Cap Material (higher polish contrast)
  const trimMetalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPalette.armorMetal).lerp(new THREE.Color('#64748b'), 0.3),
    metalness: 0.96,
    roughness: 0.15,
    clearcoat: 0.4,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.5,
  });
  materialsToDispose.push(trimMetalMat);

  // 3. Glowing Node Gem / Inlay Accent Material
  const nodeGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialPalette.ringInlay),
    emissive: new THREE.Color(initialPalette.ringInlay),
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.15,
  });
  materialsToDispose.push(nodeGlowMat);

  const capGeo = new THREE.BoxGeometry(0.11, 0.24, 0.085);
  const nodeHousingGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.09, 8);
  const nodeGemGeo = new THREE.OctahedronGeometry(0.036, 0);
  geometriesToDispose.push(capGeo, nodeHousingGeo, nodeGemGeo);

  const ringRotators: { pivot: THREE.Group; speed: number; baseTiltX: number; baseTiltZ: number }[] = [];

  RING_SPECS.forEach((spec, ringIdx) => {
    // Tilt container establishes fixed inclination plane
    const tiltFrame = new THREE.Group();
    tiltFrame.name = `OrbitalRingFrame_${ringIdx}`;
    tiltFrame.rotation.set(spec.tiltX, spec.tiltY, spec.tiltZ);

    // Spinner rotates around local Y (the ring's normal axis)
    const spinner = new THREE.Group();
    spinner.name = `OrbitalRingSpinner_${ringIdx}`;
    tiltFrame.add(spinner);

    const sectorAngle = (Math.PI * 2) / spec.segmentCount;
    const arcLen = sectorAngle - spec.gapAngle;

    for (let s = 0; s < spec.segmentCount; s++) {
      const phiStart = s * sectorAngle + spec.gapAngle * 0.5;
      const segGeo = createBeveledBandSegmentGeometry(
        spec.radius,
        spec.width,
        spec.thickness,
        phiStart,
        arcLen,
        Math.max(36, Math.floor(140 / spec.segmentCount)),
      );
      geometriesToDispose.push(segGeo);

      const segMesh = new THREE.Mesh(segGeo, mainRingMat);
      segMesh.castShadow = true;
      segMesh.receiveShadow = true;
      spinner.add(segMesh);

      // Add architectural fracture end-caps at both ends of each broken arc
      // Note: LatheGeometry angles: x = r * sin(phi), z = r * cos(phi)
      const capAngles = [phiStart, phiStart + arcLen];
      for (const a of capAngles) {
        const capMesh = new THREE.Mesh(capGeo, trimMetalMat);
        capMesh.position.set(Math.sin(a) * spec.radius, 0, Math.cos(a) * spec.radius);
        capMesh.rotation.y = a + Math.PI * 0.5;
        capMesh.scale.set(
          spec.thickness * 12.5,
          spec.width * 4.5,
          0.65,
        );
        spinner.add(capMesh);
      }

      // Add precision node medallion halfway along each arc segment
      const midAngle = phiStart + arcLen * 0.5;
      const housing = new THREE.Mesh(nodeHousingGeo, trimMetalMat);
      housing.position.set(
        Math.sin(midAngle) * (spec.radius + spec.thickness * 0.55),
        0,
        Math.cos(midAngle) * (spec.radius + spec.thickness * 0.55),
      );
      housing.rotation.z = Math.PI * 0.5;
      housing.rotation.y = midAngle - Math.PI * 0.5;
      spinner.add(housing);

      const gem = new THREE.Mesh(nodeGemGeo, nodeGlowMat);
      gem.position.set(
        Math.sin(midAngle) * (spec.radius + spec.thickness * 0.95),
        0,
        Math.cos(midAngle) * (spec.radius + spec.thickness * 0.95),
      );
      spinner.add(gem);
    }

    // Inner precision guide rail (continuous slender metallic hoop)
    if (spec.hasInnerRail) {
      const railGeo = new THREE.TorusGeometry(
        spec.radius - spec.thickness * 1.15,
        0.014,
        12,
        128,
      );
      railGeo.rotateX(Math.PI * 0.5);
      geometriesToDispose.push(railGeo);

      const railMesh = new THREE.Mesh(railGeo, trimMetalMat);
      spinner.add(railMesh);
    }

    // Outer razor rim thread for crisp specular contour catching
    const outerThreadGeo = new THREE.TorusGeometry(
      spec.radius + spec.thickness * 0.52,
      0.008,
      8,
      144,
    );
    outerThreadGeo.rotateX(Math.PI * 0.5);
    geometriesToDispose.push(outerThreadGeo);

    const outerThreadMesh = new THREE.Mesh(outerThreadGeo, trimMetalMat);
    outerThreadMesh.position.y = spec.width * 0.42;
    spinner.add(outerThreadMesh);

    const outerThreadBottom = new THREE.Mesh(outerThreadGeo, trimMetalMat);
    outerThreadBottom.position.y = -spec.width * 0.42;
    spinner.add(outerThreadBottom);

    group.add(tiltFrame);
    ringRotators.push({
      pivot: spinner,
      speed: spec.speed,
      baseTiltX: spec.tiltX,
      baseTiltZ: spec.tiltZ,
    });
  });

  const targetMetal = new THREE.Color();
  const targetInlay = new THREE.Color();
  const targetTrim = new THREE.Color();
  const slateHighlight = new THREE.Color('#78879e');

  const applySpectrum = (palette: SpectrumPalette, blendAlpha = 1.0) => {
    targetMetal.set(palette.ringMetal);
    targetInlay.set(palette.ringInlay);
    targetTrim.set(palette.armorMetal).lerp(slateHighlight, 0.34);

    mainRingMat.color.lerp(targetMetal, blendAlpha);
    mainRingMat.emissive.lerp(targetInlay, blendAlpha);
    trimMetalMat.color.lerp(targetTrim, blendAlpha);
    nodeGlowMat.color.lerp(targetInlay, blendAlpha);
    nodeGlowMat.emissive.lerp(targetInlay, blendAlpha);
  };

  const update = (dt: number, energy: number, pulseBoost: number) => {
    const speedFactor = 0.45 + energy * 0.65;
    for (let i = 0; i < ringRotators.length; i++) {
      const r = ringRotators[i];
      r.pivot.rotation.y += dt * r.speed * speedFactor;
    }
    mainRingMat.emissiveIntensity = 0.52 + energy * 0.34 + pulseBoost * 0.7;
    nodeGlowMat.emissiveIntensity = 1.05 + energy * 0.45 + pulseBoost * 0.85;
  };

  return {
    group,
    update,
    applySpectrum,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    },
  };
}
