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
