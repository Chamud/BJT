// BJT Trainer desktop app: tray icon + always-available flashcard widget + full trainer window.
// Serves the built app (app/dist) and live content (content/, incl. your private book) on 127.0.0.1 only.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'app', 'dist')
const CONTENT = path.join(ROOT, 'content')
const PORT = 5190 // separate from the dev server (5180) so both can run
const ORIGIN = `http://127.0.0.1:${PORT}`
const STATE_FILE = path.join(app.getPath('userData'), 'desktop-state.json')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

// ---------- persisted desktop state (widget position, pause) ----------
let saved = { widget: null, pausedUntil: 0, widgetVisible: true }
try { saved = { ...saved, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } } catch { /* first run */ }
const persist = () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(saved)) } catch { /* ignore */ } }

// ---------- local static server (with Range support so book audio can seek) ----------
function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '')
  for (const base of [CONTENT, DIST]) { // live content first, so new packs work without rebuilding
    const p = path.resolve(base, rel || 'index.html')
    if (!p.startsWith(base + path.sep) && p !== base) continue // block path traversal
    try { if (fs.statSync(p).isFile()) return p } catch { /* next */ }
  }
  return path.join(DIST, 'index.html')
}

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let file
      try { file = resolveFile(new URL(req.url, ORIGIN).pathname) } catch { res.writeHead(400).end(); return }
      fs.stat(file, (err, st) => {
        if (err) { res.writeHead(404).end(); return }
        const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (range) {
          const start = range[1] ? +range[1] : 0
          const end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1
          res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
          fs.createReadStream(file, { start, end }).pipe(res)
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' })
          fs.createReadStream(file).pipe(res)
        }
      })
    })
    srv.on('error', reject)
    srv.listen(PORT, '127.0.0.1', resolve)
  })
}

// ---------- windows ----------
// Never let a page open extra Electron windows: web links (e.g. "official sample page ↗") go to your
// normal browser, anything else is ignored.
function guardWindowOpen(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(ORIGIN)) shell.openExternal(url)
    return { action: 'deny' }
  })
}
let widget = null, mainWin = null, tray = null, quitting = false
const WIDGET_W = 380
const H_COMPACT = 196
let resizing = false
let lastBounds = null

function createWidget() {
  const wa = screen.getPrimaryDisplay().workArea
  // position is stored as left + BOTTOM edge, so the compact widget always sits where you left it
  const sw = saved.widget
  // right-side widgets are anchored by their RIGHT edge (they widen leftward), left-side ones by the left edge
  let x = sw ? (sw.right != null && sw.right - WIDGET_W / 2 > wa.x + wa.width / 2 ? sw.right - WIDGET_W : sw.x) : wa.x + wa.width - WIDGET_W - 24
  let y = sw ? (sw.bottom ?? sw.y + H_COMPACT) - H_COMPACT : wa.y + wa.height - H_COMPACT - 24
  // if the saved position is off every screen (monitor unplugged), reset it
  if (!screen.getAllDisplays().some(d => x >= d.workArea.x - 50 && x < d.workArea.x + d.workArea.width && y >= d.workArea.y - 50 && y < d.workArea.y + d.workArea.height)) {
    x = wa.x + wa.width - WIDGET_W - 24; y = wa.y + wa.height - H_COMPACT - 24
  }
  widget = new BrowserWindow({
    x, y, width: WIDGET_W, height: H_COMPACT, frame: false, transparent: true, resizable: false, skipTaskbar: true,
    maximizable: false, fullscreenable: false, show: false, alwaysOnTop: false, title: 'BJT 単語',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  })
  guardWindowOpen(widget)
  lastBounds = { x, y, width: WIDGET_W, height: H_COMPACT }
  widget.loadURL(`${ORIGIN}/#widget`)
  widget.once('ready-to-show', () => { if (saved.widgetVisible) widget.showInactive() })
  widget.on('moved', () => {
    if (resizing) return // ignore moves we cause ourselves when expanding/collapsing
    const b = widget.getBounds()
    if (home && lastBounds) { // dragged while a card is open: move "home" by the same amount
      const dx = b.x - lastBounds.x, dy = b.y - lastBounds.y
      home = { ...home, left: home.left + dx, right: home.right + dx, top: home.top + dy, bottom: home.bottom + dy }
    }
    lastBounds = b
    // always save the COMPACT position, so a restart puts the widget where it lives
    const c = home ?? { left: b.x, right: b.x + b.width, bottom: b.y + b.height }
    saved.widget = { x: c.left, right: c.right, bottom: c.bottom }; persist()
  })
  widget.on('close', e => { if (!quitting) { e.preventDefault(); widget.hide(); saved.widgetVisible = false; persist(); buildTray() } })
}

function openMain(hash = 'today') {
  if (!mainWin) {
    mainWin = new BrowserWindow({ width: 1400, height: 920, title: 'BJT Trainer', autoHideMenuBar: true, icon: iconImage(),
      webPreferences: { preload: path.join(__dirname, 'preload.js') } })
    mainWin.on('close', e => { if (!quitting) { e.preventDefault(); mainWin.hide() } }) // keep running in the tray
    mainWin.setMenu(null)
    guardWindowOpen(mainWin)
  }
  mainWin.loadURL(`${ORIGIN}/#${hash}`)
  mainWin.show(); mainWin.focus()
}

// ---------- pause ----------
function setPause(until) {
  saved.pausedUntil = until; persist()
  widget?.webContents.send('pause', until)
  if (until > Date.now()) lowerWidget()
  buildTray()
}
function pauseFor(ms) { setPause(Date.now() + ms) }
function pauseTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(4, 0, 0, 0); setPause(d.getTime()) }

let raisedByNag = false
function raiseWidget() {
  // no automatic pop-ups while paused OR while the widget is hidden (hidden behaves like paused);
  // show it again from the tray (single-click) to resume reminders
  if (!widget || saved.pausedUntil > Date.now() || !widget.isVisible()) return
  raisedByNag = true
  widget.setAlwaysOnTop(true, 'screen-saver') // above normal & maximised windows
  widget.showInactive() // visible without stealing keyboard focus
  widget.moveTop()
}
function lowerWidget() { raisedByNag = false; widget?.setAlwaysOnTop(false) }

/** Tray single-click: show the widget and bring it in front of other windows (it can still be covered later). */
function bringWidget() {
  if (!widget) return
  if (!widget.isVisible()) { saved.widgetVisible = true; persist(); buildTray() }
  widget.show()
  widget.setAlwaysOnTop(true)
  widget.moveTop()
  widget.focus()
  setTimeout(() => { if (widget && !raisedByNag) widget.setAlwaysOnTop(false) }, 400)
}

// ---------- tray ----------
function iconImage() {
  const p = path.join(__dirname, 'icon.png')
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
}
function buildTray() {
  if (!tray) {
    tray = new Tray(iconImage())
    tray.setToolTip('BJT Trainer')
    // Windows reports the first click of a double-click as a click too, so wait briefly before acting on it
    let clickTimer = null
    tray.on('click', () => {
      clearTimeout(clickTimer)
      clickTimer = setTimeout(() => { clickTimer = null; bringWidget() }, 260)
    })
    tray.on('double-click', () => { clearTimeout(clickTimer); clickTimer = null; openMain() })
  }
  const paused = saved.pausedUntil > Date.now()
  const login = app.getLoginItemSettings({ path: process.execPath, args: [__dirname] }).openAtLogin
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => openMain() },
    { label: widget?.isVisible() ? 'Hide' : 'Show', click: () => {
      if (widget.isVisible()) { widget.hide(); saved.widgetVisible = false } else { widget.showInactive(); saved.widgetVisible = true }
      persist(); buildTray()
    } },
    { type: 'separator' },
    paused
      ? { label: 'Resume', click: () => setPause(0) }
      : { label: 'Pause', submenu: [
          { label: '30 min', click: () => pauseFor(30 * 60000) },
          { label: '1 hour', click: () => pauseFor(60 * 60000) },
          { label: '3 hours', click: () => pauseFor(3 * 60 * 60000) },
          { label: 'Tomorrow', click: pauseTomorrow },
        ] },
    { type: 'separator' },
    { label: 'Autostart', type: 'checkbox', checked: login, click: item => {
      app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: [__dirname] })
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ]))
}

// ---------- IPC from the widget / trainer ----------
ipcMain.on('raise', raiseWidget)
ipcMain.on('lower', lowerWidget)
// Expand/collapse. In the lower half of a screen the widget grows UPWARD (bottom edge fixed), so the
// meaning/example opens above it; in the upper half it grows downward. Always kept inside the work area.
// Expand/collapse/widen. The widget grows toward the screen centre (upward in the lower half, leftward in
// the right half). The anchor is decided ONCE from the compact widget ("home") and reused until it collapses
// again, so going back always returns to exactly the same place, even if expanding had to be nudged on-screen.
let home = null // { left, top, right, bottom, growUp, growLeft } of the compact widget while a card is open
function compactAnchor(b, wa) {
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height,
    growUp: b.y + b.height / 2 > wa.y + wa.height / 2, growLeft: b.x + b.width / 2 > wa.x + wa.width / 2 }
}
ipcMain.on('resize', (_e, height, width) => {
  if (!widget) return
  const b = widget.getBounds()
  const wa = screen.getDisplayMatching(b).workArea
  const h = Math.round(height)
  const w = Math.round(Math.min(Math.max(width || WIDGET_W, WIDGET_W), wa.width - 16))
  const compactNow = b.height <= H_COMPACT
  const anchor = compactNow ? compactAnchor(b, wa) : (home ?? compactAnchor(b, wa))
  if (h > H_COMPACT && compactNow) home = anchor // remember where to come back to
  let y = anchor.growUp ? anchor.bottom - h : anchor.top
  let x = anchor.growLeft ? anchor.right - w : anchor.left
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - h)
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - w)
  if (h <= H_COMPACT) home = null // collapsed: back home
  resizing = true
  widget.setBounds({ x, y, width: w, height: h })
  lastBounds = { x, y, width: w, height: h }
  setTimeout(() => { resizing = false }, 300)
})
ipcMain.on('open-main', (_e, hash) => openMain(hash))
ipcMain.on('set-pause', (_e, until) => setPause(until))
ipcMain.handle('get-pause', () => saved.pausedUntil)

// ---------- start ----------
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => openMain())
  app.setAppUserModelId('BJT Trainer')
  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      console.error('app/dist is missing — run start-desktop.bat (it builds the app first).'); app.quit(); return
    }
    try { await startServer() } catch (e) { console.error('Could not start local server on port ' + PORT, e); app.quit(); return }
    createWidget()
    buildTray()
    setInterval(buildTray, 60000) // refresh "paused until" label / auto-resume display
  })
  app.on('window-all-closed', () => { /* stay in the tray */ })
}
