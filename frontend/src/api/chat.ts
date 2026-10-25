import { apiFetch } from './client'
import type { ChatResponse } from '../types/api'

export function sendChatMessage(message: string, demoUser: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/v1/chat', { method: 'POST', body: { message }, demoUser })
}
