import { distance } from './geometry';
import { overflowRect, targetRect } from './layout';
import type { AssignmentMap, Layout, Rect, Slot, TrackedTable } from './types';

export type FillStrategy = 'fill' | 'nearest';

export interface AssignOptions {
  /**
   * "fill"    – next table takes the lowest-numbered free slot (Jurojin's default)
   * "nearest" – next table takes the free slot closest to where it opened,
   *             which feels less jumpy when a client remembers its position
   */
  strategy?: FillStrategy;
  /** Aspect ratio per site id, used when the layout has no aspect lock. */
  siteAspect?: Record<string, number | null>;
  /** Bounds tables are kept inside (usually the layout display's work area). */
  bounds?: Rect;
}

export interface Placement {
  windowId: string;
  slotId: string | null;
  /** Null when the table should be left where it is (overflow: "leave"). */
  rect: Rect | null;
  overflow: boolean;
}

export interface AssignResult {
  assignments: AssignmentMap;
  placements: Placement[];
  /** Tables that got no slot at all. */
  unplaced: string[];
}

function slotAcceptsSite(slot: Slot, siteId: string | null): boolean {
  if (!slot.siteId) return true;
  return slot.siteId === siteId;
}

/**
 * Work out where every tracked table belongs.
 *
 * The important property is stickiness: a table that already owns a slot keeps
 * it. Re-running this every poll must not shuffle the felt around, or you lose
 * the muscle memory that makes multi-tabling possible in the first place.
 */
export function assignTables(
  tables: TrackedTable[],
  layout: Layout,
  previous: AssignmentMap = {},
  options: AssignOptions = {},
): AssignResult {
  const strategy = options.strategy ?? 'fill';
  const siteAspect = options.siteAspect ?? {};
  const slots = [...layout.slots].sort((a, b) => a.index - b.index);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const liveIds = new Set(tables.map((t) => t.window.id));
  const assignments: AssignmentMap = {};
  const takenSlots = new Set<string>();

  // 1. Carry over assignments that are still meaningful. A slot that vanished
  //    (layout edited) or a window that closed releases its claim.
  for (const [windowId, sId] of Object.entries(previous)) {
    if (!liveIds.has(windowId)) continue;
    const slot = slotById.get(sId);
    if (!slot || takenSlots.has(sId)) continue;
    const table = tables.find((t) => t.window.id === windowId);
    if (table && !slotAcceptsSite(slot, table.siteId)) continue;
    assignments[windowId] = sId;
    takenSlots.add(sId);
  }

  // 2. Hand out free slots, oldest table first so fill order is stable.
  const pending = tables
    .filter((t) => !assignments[t.window.id])
    .sort((a, b) => a.firstSeen - b.firstSeen || a.window.id.localeCompare(b.window.id));

  for (const table of pending) {
    const free = slots.filter((s) => !takenSlots.has(s.id) && slotAcceptsSite(s, table.siteId));
    if (free.length === 0) continue;

    // A slot pinned to this table's site always wins over a generic one.
    const pinned = free.filter((s) => s.siteId === table.siteId && !!s.siteId);
    const pool = pinned.length > 0 ? pinned : free;

    let chosen: Slot;
    if (strategy === 'nearest') {
      chosen = pool.reduce((best, s) =>
        distance(s.rect, table.window.bounds) < distance(best.rect, table.window.bounds) ? s : best,
      );
    } else {
      chosen = pool[0];
    }
    assignments[table.window.id] = chosen.id;
    takenSlots.add(chosen.id);
  }

  // 3. Turn assignments into concrete rects.
  const bounds = options.bounds ?? boundingBox(slots);
  const lastSlot = slots[slots.length - 1];
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  let overflowIndex = 0;

  const ordered = [...tables].sort((a, b) => a.firstSeen - b.firstSeen || a.window.id.localeCompare(b.window.id));
  for (const table of ordered) {
    const sId = assignments[table.window.id];
    if (sId) {
      const slot = slotById.get(sId);
      if (!slot) continue;
      placements.push({
        windowId: table.window.id,
        slotId: slot.id,
        rect: targetRect(slot, layout, table.siteId ? siteAspect[table.siteId] : null),
        overflow: false,
      });
      continue;
    }
    const rect = overflowRect(layout, overflowIndex, lastSlot, bounds);
    overflowIndex += 1;
    if (!rect) unplaced.push(table.window.id);
    placements.push({ windowId: table.window.id, slotId: null, rect, overflow: true });
  }

  return { assignments, placements, unplaced };
}

/** Smallest rect containing every slot. */
export function boundingBox(slots: Slot[]): Rect {
  if (slots.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = slots.map((s) => s.rect.x);
  const ys = slots.map((s) => s.rect.y);
  const rs = slots.map((s) => s.rect.x + s.rect.width);
  const bs = slots.map((s) => s.rect.y + s.rect.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...rs) - x, height: Math.max(...bs) - y };
}

/**
 * Move one table into a specific slot, swapping with whoever sits there.
 * Used when you drag a table card onto a slot in the layout preview.
 */
export function assignToSlot(assignments: AssignmentMap, windowId: string, slotId: string): AssignmentMap {
  const next: AssignmentMap = { ...assignments };
  const occupant = Object.keys(next).find((id) => next[id] === slotId && id !== windowId);
  const previousSlot = next[windowId];
  next[windowId] = slotId;
  if (occupant) {
    if (previousSlot) next[occupant] = previousSlot;
    else delete next[occupant];
  }
  return next;
}

/** Forget a table's slot so the next arrival can take it. */
export function releaseWindow(assignments: AssignmentMap, windowId: string): AssignmentMap {
  const next = { ...assignments };
  delete next[windowId];
  return next;
}

/** Rotate every table one slot forward — a quick way to re-seat the whole set. */
export function rotate(assignments: AssignmentMap, slots: Slot[], direction: 1 | -1 = 1): AssignmentMap {
  const ordered = [...slots].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) return { ...assignments };
  const next: AssignmentMap = {};
  for (const [windowId, slotId] of Object.entries(assignments)) {
    const i = ordered.findIndex((s) => s.id === slotId);
    if (i < 0) continue;
    const target = ordered[(i + direction + ordered.length) % ordered.length];
    next[windowId] = target.id;
  }
  return next;
}
