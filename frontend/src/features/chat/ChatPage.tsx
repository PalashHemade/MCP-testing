import { useState } from 'react'
import { ApiError } from '../../api/client'
import { ChatWindow } from '../../components/ChatWindow'
import { MessageInput } from '../../components/MessageInput'
import { useChatMutation } from '../../hooks/useChat'
import { usePersistedChatHistory } from '../../hooks/useChatHistory'
import type { DemoUserKey } from '../../types/api'

export function ChatPage({ demoUser }: { demoUser: DemoUserKey }) {
  // Scoped to this demoUser's localStorage key - resumes their saved
  // transcript on mount, and is cleared explicitly on logout (see
  // App.tsx). Never shares state with another demoUser's key.
  const [messages, setMessages] = usePersistedChatHistory(demoUser)
  const [error, setError] = useState<string | null>(null)
  // Only set when the failure is one a plain retry can plausibly fix
  // (timeout, 503/504, network blip) - see ApiError.retryable. A 4xx
  // (bad input, expired/invalid session) would just fail the same way
  // again, so that case gets Dismiss only, not a Retry button.
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const mutation = useChatMutation(demoUser)

  async function handleSend(content: string, { isRetry = false }: { isRetry?: boolean } = {}) {
    setError(null)
    if (!isRetry) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content }])
    }

    try {
      const response = await mutation.mutateAsync(content)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: response.answer, response },
      ])
      setLastFailedMessage(null)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong contacting the backend.'
      setError(message)
      setLastFailedMessage(err instanceof ApiError && !err.retryable ? null : content)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatWindow messages={messages} isLoading={mutation.isPending} onPickExample={handleSend} />
      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          <span>{error}</span>
          <div className="flex shrink-0 gap-3 text-xs font-medium">
            {lastFailedMessage && (
              <button type="button" onClick={() => handleSend(lastFailedMessage, { isRetry: true })} className="underline">
                Retry
              </button>
            )}
            <button type="button" onClick={() => setError(null)} className="underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
      <MessageInput onSubmit={handleSend} disabled={mutation.isPending} />
    </div>
  )
}
