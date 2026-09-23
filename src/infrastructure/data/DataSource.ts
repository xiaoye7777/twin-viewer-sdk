export type DataSourceType = 'mock' | 'websocket'
export type DataSourceConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type ViewerDataSourceConfig =
  | { type: 'mock' }
  | { type: 'websocket'; url: string }

export interface DataSource {
  start(): void
  stop(): void
}
