export type TwinVariableDataType = 'number' | 'boolean' | 'string'
export type TwinRuntimeValueData = number | boolean | string

export interface TwinDevice {
  id: string
  name: string
  type?: string
}

export interface TwinVariableDefinition {
  id: string
  key: string
  name: string
  dataType: TwinVariableDataType
  unit?: string
}

export interface TwinRuntimeValue {
  bindingId: string
  variableKey: string
  value: TwinRuntimeValueData
  updatedAt: string
}
