const COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  in_transit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  planned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  partially_paid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  unpaid: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function label(status: string): string {
  return status.replace(/_/g, ' ')
}

export function StatusBadge({ status }: { status: string }) {
  const classes = COLORS[status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {label(status)}
    </span>
  )
}

export function OverdueBadge({ isOverdue }: { isOverdue: boolean }) {
  if (!isOverdue) return null
  return (
    <span className="ml-1 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
      overdue
    </span>
  )
}
