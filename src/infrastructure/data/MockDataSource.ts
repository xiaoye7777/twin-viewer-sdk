import type { TwinBinding, TwinRuntimeValueData, TwinVariableDefinition } from '@/domain/twin'
import type { DataSource } from './DataSource'

export interface MockDataSourceOptions {
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onTick?(): void
  intervalMs?: number
}

let activeMockTimerCount = 0

export function getMockDataSourceDiagnostics(): { activeTimerCount: number } {
  return { activeTimerCount: activeMockTimerCount }
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10
}

function generateNumber(variable: TwinVariableDefinition): number {
  const key = variable.key.toLowerCase()
  // Demo range crosses the visual-rule examples (SOC < 20, temperature > 60).
  if (key === 'soc' || key.includes('stateofcharge')) return randomBetween(10, 90)
  if (key.includes('temp')) return randomBetween(25, 75)
  if (key.includes('power')) return randomBetween(100, 250)
  return randomBetween(0, 100)
}

function generateValue(variable: TwinVariableDefinition): TwinRuntimeValueData {
  if (variable.dataType === 'number') return generateNumber(variable)
  if (variable.dataType === 'boolean') {
    return variable.key.toLowerCase().includes('alarm') ? Math.random() < 0.1 : Math.random() >= 0.5
  }
  if (variable.key.toLowerCase().includes('status')) return Math.random() < 0.8 ? 'running' : 'standby'
  return Math.random() < 0.8 ? 'online' : 'offline'
}

export class MockDataSource implements DataSource {
  private readonly intervalMs: number
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: MockDataSourceOptions) {
    this.intervalMs = options.intervalMs ?? 1000
  }

  start(): void {
    if (this.timer) return
    this.tick()
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    activeMockTimerCount += 1
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    activeMockTimerCount = Math.max(0, activeMockTimerCount - 1)
  }

  private tick(): void {
    for (const binding of this.options.getBindings()) {
      for (const variable of binding.variables) {
        this.options.setRuntimeValue(binding.id, variable.key, generateValue(variable))
      }
    }
    this.options.onTick?.()
  }
}
