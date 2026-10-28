// Persists each demo user's chat transcript to localStorage, scoped by
// DemoUserKey, so a reload resumes the same conversation instead of losing
// it. This is a pure frontend/UX convenience - it has no bearing on data
// isolation between customers, which is enforced independently by the
// backend (Postgres RLS keyed off the authenticated session, see
// backend-node/docs/security.md). Even if two keys' localStorage entries
// sat side by side in the same browser, neither user's API calls can ever
// return the other's rows.
import { useEffect, useState } from 'react'
import type { ChatMessage, DemoUserKey } from '../types/api'

function storageKey(demoUser: DemoUserKey): string {
  return `logistics-chat-history:${demoUser}`
}

export function loadChatHistory(demoUser: DemoUserKey): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(demoUser))
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    // Private browsing / storage disabled / corrupt JSON - fall back to an
    // empty transcript rather than breaking the page.
    return []
  }
}

export function clearChatHistory(demoUser: DemoUserKey): void {
  try {
    localStorage.removeItem(storageKey(demoUser))
  } catch {
    // Storage unavailable - nothing to clear.
  }
}

/** Drop-in replacement for `useState<ChatMessage[]>([])` that loads the
 * given user's saved transcript on mount and keeps localStorage in sync
 * as messages change. */
export function usePersistedChatHistory(demoUser: DemoUserKey) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory(demoUser))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(demoUser), JSON.stringify(messages))
    } catch {
      // Storage unavailable (e.g. quota exceeded, private browsing) - the
      // conversation still works in-memory for this page view.
    }
  }, [demoUser, messages])

  return [messages, setMessages] as const
}
