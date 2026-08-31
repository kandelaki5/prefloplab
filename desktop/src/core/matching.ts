import type { Classification, SiteProfile, WindowInfo } from './types';

/**
 * Built-in site profiles.
 *
 * These are starting points, not gospel: every client renames its windows
 * between versions, and a few (GG, 888) draw their tables into windows whose
 * titles carry no stakes at all. Profiles are plain data and fully editable in
 * the Sites tab — when a client changes, you fix a regex instead of the app.
 *
 * Matching order matters: the first enabled profile that claims a window wins,
 * and the catch-all "generic" profile is deliberately last and disabled.
 */
export const BUILTIN_PROFILES: SiteProfile[] = [
  {
    id: 'pokerstars',
    name: 'PokerStars',
    enabled: true,
    processNames: ['pokerstars.exe', 'pokerstarseu.exe', 'pokerstarsuk.exe', 'pokerstarsit.exe'],
    // The window class is the reliable signal here; the title is decoration.
    classPatterns: ['^PokerStarsTableFrameClass$'],
    tablePatterns: ["No Limit Hold'em", 'Pot Limit Omaha', 'Limit Hold', 'Tournament \\d+', ' - Table '],
    lobbyPatterns: ['^PokerStars Lobby', '^PokerStars$', 'Cashier', 'Tournament Lobby'],
    excludePatterns: ['Chat$'],
    tableKeyPattern: '^([^-]+?)\\s+-\\s',
    aspectRatio: 4 / 3,
  },
  {
    // GG's client is Qt-based and its table windows are owned by the main
    // window, so they only show up at all now that owned windows are kept.
    // The title format varies by skin and by client version, so this profile
    // leans on the process and class and matches titles permissively; if it
    // still misses, the Windows tab will show what the real titles are.
    id: 'ggpoker',
    name: 'GGPoker / GGNetwork',
    enabled: true,
    processNames: [
      'ggpoker.exe',
      'ggpokeruk.exe',
      'ggpokerok.exe',
      'ggpokerca.exe',
      'natural8.exe',
      'clubgg.exe',
      'betkings.exe',
    ],
    classPatterns: ['^Qt\\d*QWindowIcon$', '^Qt\\d*QWindow'],
    tablePatterns: [
      'Hold\\s?em', 'Omaha', 'Rush ?& ?Cash', 'Blinds?\\s*:', '\\bNLH?\\b', '\\bPLO\\b',
      'Spin ?& ?Gold', 'Table', '\\d+/\\d+',
    ],
    lobbyPatterns: ['^Lobby$', 'Cashier', '^GGPoker$', '^Natural8$', '^ClubGG$'],
    excludePatterns: ['Chat', 'Notification', 'Update'],
    tableKeyPattern: null,
    aspectRatio: 16 / 10,
  },
  {
    // CoinPoker ships an Electron client, so every window is a Chromium
    // widget host and the table windows are owned by the main window.
    id: 'coinpoker',
    name: 'CoinPoker',
    enabled: true,
    processNames: ['coinpoker.exe', 'coin poker.exe'],
    classPatterns: ['^Chrome_WidgetWin_\\d+$'],
    tablePatterns: ['Table', 'Hold', 'Omaha', 'Blinds', '\\d+/\\d+', 'NLH', 'PLO'],
    lobbyPatterns: ['^CoinPoker$', 'Lobby', 'Cashier'],
    excludePatterns: ['Chat', 'Settings', 'Update'],
    tableKeyPattern: null,
    aspectRatio: 16 / 10,
  },
  {
    id: 'partypoker',
    name: 'partypoker',
    enabled: true,
    processNames: ['partypoker.exe', 'partygaming.exe', 'partypokerng.exe'],
    classPatterns: [],
    tablePatterns: ['Table \\d+', 'No Limit', 'Pot Limit', 'Fastforward'],
    lobbyPatterns: ['Lobby', 'Cashier'],
    excludePatterns: [],
    tableKeyPattern: '^(.*?Table \\d+)',
    aspectRatio: 4 / 3,
  },
  {
    id: '888poker',
    name: '888poker',
    enabled: true,
    processNames: ['poker.exe', '888poker.exe', 'pacificpoker.exe'],
    classPatterns: [],
    tablePatterns: ['Table', 'Hold', 'Omaha', 'BLAST'],
    lobbyPatterns: ['Lobby', 'Cashier', '^888poker$'],
    excludePatterns: [],
    tableKeyPattern: null,
    aspectRatio: 4 / 3,
  },
  {
    id: 'winamax',
    name: 'Winamax',
    enabled: true,
    processNames: ['winamax.exe', 'winamaxpoker.exe'],
    classPatterns: [],
    tablePatterns: ['Table', 'Expresso', 'Holdem', 'Omaha', '\\d+ / \\d+'],
    lobbyPatterns: ['Winamax Poker$', 'Lobby', 'Caisse'],
    excludePatterns: [],
    tableKeyPattern: null,
    aspectRatio: 4 / 3,
  },
  {
    id: 'wpn',
    name: 'ACR / Winning Poker Network',
    enabled: true,
    processNames: ['americascardroom.exe', 'blackchippoker.exe', 'truepoker.exe', 'ya.exe'],
    classPatterns: [],
    tablePatterns: ['Table', 'Hold', 'Omaha', 'Jackpot'],
    lobbyPatterns: ['Lobby', 'Cashier'],
    excludePatterns: [],
    tableKeyPattern: null,
    aspectRatio: 4 / 3,
  },
  {
    id: 'generic',
    name: 'Generic (title contains "table")',
    enabled: false,
    processNames: [],
    classPatterns: [],
    tablePatterns: ['\\btable\\b'],
    lobbyPatterns: ['\\blobby\\b'],
    excludePatterns: [],
    tableKeyPattern: null,
    aspectRatio: null,
  },
];

/** Windows smaller than this are chat popups, tooltips or splash screens. */
export const MIN_TABLE_SIZE = { width: 240, height: 180 };

const regexCache = new Map<string, RegExp | null>();

function compile(source: string): RegExp | null {
  if (regexCache.has(source)) return regexCache.get(source) ?? null;
  let re: RegExp | null = null;
  try {
    re = new RegExp(source, 'i');
  } catch {
    // A user typing a half-finished regex in the Sites tab should not take the
    // manager down; an invalid pattern simply never matches.
    re = null;
  }
  regexCache.set(source, re);
  return re;
}

function anyMatch(patterns: string[], value: string): boolean {
  return patterns.some((p) => {
    const re = compile(p);
    return re ? re.test(value) : false;
  });
}

/**
 * Reduce a title to something that survives the client renaming the window.
 *
 * Clients rewrite table titles on nearly every hand: stack sizes, blind levels,
 * "(waiting)" markers, hero's seat. Strip the volatile parts so a table keeps
 * its slot instead of being treated as a brand new table every few seconds.
 */
export function normalizeTableKey(title: string, profile?: SiteProfile | null): string {
  if (profile?.tableKeyPattern) {
    const re = compile(profile.tableKeyPattern);
    const m = re ? re.exec(title) : null;
    if (m && m[1]) return m[1].trim().toLowerCase();
  }
  return title
    .replace(/[$€£¥]\s?[\d.,]+/g, '')       // money amounts
    .replace(/\b\d+[\d.,]*\s?(bb|chips?)\b/gi, '') // stack sizes
    .replace(/\blogged in as\b.*$/i, '')     // PokerStars' trailing hero name
    .replace(/[[(][^\])]*(waiting|sitting out|action)[^\])]*[\])]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface ClassifyOptions {
  minSize?: { width: number; height: number };
}

/**
 * Decide whether a window is a poker table, a lobby, or none of our business.
 *
 * Order matters. Lobby titles are checked before the window class, because on
 * an Electron or Qt client every window shares one class ("Chrome_WidgetWin_1",
 * "Qt5152QWindowIcon") — the class tells you the toolkit, not the purpose, so
 * without this the lobby would be tiled as if it were a table.
 *
 * Every "no" carries a reason. A window quietly failing to match, with nothing
 * on screen to say why, is the failure mode that makes a tool like this
 * impossible to debug from the outside.
 */
export function classifyWindow(
  win: WindowInfo,
  profiles: SiteProfile[],
  options: ClassifyOptions = {},
): Classification {
  const none = (reason: string): Classification => ({ kind: 'other', siteId: null, tableKey: null, reason });

  if (!win.visible) return none('not visible');
  if (!win.title.trim()) return none('no window title');
  if (win.toolWindow) return none('tool window (WS_EX_TOOLWINDOW)');
  if (win.cloaked) return none('cloaked — alive but not on screen');

  const minSize = options.minSize ?? MIN_TABLE_SIZE;
  const process = win.processName.toLowerCase();
  const enabled = profiles.filter((p) => p.enabled);
  if (enabled.length === 0) return none('every site profile is switched off');

  let sawProcess = false;

  for (const profile of enabled) {
    if (profile.processNames.length > 0 && !profile.processNames.includes(process)) continue;
    sawProcess = true;

    if (profile.excludePatterns.length > 0 && anyMatch(profile.excludePatterns, win.title)) {
      return none(`excluded by ${profile.name}`);
    }

    if (anyMatch(profile.lobbyPatterns, win.title)) {
      return { kind: 'lobby', siteId: profile.id, tableKey: null };
    }

    const classMatch = profile.classPatterns.length > 0 && anyMatch(profile.classPatterns, win.className);
    const titleMatch = anyMatch(profile.tablePatterns, win.title);
    if (!classMatch && !titleMatch) continue;

    // Too small to be a table even though it looked like one. Chat popups,
    // tournament registration dialogs and toasts all land here.
    if (!win.minimized && (win.bounds.width < minSize.width || win.bounds.height < minSize.height)) {
      return none(`matched ${profile.name} but is only ${Math.round(win.bounds.width)}x${Math.round(win.bounds.height)}`);
    }

    return { kind: 'table', siteId: profile.id, tableKey: normalizeTableKey(win.title, profile) };
  }

  return none(sawProcess ? 'no profile pattern matched this title or class' : `no profile covers ${process || 'this process'}`);
}

/**
 * Build a site profile from a window the user pointed at.
 *
 * This is the escape hatch from guesswork: rather than me predicting a client's
 * title format, the user clicks "This is a table" on the real window and we
 * key on what is actually there. Process plus window class is specific enough
 * to be safe and general enough to keep matching after the client renames the
 * title, which it will.
 */
export function profileFromWindow(win: WindowInfo, name?: string): SiteProfile {
  const process = win.processName.toLowerCase();
  const id = `learned-${(process || win.className || 'window').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return {
    id,
    name: name ?? `${process || win.className || 'Custom'} (learned)`,
    enabled: true,
    processNames: process ? [process] : [],
    classPatterns: win.className ? [`^${escapeRegex(win.className)}$`] : [],
    // Anything from this process and class, of table size, counts. Narrow it
    // in the Sites tab if the client's other windows start getting caught.
    tablePatterns: ['.'],
    lobbyPatterns: [],
    excludePatterns: [],
    tableKeyPattern: null,
    aspectRatio: null,
    learned: true,
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function profileById(profiles: SiteProfile[], id: string | null): SiteProfile | null {
  if (!id) return null;
  return profiles.find((p) => p.id === id) ?? null;
}
