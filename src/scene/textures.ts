import * as THREE from 'three';

export interface ProceduralTextureSet {
  ringBumpMap: THREE.CanvasTexture;
  ringRoughnessMap: THREE.CanvasTexture;
  ringEmissiveMask: THREE.CanvasTexture;
  armorBumpMap: THREE.CanvasTexture;
  armorRoughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.max(1, Math.min(16, maxAnisotropy));

  // 1. Astrolabe Ring Engraving Map (1024 x 256 seamless horizontal strip)
  const ringBumpCanvas = document.createElement('canvas');
  ringBumpCanvas.width = 1024;
  ringBumpCanvas.height = 256;
  const rbCtx = ringBumpCanvas.getContext('2d')!;

  rbCtx.fillStyle = '#808080';
  rbCtx.fillRect(0, 0, 1024, 256);

  // Subtle brushed metal horizontal grain
  for (let y = 0; y < 256; y += 2) {
    const shade = 122 + Math.floor(Math.sin(y * 0.7) * 8 + ((y * 37) % 11) - 5);
    rbCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    rbCtx.fillRect(0, y, 1024, 1);
  }

  // Twin recessed precision grooves
  rbCtx.fillStyle = '#2c2c2c';
  rbCtx.fillRect(0, 62, 1024, 10);
  rbCtx.fillRect(0, 184, 1024, 10);

  // Central recessed glowing inlay channel
  rbCtx.fillStyle = '#181818';
  rbCtx.fillRect(0, 122, 1024, 12);

  // Precision astrolabe degree ticks & astronomical glyphs
  for (let i = 0; i < 128; i++) {
    const x = (i / 128) * 1024;
    const isMajor = i % 8 === 0;
    const isMid = i % 4 === 0;
    rbCtx.fillStyle = isMajor ? '#dcdcdc' : isMid ? '#a8a8a8' : '#585858';
    const h = isMajor ? 34 : isMid ? 22 : 12;
    rbCtx.fillRect(x, 22, isMajor ? 3 : 2, h);
    rbCtx.fillRect(x, 234 - h, isMajor ? 3 : 2, h);

    if (isMajor) {
      // Engraved diamond notch along outer band
      rbCtx.save();
      rbCtx.translate(x + 32, 95);
      rbCtx.rotate(Math.PI / 4);
      rbCtx.fillStyle = '#303030';
      rbCtx.fillRect(-6, -6, 12, 12);
      rbCtx.restore();
    }
  }

  const ringBumpMap = new THREE.CanvasTexture(ringBumpCanvas);
  ringBumpMap.wrapS = THREE.RepeatWrapping;
  ringBumpMap.wrapT = THREE.ClampToEdgeWrapping;
  ringBumpMap.repeat.set(4, 1);
  ringBumpMap.anisotropy = aniso;

  // 2. Ring Roughness Map (polished outer bevels, rougher recessed grooves)
  const ringRoughCanvas = document.createElement('canvas');
  ringRoughCanvas.width = 1024;
  ringRoughCanvas.height = 256;
  const rrCtx = ringRoughCanvas.getContext('2d')!;
  rrCtx.fillStyle = '#484848'; // ~0.28 base metallic roughness
  rrCtx.fillRect(0, 0, 1024, 256);

  // Polished bevel bands near top/bottom edges
  rrCtx.fillStyle = '#242424';
  rrCtx.fillRect(0, 0, 1024, 24);
  rrCtx.fillRect(0, 232, 1024, 24);

  // Matte dark recessed channels
  rrCtx.fillStyle = '#a0a0a0';
  rrCtx.fillRect(0, 62, 1024, 10);
  rrCtx.fillRect(0, 184, 1024, 10);
  rrCtx.fillRect(0, 120, 1024, 16);

  const ringRoughnessMap = new THREE.CanvasTexture(ringRoughCanvas);
  ringRoughnessMap.wrapS = THREE.RepeatWrapping;
  ringRoughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  ringRoughnessMap.repeat.set(4, 1);
  ringRoughnessMap.anisotropy = aniso;

  // 3. Ring Emissive Inlay Mask (thin crisp glowing circuit line & tick accents)
  const ringEmissiveCanvas = document.createElement('canvas');
  ringEmissiveCanvas.width = 1024;
  ringEmissiveCanvas.height = 256;
  const reCtx = ringEmissiveCanvas.getContext('2d')!;
  reCtx.fillStyle = '#000000';
  reCtx.fillRect(0, 0, 1024, 256);

  for (let i = 0; i < 16; i++) {
    const startX = i * 64 + 8;
    reCtx.fillStyle = '#ffffff';
    reCtx.fillRect(startX, 125, 42, 6);
    reCtx.fillStyle = '#888888';
    reCtx.fillRect(startX + 46, 126, 6, 4);
  }

  const ringEmissiveMask = new THREE.CanvasTexture(ringEmissiveCanvas);
  ringEmissiveMask.wrapS = THREE.RepeatWrapping;
  ringEmissiveMask.wrapT = THREE.ClampToEdgeWrapping;
  ringEmissiveMask.repeat.set(4, 1);
  ringEmissiveMask.anisotropy = aniso;

  // 4. Forged Obsidian / Dark Metal Armor Micro-Relief
  const armorBumpCanvas = document.createElement('canvas');
  armorBumpCanvas.width = 512;
  armorBumpCanvas.height = 512;
  const abCtx = armorBumpCanvas.getContext('2d')!;
  abCtx.fillStyle = '#787878';
  abCtx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 4) {
    for (let x = 0; x < 512; x += 4) {
      const n =
        Math.sin(x * 0.045 + Math.cos(y * 0.03) * 2.2) * 18 +
        Math.cos(y * 0.06 - Math.sin(x * 0.025) * 1.8) * 14;
      const v = Math.max(20, Math.min(235, Math.floor(124 + n)));
      abCtx.fillStyle = `rgb(${v},${v},${v})`;
      abCtx.fillRect(x, y, 4, 4);
    }
  }
  // Etched seam lines
  abCtx.strokeStyle = '#383838';
  abCtx.lineWidth = 2;
  for (let k = 64; k < 512; k += 128) {
    abCtx.beginPath();
    abCtx.moveTo(0, k);
    abCtx.lineTo(512, k);
    abCtx.stroke();
  }

  const armorBumpMap = new THREE.CanvasTexture(armorBumpCanvas);
  armorBumpMap.wrapS = THREE.RepeatWrapping;
  armorBumpMap.wrapT = THREE.RepeatWrapping;
  armorBumpMap.repeat.set(2, 2);
  armorBumpMap.anisotropy = aniso;

  const armorRoughnessCanvas = document.createElement('canvas');
  armorRoughnessCanvas.width = 512;
  armorRoughnessCanvas.height = 512;
  const arCtx = armorRoughnessCanvas.getContext('2d')!;
  arCtx.fillStyle = '#5a5a5a';
  arCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 600; i++) {
    const x = (i * 97) % 512;
    const y = (i * 151) % 512;
    const w = 16 + (i % 48);
    const h = 4 + (i % 14);
    const val = 60 + (i % 70);
    arCtx.fillStyle = `rgb(${val},${val},${val})`;
    arCtx.fillRect(x, y, w, h);
  }

  const armorRoughnessMap = new THREE.CanvasTexture(armorRoughnessCanvas);
  armorRoughnessMap.wrapS = THREE.RepeatWrapping;
  armorRoughnessMap.wrapT = THREE.RepeatWrapping;
  armorRoughnessMap.repeat.set(2, 2);
  armorRoughnessMap.anisotropy = aniso;

  return {
    ringBumpMap,
    ringRoughnessMap,
    ringEmissiveMask,
    armorBumpMap,
    armorRoughnessMap,
    dispose: () => {
      ringBumpMap.dispose();
      ringRoughnessMap.dispose();
      ringEmissiveMask.dispose();
      armorBumpMap.dispose();
      armorRoughnessMap.dispose();
    },
  };
}
