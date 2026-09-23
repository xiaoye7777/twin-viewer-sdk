import { Unzip, UnzipInflate, unzipSync, zip, type UnzipFileInfo } from 'fflate'
import { PACKAGE_LIMITS } from './packageFormat'

const allowedPath = /^(manifest\.json|scene\.json|assets\/[0-9]+\.(glb|hdr))$/

/** Preflight the central directory, then stream with actual expanded-byte limits. */
export function readPackageZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length > PACKAGE_LIMITS.zipBytes) throw new Error('ZIP 超过 256 MiB 限制')
  const entries = new Map<string, UnzipFileInfo>()
  let total = 0
  try {
    unzipSync(bytes, { filter: entry => {
      if (!allowedPath.test(entry.name)) throw new Error(`ZIP 包含不支持或异常路径: ${entry.name}`)
      if (entries.has(entry.name)) throw new Error('ZIP 包含重复文件')
      const limit = entry.name.endsWith('.json') ? PACKAGE_LIMITS.jsonBytes : PACKAGE_LIMITS.fileBytes
      total += entry.originalSize
      if (entry.originalSize > limit || total > PACKAGE_LIMITS.totalBytes || entries.size >= PACKAGE_LIMITS.files) throw new Error('ZIP 解压大小或文件数量超过限制')
      if (entry.compression !== 0 && entry.compression !== 8) throw new Error('不支持的 ZIP 压缩方式')
      entries.set(entry.name, entry)
      return false
    } })
    const files = new Map<string, Uint8Array>()
    const seen = new Set<string>()
    let expanded = 0
    const stream = new Unzip(file => {
      const expected = entries.get(file.name)
      if (!expected || seen.has(file.name)) throw new Error('ZIP 文件目录不一致')
      seen.add(file.name)
      let size = 0
      const chunks: Uint8Array[] = []
      file.ondata = (error, chunk, final) => {
        if (error) throw error
        size += chunk.length; expanded += chunk.length
        if (size > expected.originalSize || expanded > PACKAGE_LIMITS.totalBytes) throw new Error('ZIP 实际解压大小异常')
        chunks.push(chunk)
        if (final) {
          if (size !== expected.originalSize) throw new Error('ZIP 文件被截断')
          const data = new Uint8Array(size)
          let offset = 0
          for (const part of chunks) { data.set(part, offset); offset += part.length }
          files.set(file.name, data)
        }
      }
      file.start()
    })
    stream.register(UnzipInflate)
    for (let offset = 0; offset < bytes.length; offset += 16384) stream.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length)
    if (files.size !== entries.size || !files.has('manifest.json') || !files.has('scene.json')) throw new Error('项目包缺少 manifest.json / scene.json 或文件不完整')
    return files
  } catch (error) {
    throw new Error(`无法读取项目 ZIP：${error instanceof Error ? error.message : String(error)}`)
  }
}

export function writePackageZip(files: Record<string, Uint8Array>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 1 }, (error, data) => {
      if (error) reject(error)
      else if (data.length > PACKAGE_LIMITS.zipBytes) reject(new Error('项目包超过 256 MiB 限制'))
      else resolve(new Blob([new Uint8Array(data).buffer], { type: 'application/zip' }))
    })
  })
}
