/*
 * PrefLopLab Randomizer — a small window that sits above the poker client
 * and shows a number from 0 to 100. It rerolls itself every 10 seconds, or
 * immediately when clicked. Plain Win32 so the whole thing is one small
 * .exe with nothing to install: no runtime, no window manager tricks, and
 * WS_EX_TOPMOST does the one thing a browser tab cannot.
 *
 * Built with: desktop/build.sh
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>

#define TIMER_ID      1
#define TICK_MS       50      /* how often the countdown bar redraws */
#define INTERVAL_MS   10000   /* how long a number stays up */
#define MIN_W         120
#define MIN_H         100
#define GRIP          16      /* size of the resize corner, in pixels */

#define IDM_REROLL    100
#define IDM_TOPMOST   101
#define IDM_CLOSE     102
#define IDI_APP       1

static const COLORREF GOLD      = RGB(211, 172,  71);
static const COLORREF GOLD_DIM  = RGB(120,  98,  41);
static const COLORREF FELT_TOP  = RGB( 34, 133,  85);
static const COLORREF FELT_BOT  = RGB(  9,  42,  26);
static const COLORREF HINT      = RGB(118, 168, 140);
static const COLORREF TRACK     = RGB(  6,  26,  16);

static int       g_value    = 0;
static ULONGLONG g_deadline = 0;
static BOOL      g_topmost  = TRUE;

static HFONT   g_numberFont = NULL;
static HFONT   g_hintFont   = NULL;
static HDC     g_feltDC     = NULL;   /* the gradient, painted once per resize */
static HBITMAP g_feltBmp    = NULL;
static HDC     g_backDC     = NULL;   /* what a frame is composed into */
static HBITMAP g_backBmp    = NULL;

/* Left-button state: the same drag both moves the window and, if it turns
 * out not to have moved, counts as the click that rerolls. */
static BOOL  g_dragging = FALSE;
static BOOL  g_sizing   = FALSE;
static BOOL  g_moved    = FALSE;
static POINT g_anchor;        /* cursor position, in screen coordinates */
static RECT  g_startRect;     /* window rectangle when the button went down */

/*
 * advapi32's system CSPRNG. The SDK exports it under this name and only
 * declares it in ntsecapi.h as RtlGenRandom, so declare it by hand.
 */
BOOLEAN WINAPI SystemFunction036(PVOID buffer, ULONG length);

/*
 * 0-100 inclusive. Bytes from 202 up are thrown away because 256 is not a
 * multiple of 101 — without that, 0-53 would come up more often than
 * 54-100, which is exactly the bias a randomizer must not have.
 */
static int Roll101(void)
{
    unsigned char b;
    int attempt;

    for (attempt = 0; attempt < 32; attempt++) {
        if (SystemFunction036(&b, 1) && b < 202)
            return b % 101;
    }
    return (int)(GetTickCount64() % 101);
}

static void Reroll(HWND hwnd)
{
    g_value = Roll101();
    g_deadline = GetTickCount64() + INTERVAL_MS;
    InvalidateRect(hwnd, NULL, FALSE);
}

static COLORREF Blend(COLORREF a, COLORREF b, double t)
{
    return RGB(
        (int)(GetRValue(a) + (GetRValue(b) - GetRValue(a)) * t),
        (int)(GetGValue(a) + (GetGValue(b) - GetGValue(a)) * t),
        (int)(GetBValue(a) + (GetBValue(b) - GetBValue(a)) * t));
}

/*
 * Rebuilds everything that depends on the window's size: the felt, the
 * frame buffer, and the two fonts. The number is sized off the width as
 * well as the height so that "100" still fits when the window is dragged
 * narrow.
 */
static void Resize(HWND hwnd)
{
    HDC     screen;
    RECT    rc;
    int     w, h, y, size;

    GetClientRect(hwnd, &rc);
    w = rc.right;
    h = rc.bottom;
    if (w < 1 || h < 1)
        return;

    screen = GetDC(hwnd);

    if (g_feltDC) { DeleteDC(g_feltDC); DeleteObject(g_feltBmp); }
    if (g_backDC) { DeleteDC(g_backDC); DeleteObject(g_backBmp); }

    g_feltDC  = CreateCompatibleDC(screen);
    g_feltBmp = CreateCompatibleBitmap(screen, w, h);
    SelectObject(g_feltDC, g_feltBmp);

    g_backDC  = CreateCompatibleDC(screen);
    g_backBmp = CreateCompatibleBitmap(screen, w, h);
    SelectObject(g_backDC, g_backBmp);

    ReleaseDC(hwnd, screen);

    /* Felt: light near the top, dark at the bottom, like the table on the
     * web page. Squaring the ramp keeps the lit part broad instead of
     * putting the midpoint dead centre. */
    for (y = 0; y < h; y++) {
        double t = h > 1 ? (double)y / (h - 1) : 0.0;
        HBRUSH brush = CreateSolidBrush(Blend(FELT_TOP, FELT_BOT, t * t * 0.85 + t * 0.15));
        RECT   row;
        SetRect(&row, 0, y, w, y + 1);
        FillRect(g_feltDC, &row, brush);
        DeleteObject(brush);
    }

    if (g_numberFont) DeleteObject(g_numberFont);
    if (g_hintFont)   DeleteObject(g_hintFont);

    size = h * 46 / 100;
    if (size > w * 30 / 100)
        size = w * 30 / 100;
    if (size < 8)
        size = 8;

    g_numberFont = CreateFontW(-size, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                               DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                               CLEARTYPE_QUALITY, VARIABLE_PITCH, L"Segoe UI");

    size = h * 8 / 100;
    if (size < 9)  size = 9;
    if (size > 13) size = 13;

    g_hintFont = CreateFontW(-size, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
                             DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                             CLEARTYPE_QUALITY, VARIABLE_PITCH, L"Segoe UI");
}

static void Paint(HWND hwnd)
{
    PAINTSTRUCT ps;
    HDC         hdc;
    RECT        rc, area, frame;
    wchar_t     text[8];
    int         w, h, barH, i, left;
    HBRUSH      brush;
    ULONGLONG   now;

    hdc = BeginPaint(hwnd, &ps);
    GetClientRect(hwnd, &rc);
    w = rc.right;
    h = rc.bottom;

    if (!g_backDC) {
        EndPaint(hwnd, &ps);
        return;
    }

    BitBlt(g_backDC, 0, 0, w, h, g_feltDC, 0, 0, SRCCOPY);

    barH = h < 140 ? 3 : 4;

    SetBkMode(g_backDC, TRANSPARENT);

    /* The number, held slightly above centre to leave the hint its room. */
    SelectObject(g_backDC, g_numberFont);
    SetTextColor(g_backDC, GOLD);
    wsprintfW(text, L"%d", g_value);
    SetRect(&area, 0, 0, w, h - h / 7);
    DrawTextW(g_backDC, text, -1, &area, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOCLIP);

    SelectObject(g_backDC, g_hintFont);
    SetTextColor(g_backDC, HINT);
    SetTextCharacterExtra(g_backDC, 2);
    SetRect(&area, 0, h - h / 4, w, h - barH - 4);
    DrawTextW(g_backDC, L"CLICK TO REROLL", -1, &area, DT_CENTER | DT_BOTTOM | DT_SINGLELINE);
    SetTextCharacterExtra(g_backDC, 0);

    /* Countdown to the automatic reroll. */
    now = GetTickCount64();
    left = g_deadline > now ? (int)(g_deadline - now) : 0;
    SetRect(&area, 0, h - barH, w, h);
    brush = CreateSolidBrush(TRACK);
    FillRect(g_backDC, &area, brush);
    DeleteObject(brush);
    SetRect(&area, 0, h - barH, (int)((LONGLONG)w * left / INTERVAL_MS), h);
    brush = CreateSolidBrush(GOLD);
    FillRect(g_backDC, &area, brush);
    DeleteObject(brush);

    /* Gold rim, and a grip in the corner you can pull to resize. */
    frame = rc;
    brush = CreateSolidBrush(GOLD_DIM);
    FrameRect(g_backDC, &frame, brush);
    DeleteObject(brush);

    for (i = 1; i <= 3; i++) {
        int span = i * 4;
        SetRect(&area, w - span - 2, h - 3, w - span, h - 2);
        brush = CreateSolidBrush(GOLD_DIM);
        FillRect(g_backDC, &area, brush);
        DeleteObject(brush);
    }

    BitBlt(hdc, ps.rcPaint.left, ps.rcPaint.top,
           ps.rcPaint.right - ps.rcPaint.left, ps.rcPaint.bottom - ps.rcPaint.top,
           g_backDC, ps.rcPaint.left, ps.rcPaint.top, SRCCOPY);

    EndPaint(hwnd, &ps);
}

static BOOL InGrip(HWND hwnd, POINT client)
{
    RECT rc;
    GetClientRect(hwnd, &rc);
    return client.x >= rc.right - GRIP && client.y >= rc.bottom - GRIP;
}

static void ShowMenu(HWND hwnd)
{
    HMENU menu = CreatePopupMenu();
    POINT pt;

    GetCursorPos(&pt);
    AppendMenuW(menu, MF_STRING, IDM_REROLL, L"Reroll now");
    AppendMenuW(menu, MF_STRING | (g_topmost ? MF_CHECKED : MF_UNCHECKED), IDM_TOPMOST,
                L"Always on top");
    AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(menu, MF_STRING, IDM_CLOSE, L"Close");

    /* Without this the menu stays up after a click elsewhere. */
    SetForegroundWindow(hwnd);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, NULL);
    DestroyMenu(menu);
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg) {
    case WM_CREATE:
        Resize(hwnd);
        Reroll(hwnd);
        SetTimer(hwnd, TIMER_ID, TICK_MS, NULL);
        return 0;

    case WM_SIZE:
        Resize(hwnd);
        InvalidateRect(hwnd, NULL, FALSE);
        return 0;

    case WM_TIMER:
        if (GetTickCount64() >= g_deadline) {
            Reroll(hwnd);
        } else {
            /* Only the bar moves between rerolls, so only the bar is redrawn. */
            RECT rc;
            GetClientRect(hwnd, &rc);
            rc.top = rc.bottom - 5;
            InvalidateRect(hwnd, &rc, FALSE);
        }
        return 0;

    case WM_PAINT:
        Paint(hwnd);
        return 0;

    case WM_ERASEBKGND:
        return 1;   /* every pixel is painted in WM_PAINT; erasing would flicker */

    case WM_LBUTTONDOWN: {
        POINT pt;
        pt.x = GET_X_LPARAM(lParam);
        pt.y = GET_Y_LPARAM(lParam);
        GetCursorPos(&g_anchor);
        GetWindowRect(hwnd, &g_startRect);
        g_sizing   = InGrip(hwnd, pt);
        g_dragging = !g_sizing;
        g_moved    = FALSE;
        SetCapture(hwnd);
        /* A borderless popup is not activated by a click on its own, and
         * without focus the Esc and space keys never arrive. */
        SetForegroundWindow(hwnd);
        return 0;
    }

    case WM_MOUSEMOVE: {
        POINT pt;
        int dx, dy;

        if (!g_dragging && !g_sizing)
            return 0;

        GetCursorPos(&pt);
        dx = pt.x - g_anchor.x;
        dy = pt.y - g_anchor.y;
        if (dx > 3 || dx < -3 || dy > 3 || dy < -3)
            g_moved = TRUE;

        if (g_sizing) {
            int w = g_startRect.right - g_startRect.left + dx;
            int h = g_startRect.bottom - g_startRect.top + dy;
            if (w < MIN_W) w = MIN_W;
            if (h < MIN_H) h = MIN_H;
            SetWindowPos(hwnd, NULL, 0, 0, w, h, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        } else {
            SetWindowPos(hwnd, NULL, g_startRect.left + dx, g_startRect.top + dy, 0, 0,
                         SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
        return 0;
    }

    case WM_LBUTTONUP: {
        BOOL wasDrag = g_dragging;
        BOOL moved   = g_moved;

        if (g_dragging || g_sizing)
            ReleaseCapture();
        g_dragging = FALSE;
        g_sizing   = FALSE;

        /* A press that went nowhere is a click, not a drag. */
        if (wasDrag && !moved)
            Reroll(hwnd);
        return 0;
    }

    case WM_SETCURSOR: {
        POINT pt;
        GetCursorPos(&pt);
        ScreenToClient(hwnd, &pt);
        if (LOWORD(lParam) == HTCLIENT) {
            SetCursor(LoadCursor(NULL, InGrip(hwnd, pt) ? IDC_SIZENWSE : IDC_HAND));
            return TRUE;
        }
        break;
    }

    case WM_RBUTTONUP:
        ShowMenu(hwnd);
        return 0;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case IDM_REROLL:
            Reroll(hwnd);
            return 0;
        case IDM_TOPMOST:
            g_topmost = !g_topmost;
            SetWindowPos(hwnd, g_topmost ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            return 0;
        case IDM_CLOSE:
            DestroyWindow(hwnd);
            return 0;
        }
        return 0;

    case WM_KEYDOWN:
        if (wParam == VK_ESCAPE)
            DestroyWindow(hwnd);
        else if (wParam == VK_SPACE || wParam == VK_RETURN)
            Reroll(hwnd);
        return 0;

    case WM_DESTROY:
        KillTimer(hwnd, TIMER_ID);
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

/* Round the corners on Windows 11, and do nothing at all on Windows 10,
 * where the attribute does not exist. Loaded at run time so the exe keeps
 * working on versions that have no dwmapi to link against. */
static void RoundCorners(HWND hwnd)
{
    typedef HRESULT (WINAPI *SetAttr)(HWND, DWORD, LPCVOID, DWORD);
    HMODULE dwm = LoadLibraryW(L"dwmapi.dll");
    SetAttr set;
    DWORD   round = 2;   /* DWMWCP_ROUND */

    if (!dwm)
        return;
    set = (SetAttr)(void *)GetProcAddress(dwm, "DwmSetWindowAttribute");
    if (set)
        set(hwnd, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &round, sizeof(round));
    FreeLibrary(dwm);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmdline, int show)
{
    WNDCLASSEXW wc;
    HWND        hwnd;
    MSG         msg;
    RECT        work;
    int         w = 210, h = 180, x, y;

    (void)prev; (void)cmdline;

    /* Without this the window is drawn small and then stretched on a
     * scaled display, which turns the number to mush. */
    SetProcessDPIAware();

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = inst;
    wc.hCursor       = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = NULL;
    wc.lpszClassName = L"PrefLopLabRandomizer";
    wc.hIcon         = LoadIconW(inst, MAKEINTRESOURCEW(IDI_APP));
    wc.hIconSm       = wc.hIcon;
    RegisterClassExW(&wc);

    /* Opens in the top-right of the desktop, clear of the taskbar. */
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
    x = work.right - w - 24;
    y = work.top + 24;

    hwnd = CreateWindowExW(WS_EX_TOPMOST, wc.lpszClassName, L"Randomizer",
                           WS_POPUP, x, y, w, h, NULL, NULL, inst, NULL);
    if (!hwnd)
        return 1;

    RoundCorners(hwnd);
    ShowWindow(hwnd, show);
    UpdateWindow(hwnd);

    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
