import { fitAspect, inset, round } from './geometry';
import type { Layout, Rect, Slot } from './types';

export interface GridOptions {
  rows: number;
  cols: number;
  /** Space between slots, px. */
  gap?: number;
  /** Space between the slot block and the edge of the area, px. */
  padding?: number;
  /**
   * Fill order. Poker players are picky about this: most want the next table
   * to open next to the last one, some want columns first.
   */
  order?: 'row' | 'column';
}

const DEFAULT_GAP = 0;
const DEFAULT_PADDING = 0;

let slotCounter = 0;
export function slotId(prefix = 's'): string {
  slotCounter += 1;
  return `${prefix}${Date.now().toString(36)}${slotCounter.toString(36)}`;
}

/** Evenly divide `area` into rows x cols slots. */
export function gridSlots(area: Rect, options: GridOptions): Slot[] {
  const rows = Math.max(1, Math.floor(options.rows));
  const cols = Math.max(1, Math.floor(options.cols));
  const gap = options.gap ?? DEFAULT_GAP;
  const padding = options.padding ?? DEFAULT_PADDING;
  const order = options.order ?? 'row';

  const inner = inset(area, padding);
  const cellWidth = (inner.width - gap * (cols - 1)) / cols;
  const cellHeight = (inner.height - gap * (rows - 1)) / rows;

  const slots: Slot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = order === 'row' ? row * cols + col : col * rows + row;
      slots.push({
        id: slotId(),
        index,
        rect: round({
          x: inner.x + col * (cellWidth + gap),
          y: inner.y + row * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
        }),
      });
    }
  }
  return slots.sort((a, b) => a.index - b.index).map((slot, i) => ({ ...slot, index: i }));
}

/**
 * Pick the rows x cols grid that makes each table as large as possible.
 *
 * With an aspect ratio in play this is not simply "the squarest grid": four
 * 4:3 tables on an ultrawide are bigger side by side (1x4) than in a 2x2,
 * because a 2x2 cell is tall and the table cannot use the height. So we score
 * every candidate by the actual area of an aspect-fitted table and take the
 * winner.
 */
export function bestGridFor(area: Rect, count: number, aspect?: number | null, gap = 0, padding = 0): { rows: number; cols: number } {
  const n = Math.max(1, Math.floor(count));
  let best = { rows: 1, cols: n };
  let bestScore = -1;

  for (let rows = 1; rows <= n; rows += 1) {
    const cols = Math.ceil(n / rows);
    // Skip grids with a fully empty trailing row (3 rows x 2 cols for 4 tables).
    if ((rows - 1) * cols >= n) continue;
    const inner = inset(area, padding);
    const cellWidth = (inner.width - gap * (cols - 1)) / cols;
    const cellHeight = (inner.height - gap * (rows - 1)) / rows;
    if (cellWidth <= 0 || cellHeight <= 0) continue;
    const cell = { x: 0, y: 0, width: cellWidth, height: cellHeight };
    const fitted = aspect ? fitAspect(cell, aspect) : cell;
    const score = fitted.width * fitted.height;
    // Ties go to the wider grid: a row of tables is easier to scan than a column.
    if (score > bestScore + 0.5 || (Math.abs(score - bestScore) <= 0.5 && cols > best.cols)) {
      bestScore = score;
      best = { rows, cols };
    }
  }
  return best;
}

export interface CascadeOptions {
  count: number;
  /** Size of each window. */
  size: { width: number; height: number };
  offsetX?: number;
  offsetY?: number;
  padding?: number;
}

/** Overlapping pile, each window nudged down-right from the previous one. */
export function cascadeSlots(area: Rect, options: CascadeOptions): Slot[] {
  const count = Math.max(1, Math.floor(options.count));
  const offsetX = options.offsetX ?? 32;
  const offsetY = options.offsetY ?? 32;
  const inner = inset(area, options.padding ?? 0);
  const width = Math.min(options.size.width, inner.width);
  const height = Math.min(options.size.height, inner.height);

  const slots: Slot[] = [];
  let x = inner.x;
  let y = inner.y;
  for (let i = 0; i < count; i += 1) {
    if (y + height > inner.y + inner.height) {
      // Ran off the bottom: start a fresh column.
      y = inner.y;
      x += width / 2;
    }
    if (x + width > inner.x + inner.width) {
      x = inner.x;
      y = inner.y;
    }
    slots.push({ id: slotId(), index: i, rect: round({ x, y, width, height }) });
    x += offsetX;
    y += offsetY;
  }
  return slots;
}

/** One slot in the middle of the area — every table lands on top of the others. */
export function stackSlots(area: Rect, size: { width: number; height: number }): Slot[] {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  return [
    {
      id: slotId(),
      index: 0,
      rect: round({
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
      }),
    },
  ];
}

export interface AutoLayoutOptions {
  area: Rect;
  count: number;
  aspect?: number | null;
  gap?: number;
  padding?: number;
  order?: 'row' | 'column';
}

/** Grid layout with the row/column split chosen for you. */
export function autoGridSlots(options: AutoLayoutOptions): Slot[] {
  const { rows, cols } = bestGridFor(
    options.area,
    options.count,
    options.aspect ?? null,
    options.gap ?? 0,
    options.padding ?? 0,
  );
  return gridSlots(options.area, {
    rows,
    cols,
    gap: options.gap ?? 0,
    padding: options.padding ?? 0,
    order: options.order ?? 'row',
  });
}

/**
 * Where a table assigned to `slot` should actually be placed.
 * Applies the layout's aspect lock; without one the table simply fills the slot.
 */
export function targetRect(slot: Slot, layout: Pick<Layout, 'aspectRatio'>, siteAspect?: number | null): Rect {
  const aspect = layout.aspectRatio ?? siteAspect ?? null;
  return aspect ? fitAspect(slot.rect, aspect) : round(slot.rect);
}

/** Rects for tables past the last slot. */
export function overflowRect(layout: Layout, overflowIndex: number, lastSlot: Slot | undefined, bounds: Rect): Rect | null {
  if (layout.overflow === 'leave' || !lastSlot) return null;
  if (layout.overflow === 'stack') return targetRect(lastSlot, layout);
  const step = 28 * (overflowIndex + 1);
  const base = targetRect(lastSlot, layout);
  const shifted = { ...base, x: base.x + step, y: base.y + step };
  const maxX = bounds.x + bounds.width - base.width;
  const maxY = bounds.y + bounds.height - base.height;
  return round({
    ...shifted,
    x: Math.min(shifted.x, maxX),
    y: Math.min(shifted.y, maxY),
  });
}

/** Renumber slots 0..n-1 in their current array order. */
export function reindex(slots: Slot[]): Slot[] {
  return slots.map((slot, index) => ({ ...slot, index }));
}
