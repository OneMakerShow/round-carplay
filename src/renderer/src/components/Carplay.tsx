import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Typography } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { CommandMapping } from '../../../main/carplay/messages/common'

import { ExtraConfig } from '../../../main/Globals'
import { useCarplayStore, useStatusStore } from '../store/store'
import { InitEvent, Renderer } from './worker/render/RenderEvents'
import useCarplayAudio from './useCarplayAudio'
import { useCarplayTouch } from './useCarplayTouch'
import type { CarPlayWorker, KeyCommand } from './worker/types'

const RETRY_DELAY_MS = 3000

interface CarplayProps {
  receivingVideo: boolean
  setReceivingVideo: (v: boolean) => void
  settings: ExtraConfig
  command: KeyCommand
  commandCounter: number
}

const Carplay: React.FC<CarplayProps> = ({
  receivingVideo,
  setReceivingVideo,
  settings,
  command,
  commandCounter
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  // Zustand Store
  const isStreaming = useStatusStore((s) => s.isStreaming)
  const setStreaming = useStatusStore((s) => s.setStreaming)
  const setDongleConnected = useStatusStore((s) => s.setDongleConnected)
  const isDongleConnected = useStatusStore((s) => s.isDongleConnected)
  const resetInfo = useCarplayStore((s) => s.resetInfo)
  const setDeviceInfo = useCarplayStore((s) => s.setDeviceInfo)
  const setNegotiatedResolution = useCarplayStore((s) => s.setNegotiatedResolution)
  const setAudioInfo = useCarplayStore((s) => s.setAudioInfo)
  const setPcmData = useCarplayStore((s) => s.setPcmData)

  useEffect(() => {
    console.log('[UI] Dongle connected:', isDongleConnected)
  }, [isDongleConnected])

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mainElem = useRef<HTMLDivElement>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasStartedRef = useRef(false)
  const [renderReady, setRenderReady] = useState(false)

  // MediaPlayStatus Handling
  const mediaPlayStatusRef = useRef<number | undefined>(undefined)
  const audioCommandRef = useRef<number | undefined>(undefined)

  // RenderWorker + OffscreenCanvas per Ref
  const renderWorkerRef = useRef<Worker | null>(null)
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null)

  // Render settings
  const preferredRenderer = 'auto' //  'auto' | 'webgl2' | 'webgl' | 'webgpu'
  const reportFps = false
  const useHardware = true // true => prefere-hardware, false => no-preference hardware->software
  const useWebRTC = true

  // Get Settings
  const configRef = useRef(settings)
  useEffect(() => {
    configRef.current = settings
  }, [settings])

  // CHANNELS
  const videoChannel = useMemo(() => new MessageChannel(), [])
  const micChannel = useMemo(() => new MessageChannel(), [])

  // CarPlay Worker Setup
  const carplayWorker = useMemo<CarPlayWorker>(() => {
    const w = new Worker(new URL('./worker/CarPlay.worker.ts', import.meta.url), {
      type: 'module'
    }) as CarPlayWorker

    w.onerror = (e) => {
      console.error('Worker error:', e)
    }

    console.log('[CARPLAY] Creating CarPlayWorker with port:', {
      microphonePort: micChannel.port1
    })

    w.postMessage(
      {
        type: 'initialise',
        payload: {
          microphonePort: micChannel.port1
        }
      },
      [micChannel.port1]
    )
    return w
  }, [micChannel])

  // Render Worker Setup
  useEffect(() => {
    if (canvasRef.current && !offscreenCanvasRef.current && !renderWorkerRef.current) {
      offscreenCanvasRef.current = canvasRef.current.transferControlToOffscreen()
      const w = new Worker(new URL('./worker/render/Render.worker.ts', import.meta.url), {
        type: 'module'
      })
      renderWorkerRef.current = w
      w.postMessage(
        new InitEvent(
          offscreenCanvasRef.current,
          videoChannel.port2,
          preferredRenderer as Renderer,
          reportFps,
          useHardware,
          useWebRTC
        ),
        [offscreenCanvasRef.current, videoChannel.port2]
      )
    }
    // Cleanup when canvas is unmounted
    return () => {
      renderWorkerRef.current?.terminate()
      renderWorkerRef.current = null
      offscreenCanvasRef.current = null
    }
  }, [videoChannel])

  useEffect(() => {
    if (!renderWorkerRef.current) return
    const handler = (ev: MessageEvent<any>) => {
      if (ev.data?.type === 'render-ready') {
        console.log('[CARPLAY] Render worker ready message recived')
        setRenderReady(true)
      }
    }
    renderWorkerRef.current.addEventListener('message', handler)
    return () => renderWorkerRef.current?.removeEventListener('message', handler)
  }, [])

  // Preload-Chunks fwd to Worker-Port
  useEffect(() => {
    const handleVideo = (packet: any) => {
      if (!renderReady) return

      const { chunk } = packet
      const transfer = chunk.buffer

      videoChannel.port1.postMessage(transfer, [transfer])
    }

    window.carplay.ipc.onVideoChunk(handleVideo)

    return () => {}
  }, [videoChannel, renderReady])

  useEffect(() => {
    const handleAudio = (chunk: any) => {
      if (chunk && chunk.chunk && chunk.chunk.buffer) {
        micChannel.port2.postMessage(
          {
            type: 'audio',
            buffer: chunk.chunk.buffer,
            ...chunk
          },
          [chunk.chunk.buffer]
        )
      }
    }

    window.carplay.ipc.onAudioChunk(handleAudio)

    return () => {}
  }, [micChannel])

  // Start CarPlay-Service
  useEffect(() => {
    ;(async () => {
      try {
        await window.carplay.ipc.start()
      } catch (err) {
        console.error('CarPlay start failed:', err)
      }
    })()
  }, [])

  // Audio- and Touch-Hooks
  const { processAudio, getAudioPlayer } = useCarplayAudio(carplayWorker)

  const sendTouchEvent = useCarplayTouch()

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  // Carplay Worker messages
  useEffect(() => {
    if (!carplayWorker) return
    const handler = (ev: MessageEvent<any>) => {
      const { type, payload, message } = ev.data
      switch (type) {
        case 'plugged':
          setDongleConnected(true)
          break
        case 'unplugged':
          hasStartedRef.current = false
          setDongleConnected(false)
          setStreaming(false)
          setReceivingVideo(false)
          resetInfo()
          break
        case 'requestBuffer':
          clearRetryTimeout()
          getAudioPlayer(message)
          break
        case 'audio':
          clearRetryTimeout()
          processAudio({
            ...message,
            command: audioCommandRef.current
          })
          audioCommandRef.current = undefined
          break
        case 'audioInfo':
          setAudioInfo(payload)
          break
        case 'pcmData':
          setPcmData(new Float32Array(payload as ArrayBuffer))
          break
        case 'command': {
          const val = (message as any).value
          if (val === CommandMapping.requestHostUI) navigate('/settings')
          break
        }
        case 'dongleInfo':
          setDeviceInfo(payload)
          break
        case 'resolution':
          setNegotiatedResolution(payload.width, payload.height)
          setStreaming(true)
          setReceivingVideo(true)
          hasStartedRef.current = true
          break
        case 'failure':
          hasStartedRef.current = false
          if (!retryTimeoutRef.current) {
            retryTimeoutRef.current = setTimeout(() => window.location.reload(), RETRY_DELAY_MS)
          }
          break
      }
    }
    carplayWorker.addEventListener('message', handler)
    return () => carplayWorker.removeEventListener('message', handler)
  }, [
    carplayWorker,
    clearRetryTimeout,
    getAudioPlayer,
    processAudio,
    navigate,
    setDeviceInfo,
    setNegotiatedResolution,
    setAudioInfo,
    setPcmData,
    setDongleConnected,
    setStreaming,
    resetInfo,
    setReceivingVideo
  ])

  // USB
  useEffect(() => {
    const onUsbConnect = async () => {
      if (!hasStartedRef.current) {
        resetInfo()
        setDongleConnected(true)
        hasStartedRef.current = true
        await window.carplay.ipc.start()
      }
    }
    const onUsbDisconnect = async () => {
      clearRetryTimeout()
      setReceivingVideo(false)
      setStreaming(false)
      setDongleConnected(false)
      hasStartedRef.current = false
      resetInfo()
      await window.carplay.ipc.stop()
      if (canvasRef.current) {
        canvasRef.current.style.width = '0'
        canvasRef.current.style.height = '0'
      }
    }
    const usbHandler = (_: any, data: { type: string }) => {
      if (data.type === 'plugged') onUsbConnect()
      else if (data.type === 'unplugged') onUsbDisconnect()
    }
    window.carplay.usb.listenForEvents(usbHandler)

    ;(async () => {
      const last = await window.carplay.usb.getLastEvent()
      if (last) usbHandler(null, last)
    })()

    return () => {
      window.electron?.ipcRenderer.removeListener('usb-event', usbHandler)
    }
  }, [setReceivingVideo, setDongleConnected, setStreaming, clearRetryTimeout, navigate, resetInfo])

  // Settings-Events
  useEffect(() => {
    const handler = (_: any, data: any) => {
      switch (data.type) {
        case 'resolution':
          useCarplayStore.setState({
            negotiatedWidth: data.payload.width,
            negotiatedHeight: data.payload.height
          })
          useStatusStore.setState({ isStreaming: true })
          setReceivingVideo(true)
          break
        case 'audioInfo':
          useCarplayStore.setState({
            audioCodec: data.payload.codec,
            audioSampleRate: data.payload.sampleRate,
            audioChannels: data.payload.channels,
            audioBitDepth: data.payload.bitDepth
          })
          break
        case 'media': {
          const playStatus = data.payload?.payload?.media?.MediaPlayStatus
          const prevStatus = mediaPlayStatusRef.current
          if (typeof playStatus === 'number' && playStatus !== prevStatus) {
            mediaPlayStatusRef.current = playStatus
            audioCommandRef.current = playStatus
          }
          break
        }
        case 'plugged':
          useStatusStore.setState({ isDongleConnected: true })
          break
        case 'unplugged':
          useStatusStore.setState({
            isDongleConnected: false,
            isStreaming: false
          })
          useCarplayStore.getState().resetInfo()
          break
        case 'command':
          if (data.message?.value === CommandMapping.requestHostUI) navigate('/settings')
          break
      }
    }
    window.carplay.ipc.onEvent(handler)
    return () => {
      window.electron?.ipcRenderer.removeListener('carplay-event', handler)
    }
  }, [navigate])

  // Resize Observer
  useEffect(() => {
    if (!carplayWorker || !mainElem.current) return
    const obs = new ResizeObserver(() => carplayWorker.postMessage({ type: 'frame' }))
    obs.observe(mainElem.current)
    return () => obs.disconnect()
  }, [carplayWorker])

  // KeyCommand
  useEffect(() => {
    if (commandCounter) {
      window.carplay.ipc.sendKeyCommand(command)
    }
  }, [command, commandCounter])

  // Cleanup
  useEffect(() => {
    return () => {
      carplayWorker.terminate()
      renderWorkerRef.current?.terminate()
      renderWorkerRef.current = null
      offscreenCanvasRef.current = null
    }
  }, [carplayWorker])

  const isLoading = !isStreaming

  return (
    <div
      id="main"
      ref={mainElem}
      className="App"
      style={
        pathname === '/'
          ? { height: '100%', width: '100%', touchAction: 'none' }
          : { display: 'none' }
      }
    >
      {(!isDongleConnected || isLoading) && pathname === '/' && (
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Typography>
            {!isDongleConnected ? 'Searching For Dongle' : 'Searching For Phone'}
          </Typography>
        </div>
      )}
      <div
        id="videoContainer"
        onPointerDown={sendTouchEvent}
        onPointerMove={sendTouchEvent}
        onPointerUp={sendTouchEvent}
        onPointerCancel={sendTouchEvent}
        onPointerOut={sendTouchEvent}
        style={{
          height: '100%',
          width: '100%',
          padding: 0,
          margin: 0,
          display: 'flex',
          visibility: receivingVideo ? 'visible' : 'hidden',
          zIndex: receivingVideo ? 1 : -1
        }}
      >
        <canvas
          ref={canvasRef}
          id="video"
          style={{
            width: receivingVideo ? '100%' : '0',
            height: receivingVideo ? '100%' : '0'
          }}
        />
      </div>
    </div>
  )
}

export default React.memo(Carplay)
