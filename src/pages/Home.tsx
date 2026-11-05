import { Link } from 'react-router'

const links = [
  { to: '/live', label: 'Live display', hint: 'For the TV' },
  { to: '/results', label: 'Results', hint: 'Final squads' },
  { to: '/captain', label: 'Captain join', hint: 'Enter your team code' },
  { to: '/admin/login', label: 'Admin', hint: 'Organizers only' },
]

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-10">
      <h1 className="text-4xl font-bold">Football Auction</h1>
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
    </main>
  )
}
