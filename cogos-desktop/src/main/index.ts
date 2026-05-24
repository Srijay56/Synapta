// ============================================
// Synapta Desktop — Electron Main Process
// Frameless transparent window, tray, hotkeys, IPC
// All data proxied to Python backend (localhost:8000)
// ============================================

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import http from 'http'
import https from 'https'
import WebSocket from 'ws'

const BACKEND_URL = 'http://127.0.0.1:8000'
const BACKEND_WS_URL = 'ws://127.0.0.1:8000/ws/events'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backendProcess: ChildProcess | null = null
let eventSocket: WebSocket | null = null
let insightPopup: BrowserWindow | null = null
let insightPopupTimeout: ReturnType<typeof setTimeout> | null = null

// ============================================
// Python Backend Management
// ============================================

function getBackendPath(): string {
  // Paths to try, in priority order
  const candidates = [
    // Dev: sibling directory in Synapta project
    join(__dirname, '..', '..', '..', 'backend'),
    join(__dirname, '..', '..', '..', '..', 'backend'),
    // Explicit common path
    join(app.getPath('documents'), 'Synapta', 'backend'),
    // Packaged: bundled in resources
    join(process.resourcesPath || '', 'backend'),
    // Next to exe
    join(app.getPath('exe'), '..', 'backend'),
  ]

  for (const p of candidates) {
    try {
      if (existsSync(join(p, 'app', 'main.py'))) {
        return p
      }
    } catch {
      continue
    }
  }

  // Default fallback
  return join(app.getPath('documents'), 'Synapta', 'backend')
}

function startBackend(): void {
  const backendDir = getBackendPath()
  const venvPython = join(backendDir, '.venv', 'Scripts', 'python.exe')
  const pythonCmd = existsSync(venvPython) ? venvPython : 'python'

  console.log(`[Synapta] Starting Python backend from: ${backendDir}`)
  console.log(`[Synapta] Using Python: ${pythonCmd}`)

  backendProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'app.main:app',
    '--host', '0.0.0.0',
    '--port', '8000'
  ], {
    cwd: backendDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.on('error', (err) => {
    console.error(`[Backend] Failed to start: ${err.message}`)
  })

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] Exited with code: ${code}`)
    backendProcess = null
  })
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('[Synapta] Stopping Python backend...')
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

async function waitForBackend(maxWaitMs = 300000): Promise<boolean> {
  // Default: 5 minutes — needed on first run when EasyOCR downloads its models (~150MB).
  // Subsequent runs are cached so this completes in <5 seconds.
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const ok = await fetchJson('/health')
      if (ok && ok.ok) return true
    } catch {
      // Backend not ready yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// ============================================
// HTTP client for Python backend
// ============================================

function fetchJson(path: string, options?: { method?: string; body?: any }): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL)
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    }

    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(data)
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })

    if (options?.body) {
      req.write(JSON.stringify(options.body))
    }
    req.end()
  })
}

function streamChat(messages: any[], onChunk: (chunk: string) => void): Promise<void> {
  // Use the non-streaming /chat endpoint and simulate streaming by
  // sending the response word by word for a natural feel
  return new Promise(async (resolve, reject) => {
    try {
      const result = await fetchJson('/chat', {
        method: 'POST',
        body: {
          message: messages[messages.length - 1]?.content || '',
          include_screen: false,
          deep_memory: false,
          include_files: true
        }
      })

      const text = result.response || ''
      // Simulate streaming by sending words
      const words = text.split(' ')
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i]
        onChunk(chunk)
        await new Promise(r => setTimeout(r, 20))
      }
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

// ============================================
// Window
// ============================================

function createWindow(): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  const winWidth = 420
  const winHeight = Math.round(screenH * 0.85)

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: screenW - winWidth - 20,
    y: Math.round((screenH - winHeight) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    minWidth: 360,
    minHeight: 500,
    icon: undefined,
    title: 'Synapta',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.setContentProtection(true)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.hide()
  })
}

function createTray(): void {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkoBAwUqifYdQAhkEQBv8ZGBj+k+IFRkZGRrL9QHIYjIbBaBoYBAkZAIu5CBFtMVblAAAAAElFTkSuQmCC',
      'base64'
    )
  )

  tray = new Tray(icon)
  tray.setToolTip('Synapta — Local-First AI Companion')

  const contextMenu = Menu.buildFromTemplate([
    { label: '🧠 Show Synapta', click: () => { mainWindow?.show(); dismissInsightPopup() } },
    { type: 'separator' },
    { label: '📊 Backend Health', click: () => shell.openExternal(`${BACKEND_URL}/docs`) },
    { type: 'separator' },
    { label: 'Quit', click: () => { mainWindow?.destroy(); stopBackend(); app.quit() } }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
      dismissInsightPopup()
    }
  })
}

let activeHotkey = ''

function registerHotkeys(): void {
  // Try shortcuts in priority order — Alt+Space is often grabbed by Windows system menu
  const shortcuts = ['Alt+Space', 'Control+Space', 'CommandOrControl+Shift+Space']

  for (const combo of shortcuts) {
    try {
      const ok = globalShortcut.register(combo, () => {
        toggleWindow()
      })
      if (ok) {
        activeHotkey = combo
        console.log(`[Synapta] Hotkey registered: ${combo}`)
        break
      }
    } catch {
      // This shortcut is unavailable, try next
    }
  }

  if (!activeHotkey) {
    console.warn('[Synapta] WARNING: No global hotkey could be registered!')
  }
}

function toggleWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    // Position on the display where the cursor currently is
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { width: sw, height: sh, x: sx, y: sy } = display.workArea

    const winBounds = mainWindow.getBounds()
    // Snap to right edge of that display
    mainWindow.setPosition(
      sx + sw - winBounds.width - 20,
      sy + Math.round((sh - winBounds.height) / 2)
    )
    mainWindow.show()
    mainWindow.focus()
    dismissInsightPopup()
  }
}

// ============================================
// IPC — all proxied to Python backend
// ============================================

function registerIPC(): void {
  // Activity logging → Python backend /activity
  ipcMain.handle('db:logEvent', async (_, event) => {
    try {
      return await fetchJson('/activity', { method: 'POST', body: event })
    } catch (err: any) {
      console.error('[IPC] logEvent error:', err.message)
      return { memory: null, profile: null }
    }
  })

  // Get memories → Python backend /memory/all
  ipcMain.handle('db:getMemories', async (_, limit: number) => {
    try {
      const result = await fetchJson(`/memory/all`)
      const items = result.items || []
      return items.slice(0, limit).map((item: any) => ({
        id: item.id || String(Math.random()),
        activity: item.metadata?.activity || 'unknown',
        summary: item.content || '',
        tags: item.metadata?.tag ? [item.metadata.tag] : [item.metadata?.activity || 'general'],
        mood: 'neutral',
        created_at: item.created_at || item.timestamp || new Date().toISOString(),
        duration_minutes: item.metadata?.duration || 5
      }))
    } catch (err: any) {
      console.error('[IPC] getMemories error:', err.message)
      return []
    }
  })

  // Get profile → Python backend /profile
  ipcMain.handle('db:getProfile', async () => {
    try {
      const result = await fetchJson('/profile')
      return result.profile || null
    } catch (err: any) {
      console.error('[IPC] getProfile error:', err.message)
      return null
    }
  })

  // Update profile (twin preference) → Python backend /twin/preference
  ipcMain.handle('db:updateProfile', async (_, profileData) => {
    try {
      // Profile is auto-derived from twin, so just return current
      const result = await fetchJson('/profile')
      return result.profile || profileData
    } catch {
      return profileData
    }
  })

  // Get all events → Python backend /memory/all
  ipcMain.handle('db:getAllEvents', async () => {
    try {
      const result = await fetchJson('/memory/all')
      return result.items || []
    } catch {
      return []
    }
  })

  // AI Chat → Python backend /chat (with simulated streaming)
  ipcMain.handle('ollama:chat', async (event, messages: any[]) => {
    try {
      await streamChat(messages, (chunk: string) => {
        event.sender.send('ollama:chunk', chunk)
      })
      event.sender.send('ollama:done')
    } catch (err: any) {
      event.sender.send('ollama:error', err.message || 'Backend error')
    }
    return true
  })

  // AI status → Python backend /health
  ipcMain.handle('ollama:status', async () => {
    try {
      const health = await fetchJson('/health')
      const inf = health.inference || {}
      return {
        online: inf.available || false,
        model: inf.configured_model || 'gemma3:1b'
      }
    } catch {
      return { online: false, model: 'offline' }
    }
  })

  // Screen capture → Python backend /hotkey/trigger
  ipcMain.handle('screen:capture', async () => {
    try {
      const result = await fetchJson('/hotkey/trigger', { method: 'POST' })
      return { text: 'Screen captured and analyzed by Synapta backend', error: undefined }
    } catch (err: any) {
      return { text: '', error: err.message }
    }
  })

  // Recommendations → Python backend /recommendations
  ipcMain.handle('cogos:recommendations', async () => {
    try {
      const result = await fetchJson('/recommendations')
      return result.items || []
    } catch {
      return []
    }
  })

  // Insights → Python backend /insights
  ipcMain.handle('cogos:insights', async () => {
    try {
      return await fetchJson('/insights')
    } catch {
      return { predictions: [], recommendations: [], twin_summary: {}, file_stats: {} }
    }
  })

  // Files → Python backend /files/recent
  ipcMain.handle('cogos:recentFiles', async (_, limit: number) => {
    try {
      const result = await fetchJson(`/files/recent?limit=${limit || 10}`)
      return result.files || []
    } catch {
      return []
    }
  })

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:togglePin', () => {
    if (mainWindow) {
      const current = mainWindow.isAlwaysOnTop()
      mainWindow.setAlwaysOnTop(!current)
    }
  })
  ipcMain.on('window:close', () => mainWindow?.hide())
  ipcMain.handle('window:isPinned', () => mainWindow?.isAlwaysOnTop() ?? true)

  // ============================================
  // Autonomous Observer — IPC handlers
  // ============================================

  // Observer status → Python backend /observer/status
  ipcMain.handle('cogos:observerStatus', async () => {
    try {
      return await fetchJson('/observer/status')
    } catch {
      return { status: 'offline', paused: false, total_observations: 0, total_learnings: 0, stuck: { is_stuck: false } }
    }
  })

  // Observer control → Python backend /observer/control
  ipcMain.handle('cogos:observerControl', async (_, paused: boolean) => {
    try {
      return await fetchJson('/observer/control', { method: 'POST', body: { paused } })
    } catch {
      return { paused }
    }
  })

  // Observer context → Python backend /observer/context
  ipcMain.handle('cogos:observerContext', async (_, limit: number) => {
    try {
      const result = await fetchJson(`/observer/context?limit=${limit || 5}`)
      return result.observations || []
    } catch {
      return []
    }
  })

  // Observer stuck state → Python backend /observer/stuck
  ipcMain.handle('cogos:observerStuck', async () => {
    try {
      return await fetchJson('/observer/stuck')
    } catch {
      return { is_stuck: false }
    }
  })

  // Nudge dismiss → Python backend /observer/nudge/dismiss
  ipcMain.handle('cogos:nudgeDismiss', async () => {
    try {
      return await fetchJson('/observer/nudge/dismiss', { method: 'POST' })
    } catch {
      return { ok: false }
    }
  })

  // Nudge accept → Python backend /observer/nudge/accept
  ipcMain.handle('cogos:nudgeAccept', async () => {
    try {
      return await fetchJson('/observer/nudge/accept', { method: 'POST' })
    } catch {
      return { ok: false, context: '' }
    }
  })

  // Get help (AI analysis) → Python backend /observer/help
  ipcMain.handle('cogos:getHelp', async () => {
    try {
      return await fetchJson('/observer/help', { method: 'POST' })
    } catch (err: any) {
      return { ok: false, suggestions: 'Could not reach the AI right now.', error: err.message }
    }
  })

  // Trigger on-demand coaching → Python backend /observer/coach/trigger
  ipcMain.handle('cogos:coachTrigger', async () => {
    try {
      return await fetchJson('/observer/coach/trigger', { method: 'POST' })
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // Get latest coaching insight → Python backend /observer/coach/latest
  ipcMain.handle('cogos:coachLatest', async () => {
    try {
      return await fetchJson('/observer/coach/latest')
    } catch {
      return { ok: false, insight: null }
    }
  })

  // Get coach interval → Python backend /observer/coach/interval
  ipcMain.handle('cogos:getCoachInterval', async () => {
    try {
      return await fetchJson('/observer/coach/interval')
    } catch {
      return { interval: 30.0 }
    }
  })

  // Set coach interval → Python backend /observer/coach/interval
  ipcMain.handle('cogos:setCoachInterval', async (_, interval: number) => {
    try {
      return await fetchJson('/observer/coach/interval', { method: 'POST', body: { interval } })
    } catch {
      return { ok: false, interval }
    }
  })



  // ============================================
  // Wellness Engine — IPC handlers
  // ============================================

  // Get current wellness state → Python backend /wellness
  ipcMain.handle('cogos:wellness', async () => {
    try {
      return await fetchJson('/wellness')
    } catch {
      return { mood: 'idle', mood_label: 'Offline', mood_color: '#6b7280', stress_level: 0, focus_score: 0, energy_estimate: 'medium', session_duration_minutes: 0, context_switch_rate: 0, active_signals: [], recommendations: [], timestamp: Date.now() / 1000 }
    }
  })

  // Get wellness history → Python backend /wellness/history
  ipcMain.handle('cogos:wellnessHistory', async (_, limit: number) => {
    try {
      const result = await fetchJson(`/wellness/history?limit=${limit || 12}`)
      return result.snapshots || []
    } catch {
      return []
    }
  })

  // ============================================
  // Privacy & Profile — IPC handlers
  // ============================================

  ipcMain.handle('cogos:getPrivacySettings', async () => {
    try {
      return await fetchJson('/privacy/settings')
    } catch {
      return { privacy_mode: 'denylist', window_allowlist: [], window_denylist: [] }
    }
  })

  ipcMain.handle('cogos:setPrivacySettings', async (_, settings: any) => {
    try {
      return await fetchJson('/privacy/settings', { method: 'POST', body: settings })
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('cogos:setCustomInstructions', async (_, instructions: string) => {
    try {
      return await fetchJson('/profile/instructions', { method: 'POST', body: { instructions } })
    } catch {
      return { ok: false }
    }
  })
}

// ============================================
// Insight Notification Popup
// ============================================

function getInsightPopupHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .popup {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: rgba(10, 10, 25, 0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 14px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.5),
      0 0 60px rgba(139, 92, 246, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transition: all 0.2s ease;
    animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .popup:hover {
    background: rgba(15, 15, 35, 0.95);
    border-color: rgba(139, 92, 246, 0.5);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.5),
      0 0 80px rgba(139, 92, 246, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(40px) scale(0.95); }
    to { opacity: 1; transform: translateX(0) scale(1); }
  }
  .icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }
  .icon-wrap::before {
    content: '';
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(139, 92, 246, 0.15);
    animation: pulse 2s ease-in-out infinite;
  }
  .icon {
    position: relative;
    z-index: 1;
    font-size: 20px;
    line-height: 1;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.8); opacity: 0; }
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 12px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 2px;
    letter-spacing: 0.01em;
  }
  .subtitle {
    font-size: 10px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arrow {
    font-size: 16px;
    color: rgba(139, 92, 246, 0.6);
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .popup:hover .arrow {
    transform: translateX(3px);
    color: rgba(139, 92, 246, 0.9);
  }
</style>
</head>
<body>
<div class="popup" id="popup">
  <div class="icon-wrap"><span class="icon">💡</span></div>
  <div class="content">
    <div class="title">New insights available</div>
    <div class="subtitle">Click to open Synapta</div>
  </div>
  <span class="arrow">›</span>
</div>
<script>
  document.getElementById('popup').addEventListener('click', () => {
    if (window.insightPopupAPI) window.insightPopupAPI.openMain();
  });
</script>
</body>
</html>`
}

function showInsightPopup(): void {
  // Don't show if main window is visible, or if popup already showing
  if (mainWindow?.isVisible()) return
  if (insightPopup && !insightPopup.isDestroyed()) return

  const display = screen.getPrimaryDisplay()
  const { width: sw, height: sh, x: sx, y: sy } = display.workArea

  const popupW = 300
  const popupH = 68
  const margin = 20

  insightPopup = new BrowserWindow({
    width: popupW,
    height: popupH,
    x: sx + sw - popupW - margin,
    y: sy + sh - popupH - margin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Load inline HTML (original, no navigation hack needed)
  const html = getInsightPopupHTML()
  // Replace the click handler to post a message to the host
  const htmlWithSignal = html.replace(
    `if (window.insightPopupAPI) window.insightPopupAPI.openMain();`,
    `require('electron').ipcRenderer.send('insight-popup:clicked');`
  )

  // Since sandbox is off and contextIsolation is true (no preload),
  // we use executeJavaScript after load to set up a click listener
  insightPopup.webContents.on('did-finish-load', () => {
    if (!insightPopup || insightPopup.isDestroyed()) return
    insightPopup.webContents.executeJavaScript(`
      document.addEventListener('mousedown', () => {
        // Signal click via console message (reliable cross-context method)
        console.log('__COGOS_POPUP_CLICKED__');
      });
    `).catch(() => {})
  })

  // Listen for the console message as the click signal
  insightPopup.webContents.on('console-message', (_event, _level, message) => {
    if (message === '__COGOS_POPUP_CLICKED__') {
      dismissInsightPopup()
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  insightPopup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  insightPopup.on('closed', () => {
    insightPopup = null
    if (insightPopupTimeout) {
      clearTimeout(insightPopupTimeout)
      insightPopupTimeout = null
    }
  })

  // Auto-dismiss after 10 seconds
  insightPopupTimeout = setTimeout(() => {
    dismissInsightPopup()
  }, 10000)

  console.log('[Synapta] Insight notification popup shown')
}

function dismissInsightPopup(): void {
  if (insightPopupTimeout) {
    clearTimeout(insightPopupTimeout)
    insightPopupTimeout = null
  }
  if (insightPopup && !insightPopup.isDestroyed()) {
    insightPopup.close()
    insightPopup = null
  }
}

// ============================================
// WebSocket — real-time event forwarding
// ============================================

function connectEventSocket(): void {
  if (eventSocket) {
    try { eventSocket.close() } catch { /* ignore */ }
  }

  try {
    eventSocket = new WebSocket(BACKEND_WS_URL)

    eventSocket.on('open', () => {
      console.log('[Synapta] WebSocket connected to backend event bus')
    })

    eventSocket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        const type = msg.type as string

        // Forward nudge events to the renderer
        if (type === 'nudge.stuck') {
          mainWindow?.webContents.send('cogos:nudge', msg.payload)
        }

        // Forward observer status updates
        if (type === 'observer.context_update' || type === 'observer.started' || type === 'observer.stopped') {
          mainWindow?.webContents.send('cogos:observerUpdate', msg.payload)
        }

        // Forward help response
        if (type === 'observer.help_given') {
          mainWindow?.webContents.send('cogos:helpGiven', msg.payload)
        }

        // Forward proactive coaching insight (every 60s)
        if (type === 'coach.insight') {
          mainWindow?.webContents.send('cogos:coachInsight', msg.payload)

          // Show notification popup if main window is hidden
          if (mainWindow && !mainWindow.isVisible()) {
            showInsightPopup()
          }
        }

        // Forward idle/active transitions
        if (type === 'observer.idle') {
          mainWindow?.webContents.send('cogos:idle', msg.payload)
        }
        if (type === 'observer.active') {
          mainWindow?.webContents.send('cogos:active', msg.payload)
        }

        // Forward wellness state updates
        if (type === 'wellness.update') {
          mainWindow?.webContents.send('cogos:wellnessUpdate', msg.payload)
        }
      } catch {
        // Ignore malformed messages
      }
    })

    eventSocket.on('close', () => {
      console.log('[Synapta] WebSocket disconnected — reconnecting in 5s...')
      eventSocket = null
      setTimeout(connectEventSocket, 5000)
    })

    eventSocket.on('error', (err) => {
      console.error('[Synapta] WebSocket error:', err.message)
      // close event will handle reconnect
    })
  } catch (err: any) {
    console.error('[Synapta] WebSocket connection failed:', err.message)
    setTimeout(connectEventSocket, 5000)
  }
}

// ============================================
// App lifecycle
// ============================================

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.Synapta.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start the Python backend
  startBackend()

  // Wait for backend to be ready
  console.log('[Synapta] Waiting for Python backend...')
  const backendReady = await waitForBackend(300000)
  if (backendReady) {
    console.log('[Synapta] Python backend is ready!')
  } else {
    console.warn('[Synapta] Backend did not start in time — app will run but some features may not work')
  }

  createWindow()
  createTray()
  registerHotkeys()
  registerIPC()

  // Connect to backend WebSocket for real-time events (nudges, observer updates)
  if (backendReady) {
    connectEventSocket()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  dismissInsightPopup()
  if (eventSocket) {
    try { eventSocket.close() } catch { /* ignore */ }
    eventSocket = null
  }
  stopBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (eventSocket) {
      try { eventSocket.close() } catch { /* ignore */ }
      eventSocket = null
    }
    stopBackend()
    app.quit()
  }
})
