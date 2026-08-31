import type { DisplayInfo, Layout, Rect, Slot } from '../core/types';
import type { TableView } from '../shared/ipc';
import { h } from './dom';

export interface PreviewOptions {
  display: DisplayInfo | null;
  layout: Layout | null;
  tables?: TableView[];
  /** Slots can be dragged, resized and selected. */
  editable?: boolean;
  selectedSlotId?: string | null;
  useWorkArea?: boolean;
  onSlotsChange?: (slots: Slot[]) => void;
  onSelectSlot?: (slotId: string | null) => void;
  onDropTable?: (windowId: string, slotId: string) => void;
  onFocusTable?: (windowId: string) => void;
}

/** Snap distance in *screen* pixels of the preview, converted to display px. */
const SNAP_PX = 7;

/**
 * A scaled picture of one monitor with the layout's slots on it.
 *
 * Doubles as the layout editor: with `editable` on, slots can be dragged and
 * resized, and they snap to each other and to the screen edges — which is how
 * you build the asymmetric layouts (big table bottom-left, satellites stacked
 * up the right) that a plain grid cannot express.
 */
export function renderPreview(container: HTMLElement, options: PreviewOptions): void {
  container.replaceChildren();
  container.classList.add('preview');

  const { display, layout } = options;
  if (!display) {
    container.append(h('div', { class: 'preview-empty', text: 'No display detected.' }));
    return;
  }

  const area = options.useWorkArea === false ? display.bounds : display.workArea;
  const surface = display.bounds;
  const box = container.getBoundingClientRect();
  const availableWidth = box.width || container.clientWidth || 640;
  const maxHeight = Number(container.dataset.maxHeight ?? 420);
  const scale = Math.min(availableWidth / surface.width, maxHeight / surface.height);

  const screenEl = h('div', {
    class: 'preview-screen',
    style: {
      width: `${surface.width * scale}px`,
      height: `${surface.height * scale}px`,
    },
    onmousedown: (event: MouseEvent) => {
      if (event.target === screenEl) options.onSelectSlot?.(null);
    },
  });

  // The work area, so you can see what the taskbar is eating.
  if (options.useWorkArea !== false && (area.height !== surface.height || area.width !== surface.width)) {
    screenEl.append(
      h('div', {
        class: 'preview-workarea',
        style: {
          left: `${(area.x - surface.x) * scale}px`,
          top: `${(area.y - surface.y) * scale}px`,
          width: `${area.width * scale}px`,
          height: `${area.height * scale}px`,
        },
      }),
    );
  }

  const tablesBySlot = new Map<string, TableView>();
  for (const table of options.tables ?? []) {
    if (table.slotId) tablesBySlot.set(table.slotId, table);
  }

  const slots = [...(layout?.slots ?? [])].sort((a, b) => a.index - b.index);

  for (const slot of slots) {
    const occupant = tablesBySlot.get(slot.id);
    const el = h('div', {
      class: [
        'preview-slot',
        occupant ? 'is-occupied' : '',
        options.selectedSlotId === slot.id ? 'is-selected' : '',
        slot.siteId ? 'is-pinned' : '',
      ]
        .filter(Boolean)
        .join(' '),
      style: {
        left: `${(slot.rect.x - surface.x) * scale}px`,
        top: `${(slot.rect.y - surface.y) * scale}px`,
        width: `${slot.rect.width * scale}px`,
        height: `${slot.rect.height * scale}px`,
      },
      dataset: { slotId: slot.id },
      ondblclick: () => {
        if (occupant) options.onFocusTable?.(occupant.id);
      },
      ondragover: (event: DragEvent) => {
        if (!options.onDropTable) return;
        event.preventDefault();
        el.classList.add('is-dropTarget');
      },
      ondragleave: () => el.classList.remove('is-dropTarget'),
      ondrop: (event: DragEvent) => {
        el.classList.remove('is-dropTarget');
        const windowId = event.dataTransfer?.getData('text/window-id');
        if (windowId) options.onDropTable?.(windowId, slot.id);
      },
    });

    el.append(
      h('span', { class: 'preview-slot-index', text: String(slot.index + 1) }),
      h('span', { class: 'preview-slot-title', text: occupant ? occupant.title : slot.label ?? '' }),
    );
    if (slot.siteId) el.append(h('span', { class: 'preview-slot-pin', text: slot.siteId }));

    // With an aspect lock the window does not fill its slot; draw where it
    // actually sits so the preview matches the screen.
    if (occupant && !occupant.minimized) {
      const inner = occupant.bounds;
      const fills =
        Math.abs(inner.width - slot.rect.width) < 4 && Math.abs(inner.height - slot.rect.height) < 4;
      if (!fills) {
        el.append(
          h('span', {
            class: 'preview-window',
            style: {
              left: `${(inner.x - slot.rect.x) * scale}px`,
              top: `${(inner.y - slot.rect.y) * scale}px`,
              width: `${inner.width * scale}px`,
              height: `${inner.height * scale}px`,
            },
          }),
        );
      }
    }

    if (options.editable) {
      el.addEventListener('mousedown', (event) => {
        if ((event.target as HTMLElement).classList.contains('preview-handle')) return;
        options.onSelectSlot?.(slot.id);
        startDrag(event, slot, slots, area, scale, options, 'move');
      });
      for (const handle of ['nw', 'ne', 'sw', 'se'] as const) {
        el.append(
          h('span', {
            class: `preview-handle preview-handle-${handle}`,
            onmousedown: (event: MouseEvent) => {
              event.stopPropagation();
              options.onSelectSlot?.(slot.id);
              startDrag(event, slot, slots, area, scale, options, handle);
            },
          }),
        );
      }
    }

    screenEl.append(el);
  }

  // Tables that did not get a slot, drawn where they actually are.
  for (const table of options.tables ?? []) {
    if (table.slotId || table.minimized) continue;
    screenEl.append(
      h(
        'div',
        {
          class: 'preview-loose',
          style: {
            left: `${(table.bounds.x - surface.x) * scale}px`,
            top: `${(table.bounds.y - surface.y) * scale}px`,
            width: `${table.bounds.width * scale}px`,
            height: `${table.bounds.height * scale}px`,
          },
          title: table.title,
          ondblclick: () => options.onFocusTable?.(table.id),
        },
        h('span', { class: 'preview-slot-title', text: table.title }),
      ),
    );
  }

  container.append(screenEl);
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function startDrag(
  event: MouseEvent,
  slot: Slot,
  slots: Slot[],
  area: Rect,
  scale: number,
  options: PreviewOptions,
  mode: DragMode,
): void {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = { ...slot.rect };
  const snapDistance = SNAP_PX / scale;
  const others = slots.filter((s) => s.id !== slot.id).map((s) => s.rect);

  const onMove = (moveEvent: MouseEvent) => {
    const dx = (moveEvent.clientX - startX) / scale;
    const dy = (moveEvent.clientY - startY) / scale;
    let next: Rect;

    if (mode === 'move') {
      next = { ...origin, x: origin.x + dx, y: origin.y + dy };
    } else {
      const left = mode === 'nw' || mode === 'sw';
      const top = mode === 'nw' || mode === 'ne';
      const x = left ? origin.x + dx : origin.x;
      const y = top ? origin.y + dy : origin.y;
      const width = left ? origin.width - dx : origin.width + dx;
      const height = top ? origin.height - dy : origin.height + dy;
      next = { x, y, width: Math.max(120, width), height: Math.max(90, height) };
    }

    if (!moveEvent.altKey) next = snap(next, others, area, snapDistance, mode === 'move');

    const updated = slots.map((s) =>
      s.id === slot.id ? { ...s, rect: { x: Math.round(next.x), y: Math.round(next.y), width: Math.round(next.width), height: Math.round(next.height) } } : s,
    );
    options.onSlotsChange?.(updated);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** Pull edges onto nearby slot edges and the screen edges. Hold Alt to bypass. */
function snap(r: Rect, others: Rect[], area: Rect, distance: number, moving: boolean): Rect {
  const verticals = [area.x, area.x + area.width / 2, area.x + area.width];
  const horizontals = [area.y, area.y + area.height / 2, area.y + area.height];
  for (const other of others) {
    verticals.push(other.x, other.x + other.width);
    horizontals.push(other.y, other.y + other.height);
  }

  let { x, y, width, height } = r;

  const nearest = (value: number, candidates: number[]): number | null => {
    let best: number | null = null;
    let bestDelta = distance;
    for (const candidate of candidates) {
      const delta = Math.abs(candidate - value);
      if (delta <= bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
    return best;
  };

  const leftSnap = nearest(x, verticals);
  const rightSnap = nearest(x + width, verticals);
  const topSnap = nearest(y, horizontals);
  const bottomSnap = nearest(y + height, horizontals);

  if (moving) {
    if (leftSnap !== null) x = leftSnap;
    else if (rightSnap !== null) x = rightSnap - width;
    if (topSnap !== null) y = topSnap;
    else if (bottomSnap !== null) y = bottomSnap - height;
  } else {
    if (leftSnap !== null) {
      width += x - leftSnap;
      x = leftSnap;
    }
    if (rightSnap !== null) width = rightSnap - x;
    if (topSnap !== null) {
      height += y - topSnap;
      y = topSnap;
    }
    if (bottomSnap !== null) height = bottomSnap - y;
  }

  return { x, y, width: Math.max(120, width), height: Math.max(90, height) };
}
