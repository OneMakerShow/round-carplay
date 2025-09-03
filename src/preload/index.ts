import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { ExtraConfig } from '../main/Globals'

type ApiCallback<T = any> = (event: IpcRendererEvent, ...args: T[]) => void

let usbEventQueue: [IpcRendererEvent, ...any[]][] = []
let usbEventHandlers: ApiCallback<any>[] = []

ipcRenderer.on('usb-event', (event, ...args) => {
  if (usbEventHandlers.length) {
    usbEventHandlers.forEach((h) => h(event, ...args))
  } else {
    usbEventQueue.push([event, ...args])
  }
})

type ChunkHandler = (payload: any) => void

let videoChunkQueue: any[] = []
let videoChunkHandler: ChunkHandler | null = null

let audioChunkQueue: any[] = []
let audioChunkHandler: ChunkHandler | null = null

ipcRenderer.on('carplay-video-chunk', (_event, payload) => {
  if (videoChunkHandler) {
    videoChunkHandler(payload)
  } else {
    videoChunkQueue.push(payload)
    console.log('[PRELOAD] Video chunk queued (no handler set)')
  }
})

ipcRenderer.on('carplay-audio-chunk', (_event, payload) => {
  if (audioChunkHandler) {
    audioChunkHandler(payload)
  } else {
    audioChunkQueue.push(payload)
    console.log('[PRELOAD] Audio chunk queued (no handler set)')
  }
})

const api = {
  quit: () => ipcRenderer.invoke('quit'),

  onUSBResetStatus: (callback: ApiCallback<any>) => {
    ipcRenderer.on('usb-reset-start', callback)
    ipcRenderer.on('usb-reset-done', callback)
  },

  usb: {
    forceReset: () => ipcRenderer.invoke('usb-force-reset'),
    detectDongle: () => ipcRenderer.invoke('usb-detect-dongle'),
    getDeviceInfo: () => ipcRenderer.invoke('carplay:usbDevice'),
    getLastEvent: () => ipcRenderer.invoke('usb-last-event'),
    getSysdefaultPrettyName: () => ipcRenderer.invoke('get-sysdefault-mic-label'),
    listenForEvents: (callback: ApiCallback<any>) => {
      usbEventHandlers.push(callback)
      usbEventQueue.forEach(([evt, ...args]) => callback(evt, ...args))
      usbEventQueue = []
    },
    unlistenForEvents: (callback: ApiCallback<any>) => {
      usbEventHandlers = usbEventHandlers.filter((cb) => cb !== callback)
    }
  },

  settings: {
    get: () => ipcRenderer.invoke('getSettings'),
    save: (settings: ExtraConfig) => ipcRenderer.invoke('save-settings', settings),
    onUpdate: (callback: ApiCallback<ExtraConfig>) => ipcRenderer.on('settings', callback)
  },

  ipc: {
    start: () => ipcRenderer.invoke('carplay-start'),
    stop: () => ipcRenderer.invoke('carplay-stop'),
    sendFrame: () => ipcRenderer.invoke('carplay-sendframe'),
    sendTouch: (x: number, y: number, action: number) =>
      ipcRenderer.send('carplay-touch', { x, y, action }),
    sendKeyCommand: (key: string) => ipcRenderer.send('carplay-key-command', key),
    onEvent: (callback: ApiCallback<any>) => ipcRenderer.on('carplay-event', callback),

    onVideoChunk: (handler: ChunkHandler) => {
      videoChunkHandler = handler
      videoChunkQueue.forEach((chunk) => handler(chunk))
      videoChunkQueue = []
    },
    onAudioChunk: (handler: ChunkHandler) => {
      audioChunkHandler = handler
      audioChunkQueue.forEach((chunk) => handler(chunk))
      audioChunkQueue = []
    }
  }
}

contextBridge.exposeInMainWorld('carplay', api)

declare global {
  interface Window {
    carplay: typeof api
  }
}
