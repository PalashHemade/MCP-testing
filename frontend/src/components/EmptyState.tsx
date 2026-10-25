const EXAMPLE_QUESTIONS = [
  'Show all trips currently in transit.',
  'What was the profit on TRIP-1001?',
  'Which invoices are still outstanding?',
  'Which customer generated the most billed revenue last month?',
  'Which vehicles completed the most trips this quarter?',
  'Which route had the highest aggregate profit per kilometre this month?',
  'According to the applicable port policy, what documents are required for this shipment?',
]

export function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Ask about your logistics data</h2>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
        Try one of these, or ask your own question about trips, invoices, drivers, vehicles, or policy documents.
      </p>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-400"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
