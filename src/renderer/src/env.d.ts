/// <reference types="@webgpu/types" />

declare module 'pcm-ringbuf-player' {
  export class PcmPlayer {
    readonly sab: SharedArrayBuffer
    constructor(sampleRate: number, channels: number)
    volume(volume: number, duration?: number): void
    start(): void
    stop(): void
  }
}

interface USBDevice {
  readonly productName?: string
  readonly manufacturerName?: string
  readonly serialNumber?: string
  readonly deviceVersionMajor?: number
  readonly deviceVersionMinor?: number
  readonly vendorId: number
  readonly productId: number
}

interface USBDeviceRequestOptions {
  filters?: Array<Partial<USBDevice>>
}

declare global {
  interface Navigator {
    usb: {
      getDevices(): Promise<USBDevice[]>
      requestDevice(options?: USBDeviceRequestOptions): Promise<USBDevice>
      addEventListener(
        type: 'connect' | 'disconnect',
        listener: (ev: Event) => void
      ): void
      removeEventListener(
        type: 'connect' | 'disconnect',
        listener: (ev: Event) => void
      ): void
    }
  }
}

export {}