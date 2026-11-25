import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARTICLE_COUNTS,
  MAX_SHOCKWAVES,
  SPECTRA,
  SPECTRUM_ORDER,
  createInitialShockwaves,
  dampValue,
  generateParticleBuffers,
  hexToRgbNormalized,
  stepShockwaves,
  triggerShockwave,
} from './spectra';

test('all three spectra are defined with valid hex colors', () => {
  assert.deepEqual(SPECTRUM_ORDER, ['molten-gold', 'ice-blue', 'crimson']);
  for (const id of SPECTRUM_ORDER) {
    const palette = SPECTRA[id];
    assert.ok(palette.label.length > 0);
    const rgb = hexToRgbNormalized(palette.fissureCore);
    assert.ok(rgb.r >= 0 && rgb.r <= 1);
    assert.ok(rgb.g >= 0 && rgb.g <= 1);
    assert.ok(rgb.b >= 0 && rgb.b <= 1);
  }
});

test('shockwaves trigger, expand, attenuate, and deactivate cleanly', () => {
  let waves = createInitialShockwaves();
  assert.equal(waves.length, MAX_SHOCKWAVES);
  assert.equal(waves.filter((w) => w.active).length, 0);

  waves = triggerShockwave(waves, 1.0, 20);
  assert.equal(waves.filter((w) => w.active).length, 1);
  assert.ok(waves[0].radius >= 1.4);

  const initialRadius = waves[0].radius;
  waves = stepShockwaves(waves, 0.5, 1.0);
  assert.ok(waves[0].radius > initialRadius);
  assert.ok(waves[0].strength > 0 && waves[0].strength < 1.0);

  // Advance until completion
  for (let i = 0; i < 40; i++) {
    waves = stepShockwaves(waves, 0.25, 1.0);
  }
  assert.equal(waves.filter((w) => w.active).length, 0);
});

test('particle generator builds 80,000 finite 3D particles across all three layers', () => {
  const buffers = generateParticleBuffers();
  const expectedTotal =
    DEFAULT_PARTICLE_COUNTS.disk +
    DEFAULT_PARTICLE_COUNTS.stream +
    DEFAULT_PARTICLE_COUNTS.star;

  assert.equal(expectedTotal, 80_000);
  assert.equal(buffers.totalCount, 80_000);
  assert.equal(buffers.positions.length, 80_000 * 3);
  assert.equal(buffers.attributesA.length, 80_000 * 4);
  assert.equal(buffers.attributesB.length, 80_000 * 4);

  let hasNear = false;
  let hasFar = false;
  for (let i = 0; i < buffers.totalCount; i++) {
    const x = buffers.positions[i * 3];
    const y = buffers.positions[i * 3 + 1];
    const z = buffers.positions[i * 3 + 2];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    const dist = Math.hypot(x, y, z);
    if (dist < 4) hasNear = true;
    if (dist > 25) hasFar = true;
  }
  assert.ok(hasNear && hasFar);
});

test('dampValue approaches target monotonically without overshooting', () => {
  let v = 0;
  for (let i = 0; i < 20; i++) {
    v = dampValue(v, 10, 8, 0.016);
    assert.ok(v >= 0 && v <= 10);
  }
  assert.ok(v > 8.5);
});
