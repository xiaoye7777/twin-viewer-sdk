import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { json, record } from './packageFormat'
import type { AssetType } from '@/infrastructure/assets/AssetRepository'

/** Only self-contained GLB and Radiance HDR are supported by the current asset UI. */
export function validatePortableAsset(bytes: Uint8Array, type: AssetType): void {
  if (type === 'environment') {
    const header = new TextDecoder().decode(bytes.subarray(0, 8192))
    const dimensions = /-Y\s+(\d+)\s+\+X\s+(\d+)/.exec(header)
    if (!/^#\?(RADIANCE|RGBE)/.test(header) || !dimensions || Number(dimensions[1]) * Number(dimensions[2]) > 16 * 1024 ** 2) throw new Error('HDR 格式无效或尺寸过大')
    try { new RGBELoader().parse(new Uint8Array(bytes).buffer) }
    catch { throw new Error('HDR 数据损坏') }
    return
  }
  if (bytes.length < 20) throw new Error('GLB 文件被截断')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error('GLB 头部或版本无效')
  let model: unknown, binarySize = 0
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('GLB chunk 不完整')
    const size = view.getUint32(offset, true), kind = view.getUint32(offset + 4, true)
    if (size % 4 || offset + 8 + size > bytes.length) throw new Error('GLB chunk 大小无效')
    if (offset === 12 && kind !== 0x4e4f534a) throw new Error('GLB 缺少 JSON chunk')
    if (kind === 0x4e4f534a) { if (model) throw new Error('GLB 重复 JSON'); model = json(bytes.subarray(offset + 8, offset + 8 + size), 'GLB JSON') }
    if (kind === 0x004e4942) binarySize += size
    offset += 8 + size
  }
  if (!record(model) || !record(model.asset) || model.asset.version !== '2.0') throw new Error('GLB 内容无效')
  const buffers = model.buffers ?? [], images = model.images ?? []
  if (!Array.isArray(buffers) || !Array.isArray(images)) throw new Error('GLB 资源列表无效')
  for (const resource of [...buffers, ...images]) {
    if (!record(resource)) throw new Error('GLB 资源无效')
    if (resource.uri !== undefined && (typeof resource.uri !== 'string' || !/^data:[^,]*;base64,/.test(resource.uri))) throw new Error('GLB 引用了外部资源；请先导出为内嵌纹理的自包含 GLB')
  }
  for (const buffer of buffers) {
    if (!record(buffer) || typeof buffer.byteLength !== 'number' || buffer.byteLength < 0 || (buffer.uri === undefined && buffer.byteLength > binarySize)) throw new Error('GLB 二进制缓冲区不完整')
  }
}
