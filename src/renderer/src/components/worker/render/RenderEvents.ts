export type WorkerEventType = 'init' | 'frame' | 'renderDone'

export type Renderer = 'auto' | 'webgl2' | 'webgl' | 'webgpu'

export interface WorkerEvent {
  type: WorkerEventType
}

export class RenderEvent implements WorkerEvent {
  type: WorkerEventType = 'frame'

  constructor(public frameData: ArrayBuffer) {}
}

export class InitEvent implements WorkerEvent {
  type: WorkerEventType = 'init'

  constructor(
    public canvas: OffscreenCanvas,
    public videoPort: MessagePort,
    public renderer: Renderer = 'auto',
    public reportFps: boolean = false,
    public useHardware: boolean = false,
    public useWebRTC: boolean = false
  ) {}
}
