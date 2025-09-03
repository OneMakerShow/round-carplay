export class WebRTCDecoder {
  private decoder!: VideoDecoder
  private onFrame: (frame: VideoFrame) => void
  private readonly supportedCodecs = [
    'avc1.64002A', // H.264 High Profile Level 4.2
    'avc1.42E01F', // H.264 Baseline Profile Level 3.0
    'h264' // Generic H.264
  ]
  private resetCount = 0
  private readonly maxResetAttempts = 3

  constructor(onFrame: (frame: VideoFrame) => void) {
    this.onFrame = onFrame
    this.initDecoder()
  }

  private initDecoder(): void {
    this.decoder = new VideoDecoder({
      output: (frame) => this.handleFrame(frame),
      error: (e) => this.handleError(e)
    })
  }

  private handleFrame(frame: VideoFrame): void {
    try {
      if (frame.timestamp != null) {
        this.onFrame(frame)
      } else {
        console.warn('[WebRTCDecoder] Received frame with null timestamp')
      }
    } finally {
      frame.close()
    }
  }

  private handleError(error: Error): void {
    console.error('[WebRTCDecoder] Decoder error:', error)
    if (this.resetCount < this.maxResetAttempts) {
      this.resetCount++
      console.warn(
        `[WebRTCDecoder] Attempting decoder reset (${this.resetCount}/${this.maxResetAttempts})`
      )
      this.resetDecoder()
    } else {
      console.error('[WebRTCDecoder] Max reset attempts reached')
    }
  }

  private resetDecoder(): void {
    try {
      if (this.decoder.state !== 'closed') {
        this.decoder.close()
      }
      this.initDecoder()
    } catch (e) {
      console.error('[WebRTCDecoder] Reset failed:', e)
    }
  }

  async configure(config: VideoDecoderConfig): Promise<boolean> {
    // Try with hardware acceleration
    if (
      await this.tryConfigure({
        ...config,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware'
      })
    ) {
      return true
    }

    // Try without hardware acceleration
    if (
      await this.tryConfigure({
        ...config,
        optimizeForLatency: true,
        hardwareAcceleration: 'no-preference'
      })
    ) {
      return true
    }

    // Try alternative codecs
    for (const codec of this.supportedCodecs) {
      if (
        codec !== config.codec &&
        (await this.tryConfigure({
          codec,
          codedWidth: config.codedWidth,
          codedHeight: config.codedHeight,
          optimizeForLatency: true,
          hardwareAcceleration: 'no-preference'
        }))
      ) {
        return true
      }
    }

    console.warn('[WebRTCDecoder] All configuration attempts failed')
    return false
  }

  private async tryConfigure(config: VideoDecoderConfig): Promise<boolean> {
    try {
      console.log('[WebRTCDecoder] Trying config:', config)
      const support = await VideoDecoder.isConfigSupported(config)
      if (!support.supported) {
        console.log('[WebRTCDecoder] Config not supported')
        return false
      }

      if (this.decoder.state === 'closed') {
        this.resetDecoder()
      }

      this.decoder.configure(support.config || config)
      console.log('[WebRTCDecoder] Configuration successful')
      this.resetCount = 0
      return true
    } catch (e) {
      console.error('[WebRTCDecoder] Configuration failed:', e)
      return false
    }
  }

  decode(data: Uint8Array, isKeyFrame: boolean): void {
    if (this.decoder.state !== 'configured') {
      console.warn('[WebRTCDecoder] Decoder not ready, ignoring frame')
      return
    }

    try {
      const buffer = new ArrayBuffer(data.byteLength)
      new Uint8Array(buffer).set(data)

      const chunk = new EncodedVideoChunk({
        type: isKeyFrame ? 'key' : 'delta',
        timestamp: performance.now(),
        data: buffer
      })
      this.decoder.decode(chunk)
    } catch (e) {
      console.error('[WebRTCDecoder] Decode error:', e)
      this.handleError(e as Error)
    }
  }

  close(): void {
    try {
      if (this.decoder.state !== 'closed') {
        this.decoder.close()
      }
    } catch (e) {
      console.error('[WebRTCDecoder] Error closing decoder:', e)
    }
  }

  async getCapabilities(): Promise<void> {
    for (const codec of this.supportedCodecs) {
      try {
        const support = await VideoDecoder.isConfigSupported({
          codec,
          codedWidth: 1920,
          codedHeight: 1080,
          hardwareAcceleration: 'prefer-hardware'
        })
        console.log(`[WebRTCDecoder] ${codec} support:`, {
          supported: support.supported,
          config: support.config
        })
      } catch (e) {
        console.error('[WebRTCDecoder] Capabilities check failed:', e)
      }
    }
  }
}
