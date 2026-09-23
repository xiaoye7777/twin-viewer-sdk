import type { TwinBinding, TwinRuntimeValueData, TwinVariableDataType } from '@/domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'

export interface WebSocketDataSourceOptions {
  url: string
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
  onMessage?(): void
}

export interface WebSocketDeviceMessage {
  deviceId: string
  [variableKey: string]: unknown
}

let activeSocketCount = 0

export function getWebSocketDataSourceDiagnostics(): { activeSocketCount: number } {
  return { activeSocketCount }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValueOfType(value: unknown, dataType: TwinVariableDataType): value is TwinRuntimeValueData {
  if (dataType === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === dataType
}

/** Maps the transport envelope to existing binding/variable identities. */
export function mapWebSocketDeviceMessage(
  message: unknown,
  bindings: readonly TwinBinding[],
): Array<{ bindingId: string; variableKey: string; value: TwinRuntimeValueData }> {
  if (!isRecord(message) || typeof message.deviceId !== 'string' || !message.deviceId) return []
  const binding = bindings.find(item => item.device.id === message.deviceId)
  if (!binding) return []
  const values = isRecord(message.values) ? message.values : message
  return binding.variables.flatMap(variable => {
    const value = values[variable.key]
    return isValueOfType(value, variable.dataType)
      ? [{ bindingId: binding.id, variableKey: variable.key, value }]
      : []
  })
}

export class WebSocketDataSource implements DataSource {
  private socket: WebSocket | null = null
  private stopping = false

  constructor(private readonly options: WebSocketDataSourceOptions) {}

  start(): void {
    if (this.socket) return
    if (typeof WebSocket === 'undefined') {
      this.options.onStatus('error', '当前环境不支持 WebSocket')
      return
    }
    this.stopping = false
    this.options.onStatus('connecting')
    try {
      const socket = new WebSocket(this.options.url)
      this.socket = socket
      activeSocketCount += 1
      socket.addEventListener('open', () => {
        if (this.socket === socket) this.options.onStatus('connected')
      })
      socket.addEventListener('message', (event) => {
        if (this.socket !== socket) return
        try {
          const parsed: unknown = JSON.parse(typeof event.data === 'string' ? event.data : '')
          const messages = Array.isArray(parsed) ? parsed : [parsed]
          let accepted = false
          for (const message of messages) {
            const updates = mapWebSocketDeviceMessage(message, this.options.getBindings())
            for (const update of updates) this.options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
            accepted = accepted || updates.length > 0
          }
          if (accepted) this.options.onMessage?.()
        } catch {
          this.options.onStatus('error', '收到无法解析的 WebSocket JSON 消息')
        }
      })
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.options.onStatus('error', 'WebSocket 连接错误')
      })
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return
        this.socket = null
        activeSocketCount = Math.max(0, activeSocketCount - 1)
        this.options.onStatus('disconnected', this.stopping ? undefined : 'WebSocket 连接已关闭')
      })
    } catch (error) {
      this.options.onStatus('error', error instanceof Error ? error.message : 'WebSocket 连接失败')
    }
  }

  stop(): void {
    const socket = this.socket
    if (!socket) return
    this.stopping = true
    this.socket = null
    activeSocketCount = Math.max(0, activeSocketCount - 1)
    socket.close(1000, 'Viewer data source stopped')
    this.options.onStatus('disconnected')
  }
}
