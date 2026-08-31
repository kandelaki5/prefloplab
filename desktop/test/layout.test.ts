import assert from 'node:assert/strict';
import test from 'node:test';
import { autoGridSlots, bestGridFor, cascadeSlots, gridSlots, overflowRect, stackSlots, targetRect } from '../src/core/layout';
import { fitAspect } from '../src/core/geometry';
import type { Layout, Rect } from '../src/core/types';

const screen: Rect = { x: 0, y: 0, width: 2560, height: 1400 };

test('a grid covers the whole area with no gaps and no overlap', () => {
  const slots = gridSlots(screen, { rows: 2, cols: 3 });
  assert.equal(slots.length, 6);

  const covered = slots.reduce((sum, s) => sum + s.rect.width * s.rect.height, 0);
  assert.ok(Math.abs(covered - screen.width * screen.height) < 6000, 'grid should tile the area');

  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i]!.rect;
      const b = slots[j]!.rect;
      const overlapping =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlapping, false, `slots ${i} and ${j} overlap`);
    }
  }
});

test('grid respects gap and padding', () => {
  const slots = gridSlots(screen, { rows: 1, cols: 2, gap: 20, padding: 10 });
  assert.equal(slots[0]!.rect.x, 10);
  assert.equal(slots[0]!.rect.width, (2560 - 20 - 20) / 2);
  assert.equal(slots[1]!.rect.x, 10 + slots[0]!.rect.width + 20);
});

test('column ordering fills top-to-bottom before left-to-right', () => {
  const slots = gridSlots(screen, { rows: 2, cols: 2, order: 'column' });
  assert.equal(slots[1]!.rect.x, slots[0]!.rect.x);
  assert.ok(slots[1]!.rect.y > slots[0]!.rect.y);
});

test('the auto grid picks the split that makes 4:3 tables biggest', () => {
  assert.deepEqual(bestGridFor(screen, 4, 4 / 3), { rows: 2, cols: 2 });

  // On a short, very wide strip the same four tables want a single row.
  const strip: Rect = { x: 0, y: 0, width: 5120, height: 700 };
  assert.deepEqual(bestGridFor(strip, 4, 4 / 3), { rows: 1, cols: 4 });
});

test('the auto grid never leaves a completely empty row', () => {
  for (let count = 1; count <= 12; count += 1) {
    const { rows, cols } = bestGridFor(screen, count, 4 / 3);
    assert.ok(rows * cols >= count, `${rows}x${cols} cannot hold ${count}`);
    assert.ok((rows - 1) * cols < count, `${rows}x${cols} has an empty row for ${count}`);
  }
});

test('auto layout produces exactly the slots asked for', () => {
  const slots = autoGridSlots({ area: screen, count: 6, aspect: 4 / 3 });
  assert.equal(slots.length, 6);
  assert.deepEqual(slots.map((s) => s.index), [0, 1, 2, 3, 4, 5]);
});

test('aspect fitting centres the table and keeps its shape', () => {
  const slot: Rect = { x: 100, y: 100, width: 800, height: 800 };
  const fitted = fitAspect(slot, 4 / 3);
  assert.equal(fitted.width, 800);
  assert.equal(fitted.height, 600);
  assert.equal(fitted.x, 100);
  assert.equal(fitted.y, 200, 'leftover height is split evenly');
});

test('cascade steps down and to the right, and stays on screen', () => {
  const slots = cascadeSlots(screen, { count: 5, size: { width: 800, height: 600 }, offsetX: 40, offsetY: 30 });
  assert.equal(slots.length, 5);
  assert.equal(slots[1]!.rect.x - slots[0]!.rect.x, 40);
  assert.equal(slots[1]!.rect.y - slots[0]!.rect.y, 30);
  for (const slot of slots) {
    assert.ok(slot.rect.x >= screen.x && slot.rect.y >= screen.y);
  }
});

test('stack puts a single slot in the middle', () => {
  const slots = stackSlots(screen, { width: 800, height: 600 });
  assert.equal(slots.length, 1);
  assert.equal(slots[0]!.rect.x, (2560 - 800) / 2);
  assert.equal(slots[0]!.rect.y, (1400 - 600) / 2);
});

test('extra tables cascade past the last slot without leaving the screen', () => {
  const slots = gridSlots(screen, { rows: 1, cols: 2 });
  const layout: Layout = {
    id: 'l', name: 'l', kind: 'grid', displayId: 'd', slots, overflow: 'cascade', aspectRatio: null,
  };
  const rect = overflowRect(layout, 0, slots[slots.length - 1], screen);
  assert.ok(rect);
  assert.ok(rect!.x + rect!.width <= screen.x + screen.width);
  assert.ok(rect!.y + rect!.height <= screen.y + screen.height);

  const leaveAlone: Layout = { ...layout, overflow: 'leave' };
  assert.equal(overflowRect(leaveAlone, 0, slots[0], screen), null);
});

test('the layout aspect lock beats the site default', () => {
  const slot = gridSlots(screen, { rows: 1, cols: 1 })[0]!;
  const locked = targetRect(slot, { aspectRatio: 16 / 9 }, 4 / 3);
  assert.ok(Math.abs(locked.width / locked.height - 16 / 9) < 0.01);

  const siteDefault = targetRect(slot, { aspectRatio: null }, 4 / 3);
  assert.ok(Math.abs(siteDefault.width / siteDefault.height - 4 / 3) < 0.01);
});
