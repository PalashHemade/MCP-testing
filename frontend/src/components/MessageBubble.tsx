import type { ChatMessage } from '../types/api'
import { ToolExecutionPanel } from './ToolExecutionPanel'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const response = message.response

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[75%] ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {response && (
          <>
            {!response.is_fully_complete && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                ⚠ This answer may be incomplete.
                {response.validation_notes.length > 0 && (
                  <ul className="mt-1 list-inside list-disc">
                    {response.validation_notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {response.clarification_required && (
              <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                Clarification needed before this can be answered fully.
              </div>
            )}
            <ToolExecutionPanel steps={response.tool_executions} retrievalMethod={response.retrieval_method} />
          </>
        )}
      </div>
    </div>
  )
}
