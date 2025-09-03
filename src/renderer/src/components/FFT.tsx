import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useCarplayStore } from '../store/store'
import { themeColors } from '../themeColors'

export interface FFTSpectrumProps {
  data: number[] | Float32Array
}

// Configuration
const POINTS = 24
const FFT_SIZE = 4096
const LABEL_FONT_SIZE = 16
const MARGIN_BOTTOM = 16
const MIN_FREQ = 20
const MAX_FREQ = 20000
const SPECTRUM_WIDTH_RATIO = 0.92
const TARGET_FPS = 30

export default function FFTSpectrum({ data }: FFTSpectrumProps) {
  const barColor = themeColors.barColor
  const peakColor = themeColors.peakColor

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef<number[] | Float32Array>(data)
  dataRef.current = data

  const sampleRate = useCarplayStore((s) => s.audioSampleRate) ?? 44100
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Worker and buffers
  const workerRef = useRef<Worker | null>(null)
  const binsRef = useRef<Float32Array>(new Float32Array(POINTS))
  const peaksRef = useRef<number[]>([])

  useEffect(() => {
    peaksRef.current = Array(POINTS).fill(0)
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('./worker/fft.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker
    worker.postMessage({
      type: 'init',
      fftSize: FFT_SIZE,
      points: POINTS,
      sampleRate,
      minFreq: MIN_FREQ,
      maxFreq: MAX_FREQ
    })
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'bins') {
        binsRef.current = new Float32Array(e.data.bins)
      }
    }
    return () => worker.terminate()
  }, [sampleRate])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker || dataRef.current.length === 0) return
    const buf = dataRef.current instanceof Float32Array
      ? dataRef.current
      : new Float32Array(dataRef.current)
    worker.postMessage({ type: 'pcm', buffer: buf.buffer }, [buf.buffer])
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const update = () => {
      const { width, height } = canvas.getBoundingClientRect()
      setDimensions({ width, height })
    }
    const obs = new ResizeObserver(update)
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const bg = bgCanvasRef.current
    if (!bg || dimensions.width === 0) return
    const ctx = bg.getContext('2d')!
    const { width: cw, height: ch } = dimensions
    const usableH = ch - MARGIN_BOTTOM
    const specW = cw * SPECTRUM_WIDTH_RATIO
    const xOff = (cw - specW) / 2
    bg.width = cw
    bg.height = ch

    ctx.clearRect(0, 0, cw, ch)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(xOff, 0, specW, usableH)

    ctx.strokeStyle = '#555'
    ctx.lineWidth = 0.5
    ;[0.25, 0.5, 0.75].forEach(f => {
      const y = usableH * f
      ctx.beginPath()
      ctx.moveTo(xOff, y)
      ctx.lineTo(xOff + specW, y)
      ctx.stroke()
    })

    const freqs = [MIN_FREQ, 100, 500, 1000, 5000, 10000, MAX_FREQ]
    ctx.fillStyle = '#aaa'
    ctx.font = `${LABEL_FONT_SIZE}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const logMin = Math.log10(MIN_FREQ)
    const logMax = Math.log10(MAX_FREQ)
    const logDen = logMax - logMin

    freqs.forEach(freq => {
      const pos = (Math.log10(freq) - logMin) / logDen
      const x = xOff + pos * specW
      ctx.strokeStyle = '#666'
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, usableH)
      ctx.stroke()
      const label = freq >= 1000 ? `${freq/1000}k` : `${freq}`
      ctx.fillText(label, x, usableH + 2)
    })
  }, [dimensions, sampleRate])

  useEffect(() => {
    let rafId: number
    let last = 0
    const draw = () => {
      rafId = requestAnimationFrame(draw)
      const now = performance.now()
      if (now - last < 1000 / TARGET_FPS) return
      last = now
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const { width: cw, height: ch } = dimensions
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }

      ctx.clearRect(0, 0, cw, ch)
      const usableH = ch - MARGIN_BOTTOM
      const specW = cw * SPECTRUM_WIDTH_RATIO
      const xOff = (cw - specW) / 2
      const barW = specW / POINTS
      const bins = binsRef.current
      const peaks = peaksRef.current
      const decay = usableH * 0.02

      for (let i = 0; i < POINTS; i++) {
        const h = bins[i] * usableH
        const x = xOff + i * barW
        peaks[i] = h > peaks[i] ? h : Math.max(peaks[i] - decay, 0)
        ctx.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.4))'
        ctx.fillStyle = barColor
        ctx.fillRect(x, usableH - h, barW * 0.8, h)
        ctx.filter = 'none'
        ctx.fillStyle = peakColor
        ctx.fillRect(x, usableH - peaks[i] - 2, barW * 0.8, 2)
      }
    }
    draw()
    return () => cancelAnimationFrame(rafId)
  }, [dimensions])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Box
        ref={bgCanvasRef}
        component='canvas'
        sx={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
      />
      <Box
        ref={canvasRef}
        component='canvas'
        sx={{ position: 'absolute', width: '100%', height: '100%', background: 'transparent', zIndex: 2 }}
      />
    </Box>
  )
}
