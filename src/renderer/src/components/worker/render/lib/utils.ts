import { Bitstream, NALUStream, SPS, StreamType } from './h264-utils'

export enum NaluTypes {
  NDR = 1,
  IDR = 5,
  SEI = 6,
  SPS = 7,
  PPS = 8,
  AUD = 9
}

export interface GetNaluResult {
  nalu: Uint8Array
  rawNalu: Uint8Array
  type: NaluTypes
}

export function getNaluFromStream(
  buffer: Uint8Array,
  type: NaluTypes,
  streamType: StreamType = 'annexB'
): GetNaluResult | null {
  const stream = new NALUStream(buffer, { type: streamType })
  for (const nalu of stream.nalus()) {
    if (!nalu?.nalu || nalu.nalu.length < 4) continue
    const bs = new Bitstream(nalu.nalu)
    bs.seek(3)
    const nalUnitType = bs.u(5)
    if (nalUnitType === type) {
      return {
        nalu: nalu.nalu,
        rawNalu: nalu.rawNalu!,
        type: nalUnitType
      }
    }
  }
  return null
}

export function getDecoderConfig(
  data: Uint8Array
): { codec: string; codedWidth: number; codedHeight: number } | null {
  for (const st of ['annexB', 'packet'] as StreamType[]) {
    try {
      const res = getNaluFromStream(data, NaluTypes.SPS, st)
      if (res) {
        const sps = new SPS(res.nalu)
        return {
          codec: sps.MIME,
          codedWidth: sps.picWidth,
          codedHeight: sps.picHeight
        }
      }
    } catch (e) {
      console.warn(`[lib/utils] getDecoderConfig failed for ${st}:`, e)
    }
  }
  return null
}

export function isKeyFrame(data: Uint8Array): boolean {
  return !!getNaluFromStream(data, NaluTypes.IDR)
}

export { SPS } from './h264-utils'
