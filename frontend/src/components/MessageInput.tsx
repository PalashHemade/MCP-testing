import { useState } from 'react'
import type { FormEvent } from 'react'

export function MessageInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (message: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
      <label htmlFor="chat-input" className="sr-only">
        Ask a question about your logistics data
      </label>
      <textarea
        id="chat-input"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            handleSubmit(e)
          }
        }}
        placeholder="Ask about trips, invoices, profit, vehicles, drivers, or policy documents..."
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? 'Thinking…' : 'Send'}
      </button>
    </form>
  )
}
