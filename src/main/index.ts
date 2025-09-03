import { app, shell, BrowserWindow, session, ipcMain, protocol } from 'electron'
import { join, extname } from 'path'
import { existsSync, createReadStream, readFileSync, writeFileSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import { DEFAULT_CONFIG } from '@carplay/node'
import { Socket } from './Socket'
import { ExtraConfig, KeyBindings } from './Globals'
import { USBService } from './usb/USBService'
import { CarplayService } from './carplay/CarplayService'

// Important: On Linux, enabling VA-API flags breaks WebCodecs’ hardware fallback path.
// Requesting ‘prefer-hardware’ without a valid VA-API backend will immediately close the decoder.
// Therefore on Linux we default to ‘prefer-software’ and only switch to hardware after confirming support.
// On macOS, the WebCodecs hardware accelerator is available, so this Linux-specific fallback logic is not needed.

// Feature-Flags
app.commandLine.appendSwitch(
  'enable-features',
  [
    'AcceleratedVideoEncoder',
    'AcceleratedVideoDecodeLinuxGL',
    'AcceleratedVideoDecodeLinuxZeroCopyGL'
  ].join(',')
)

// EGL/ANGLE for OpenGL
app.commandLine.appendSwitch('use-gl', 'angle')
app.commandLine.appendSwitch('use-angle', 'gl')

// Disable blocklist & workarounds
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-gpu-driver-bug-workaround')

// GPU rasterization
app.commandLine.appendSwitch('enable-gpu-rasterization')

if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-unsafe-webgpu')
  app.commandLine.appendSwitch('enable-dawn-features')
}

app.on('gpu-info-update', () => {
  console.log('GPU Info:', app.getGPUFeatureStatus())
})

const mimeTypeFromExt = (ext: string): string =>
  ({
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.map': 'application/json'
  })[ext.toLowerCase()] ?? 'application/octet-stream'

const MIN_WIDTH = 400

function applyAspectRatio(win: BrowserWindow, width: number, height: number): void {
  if (!win) return

  const ratio = width && height ? width / height : 0

  const [winW, winH] = win.getSize()
  const [contentW, contentH] = win.getContentSize()
  const extraWidth = Math.max(0, winW - contentW)
  const extraHeight = Math.max(0, winH - contentH)

  win.setAspectRatio(ratio, { width: extraWidth, height: extraHeight })

  if (ratio > 0) {
    const minH = Math.round(MIN_WIDTH / ratio)
    win.setMinimumSize(MIN_WIDTH + extraWidth, minH + extraHeight)
  } else {
    win.setMinimumSize(0, 0)
  }
}

// Globals
let mainWindow: BrowserWindow | null
let socket: Socket
let config: ExtraConfig
let usbService: USBService
let isQuitting = false

const carplayService = new CarplayService()
;(global as any).carplayService = carplayService

app.on('before-quit', async (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()
  try {
    carplayService['shuttingDown'] = true
    await carplayService.stop()
    await usbService['forceReset']?.()
    await usbService.stop()
  } catch (err) {
    console.warn('Error while quitting:', err)
  } finally {
    app.exit(0)
  }
})

// Protocol & Config
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

const appPath = app.getPath('userData')
const configPath = join(appPath, 'config.json')

const DEFAULT_BINDINGS: KeyBindings = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  selectUp: 'KeyB',
  selectDown: 'Space',
  back: 'Backspace',
  home: 'KeyH',
  play: 'KeyP',
  pause: 'KeyO',
  next: 'KeyM',
  prev: 'KeyN'
}

function loadConfig(): ExtraConfig {
  let fileConfig: Partial<ExtraConfig> = {}
  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, 'utf8'))
  }

  const merged: ExtraConfig = {
    ...DEFAULT_CONFIG,
    kiosk: true,
    camera: '',
    microphone: '',
    nightMode: true,
    audioVolume: 1.0,
    navVolume: 0.5,
    bindings: { ...DEFAULT_BINDINGS },
    ...fileConfig
  } as ExtraConfig

  merged.bindings = {
    ...DEFAULT_BINDINGS,
    ...(fileConfig.bindings || {})
  }

  const needWrite = !existsSync(configPath) || JSON.stringify(fileConfig) !== JSON.stringify(merged)

  if (needWrite) {
    writeFileSync(configPath, JSON.stringify(merged, null, 2))
    console.log('[config] Written complete config.json with all defaults')
  }

  return merged
}

config = loadConfig()

// Window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: config.width,
    height: config.height,
    frame: !config.kiosk,
    useContentSize: true,
    kiosk: false,
    autoHideMenuBar: true,
    backgroundColor: '#000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: true
    }
  })

  const ses = mainWindow.webContents.session
  ses.setPermissionCheckHandler((_w, p) => ['usb', 'hid', 'media', 'display-capture'].includes(p))
  ses.setPermissionRequestHandler((_w, p, cb) =>
    cb(['usb', 'hid', 'media', 'display-capture'].includes(p))
  )
  ses.setUSBProtectedClassesHandler(({ protectedClasses }) =>
    protectedClasses.filter((c) => ['audio', 'video', 'vendor-specific'].includes(c))
  )

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*/*', 'file://*/*'] },
    (d, cb) =>
      cb({
        responseHeaders: {
          ...d.responseHeaders,
          'Cross-Origin-Opener-Policy': ['same-origin'],
          'Cross-Origin-Embedder-Policy': ['require-corp'],
          'Cross-Origin-Resource-Policy': ['same-site']
        }
      })
  )

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()

    if (config.kiosk) {
      mainWindow.setKiosk(true)
      applyAspectRatio(mainWindow, 0, 0)
    } else {
      mainWindow.setContentSize(config.width, config.height, false)
      applyAspectRatio(mainWindow, config.width, config.height)
    }

    if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
    carplayService.attachRenderer(mainWindow.webContents)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadURL('app://index.html')

  // macOS hide
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // chrome://gpu
  if (is.dev) {
    const gpuWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'GPU Info',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    gpuWindow.loadURL('chrome://gpu')
  }
  // chrome://media-internals
  if (is.dev) {
    const mediaWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'GPU Info',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    mediaWindow.loadURL('chrome://media-internals')
  }
}

// App‑Lifecycle
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.carplay')

  protocol.registerStreamProtocol('app', (request, cb) => {
    try {
      const u = new URL(request.url)
      let path = decodeURIComponent(u.pathname)
      if (path === '/' || path === '') path = '/index.html'
      const file = join(__dirname, '../renderer', path)
      if (!existsSync(file)) return cb({ statusCode: 404 })
      cb({
        statusCode: 200,
        headers: {
          'Content-Type': mimeTypeFromExt(extname(file)),
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-site'
        },
        data: createReadStream(file)
      })
    } catch (e) {
      console.error('[app-protocol] error', e)
      cb({ statusCode: 500 })
    }
  })

  usbService = new USBService(carplayService)
  socket = new Socket(config, saveSettings)

  ipcMain.handle('quit', () => (process.platform === 'darwin' ? mainWindow?.hide() : app.quit()))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) createWindow()
    else mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Settings IPC
function saveSettings(settings: ExtraConfig) {
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        ...settings,
        width: +settings.width,
        height: +settings.height,
        fps: +settings.fps,
        dpi: +settings.dpi,
        format: +settings.format,
        iBoxVersion: +settings.iBoxVersion,
        phoneWorkMode: +settings.phoneWorkMode,
        packetMax: +settings.packetMax,
        mediaDelay: +settings.mediaDelay
      },
      null,
      2
    )
  )

  socket.config = settings
  socket.sendSettings()

  if (!mainWindow) return

  if (settings.kiosk) {
    mainWindow.setKiosk(true)
    applyAspectRatio(mainWindow, 0, 0)
  } else {
    mainWindow.setKiosk(false)
    mainWindow.setContentSize(settings.width, settings.height, false)
    applyAspectRatio(mainWindow, settings.width, settings.height)
  }
}
