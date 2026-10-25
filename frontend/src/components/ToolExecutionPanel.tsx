import { useState } from 'react'
import type { ToolExecutionSummary } from '../types/api'
import { ToolResultView } from './ToolResultView'

function StepStatusDot({ status }: { status: string }) {
  const color = status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
}

export function ToolExecutionPanel({
  steps,
  retrievalMethod,
}: {
  steps: ToolExecutionSummary[]
  retrievalMethod: string
}) {
  const [open, setOpen] = useState(false)

  if (steps.length === 0) {
    return null
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 text-sm dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span>
          Tool execution ({steps.length} step{steps.length > 1 ? 's' : ''}, retrieval: {retrievalMethod})
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-700">
          {steps.map((step) => (
            <div key={step.step_id}>
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <StepStatusDot status={step.status} />
                <span className="font-mono">{step.tool_name}</span>
                <span>{step.duration_ms}ms</span>
              </div>
              {step.status === 'error' ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{step.error}</p>
              ) : (
                step.output && <ToolResultView toolName={step.tool_name} output={step.output} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
