import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types/api'
import { EmptyState } from './EmptyState'
import { MessageBubble } from './MessageBubble'

export function ChatWindow({
  messages,
  isLoading,
  onPickExample,
}: {
  messages: ChatMessage[]
  isLoading: boolean
  onPickExample: (question: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState onPick={onPickExample} />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="animate-pulse rounded-2xl bg-white px-4 py-3 text-sm text-slate-400 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            Thinking…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
