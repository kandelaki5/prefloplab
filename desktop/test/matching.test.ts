import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PROFILES, classifyWindow, normalizeTableKey } from '../src/core/matching';
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
