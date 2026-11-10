import { useState } from 'react'
import { Link } from 'react-router'
import RulesModal from '../components/RulesModal'
import type { Settings } from '../lib/types'
import { useSingleRow } from '../lib/useTable'

const links = [
  { to: '/live', label: 'Live auction', hint: 'Big-screen display' },
  { to: '/results', label: 'Squads', hint: 'Teams and players bought' },
  { to: '/captain', label: 'Captains', hint: 'Join with your team code and bid' },
  { to: '/admin/login', label: 'Organizers', hint: 'Run the auction' },
]

export default function Home() {
  const { row: settings } = useSingleRow<Settings>('settings')
  const [showRules, setShowRules] = useState(false)

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-5xl">⚽</div>
          <h1 className="mt-2 text-4xl font-bold">{settings?.tournament_name ?? 'EPL 2.0'}</h1>
          <p className="mt-2 text-slate-400">Player auction</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/guide"
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium hover:border-sky-500"
          >
            📖 How it works
          </Link>
          <button
            onClick={() => setShowRules(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-medium hover:border-sky-500"
          >
            📋 Rules
          </button>
        </div>
      </div>
      <nav className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-500"
          >
            <div className="text-lg font-semibold">{l.label}</div>
            <div className="text-sm text-slate-400">{l.hint}</div>
          </Link>
        ))}
      </nav>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}
