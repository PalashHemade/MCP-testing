import { DEMO_USERS, type DemoUserKey } from '../types/api'

export function UserSwitcher({
  value,
  onChange,
}: {
  value: DemoUserKey
  onChange: (value: DemoUserKey) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="demo-user" className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Signed in as
      </label>
      <select
        id="demo-user"
        value={value}
        onChange={(e) => onChange(e.target.value as DemoUserKey)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        {DEMO_USERS.map((u) => (
          <option key={u.key} value={u.key}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  )
}
