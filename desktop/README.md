# TableLab — a poker table manager

Finds your poker client's table windows and arranges them into a layout you
designed, the way Jurojin Poker or Table Ninja do. New tables land in the next
free slot the moment they open; closed tables free their seat; global hotkeys
re-arrange, rotate and switch tables without leaving the felt.

It manages *windows*. It does not read cards, calculate odds, act for you, or
inject anything into the poker client — see [Scope](#scope-and-limits).

![Tables view](docs/tables.png)

## Running it

```bash
npm install
npm start          # real windows on Windows, simulator elsewhere
npm run dev        # force the simulator
npm test           # 51 unit tests, no Windows required
npm run dist:win   # build a Windows installer + portable exe
```

Node 20+ is required to build. The Windows build needs no compiler: window
management goes through [koffi](https://koffi.dev), which ships prebuilt.

## How it works

```
scan (every 750ms)      classify                 assign                  place
OS window list  ──▶  site profiles decide  ──▶  sticky slot     ──▶  move/resize
                     table / lobby / other      assignment            the window
```

**Scanning.** `EnumWindows` gives every top-level window; child, tool, cloaked
and owned windows are dropped before anything else looks at them.

**Classifying.** Each window is run past the site profiles in `Sites`. A profile
matches on process name, window class and title regexes. The window class is
preferred where a client has a stable one (`PokerStarsTableFrameClass`), because
titles get rewritten constantly.

**Table identity.** Clients rename table windows on nearly every hand — stack
sizes, blind levels, "action on you" markers. A table is keyed on the part that
does not move, so a rename never looks like a new table and never costs a seat.

**Assignment is sticky.** A table that owns a slot keeps it. New tables take the
lowest free slot (or the nearest one to where they opened, your choice). A table
that closes releases its seat, and gets it back if it reappears within two
minutes — a disconnect and reconnect should not reshuffle your screen.

**Placing.** Since Windows 10, `GetWindowRect` includes ~7px of invisible resize
border. TableLab asks DWM for the real frame and compensates, so tiled tables
sit edge to edge instead of leaving gaps. With an aspect lock on, a table is
scaled to the largest size its own aspect ratio allows inside the slot and
centred there — clients that refuse to stretch still line up.

By default a table is placed once, when it appears. Drag one aside and it stays
where you put it. Turn on **Keep tables locked to slots** if you want it snapped
back on every scan.

## Layouts

Grid, stack and cascade layouts are generated for you; the grid split is chosen
to make each table as large as possible for its aspect ratio, which is not
always the squarest grid — four 4:3 tables on an ultrawide are bigger in one row
than in a 2x2.

Any generated layout can then be edited by hand: drag slots to move, corners to
resize, edges snap to the other slots and to the screen (hold <kbd>Alt</kbd> to
place freely). A slot can be reserved for one site, so — for example — Zoom
tables always take the same seat. Extra tables beyond the last slot can cascade,
stack, or be left alone.

![Layout editor](docs/layouts.png)

## Hotkeys

| Default | Action |
| --- | --- |
| <kbd>Alt</kbd>+<kbd>A</kbd> | Arrange every table now |
| <kbd>Alt</kbd>+<kbd>L</kbd> | Next layout |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | Focus previous / next table in slot order |
| <kbd>Alt</kbd>+<kbd>R</kbd> | Rotate every table one seat forward |
| <kbd>Alt</kbd>+<kbd>S</kbd> | Toggle auto-arrange |
| <kbd>Alt</kbd>+<kbd>T</kbd> | Show TableLab |

All rebindable. A combination another program already owns is reported in the
Hotkeys tab rather than failing silently.

Bringing a table to the front uses the `AttachThreadInput` route, because
Windows refuses `SetForegroundWindow` from a background process — this is what
makes hotkey table-switching work while a client has focus.

## Your client is not recognised

Open **Sites**. Every window TableLab did not claim is listed there with its
process and window class; copy either into the matching profile, or build a new
one. Profiles are plain regex data, editable live — when a client changes its
window titles you fix a pattern, not the app. The built-in profiles for
PokerStars, GGPoker, partypoker, 888, Winamax and the WPN skins are starting
points, not guarantees.

## Developing without Windows

`npm run dev` runs a simulated desktop: tables open in random places, rename
themselves like real clients, and are arranged through exactly the same code
path. The Tables tab grows a Simulator panel to open and close them. This is
also what the test suite drives, so the manager loop is covered on any OS.

```
src/core/      pure logic — geometry, layouts, matching, assignment (all tested)
src/main/      Electron main: config, scan loop, hotkeys, tray
src/main/platform/  win32 (koffi → user32/dwmapi) and mock backends
src/renderer/  the UI — no framework, just the DOM
```

Config lives in `%APPDATA%/TableLab/config.json` (`~/.config/TableLab` on
Linux). It is hand-editable, and a broken file falls back to defaults instead of
a crash loop.

## Scope and limits

- **Windows only for real window management.** The macOS and Linux equivalents
  (Accessibility API, X11/wmctrl) are not implemented; on those systems the app
  runs the simulator and says so in the status bar.
- **No HUD, no odds, no automated actions.** TableLab moves windows. It does not
  read the table, click buttons, or send input to the client.
- **Mixed-DPI setups** are handled by working in physical pixels from
  `EnumDisplayMonitors` rather than trusting a scale factor.
- Poker sites set their own rules about which tools are allowed. A window
  manager is normally fine, but the rules are the site's, not this README's —
  check yours before running anything alongside real-money play.
