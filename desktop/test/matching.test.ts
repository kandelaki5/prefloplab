import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PROFILES, classifyWindow, normalizeTableKey, profileFromWindow } from '../src/core/matching';
import type { SiteProfile, WindowInfo } from '../src/core/types';

function win(patch: Partial<WindowInfo> = {}): WindowInfo {
  return {
    id: '1',
    title: "Achilles - $0.25/$0.50 USD - No Limit Hold'em",
    processName: 'pokerstars.exe',
    className: 'PokerStarsTableFrameClass',
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    minimized: false,
    visible: true,
    pid: 1234,
    owned: false,
    ownerId: null,
    toolWindow: false,
    cloaked: false,
    resizable: true,
    ...patch,
  };
}

test('a PokerStars table is recognised by its window class', () => {
  const result = classifyWindow(win(), BUILTIN_PROFILES);
  assert.equal(result.kind, 'table');
  assert.equal(result.siteId, 'pokerstars');
  assert.equal(result.tableKey, 'achilles');
});

test('the lobby is not mistaken for a table', () => {
  const result = classifyWindow(win({ title: 'PokerStars Lobby', className: 'PokerStarsLobbyClass' }), BUILTIN_PROFILES);
  assert.equal(result.kind, 'lobby');
});

test('windows from other programs are ignored', () => {
  const result = classifyWindow(
    win({ title: 'Untitled - Notepad', processName: 'notepad.exe', className: 'Notepad' }),
    BUILTIN_PROFILES,
  );
  assert.equal(result.kind, 'other');
  assert.equal(result.siteId, null);
});

test('a table keeps the same key while the client renames the window', () => {
  const profile = BUILTIN_PROFILES.find((p) => p.id === 'pokerstars')!;
  const first = normalizeTableKey("Achilles - $0.25/$0.50 USD - No Limit Hold'em", profile);
  const later = normalizeTableKey("Achilles - $0.50/$1.00 USD - No Limit Hold'em - Logged In as hero", profile);
  assert.equal(first, later, 'a rename must not look like a new table');
});

test('without a capture pattern the volatile parts of a title are stripped', () => {
  const a = normalizeTableKey('Rush & Cash 42 - $120.50 - Blinds: $0.50/$1');
  const b = normalizeTableKey('Rush & Cash 42 - $8.75 - Blinds: $0.50/$1');
  assert.equal(a, b);
});

test('a chat popup that mentions the table is not treated as one', () => {
  const tiny = classifyWindow(
    win({ title: 'Table chat', bounds: { x: 0, y: 0, width: 220, height: 120 }, className: 'ChatClass' }),
    BUILTIN_PROFILES,
  );
  assert.notEqual(tiny.kind, 'table');
});

test('exclude patterns win over table patterns', () => {
  const profile: SiteProfile = {
    id: 'x', name: 'x', enabled: true, processNames: [], classPatterns: [],
    tablePatterns: ['Hold'], lobbyPatterns: [], excludePatterns: ['Replay'], tableKeyPattern: null, aspectRatio: null,
  };
  const result = classifyWindow(win({ title: "Replay: No Limit Hold'em", className: 'Replayer' }), [profile]);
  assert.equal(result.kind, 'other');
});

test('a disabled profile matches nothing', () => {
  const disabled = BUILTIN_PROFILES.map((p) => ({ ...p, enabled: false }));
  assert.equal(classifyWindow(win(), disabled).kind, 'other');
});

test('an invalid regex is ignored instead of crashing the scan', () => {
  const broken: SiteProfile = {
    id: 'broken', name: 'broken', enabled: true, processNames: [], classPatterns: [],
    tablePatterns: ['([unclosed'], lobbyPatterns: [], excludePatterns: [], tableKeyPattern: null, aspectRatio: null,
  };
  assert.doesNotThrow(() => classifyWindow(win(), [broken]));
  assert.equal(classifyWindow(win(), [broken]).kind, 'other');
});

test('a minimized table is still tracked', () => {
  const ggProfile = BUILTIN_PROFILES.find((p) => p.id === 'ggpoker')!;
  const result = classifyWindow(
    win({ title: 'NLH 512 - Blinds: $0.50/$1', processName: 'ggpoker.exe', className: 'Qt5152QWindowIcon', minimized: true }),
    [ggProfile],
  );
  assert.equal(result.kind, 'table');
});

// --- regressions from the GGPoker / CoinPoker report -------------------------

test('an owned window is still a table candidate', () => {
  // Electron and Qt clients own their table windows from the main window.
  // Dropping owned windows made those tables invisible to the manager, with
  // nothing in the UI to say why.
  const result = classifyWindow(win({ owned: true, ownerId: '99' }), BUILTIN_PROFILES);
  assert.equal(result.kind, 'table');
});

test('on a client where every window shares one class, the lobby is still a lobby', () => {
  // Chrome_WidgetWin_1 tells you the toolkit, not the purpose. Matching the
  // class before the lobby title would tile the lobby as if it were a table.
  const lobby = classifyWindow(
    win({
      title: 'CoinPoker',
      processName: 'coinpoker.exe',
      className: 'Chrome_WidgetWin_1',
      owned: false,
    }),
    BUILTIN_PROFILES,
  );
  assert.equal(lobby.kind, 'lobby');
  assert.equal(lobby.siteId, 'coinpoker');
});

test('a CoinPoker table window is recognised', () => {
  const result = classifyWindow(
    win({
      title: 'Table Zeus - NLH $0.10/$0.25',
      processName: 'coinpoker.exe',
      className: 'Chrome_WidgetWin_1',
      owned: true,
    }),
    BUILTIN_PROFILES,
  );
  assert.equal(result.kind, 'table');
  assert.equal(result.siteId, 'coinpoker');
});

test('a GGPoker Qt table window is recognised', () => {
  const result = classifyWindow(
    win({
      title: 'NLH 512 - Blinds: $0.50/$1',
      processName: 'ggpoker.exe',
      className: 'Qt5152QWindowIcon',
      owned: true,
    }),
    BUILTIN_PROFILES,
  );
  assert.equal(result.kind, 'table');
  assert.equal(result.siteId, 'ggpoker');
});

test('tool windows and cloaked windows are rejected, and say so', () => {
  const tool = classifyWindow(win({ toolWindow: true }), BUILTIN_PROFILES);
  assert.equal(tool.kind, 'other');
  assert.match(tool.reason ?? '', /tool window/i);

  const cloaked = classifyWindow(win({ cloaked: true }), BUILTIN_PROFILES);
  assert.equal(cloaked.kind, 'other');
  assert.match(cloaked.reason ?? '', /cloaked/i);
});

test('every rejection carries a reason a user can act on', () => {
  const cases = [
    win({ title: '' }),
    win({ title: 'Untitled - Notepad', processName: 'notepad.exe', className: 'Notepad' }),
    win({ processName: 'pokerstars.exe', className: 'Chat', title: 'Table chat', bounds: { x: 0, y: 0, width: 200, height: 100 } }),
  ];
  for (const candidate of cases) {
    const result = classifyWindow(candidate, BUILTIN_PROFILES);
    assert.equal(result.kind, 'other');
    assert.ok(result.reason && result.reason.length > 0, `no reason given for "${candidate.title}"`);
  }
});

test('a profile learned from a window matches that window and leaves others alone', () => {
  const unknown = win({
    title: 'Ares — 0.02/0.05',
    processName: 'mysterypoker.exe',
    className: 'MysteryTableWnd',
  });
  assert.equal(classifyWindow(unknown, BUILTIN_PROFILES).kind, 'other');

  const learned = profileFromWindow(unknown);
  assert.equal(classifyWindow(unknown, [learned]).kind, 'table');

  // The client renames the window every hand; the rule must survive that.
  const renamed = { ...unknown, title: 'Ares — 0.05/0.10 — $84.20' };
  assert.equal(classifyWindow(renamed, [learned]).kind, 'table');

  // And it must not start claiming the browser.
  const browser = win({ title: 'Poker strategy - Chrome', processName: 'chrome.exe', className: 'Chrome_WidgetWin_1' });
  assert.equal(classifyWindow(browser, [learned]).kind, 'other');
});

test('a learned rule still respects the minimum table size', () => {
  const source = win({ processName: 'mysterypoker.exe', className: 'MysteryTableWnd' });
  const learned = profileFromWindow(source);
  const popup = { ...source, bounds: { x: 0, y: 0, width: 180, height: 90 } };
  assert.equal(classifyWindow(popup, [learned]).kind, 'other');
});
