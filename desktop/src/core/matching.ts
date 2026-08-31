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
    id: 'ggpoker',
    name: 'GGPoker / GGNetwork',
    enabled: true,
    processNames: ['ggpoker.exe', 'ggpokeruk.exe', 'ggpokerok.exe', 'natural8.exe', 'clubgg.exe'],
    classPatterns: [],
    tablePatterns: ['Hold\\s?em', 'Omaha', 'Rush ?& ?Cash', 'Blinds?\\s*:', '\\bNLH?\\b'],
    lobbyPatterns: ['Lobby', 'Cashier', '^GGPoker$'],
    excludePatterns: ['Chat', 'Notification'],
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

/** Decide whether a window is a poker table, a lobby, or none of our business. */
export function classifyWindow(
  win: WindowInfo,
  profiles: SiteProfile[],
  options: ClassifyOptions = {},
): Classification {
  const none: Classification = { kind: 'other', siteId: null, tableKey: null };
  if (!win.visible || !win.title.trim()) return none;

  const minSize = options.minSize ?? MIN_TABLE_SIZE;
  const process = win.processName.toLowerCase();

  for (const profile of profiles) {
    if (!profile.enabled) continue;
    if (profile.processNames.length > 0 && !profile.processNames.includes(process)) continue;
    if (profile.excludePatterns.length > 0 && anyMatch(profile.excludePatterns, win.title)) continue;

    const classMatch = profile.classPatterns.length > 0 && anyMatch(profile.classPatterns, win.className);
    const lobbyMatch = anyMatch(profile.lobbyPatterns, win.title);
    const titleMatch = anyMatch(profile.tablePatterns, win.title);

    // The window class is authoritative when a profile defines one: it survives
    // every title rename the client can throw at us.
    if (classMatch) {
      return { kind: 'table', siteId: profile.id, tableKey: normalizeTableKey(win.title, profile) };
    }
    if (lobbyMatch) return { kind: 'lobby', siteId: profile.id, tableKey: null };
    if (!titleMatch) continue;

    // Too small to be a table even though the title looked right.
    if (win.bounds.width < minSize.width || win.bounds.height < minSize.height) {
      return { kind: 'other', siteId: profile.id, tableKey: null };
    }
    if (win.minimized) {
      // Minimized tables still count — we just cannot place them until restored.
      return { kind: 'table', siteId: profile.id, tableKey: normalizeTableKey(win.title, profile) };
    }
    return { kind: 'table', siteId: profile.id, tableKey: normalizeTableKey(win.title, profile) };
  }

  return none;
}

export function profileById(profiles: SiteProfile[], id: string | null): SiteProfile | null {
  if (!id) return null;
  return profiles.find((p) => p.id === id) ?? null;
}
