import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigStore } from '../src/main/config';
import { TableManager } from '../src/main/manager';
import { MockBackend } from '../src/main/platform/mock';
import { targetRect } from '../src/core/layout';
import type { DisplayInfo } from '../src/core/types';
import type { ManagerState } from '../src/shared/ipc';

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

/** A manager wired to a simulated desktop with nothing open on it. */
function harness() {
  const backend = new MockBackend(displays);
  backend.closeAll();
  const store = new ConfigStore(join(mkdtempSync(join(tmpdir(), 'tablelab-')), 'config.json'), displays);
  let last: ManagerState | null = null;
  const manager = new TableManager(backend, store, { onState: (state) => (last = state) });
  return { backend, store, manager, state: () => last as ManagerState };
}

test('a table that opens in a random spot is moved onto a slot', () => {
  const { backend, manager, state } = harness();
  const table = backend.spawnTable('pokerstars');
  manager.scan();

  const view = state().tables.find((t) => t.id === table.id)!;
  assert.ok(view, 'the table should be detected');
  assert.ok(view.slotId, 'and given a slot');

  const layout = manager.activeLayout()!;
  const slot = layout.slots.find((s) => s.id === view.slotId)!;
  const moved = backend.listWindows().find((w) => w.id === table.id)!;

  // PokerStars tables are 4:3, so the window is centred inside its slot rather
  // than stretched to fill it.
  assert.deepEqual(moved.bounds, targetRect(slot, layout, 4 / 3));
  assert.ok(Math.abs(moved.bounds.width / moved.bounds.height - 4 / 3) < 0.01);
});

test('the lobby is detected but never seated', () => {
  const { backend, manager, state } = harness();
  backend.spawnLobby('pokerstars');
  manager.scan();
  assert.equal(state().tables.length, 0);
  assert.equal(state().lobbies.length, 1);
});

test('renaming a table mid-session does not disturb its seat', () => {
  const { backend, manager, state } = harness();
  const table = backend.spawnTable('pokerstars');
  manager.scan();
  const before = state().tables.find((t) => t.id === table.id)!.slotId;

  backend.churnTitles();
  manager.scan();

  const after = state().tables.find((t) => t.id === table.id)!;
  assert.equal(after.slotId, before);
  assert.notEqual(after.title, table.title, 'the title really did change');
});

test('a table you drag away stays where you put it', () => {
  const { backend, manager } = harness();
  const table = backend.spawnTable('pokerstars');
  manager.scan();

  backend.setWindowBounds(table.id, { x: 1700, y: 900, width: 700, height: 500 });
  manager.scan();

  const after = backend.listWindows().find((w) => w.id === table.id)!;
  assert.equal(after.bounds.x, 1700, 'auto-arrange only places a table when it first appears');
});

test('with the layout locked, a table that wanders is snapped back', () => {
  const { backend, store, manager } = harness();
  store.update({ enforceLayout: true });
  const table = backend.spawnTable('pokerstars');
  manager.scan();
  const placed = backend.listWindows().find((w) => w.id === table.id)!.bounds;

  backend.setWindowBounds(table.id, { x: 1700, y: 900, width: 700, height: 500 });
  manager.scan();

  const after = backend.listWindows().find((w) => w.id === table.id)!;
  assert.deepEqual(after.bounds, placed);
});

test('closing a table frees its seat for the next one', () => {
  const { backend, manager, state } = harness();
  const first = backend.spawnTable('pokerstars');
  manager.scan();
  const seat = state().tables.find((t) => t.id === first.id)!.slotId;

  backend.closeWindow(first.id);
  manager.scan();
  assert.equal(state().tables.length, 0);

  const second = backend.spawnTable('pokerstars');
  manager.scan();
  assert.equal(state().tables.find((t) => t.id === second.id)!.slotId, seat);
});

test('switching layout re-places every open table', () => {
  const { backend, store, manager, state } = harness();
  backend.spawnTable('pokerstars');
  backend.spawnTable('pokerstars');
  manager.scan();

  const next = store.get().layouts[1]!;
  store.update({ activeLayoutId: next.id });
  manager.onLayoutChanged();

  const slotIds = new Set(next.slots.map((s) => s.id));
  for (const table of state().tables) {
    assert.ok(table.slotId && slotIds.has(table.slotId), 'every table lands in the new layout');
    const window = backend.listWindows().find((w) => w.id === table.id)!;
    const slot = next.slots.find((s) => s.id === table.slotId)!;
    assert.deepEqual(window.bounds, targetRect(slot, next, 4 / 3));
  }
});

test('more tables than slots still get placed, without stealing seats', () => {
  const { backend, store, manager, state } = harness();
  const four = store.get().layouts.find((l) => l.slots.length === 4)!;
  store.update({ activeLayoutId: four.id });
  manager.onLayoutChanged();

  const ids = [1, 2, 3, 4, 5].map(() => backend.spawnTable('pokerstars').id);
  manager.scan();

  const seated = state().tables.filter((t) => t.slotId);
  assert.equal(seated.length, 4);
  assert.equal(new Set(seated.map((t) => t.slotId)).size, 4, 'no two tables share a slot');

  const overflowId = ids.find((id) => !state().tables.find((t) => t.id === id)?.slotId)!;
  const overflow = backend.listWindows().find((w) => w.id === overflowId)!;
  assert.ok(overflow.bounds.x >= 0 && overflow.bounds.y >= 0, 'the extra table is cascaded, not lost');
});

test('cycling the layout wraps back to the first one', () => {
  const { store, manager } = harness();
  const ids = store.get().layouts.map((l) => l.id);
  for (let i = 1; i <= ids.length; i += 1) {
    manager.cycleLayout();
    assert.equal(store.get().activeLayoutId, ids[i % ids.length]);
  }
});

test('focus cycling walks the tables in slot order', () => {
  const { backend, manager, state } = harness();
  backend.spawnTable('pokerstars');
  backend.spawnTable('pokerstars');
  backend.spawnTable('pokerstars');
  manager.scan();

  const order = state().tables.map((t) => t.id);
  manager.cycleTable(1);
  assert.equal(backend.getForegroundWindow(), order[0]);
  manager.cycleTable(1);
  assert.equal(backend.getForegroundWindow(), order[1]);
  manager.cycleTable(-1);
  assert.equal(backend.getForegroundWindow(), order[0]);
});

test('auto-arrange off means new tables are left alone', () => {
  const { backend, store, manager } = harness();
  store.update({ autoArrange: false });
  const table = backend.spawnTable('pokerstars');
  const original = { ...backend.listWindows().find((w) => w.id === table.id)!.bounds };
  manager.scan();
  assert.deepEqual(backend.listWindows().find((w) => w.id === table.id)!.bounds, original);

  manager.arrangeNow(true);
  assert.notDeepEqual(backend.listWindows().find((w) => w.id === table.id)!.bounds, original);
});

// --- what happens when a client does not cooperate ---------------------------

test('a fixed-size client is positioned, not resized', () => {
  const { backend, manager, state } = harness();
  const table = backend.spawnTable('pokerstars', true);
  const originalSize = { width: table.bounds.width, height: table.bounds.height };
  manager.scan();

  const view = state().tables.find((t) => t.id === table.id)!;
  assert.equal(view.status, 'size-locked');
  assert.match(view.statusDetail ?? '', /keeps its own table size/i);

  const placed = backend.listWindows().find((w) => w.id === table.id)!;
  assert.equal(placed.bounds.width, originalSize.width, 'its size was left alone');

  // ...and it sits in the middle of the slot it was given.
  const slot = manager.activeLayout()!.slots.find((s) => s.id === view.slotId)!;
  assert.equal(
    Math.round(placed.bounds.x + placed.bounds.width / 2),
    Math.round(slot.rect.x + slot.rect.width / 2),
  );
});

/** A client that says yes to every move and then does nothing — an elevated one. */
class StubbornBackend extends MockBackend {
  override setWindowBounds(): { ok: boolean } {
    return { ok: true };
  }
}

test('a client that ignores moves is reported instead of retried forever', () => {
  const backend = new StubbornBackend(displays);
  backend.closeAll();
  const store = new ConfigStore(join(mkdtempSync(join(tmpdir(), 'tablelab-')), 'config.json'), displays);
  let last: ManagerState | null = null;
  const manager = new TableManager(backend, store, { onState: (s) => (last = s) });

  const table = backend.spawnTable('pokerstars');
  for (let i = 0; i < 6; i += 1) manager.scan();

  const view = (last as unknown as ManagerState).tables.find((t) => t.id === table.id)!;
  assert.equal(view.status, 'stuck');
  assert.match(view.statusDetail ?? '', /administrator/i);
  assert.ok(
    (last as unknown as ManagerState).issues.some((issue) => /would not move/i.test(issue)),
    'the failure is surfaced as an issue, not buried',
  );
});

test('an arrange gives a stuck table another chance', () => {
  const backend = new StubbornBackend(displays);
  backend.closeAll();
  const store = new ConfigStore(join(mkdtempSync(join(tmpdir(), 'tablelab-')), 'config.json'), displays);
  let last: ManagerState | null = null;
  const manager = new TableManager(backend, store, { onState: (s) => (last = s) });

  backend.spawnTable('pokerstars');
  for (let i = 0; i < 6; i += 1) manager.scan();
  assert.equal((last as unknown as ManagerState).tables[0]!.status, 'stuck');

  manager.arrangeNow(true);
  assert.notEqual((last as unknown as ManagerState).tables[0]!.status, 'stuck');
});

test('unmanaged windows are reported with the reason they were skipped', () => {
  const { backend, manager, state } = harness();
  backend.spawnLobby('pokerstars');
  manager.scan();

  const lobby = state().windows.find((w) => /lobby/i.test(w.title))!;
  assert.equal(lobby.kind, 'lobby');

  // Nothing is hidden from this list — that is the point of it.
  assert.equal(state().windows.length, backend.listWindows().length);
});

test('the diagnostics dump carries what a bug report needs', () => {
  const { backend, manager } = harness();
  backend.spawnTable('ggpoker');
  manager.scan();

  const dump = manager.snapshotForDiagnostics();
  for (const key of ['platform', 'backend', 'displays', 'profiles', 'tables', 'windows', 'activeLayout']) {
    assert.ok(key in dump, `diagnostics is missing "${key}"`);
  }
  assert.ok((dump.windows as unknown[]).length > 0);
});
