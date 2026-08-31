import type { Layout, Slot } from '../core/types';
import type { Api, AppConfig, BuildLayoutRequest, HotkeyAction, HotkeyStatus, ManagerState } from '../shared/ipc';
import { HOTKEY_LABELS } from '../shared/ipc';
import { button, clear, field, formatRect, h, numberInput, select, toggle } from './dom';
import { renderPreview } from './preview';

declare global {
  interface Window {
    tablelab: Api;
  }
}

const api = window.tablelab;

type Tab = 'tables' | 'layouts' | 'sites' | 'hotkeys' | 'settings';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'tables', label: 'Tables', hint: 'What is open and where it sits' },
  { id: 'layouts', label: 'Layouts', hint: 'Build and edit table layouts' },
  { id: 'sites', label: 'Sites', hint: 'How windows are recognised' },
  { id: 'hotkeys', label: 'Hotkeys', hint: 'Global shortcuts' },
  { id: 'settings', label: 'Settings', hint: 'Behaviour and backend' },
];

const ui = {
  tab: 'tables' as Tab,
  config: null as AppConfig | null,
  state: null as ManagerState | null,
  hotkeys: [] as HotkeyStatus[],
  draft: null as Layout | null,
  selectedSlotId: null as string | null,
  capturing: null as HotkeyAction | null,
  notice: null as string | null,
};

const root = document.getElementById('app') as HTMLElement;

function displayById(id: string | null) {
  const displays = ui.state?.displays ?? [];
  return displays.find((d) => d.id === id) ?? displays.find((d) => d.primary) ?? displays[0] ?? null;
}

function activeLayout(): Layout | null {
  const config = ui.config;
  if (!config) return null;
  return config.layouts.find((l) => l.id === config.activeLayoutId) ?? config.layouts[0] ?? null;
}

async function saveConfig(patch: Partial<AppConfig>): Promise<void> {
  ui.config = await api.saveConfig(patch);
  render();
}

function notify(message: string): void {
  ui.notice = message;
  render();
  window.setTimeout(() => {
    if (ui.notice === message) {
      ui.notice = null;
      render();
    }
  }, 3200);
}

// --- shell -----------------------------------------------------------------

function render(): void {
  clear(root);
  root.append(renderSidebar(), renderContent(), renderStatusBar());
}

function renderSidebar(): HTMLElement {
  return h(
    'aside',
    { class: 'sidebar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-name', text: 'TableLab' })),
    h(
      'nav',
      { class: 'nav' },
      ...TABS.map((tab) =>
        h(
          'button',
          {
            class: `nav-item ${ui.tab === tab.id ? 'is-active' : ''}`,
            type: 'button',
            onclick: () => {
              ui.tab = tab.id;
              render();
            },
          },
          h('span', { class: 'nav-label', text: tab.label }),
          h('span', { class: 'nav-hint', text: tab.hint }),
        ),
      ),
    ),
    renderQuickActions(),
  );
}

function renderQuickActions(): HTMLElement {
  const config = ui.config;
  return h(
    'div',
    { class: 'quick' },
    button('Arrange now', () => void api.arrangeNow(true), 'primary'),
    config
      ? toggle('Auto-arrange new tables', config.autoArrange, (value) => void saveConfig({ autoArrange: value }))
      : null,
    config
      ? toggle('Keep tables locked to slots', config.enforceLayout, (value) => void saveConfig({ enforceLayout: value }))
      : null,
  );
}

function renderContent(): HTMLElement {
  const main = h('main', { class: 'content' });
  if (!ui.config || !ui.state) {
    main.append(h('div', { class: 'empty', text: 'Starting up…' }));
    return main;
  }
  if (ui.tab === 'tables') main.append(renderTablesView());
  else if (ui.tab === 'layouts') main.append(renderLayoutsView());
  else if (ui.tab === 'sites') main.append(renderSitesView());
  else if (ui.tab === 'hotkeys') main.append(renderHotkeysView());
  else main.append(renderSettingsView());
  return main;
}

function renderStatusBar(): HTMLElement {
  const state = ui.state;
  const backendLabel = !state
    ? 'starting'
    : state.backendId === 'win32'
      ? 'Windows — managing real windows'
      : 'Simulator — no real windows are touched';
  return h(
    'footer',
    { class: 'status' },
    h('span', { class: `dot ${state?.backendAvailable ? 'ok' : 'warn'}` }),
    h('span', { text: backendLabel }),
    h('span', { class: 'spacer' }),
    ui.notice ? h('span', { class: 'notice', text: ui.notice }) : null,
    state?.lastError ? h('span', { class: 'error', text: state.lastError }) : null,
    h('span', { class: 'muted', text: `${state?.tables.length ?? 0} tables` }),
  );
}

// --- tables ----------------------------------------------------------------

function renderTablesView(): HTMLElement {
  const config = ui.config!;
  const state = ui.state!;
  const layout = activeLayout();
  const display = displayById(layout?.displayId ?? null);

  const previewBox = h('div', { class: 'preview-host', dataset: { maxHeight: '420' } });
  // The preview needs its own width, which only exists after layout; defer.
  queueMicrotask(() =>
    renderPreview(previewBox, {
      display,
      layout,
      tables: state.tables,
      onDropTable: (windowId, slotId) => void api.assignTableToSlot(windowId, slotId),
      onFocusTable: (windowId) => void api.focusTable(windowId),
    }),
  );

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: 'Tables' }),
      h(
        'div',
        { class: 'row' },
        select(
          config.activeLayoutId ?? '',
          config.layouts.map((l) => ({ value: l.id, label: `${l.name} · ${l.slots.length} slots` })),
          (value) => void api.setActiveLayout(value).then((next) => {
            ui.config = next;
            render();
          }),
        ),
        button('Rotate seats', () => void api.rotateTables(1)),
        button('Next layout', () => {
          const layouts = config.layouts;
          if (layouts.length < 2) return;
          const index = layouts.findIndex((l) => l.id === config.activeLayoutId);
          const next = layouts[(index + 1) % layouts.length]!;
          void api.setActiveLayout(next.id).then((updated) => {
            ui.config = updated;
            notify(`Switched to “${next.name}”`);
          });
        }),
      ),
    ),
    h(
      'div',
      { class: 'split' },
      h('section', { class: 'panel' }, h('h2', { text: display ? display.label : 'No display' }), previewBox,
        h('p', { class: 'muted small', text: 'Drag a table from the list onto a slot to re-seat it. Double-click a slot to bring that table to the front.' })),
      h('section', { class: 'panel' }, h('h2', { text: 'Open tables' }), renderTableList()),
    ),
    state.backendId === 'mock' ? renderSimulator() : null,
  );
}

function renderTableList(): HTMLElement {
  const state = ui.state!;
  if (state.tables.length === 0) {
    return h('div', { class: 'empty', text: 'No tables detected yet. Open some tables, or check the Sites tab if your client is not recognised.' });
  }
  const list = h('ul', { class: 'tables' });
  for (const table of state.tables) {
    list.append(
      h(
        'li',
        {
          class: `table-row ${table.minimized ? 'is-minimized' : ''}`,
          draggable: true,
          ondragstart: (event: DragEvent) => {
            event.dataTransfer?.setData('text/window-id', table.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          },
        },
        h('span', { class: 'slot-badge', text: table.slotIndex === null ? '–' : String(table.slotIndex + 1) }),
        h(
          'span',
          { class: 'table-main' },
          h('span', { class: 'table-title', text: table.title }),
          h('span', { class: 'table-meta', text: `${table.siteName} · ${formatRect(table.bounds)}${table.minimized ? ' · minimized' : ''}` }),
        ),
        h(
          'span',
          { class: 'row' },
          button('Focus', () => void api.focusTable(table.id)),
          button('Unseat', () => void api.releaseTable(table.id)),
        ),
      ),
    );
  }
  return list;
}

function renderSimulator(): HTMLElement {
  return h(
    'section',
    { class: 'panel simulator' },
    h('h2', { text: 'Simulator' }),
    h('p', { class: 'muted small', text: 'This machine is not Windows, so TableLab is driving a simulated desktop. Everything below behaves like a real client: tables open in random places, rename themselves, and get arranged by the same code path.' }),
    h(
      'div',
      { class: 'row' },
      button('Open table (PokerStars)', () => void api.mock('spawnTable', 'pokerstars')),
      button('Open table (GGPoker)', () => void api.mock('spawnTable', 'ggpoker')),
      button('Open table (partypoker)', () => void api.mock('spawnTable', 'partypoker')),
      button('Rename tables', () => void api.mock('churn')),
      button('Close all tables', () => void api.mock('closeAll'), 'danger'),
    ),
  );
}

// --- layouts ---------------------------------------------------------------

function renderLayoutsView(): HTMLElement {
  const config = ui.config!;
  if (!ui.draft) {
    const current = activeLayout();
    ui.draft = current ? structuredClone(current) : null;
  }

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Layouts' })),
    h(
      'div',
      { class: 'split split-narrow' },
      h(
        'section',
        { class: 'panel' },
        h('h2', { text: 'Your layouts' }),
        h(
          'ul',
          { class: 'layout-list' },
          ...config.layouts.map((layout) =>
            h(
              'li',
              {
                class: `layout-item ${ui.draft?.id === layout.id ? 'is-active' : ''}`,
                onclick: () => {
                  ui.draft = structuredClone(layout);
                  ui.selectedSlotId = null;
                  render();
                },
              },
              h('span', { class: 'layout-name', text: layout.name }),
              h('span', { class: 'layout-meta', text: `${layout.kind} · ${layout.slots.length} slots` }),
            ),
          ),
        ),
        renderGenerator(),
      ),
      renderLayoutEditor(),
    ),
  );
}

function renderGenerator(): HTMLElement {
  const state = ui.state!;
  const draftRequest: BuildLayoutRequest = {
    name: '',
    kind: 'grid',
    displayId: state.displays.find((d) => d.primary)?.id ?? state.displays[0]?.id ?? '',
    count: 6,
    gap: 0,
    padding: 0,
    aspectRatio: 4 / 3,
    useWorkArea: true,
  };

  const nameInput = h('input', { class: 'input', placeholder: '6 tables, main screen' });
  const kindSelect = select<'grid' | 'stack' | 'cascade'>(
    'grid',
    [
      { value: 'grid', label: 'Grid (tiled)' },
      { value: 'stack', label: 'Stack (all on one spot)' },
      { value: 'cascade', label: 'Cascade (overlapping)' },
    ],
    (value) => {
      draftRequest.kind = value;
    },
  );
  const countInput = numberInput(6, (value) => {
    draftRequest.count = value;
  }, 1, 24);
  const gapInput = numberInput(0, (value) => {
    draftRequest.gap = value;
  }, 0, 200);
  const aspectSelect = select<string>(
    '1.3333333333333333',
    [
      { value: '1.3333333333333333', label: '4:3 (most clients)' },
      { value: '1.6', label: '16:10' },
      { value: '1.7777777777777777', label: '16:9' },
      { value: '0', label: 'Fill the slot' },
    ],
    (value) => {
      draftRequest.aspectRatio = Number(value) || null;
    },
  );
  const displaySelect = select<string>(
    draftRequest.displayId,
    state.displays.map((d) => ({ value: d.id, label: `${d.label} (${d.bounds.width}×${d.bounds.height})` })),
    (value) => {
      draftRequest.displayId = value;
    },
  );

  return h(
    'div',
    { class: 'generator' },
    h('h3', { text: 'New layout' }),
    field('Name', nameInput),
    field('Type', kindSelect),
    field('Tables', countInput, 'Grid rows and columns are chosen to make each table as big as possible.'),
    field('Gap (px)', gapInput),
    field('Table shape', aspectSelect),
    field('Display', displaySelect),
    button(
      'Create layout',
      async () => {
        draftRequest.name = nameInput.value.trim() || `${draftRequest.count} tables`;
        const layout = await api.buildLayout(draftRequest);
        ui.config = await api.saveLayout(layout);
        ui.draft = structuredClone(layout);
        ui.selectedSlotId = null;
        notify(`Created “${layout.name}”`);
      },
      'primary',
    ),
  );
}

function renderLayoutEditor(): HTMLElement {
  const draft = ui.draft;
  const panel = h('section', { class: 'panel' });
  if (!draft) {
    panel.append(h('h2', { text: 'Editor' }), h('div', { class: 'empty', text: 'Pick a layout on the left, or create one.' }));
    return panel;
  }

  const display = displayById(draft.displayId);
  const previewBox = h('div', { class: 'preview-host', dataset: { maxHeight: '380' } });
  const inspector = h('div', { class: 'inspector' });

  const paint = () => {
    renderPreview(previewBox, {
      display,
      layout: draft,
      editable: true,
      selectedSlotId: ui.selectedSlotId,
      tables: ui.state?.tables ?? [],
      onSelectSlot: (slotId) => {
        ui.selectedSlotId = slotId;
        paint();
      },
      onSlotsChange: (slots) => {
        draft.slots = slots;
        draft.kind = 'custom';
        paint();
      },
    });
    clear(inspector).append(renderSlotInspector(draft, paint));
  };
  queueMicrotask(paint);

  const addSlot = () => {
    const last = draft.slots[draft.slots.length - 1];
    const base = last?.rect ?? { x: display?.workArea.x ?? 0, y: display?.workArea.y ?? 0, width: 640, height: 480 };
    draft.slots = [
      ...draft.slots,
      {
        id: `slot-${Date.now().toString(36)}-${draft.slots.length}`,
        index: draft.slots.length,
        rect: { ...base, x: base.x + 40, y: base.y + 40 },
      },
    ];
    draft.kind = 'custom';
    paint();
  };

  panel.append(
    h(
      'div',
      { class: 'view-head' },
      h('h2', { text: 'Editor' }),
      h(
        'div',
        { class: 'row' },
        button('Add slot', addSlot),
        button('Duplicate', () => {
          const copy = structuredClone(draft);
          copy.id = `layout-${Date.now().toString(36)}`;
          copy.name = `${draft.name} copy`;
          ui.draft = copy;
          render();
        }),
        button(
          'Save',
          async () => {
            ui.config = await api.saveLayout(normalizeDraft(draft));
            notify(`Saved “${draft.name}”`);
          },
          'primary',
        ),
        button(
          'Delete',
          async () => {
            ui.config = await api.deleteLayout(draft.id);
            ui.draft = null;
            notify('Layout deleted');
          },
          'danger',
        ),
      ),
    ),
    field(
      'Name',
      h('input', {
        class: 'input',
        value: draft.name,
        onchange: (event: Event) => {
          draft.name = (event.target as HTMLInputElement).value;
        },
      }),
    ),
    h(
      'div',
      { class: 'row wrap' },
      field(
        'Display',
        select(
          draft.displayId,
          (ui.state?.displays ?? []).map((d) => ({ value: d.id, label: d.label })),
          (value) => {
            draft.displayId = value;
            render();
          },
        ),
      ),
      field(
        'Extra tables',
        select(
          draft.overflow,
          [
            { value: 'cascade', label: 'Cascade past the last slot' },
            { value: 'stack', label: 'Stack on the last slot' },
            { value: 'leave', label: 'Leave them alone' },
          ],
          (value) => {
            draft.overflow = value as Layout['overflow'];
          },
        ),
      ),
      field(
        'Aspect lock',
        select(
          String(draft.aspectRatio ?? 0),
          [
            { value: '0', label: 'Off — fill the slot' },
            { value: '1.3333333333333333', label: '4:3' },
            { value: '1.6', label: '16:10' },
            { value: '1.7777777777777777', label: '16:9' },
          ],
          (value) => {
            draft.aspectRatio = Number(value) || null;
            paint();
          },
        ),
        'Clients that refuse to stretch look better centred in their slot.',
      ),
    ),
    previewBox,
    h('p', { class: 'muted small', text: 'Drag slots to move, corners to resize. Edges snap to other slots and the screen; hold Alt to place freely.' }),
    inspector,
  );
  return panel;
}

function renderSlotInspector(draft: Layout, repaint: () => void): HTMLElement {
  const slot = draft.slots.find((s) => s.id === ui.selectedSlotId);
  if (!slot) return h('div', { class: 'muted small', text: 'Select a slot to edit its exact position.' });

  const update = (patch: Partial<Slot['rect']>) => {
    slot.rect = { ...slot.rect, ...patch };
    draft.kind = 'custom';
    repaint();
  };

  return h(
    'div',
    { class: 'row wrap' },
    field('X', numberInput(slot.rect.x, (value) => update({ x: value }), -20000, 20000)),
    field('Y', numberInput(slot.rect.y, (value) => update({ y: value }), -20000, 20000)),
    field('Width', numberInput(slot.rect.width, (value) => update({ width: value }), 120, 20000)),
    field('Height', numberInput(slot.rect.height, (value) => update({ height: value }), 90, 20000)),
    field(
      'Reserve for',
      select(
        slot.siteId ?? '',
        [{ value: '', label: 'Any site' }, ...(ui.config?.profiles ?? []).map((p) => ({ value: p.id, label: p.name }))],
        (value) => {
          slot.siteId = value || null;
          repaint();
        },
      ),
      'Pin a slot to one site so, say, Zoom tables always take the same seat.',
    ),
    button('Remove slot', () => {
      draft.slots = draft.slots.filter((s) => s.id !== slot.id).map((s, index) => ({ ...s, index }));
      ui.selectedSlotId = null;
      draft.kind = 'custom';
      repaint();
    }, 'danger'),
  );
}

/** Renumber slots top-left to bottom-right so fill order matches what you see. */
function normalizeDraft(layout: Layout): Layout {
  const slots = [...layout.slots]
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    .map((slot, index) => ({ ...slot, index }));
  return { ...layout, slots };
}

// --- sites -----------------------------------------------------------------

function renderSitesView(): HTMLElement {
  const config = ui.config!;
  const state = ui.state!;

  const patternField = (label: string, value: string[], onChange: (next: string[]) => void, hint?: string) =>
    field(
      label,
      h('input', {
        class: 'input',
        value: value.join(', '),
        onchange: (event: Event) =>
          onChange(
            (event.target as HTMLInputElement).value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
      }),
      hint,
    );

  const profiles = h(
    'div',
    { class: 'profiles' },
    ...config.profiles.map((profile) =>
      h(
        'details',
        { class: 'profile', open: profile.enabled },
        h(
          'summary',
          {},
          toggle(profile.name, profile.enabled, (enabled) => {
            const next = config.profiles.map((p) => (p.id === profile.id ? { ...p, enabled } : p));
            void saveConfig({ profiles: next });
          }),
        ),
        patternField('Processes', profile.processNames, (processNames) => updateProfile(profile.id, { processNames }), 'Executable names, comma separated. Empty matches any process.'),
        patternField('Window classes', profile.classPatterns, (classPatterns) => updateProfile(profile.id, { classPatterns }), 'Regex. The most reliable signal when a client has one.'),
        patternField('Table titles', profile.tablePatterns, (tablePatterns) => updateProfile(profile.id, { tablePatterns })),
        patternField('Lobby titles', profile.lobbyPatterns, (lobbyPatterns) => updateProfile(profile.id, { lobbyPatterns })),
        patternField('Never match', profile.excludePatterns, (excludePatterns) => updateProfile(profile.id, { excludePatterns })),
        field(
          'Table name capture',
          h('input', {
            class: 'input',
            value: profile.tableKeyPattern ?? '',
            placeholder: '^([^-]+?)\\s+-\\s',
            onchange: (event: Event) => updateProfile(profile.id, { tableKeyPattern: (event.target as HTMLInputElement).value || null }),
          }),
          'Regex with one group pulling the stable table name out of the title, so renames do not lose the seat.',
        ),
      ),
    ),
  );

  const unmatched = h(
    'div',
    { class: 'panel' },
    h('h2', { text: 'Windows we did not claim' }),
    h('p', { class: 'muted small', text: 'If your tables are in here, copy the process or class into the matching profile above.' }),
    h(
      'ul',
      { class: 'window-list' },
      ...state.otherWindows.slice(0, 40).map((win) =>
        h(
          'li',
          {},
          h('span', { class: 'window-title', text: win.title }),
          h('span', { class: 'window-meta', text: `${win.processName || 'unknown.exe'} · ${win.className}` }),
        ),
      ),
    ),
  );

  return h('div', { class: 'view' }, h('header', { class: 'view-head' }, h('h1', { text: 'Sites' })), h('div', { class: 'split split-narrow' }, h('section', { class: 'panel' }, profiles), unmatched));
}

function updateProfile(id: string, patch: Record<string, unknown>): void {
  const config = ui.config!;
  const profiles = config.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
  void saveConfig({ profiles });
}

// --- hotkeys ---------------------------------------------------------------

function renderHotkeysView(): HTMLElement {
  const config = ui.config!;
  const rows = (Object.keys(HOTKEY_LABELS) as HotkeyAction[]).map((action) => {
    const accelerator = config.hotkeys[action] ?? '';
    const status = ui.hotkeys.find((s) => s.action === action);
    const capture = h('button', {
      class: `hotkey ${ui.capturing === action ? 'is-capturing' : ''}`,
      type: 'button',
      text: ui.capturing === action ? 'Press keys…' : accelerator || 'Not set',
      onclick: () => {
        ui.capturing = action;
        render();
      },
    });
    return h(
      'li',
      { class: 'hotkey-row' },
      h('span', { text: HOTKEY_LABELS[action] }),
      capture,
      status && !status.registered
        ? h('span', { class: 'error', text: status.error ?? 'Not registered' })
        : h('span', { class: 'muted small', text: status ? 'Active' : '—' }),
      button('Clear', () => void saveConfig({ hotkeys: { ...config.hotkeys, [action]: '' } })),
    );
  });

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Hotkeys' })),
    h('section', { class: 'panel' }, h('ul', { class: 'hotkeys' }, ...rows),
      h('p', { class: 'muted small', text: 'Hotkeys are global: they work while a poker client has focus, which is the whole point. A combination another program already owns is reported here instead of failing quietly.' })),
  );
}

function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  const key = event.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;

  let named = key;
  if (key.length === 1) named = key.toUpperCase();
  else if (key.startsWith('Arrow')) named = key.slice(5);
  else if (key === ' ') named = 'Space';
  else if (key === 'Escape') named = 'Esc';

  parts.push(named);
  // A bare letter would swallow that key everywhere on the system.
  if (parts.length === 1 && !/^F\d{1,2}$/.test(named)) return null;
  return parts.join('+');
}

// --- settings --------------------------------------------------------------

function renderSettingsView(): HTMLElement {
  const config = ui.config!;
  const state = ui.state!;
  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', { text: 'Settings' })),
    h(
      'section',
      { class: 'panel' },
      field('Scan interval (ms)', numberInput(config.pollIntervalMs, (value) => void saveConfig({ pollIntervalMs: value }), 200, 5000, 50),
        'How often TableLab looks for new or closed tables.'),
      field(
        'Where new tables go',
        select(
          config.strategy,
          [
            { value: 'fill', label: 'First free slot' },
            { value: 'nearest', label: 'Nearest free slot to where it opened' },
          ],
          (value) => void saveConfig({ strategy: value as AppConfig['strategy'] }),
        ),
      ),
      toggle('Focus a table when it is first placed', config.focusOnPlace, (value) => void saveConfig({ focusOnPlace: value })),
      toggle('Minimize the lobby while tables are open', config.tuckLobby, (value) => void saveConfig({ tuckLobby: value })),
      toggle('Start minimized to the tray', config.startMinimized, (value) => void saveConfig({ startMinimized: value })),
      field(
        'Backend',
        select(
          config.backend,
          [
            { value: 'auto', label: 'Auto — real windows on Windows, simulator elsewhere' },
            { value: 'win32', label: 'Windows only' },
            { value: 'mock', label: 'Simulator' },
          ],
          (value) => void saveConfig({ backend: value as AppConfig['backend'] }),
        ),
        state.backendReason ?? '',
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', { text: 'Displays' }),
      h(
        'ul',
        { class: 'window-list' },
        ...state.displays.map((d) =>
          h('li', {}, h('span', { class: 'window-title', text: d.label + (d.primary ? ' (primary)' : '') }),
            h('span', { class: 'window-meta', text: `${formatRect(d.bounds)} · work area ${formatRect(d.workArea)} · scale ${d.scaleFactor}` })),
        ),
      ),
    ),
  );
}

// --- bootstrap -------------------------------------------------------------

window.addEventListener('keydown', (event) => {
  if (!ui.capturing) return;
  event.preventDefault();
  const accelerator = acceleratorFromEvent(event);
  if (!accelerator) return;
  const action = ui.capturing;
  ui.capturing = null;
  const config = ui.config!;
  void saveConfig({ hotkeys: { ...config.hotkeys, [action]: accelerator } }).then(async () => {
    ui.hotkeys = await api.getHotkeyStatus();
    render();
  });
});

async function boot(): Promise<void> {
  ui.config = await api.getConfig();
  ui.state = await api.getState();
  ui.hotkeys = await api.getHotkeyStatus();
  render();

  api.onState((state) => {
    ui.state = state;
    // Only the live view depends on scan results; re-rendering the editor or a
    // form under the user's cursor every 750ms would be unusable.
    if (ui.tab === 'tables') render();
    else {
      const status = document.querySelector('.status');
      status?.replaceWith(renderStatusBar());
    }
  });

  window.addEventListener('resize', () => {
    if (ui.tab === 'tables' || ui.tab === 'layouts') render();
  });
}

void boot();
