import { useState } from 'react'
import { UserSwitcher } from './components/UserSwitcher'
import { ChatPage } from './features/chat/ChatPage'
import { clearChatHistory } from './hooks/useChatHistory'
import { DEMO_USERS, type DemoUserKey } from './types/api'

export default function App() {
  // null = logged out: no demo user selected, no chat panel shown. This
  // mirrors a real session - the chat only exists once someone is signed
  // in, and the backend only ever sees requests tied to one such session
  // (see docs/security.md for how that's enforced server-side via RLS).
  const [demoUser, setDemoUser] = useState<DemoUserKey | null>(null)

  function handleLogout() {
    if (demoUser) clearChatHistory(demoUser)
    setDemoUser(null)
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">Logistics AI Chatbot</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Customer portal demo - development authentication only</p>
        </div>
        {demoUser && (
          <div className="flex items-center gap-3">
            <UserSwitcher value={demoUser} onChange={setDemoUser} />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {demoUser ? (
          <ChatPage key={demoUser} demoUser={demoUser} />
        ) : (
          <LoginScreen onLogin={setDemoUser} />
        )}
      </main>
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (user: DemoUserKey) => void }) {
  const [selected, setSelected] = useState<DemoUserKey>(DEMO_USERS[0].key)
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sign in to continue</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Development login only - pick which customer account to use. Each account's chat history is kept separate
          and is cleared when you log out.
        </p>
        <UserSwitcher value={selected} onChange={setSelected} />
        <button
          type="button"
          onClick={() => onLogin(selected)}
          className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Log in
        </button>
      </div>
    </div>
  )
}
