import { apiFetch } from './client'
import type { ToolMetadata } from '../types/api'

export function listTools(demoUser: string): Promise<ToolMetadata[]> {
  return apiFetch<ToolMetadata[]>('/api/v1/tools', { demoUser })
}
