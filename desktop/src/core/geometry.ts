import type { Rect } from './types';

export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

export function area(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function equals(a: Rect, b: Rect, tolerance = 0): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(right(a), right(b)) - x;
  const h = Math.min(bottom(a), bottom(b)) - y;
  return { x, y, width: Math.max(0, w), height: Math.max(0, h) };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return area(intersection(a, b)) > 0;
}

/** Fraction of `a` that lies inside `b`, 0..1. */
export function coverage(a: Rect, b: Rect): number {
  const total = area(a);
  return total === 0 ? 0 : area(intersection(a, b)) / total;
}

export function distance(a: Rect, b: Rect): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

export function round(r: Rect): Rect {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

/** Shrink a rect by `pad` on every side (or per-side). */
export function inset(r: Rect, pad: number | { top: number; right: number; bottom: number; left: number }): Rect {
  const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  return {
    x: r.x + p.left,
    y: r.y + p.top,
    width: Math.max(0, r.width - p.left - p.right),
    height: Math.max(0, r.height - p.top - p.bottom),
  };
}

/**
 * Largest rect with `aspect` (w/h) that fits inside `slot`, centred.
 * Poker clients keep their own aspect ratio no matter what you ask for, so we
 * ask for something they will accept and centre it in the slot ourselves.
 */
export function fitAspect(slot: Rect, aspect: number): Rect {
  if (!Number.isFinite(aspect) || aspect <= 0) return { ...slot };
  let width = slot.width;
  let height = width / aspect;
  if (height > slot.height) {
    height = slot.height;
    width = height * aspect;
  }
  return round({
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  });
}

/** Push a rect back inside `bounds`, shrinking it only if it is too big. */
export function clampInto(r: Rect, bounds: Rect): Rect {
  const width = Math.min(r.width, bounds.width);
  const height = Math.min(r.height, bounds.height);
  const x = Math.min(Math.max(r.x, bounds.x), right(bounds) - width);
  const y = Math.min(Math.max(r.y, bounds.y), bottom(bounds) - height);
  return round({ x, y, width, height });
}

/** The display whose bounds contain the biggest share of `r`. */
export function displayFor<T extends { bounds: Rect }>(r: Rect, displays: T[]): T | null {
  let best: T | null = null;
  let bestCoverage = -1;
  for (const d of displays) {
    const c = coverage(r, d.bounds);
    if (c > bestCoverage) {
      bestCoverage = c;
      best = d;
    }
  }
  return best;
}
