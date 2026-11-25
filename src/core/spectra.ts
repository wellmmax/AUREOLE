export type SpectrumId = 'molten-gold' | 'ice-blue' | 'crimson';

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface SpectrumPalette {
  id: SpectrumId;
  label: string;
  englishLabel: string;
  accentHex: string;
  swatchHex: string;
  obsidianBase: string;
  armorMetal: string;
  fissureDeep: string;
  fissureCore: string;
  keyLightColor: string;
  rimLightColor: string;
  nebulaPrimary: string;
  nebulaSecondary: string;
  ringMetal: string;
  ringInlay: string;
  particleInner: string;
  particleMid: string;
  particleOuter: string;
  fogColor: string;
}

export const SPECTRA: Record<SpectrumId, SpectrumPalette> = {
  'molten-gold': {
    id: 'molten-gold',
    label: '熔金',
    englishLabel: 'Molten Gold',
    accentHex: '#f0b354',
    swatchHex: '#f59e0b',
    obsidianBase: '#0b0e16',
    armorMetal: '#19202e',
    fissureDeep: '#b84308',
    fissureCore: '#ffbe55',
    keyLightColor: '#ffbe66',
    rimLightColor: '#38bdf8',
    nebulaPrimary: '#0c1f3d',
    nebulaSecondary: '#2c190e',
    ringMetal: '#262d3d',
    ringInlay: '#f2b14c',
    particleInner: '#ffd078',
    particleMid: '#e38736',
    particleOuter: '#5cc8ea',
    fogColor: '#030712',
  },
  'ice-blue': {
    id: 'ice-blue',
    label: '冰蓝',
    englishLabel: 'Glacial Cyan',
    accentHex: '#67d8f7',
    swatchHex: '#38bdf8',
    obsidianBase: '#080e19',
    armorMetal: '#162236',
    fissureDeep: '#0c5f99',
    fissureCore: '#7ee3ff',
    keyLightColor: '#8ee6ff',
    rimLightColor: '#818cf8',
    nebulaPrimary: '#0b2242',
    nebulaSecondary: '#161b3a',
    ringMetal: '#222d40',
    ringInlay: '#63d5f7',
    particleInner: '#98ecff',
    particleMid: '#3b9be8',
    particleOuter: '#a5b4fc',
    fogColor: '#030814',
  },
  crimson: {
    id: 'crimson',
    label: '绯红',
    englishLabel: 'Astral Crimson',
    accentHex: '#f45d75',
    swatchHex: '#f43f5e',
    obsidianBase: '#110a10',
    armorMetal: '#241822',
    fissureDeep: '#991034',
    fissureCore: '#ff6b81',
    keyLightColor: '#ff7086',
    rimLightColor: '#56b4e9',
    nebulaPrimary: '#240e1f',
    nebulaSecondary: '#0d1b36',
    ringMetal: '#2a202a',
    ringInlay: '#f44a67',
    particleInner: '#ff8093',
    particleMid: '#c43452',
    particleOuter: '#68a6e6',
    fogColor: '#050610',
  },
};

export const SPECTRUM_ORDER: SpectrumId[] = ['molten-gold', 'ice-blue', 'crimson'];

export interface RingInclination {
  radius: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  speed: number;
}

export const RING_CONFIGS: readonly RingInclination[] = [
  { radius: 2.52, tiltX: 0.52, tiltY: 0.14, tiltZ: -0.34, speed: 0.14 },
  { radius: 3.55, tiltX: -0.64, tiltY: 0.36, tiltZ: 0.48, speed: -0.095 },
  { radius: 4.65, tiltX: 0.24, tiltY: -0.31, tiltZ: -0.76, speed: 0.062 },
];

export interface ShockwaveState {
  active: boolean;
  radius: number;
  strength: number;
  age: number;
  maxRadius: number;
}

export const MAX_SHOCKWAVES = 3;

export function createInitialShockwaves(): ShockwaveState[] {
  return Array.from({ length: MAX_SHOCKWAVES }, () => ({
    active: false,
    radius: 0,
    strength: 0,
    age: 0,
    maxRadius: 24,
  }));
}

export function triggerShockwave(
  waves: ShockwaveState[],
  initialStrength = 1.0,
  maxRadius = 24,
): ShockwaveState[] {
  let targetIdx = waves.findIndex((w) => !w.active);
  if (targetIdx === -1) {
    // Reuse oldest wave
    let oldestAge = -1;
    for (let i = 0; i < waves.length; i++) {
      if (waves[i].age > oldestAge) {
        oldestAge = waves[i].age;
        targetIdx = i;
      }
    }
  }
  return waves.map((w, idx) =>
    idx === targetIdx
      ? {
          active: true,
          radius: 1.45,
          strength: Math.max(0.2, Math.min(2.0, initialStrength)),
          age: 0,
          maxRadius,
        }
      : w,
  );
}

export function stepShockwaves(
  waves: ShockwaveState[],
  dt: number,
  energy = 1.0,
): ShockwaveState[] {
  if (dt <= 0) return waves;
  const speed = 7.2 + energy * 3.0;
  return waves.map((w) => {
    if (!w.active) return w;
    const nextAge = w.age + dt;
    const nextRadius = w.radius + speed * dt;
    const progress = nextRadius / w.maxRadius;
    if (progress >= 1.0) {
      return { ...w, active: false, radius: 0, strength: 0, age: 0 };
    }
    const attenuation = Math.pow(1 - progress, 1.35);
    return {
      ...w,
      age: nextAge,
      radius: nextRadius,
      strength: attenuation,
    };
  });
}

export function hexToRgbNormalized(hex: string): RgbTuple {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export function lerpNumber(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return a + (b - a) * clamped;
}

export function dampValue(current: number, target: number, lambda: number, dt: number): number {
  const alpha = 1 - Math.exp(-lambda * Math.max(0, dt));
  return current + (target - current) * alpha;
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParticleBufferSet {
  totalCount: number;
  diskCount: number;
  streamCount: number;
  starCount: number;
  positions: Float32Array;
  // x: baseSize, y: phaseOffset, z: layerType (0=disk, 1=stream, 2=star), w: orbitalSpeedScale
  attributesA: Float32Array;
  // x: radialMix (0..1), y: colorSeed (0..1), z: verticalSpread, w: brightnessWeight
  attributesB: Float32Array;
}

export const DEFAULT_PARTICLE_COUNTS = {
  disk: 46_000,
  stream: 20_000,
  star: 14_000,
} as const;

function rotateEulerXYZ(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
): [number, number, number] {
  // Rotate X
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const x1 = x;

  // Rotate Y
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  // Rotate Z
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x3 = x2 * cz - y2 * sz;
  const y3 = x2 * sz + y2 * cz;
  const z3 = z2;

  return [x3, y3, z3];
}

export function generateParticleBuffers(
  diskCount = DEFAULT_PARTICLE_COUNTS.disk,
  streamCount = DEFAULT_PARTICLE_COUNTS.stream,
  starCount = DEFAULT_PARTICLE_COUNTS.star,
  seed = 20261124,
): ParticleBufferSet {
  const totalCount = diskCount + streamCount + starCount;
  const positions = new Float32Array(totalCount * 3);
  const attributesA = new Float32Array(totalCount * 4);
  const attributesB = new Float32Array(totalCount * 4);
  const rng = createSeededRng(seed);

  const gaussian = () => {
    const u1 = Math.max(1e-6, rng());
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  let idx = 0;

  // 1. Spiral Accretion Stardust Disk (3 logarithmic arms + diffuse halo)
  const armCount = 3;
  for (let i = 0; i < diskCount; i++) {
    const rNorm = Math.pow(rng(), 0.78);
    const radius = 2.05 + rNorm * 13.5;
    const armIndex = i % armCount;
    const armBaseAngle = (armIndex / armCount) * Math.PI * 2;
    const spiralTwist = Math.log(radius * 0.65 + 1.0) * 2.55;
    const armSpread = gaussian() * (0.24 + rNorm * 0.45);
    const angle = armBaseAngle + spiralTwist + armSpread;

    // Disk tilt slightly pitched for dramatic 3/4 view
    const localX = Math.cos(angle) * radius;
    const localZ = Math.sin(angle) * radius;
    const thickness = 0.14 + rNorm * 0.72;
    const localY = gaussian() * thickness * 0.48;

    const [px, py, pz] = rotateEulerXYZ(localX, localY, localZ, 0.12, 0.0, -0.09);

    const i3 = idx * 3;
    const i4 = idx * 4;
    positions[i3] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;

    const size = 0.65 + Math.pow(rng(), 2.2) * 2.6;
    const phase = rng() * Math.PI * 2;
    const orbitalScale = 1.0 / Math.pow(Math.max(1.8, radius), 0.72);

    attributesA[i4] = size;
    attributesA[i4 + 1] = phase;
    attributesA[i4 + 2] = 0.0; // Disk layer
    attributesA[i4 + 3] = orbitalScale;

    attributesB[i4] = Math.min(1.0, (radius - 2.05) / 13.5);
    attributesB[i4 + 1] = rng();
    attributesB[i4 + 2] = localY;
    attributesB[i4 + 3] = 0.42 + rng() * 0.58;
    idx++;
  }

  // 2. Orbital Light Streams (aligned with the 3 tilted metallic rings)
  for (let i = 0; i < streamCount; i++) {
    const ringIdx = i % RING_CONFIGS.length;
    const ring = RING_CONFIGS[ringIdx];
    const angle = rng() * Math.PI * 2;
    const radialJitter = gaussian() * 0.16;
    const radius = ring.radius + radialJitter;
    const verticalJitter = gaussian() * 0.075;

    const lx = Math.cos(angle) * radius;
    const ly = verticalJitter;
    const lz = Math.sin(angle) * radius;

    const [px, py, pz] = rotateEulerXYZ(lx, ly, lz, ring.tiltX, ring.tiltY, ring.tiltZ);

    const i3 = idx * 3;
    const i4 = idx * 4;
    positions[i3] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;

    attributesA[i4] = 0.75 + Math.pow(rng(), 2.4) * 2.1;
    attributesA[i4 + 1] = rng() * Math.PI * 2;
    attributesA[i4 + 2] = 1.0 + ringIdx * 0.1; // Stream layer encoded with ring index
    attributesA[i4 + 3] = ring.speed * (1.2 + rng() * 0.6);

    attributesB[i4] = 0.15 + ringIdx * 0.3;
    attributesB[i4 + 1] = rng();
    attributesB[i4 + 2] = ringIdx;
    attributesB[i4 + 3] = 0.65 + rng() * 0.35;
    idx++;
  }

  // 3. Deep-Space Parallax Starfield & Distant Clusters
  for (let i = 0; i < starCount; i++) {
    const u = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const sinTheta = Math.sqrt(Math.max(0, 1 - u * u));
    const radius = 15 + Math.pow(rng(), 0.65) * 58;

    const px = radius * sinTheta * Math.cos(phi);
    const py = radius * u * 0.82;
    const pz = radius * sinTheta * Math.sin(phi);

    const i3 = idx * 3;
    const i4 = idx * 4;
    positions[i3] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;

    attributesA[i4] = 0.4 + Math.pow(rng(), 3.0) * 1.9;
    attributesA[i4 + 1] = rng() * Math.PI * 2;
    attributesA[i4 + 2] = 2.0; // Starfield layer
    attributesA[i4 + 3] = 0.015 + rng() * 0.025;

    attributesB[i4] = 0.7 + rng() * 0.3;
    attributesB[i4 + 1] = rng();
    attributesB[i4 + 2] = 0.0;
    attributesB[i4 + 3] = 0.35 + rng() * 0.65;
    idx++;
  }

  return {
    totalCount,
    diskCount,
    streamCount,
    starCount,
    positions,
    attributesA,
    attributesB,
  };
}
