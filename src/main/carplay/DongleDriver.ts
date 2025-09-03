// DongleDriver.ts
import EventEmitter from 'events'
import { MessageHeader, HeaderBuildError } from './messages/common.js'
import { PhoneType } from './messages/readable.js'
import {
  SendableMessage,
  SendNumber,
  FileAddress,
  SendOpen,
  SendBoolean,
  SendString,
  SendBoxSettings,
  SendCommand,
  HeartBeat
} from './messages/sendable.js'

const CONFIG_NUMBER = 1
const MAX_ERROR_COUNT = 5

export enum HandDriveType {
  LHD = 0,
  RHD = 1
}

export type PhoneTypeConfig = { frameInterval: number | null }
type PhoneTypeConfigMap = { [K in PhoneType]: PhoneTypeConfig }

export type DongleConfig = {
  androidWorkMode?: boolean
  width: number
  height: number
  fps: number
  dpi: number
  format: number
  iBoxVersion: number
  packetMax: number
  phoneWorkMode: number
  nightMode: boolean
  boxName: string
  hand: HandDriveType
  mediaDelay: number
  audioTransferMode: boolean
  wifiType: '2.4ghz' | '5ghz'
  micType: 'box' | 'os'
  phoneConfig: Partial<PhoneTypeConfigMap>
}

export const DEFAULT_CONFIG: DongleConfig = {
  width: 800,
  height: 480,
  fps: 60,
  dpi: 140,
  format: 5,
  iBoxVersion: 2,
  phoneWorkMode: 2,
  packetMax: 49152,
  boxName: 'nodePlay',
  nightMode: true,
  hand: HandDriveType.LHD,
  mediaDelay: 500,
  audioTransferMode: false,
  wifiType: '5ghz',
  micType: 'os',
  phoneConfig: {
    [PhoneType.CarPlay]: { frameInterval: 5000 },
    [PhoneType.AndroidAuto]: { frameInterval: null }
  }
}

export class DriverStateError extends Error {}

export class DongleDriver extends EventEmitter {
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private _device: USBDevice | null = null
  private _inEP: USBEndpoint | null = null
  private _outEP: USBEndpoint | null = null
  private errorCount = 0
  private _closing = false

  static knownDevices = [
    { vendorId: 0x1314, productId: 0x1520 },
    { vendorId: 0x1314, productId: 0x1521 }
  ]

  initialise = async (device: USBDevice) => {
    if (this._device) return

    try {
      this._device = device
      if (!device.opened) throw new DriverStateError('Device not opened')

      await device.selectConfiguration(CONFIG_NUMBER)
      const cfg = device.configuration
      if (!cfg) throw new DriverStateError('Device has no configuration')

      const { interfaceNumber, alternate } = cfg.interfaces[0]
      this._inEP = alternate.endpoints.find((e) => e.direction === 'in')!
      this._outEP = alternate.endpoints.find((e) => e.direction === 'out')!
      if (!this._inEP || !this._outEP) throw new DriverStateError('Endpoints missing')

      await device.claimInterface(interfaceNumber)
    } catch (err) {
      await this.close()
      throw err
    }
  }

  send = async (msg: SendableMessage): Promise<boolean> => {
    const dev = this._device
    if (!dev || !dev.opened) return false

    try {
      const buf = msg.serialise()
      const view = new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength)
      const res = await dev.transferOut(this._outEP!.endpointNumber, view)
      return res.status === 'ok'
    } catch (err) {
      console.error('Send error', err)
      return false
    }
  }

  private async readLoop() {
    while (this._device?.opened && !this._closing) {
      if (this.errorCount >= MAX_ERROR_COUNT) {
        await this.close()
        this.emit('failure')
        return
      }

      try {
        const headerBuf = (
          await this._device.transferIn(this._inEP!.endpointNumber, MessageHeader.dataLength)
        )?.data?.buffer
        if (this._closing) break
        if (!headerBuf) throw new HeaderBuildError('Empty header')

        const header = MessageHeader.fromBuffer(Buffer.from(headerBuf))
        let extra: Buffer | undefined
        if (header.length) {
          const extraBuf = (
            await this._device.transferIn(this._inEP!.endpointNumber, header.length)
          )?.data?.buffer
          if (this._closing) break
          if (!extraBuf) throw new Error('Failed to read extra data')
          extra = Buffer.from(extraBuf)
        }

        const msg = header.toMessage(extra)
        if (msg) this.emit('message', msg)
      } catch (err) {
        if (this._closing) break
        console.error('readLoop error', err)
        this.errorCount++
      }
    }
  }

  start = async (cfg: DongleConfig) => {
    if (!this._device) throw new DriverStateError('initialise() first')
    if (!this._device.opened) return

    this.errorCount = 0
    const messages: SendableMessage[] = [
      new SendNumber(cfg.dpi, FileAddress.DPI),
      new SendOpen(cfg),
      new SendBoolean(cfg.nightMode, FileAddress.NIGHT_MODE),
      new SendNumber(cfg.hand, FileAddress.HAND_DRIVE_MODE),
      new SendBoolean(true, FileAddress.CHARGE_MODE),
      new SendString(cfg.boxName, FileAddress.BOX_NAME),
      new SendBoxSettings(cfg),
      new SendCommand('wifiEnable'),
      new SendCommand(cfg.wifiType === '5ghz' ? 'wifi5g' : 'wifi24g'),
      new SendCommand(cfg.micType === 'box' ? 'boxMic' : 'mic'),
      new SendCommand(cfg.audioTransferMode ? 'audioTransferOn' : 'audioTransferOff')
    ]
    if (cfg.androidWorkMode)
      messages.push(new SendBoolean(cfg.androidWorkMode, FileAddress.ANDROID_WORK_MODE))

    await Promise.all(messages.map(this.send))
    setTimeout(() => this.send(new SendCommand('wifiConnect')), 1000)

    this.readLoop()
    this._heartbeatInterval = setInterval(() => this.send(new HeartBeat()), 2000)
  }

  close = async () => {
    if (!this._device) return

    this._closing = true
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval)
      this._heartbeatInterval = null
    }

    if (process.platform === 'darwin') await new Promise((r) => setTimeout(r, 50))

    try {
      await this._device.close()
    } catch (err) {
      console.warn('device.close() failed', err)
    }

    this._device = null
    this._inEP = null
    this._outEP = null
    this._closing = false
  }
}
