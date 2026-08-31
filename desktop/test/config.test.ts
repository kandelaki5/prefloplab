import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig, normalizeConfig } from '../src/main/config';
import type { DisplayInfo } from '../src/core/types';

const displays: DisplayInfo[] = [
  {
    id: 'd1',
    label: 'Main',
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    workArea: { x: 0, y: 0, width: 2560, height: 1400 },
    scaleFactor: 1,
    primary: true,
  },
];

test('a fresh install gets usable layouts and an active one', () => {
  const config = defaultConfig(displays);
  assert.ok(config.layouts.length >= 3);
  assert.equal(config.activeLayoutId, config.layouts[0]!.id);
  assert.ok(config.layouts.every((l) => l.slots.length > 0));
});

test('garbage on disk falls back to defaults instead of crashing', () => {
  assert.doesNotThrow(() => normalizeConfig('not a config', displays));
  const config = normalizeConfig(null, displays);
  assert.equal(config.layouts.length, defaultConfig(displays).layouts.length);
});

test('the scan interval is clamped to something sane', () => {
  assert.equal(normalizeConfig({ pollIntervalMs: 5 }, displays).pollIntervalMs, 200);
  assert.equal(normalizeConfig({ pollIntervalMs: 60_000 }, displays).pollIntervalMs, 5000);
  assert.equal(normalizeConfig({ pollIntervalMs: Number.NaN }, displays).pollIntervalMs, 200);
});

test('edits to a built-in site profile survive a reload', () => {
  const config = normalizeConfig(
    { profiles: [{ id: 'pokerstars', enabled: false, tablePatterns: ['custom'] }] },
    displays,
  );
  const stars = config.profiles.find((p) => p.id === 'pokerstars')!;
  assert.equal(stars.enabled, false);
  assert.deepEqual(stars.tablePatterns, ['custom']);
  // Fields the user did not touch keep their built-in values.
  assert.ok(stars.processNames.includes('pokerstars.exe'));
});

test('new built-in profiles appear for users upgrading from an older config', () => {
  const config = normalizeConfig({ profiles: [{ id: 'pokerstars', enabled: true }] }, displays);
  assert.ok(config.profiles.some((p) => p.id === 'ggpoker'));
});

test('a profile the user invented is kept', () => {
  const custom = { id: 'my-site', name: 'My site', enabled: true, processNames: ['x.exe'], classPatterns: [], tablePatterns: ['Table'], lobbyPatterns: [], excludePatterns: [] };
  const config = normalizeConfig({ profiles: [custom] }, displays);
  assert.ok(config.profiles.some((p) => p.id === 'my-site'));
});

test('an active layout id pointing at a deleted layout is repaired', () => {
  const base = defaultConfig(displays);
  const config = normalizeConfig({ layouts: base.layouts, activeLayoutId: 'gone' }, displays);
  assert.equal(config.activeLayoutId, base.layouts[0]!.id);
});
