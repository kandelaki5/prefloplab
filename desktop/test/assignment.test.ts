import assert from 'node:assert/strict';
import test from 'node:test';
import { assignTables, assignToSlot, releaseWindow, rotate } from '../src/core/assignment';
import { gridSlots } from '../src/core/layout';
import type { Layout, TrackedTable } from '../src/core/types';

const screen = { x: 0, y: 0, width: 2000, height: 1200 };

function makeLayout(count = 4, overflow: Layout['overflow'] = 'cascade'): Layout {
  return {
    id: 'layout',
    name: 'test',
    kind: 'grid',
    displayId: 'display',
    slots: gridSlots(screen, { rows: 2, cols: count / 2 }),
    overflow,
    aspectRatio: null,
  };
}

function table(id: string, firstSeen: number, x = 0, y = 0): TrackedTable {
  return {
    window: {
      id,
      title: `Table ${id}`,
      processName: 'pokerstars.exe',
      className: 'PokerStarsTableFrameClass',
      bounds: { x, y, width: 800, height: 600 },
      minimized: false,
      visible: true,
      pid: 1,
      owned: false,
      ownerId: null,
      toolWindow: false,
      cloaked: false,
      resizable: true,
    },
    siteId: 'pokerstars',
    tableKey: `table-${id}`,
    firstSeen,
  };
}

test('tables fill the lowest free slots in the order they opened', () => {
  const layout = makeLayout();
  const tables = [table('c', 300), table('a', 100), table('b', 200)];
  const { assignments } = assignTables(tables, layout);

  assert.equal(assignments.a, layout.slots[0]!.id);
  assert.equal(assignments.b, layout.slots[1]!.id);
  assert.equal(assignments.c, layout.slots[2]!.id);
});

test('an existing table keeps its slot when another one opens', () => {
  const layout = makeLayout();
  const first = assignTables([table('a', 100)], layout).assignments;
  const second = assignTables([table('a', 100), table('b', 200)], layout, first).assignments;

  assert.equal(second.a, first.a, 'the table already on the felt must not move');
  assert.notEqual(second.b, first.a);
});

test('closing a table frees its slot for the next one', () => {
  const layout = makeLayout();
  const withTwo = assignTables([table('a', 100), table('b', 200)], layout).assignments;
  const slotOfA = withTwo.a!;

  // "a" is gone; "c" opens.
  const after = assignTables([table('b', 200), table('c', 300)], layout, withTwo).assignments;
  assert.equal(after.b, withTwo.b, 'b stays put');
  assert.equal(after.c, slotOfA, 'c takes the seat a left behind');
});

test('assignments survive a layout edit that keeps the slots', () => {
  const layout = makeLayout();
  const before = assignTables([table('a', 100)], layout).assignments;
  const moved: Layout = {
    ...layout,
    slots: layout.slots.map((s) => ({ ...s, rect: { ...s.rect, x: s.rect.x + 50 } })),
  };
  const after = assignTables([table('a', 100)], moved, before);
  assert.equal(after.assignments.a, before.a);
  assert.equal(after.placements[0]!.rect!.x, moved.slots[0]!.rect.x);
});

test('a slot reserved for one site is skipped by everyone else', () => {
  const layout = makeLayout();
  layout.slots[0]!.siteId = 'ggpoker';
  const { assignments } = assignTables([table('a', 100)], layout);
  assert.equal(assignments.a, layout.slots[1]!.id);
});

test('a reserved slot is preferred by the site it belongs to', () => {
  const layout = makeLayout();
  layout.slots[2]!.siteId = 'pokerstars';
  const { assignments } = assignTables([table('a', 100)], layout);
  assert.equal(assignments.a, layout.slots[2]!.id);
});

test('nearest-slot strategy seats a table where it already is', () => {
  const layout = makeLayout();
  const bottomRight = layout.slots[3]!;
  const near = table('a', 100, bottomRight.rect.x + 10, bottomRight.rect.y + 10);
  const { assignments } = assignTables([near], layout, {}, { strategy: 'nearest' });
  assert.equal(assignments.a, bottomRight.id);
});

test('tables past the last slot cascade, and are reported as overflow', () => {
  const layout = makeLayout();
  const tables = [1, 2, 3, 4, 5].map((n) => table(String(n), n * 100));
  const { placements, unplaced } = assignTables(tables, layout);

  const extra = placements.find((p) => p.windowId === '5')!;
  assert.equal(extra.slotId, null);
  assert.equal(extra.overflow, true);
  assert.ok(extra.rect, 'cascade overflow still gets a position');
  assert.deepEqual(unplaced, []);
});

test('overflow "leave" means the table is not touched at all', () => {
  const layout = makeLayout(4, 'leave');
  const tables = [1, 2, 3, 4, 5].map((n) => table(String(n), n * 100));
  const { placements, unplaced } = assignTables(tables, layout);
  assert.deepEqual(unplaced, ['5']);
  assert.equal(placements.find((p) => p.windowId === '5')!.rect, null);
});

test('dragging a table onto an occupied slot swaps the two', () => {
  const layout = makeLayout();
  const before = assignTables([table('a', 100), table('b', 200)], layout).assignments;
  const after = assignToSlot(before, 'b', before.a!);
  assert.equal(after.b, before.a);
  assert.equal(after.a, before.b, 'the displaced table takes the other seat');
});

test('unseating a table leaves the slot free', () => {
  const layout = makeLayout();
  const before = assignTables([table('a', 100)], layout).assignments;
  assert.deepEqual(releaseWindow(before, 'a'), {});
});

test('rotating moves every table one slot forward and wraps around', () => {
  const layout = makeLayout();
  const before = assignTables([table('a', 100), table('b', 200)], layout).assignments;
  const after = rotate(before, layout.slots, 1);
  assert.equal(after.a, layout.slots[1]!.id);
  assert.equal(after.b, layout.slots[2]!.id);

  const wrapped = rotate({ x: layout.slots[3]!.id }, layout.slots, 1);
  assert.equal(wrapped.x, layout.slots[0]!.id);
});
