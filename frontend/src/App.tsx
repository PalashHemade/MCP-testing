import { useState } from 'react'
import { UserSwitcher } from './components/UserSwitcher'
import { ChatPage } from './features/chat/ChatPage'
import type { DemoUserKey } from './types/api'

export default function App() {
  const [demoUser, setDemoUser] = useState<DemoUserKey>('demo-customer-acme')

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">Logistics AI Chatbot</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Customer portal demo - development authentication only</p>
        </div>
        <UserSwitcher value={demoUser} onChange={setDemoUser} />
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <ChatPage key={demoUser} demoUser={demoUser} />
      </main>
    </div>
  )
}
