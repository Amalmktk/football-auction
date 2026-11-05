import Papa from 'papaparse'
import { Link } from 'react-router'
import { Avatar, Button, ConnectionBadge } from '../components/ui'
import { fmt, useAuction } from '../lib/auction'

export default function Results() {
  const a = useAuction()
  const { settings } = a

  if (a.loading || !settings) return <p className="p-6 text-slate-400">Loading…</p>

  const unsold = a.players.filter((p) => p.status === 'unsold' || p.status === 'available')

  function exportCsv() {
    const rows = a.teams.flatMap((t) =>
      (a.squads.get(t.id) ?? []).map((p) => ({
        team: t.name,
        player: p.name,
        captain: p.is_captain ? 'yes' : '',
        position: p.position ?? '',
        price: p.is_captain ? 0 : (p.sold_price ?? ''),
        team_purse_remaining: t.purse_remaining,
      })),
    )
    unsold.forEach((p) =>
      rows.push({
        team: '(unsold)',
        player: p.name,
        captain: '',
        position: p.position ?? '',
        price: '',
        team_purse_remaining: 0,
      }),
    )
    const url = URL.createObjectURL(new Blob([Papa.unparse(rows)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'auction-results.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 print:max-w-none print:p-0">
      <ConnectionBadge connected={a.connected} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-3xl font-bold">{settings.tournament_name}: squads</h1>
          <p className="text-slate-400 print:text-gray-600">Updates live as players are sold.</p>
        </div>
        <div className="no-print flex gap-2">
          <Link to="/" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            Home
          </Link>
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {a.teams.map((t) => {
          const squad = (a.squads.get(t.id) ?? [])
            .slice()
            .sort((x, y) => Number(y.is_captain) - Number(x.is_captain) || (y.sold_price ?? 0) - (x.sold_price ?? 0))
          const spent = squad.reduce((sum, p) => sum + (p.is_captain ? 0 : (p.sold_price ?? 0)), 0)
          return (
            <section
              key={t.id}
              className="break-inside-avoid overflow-hidden rounded-xl border border-slate-800 bg-slate-900 print:border-gray-300 print:bg-white"
            >
              <header className="flex items-center gap-3 border-b-4 px-4 py-3" style={{ borderColor: t.color }}>
                <Avatar name={t.short_name} url={t.logo_url} color={t.color} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{t.name}</div>
                  <div className="text-xs text-slate-400 print:text-gray-600">
                    {squad.length} players · spent {fmt(spent)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400 print:text-gray-600">Left</div>
                  <div className="font-black tabular-nums">{fmt(t.purse_remaining)}</div>
                </div>
              </header>
              <ul className="text-sm">
                {squad.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between border-t border-slate-800 px-4 py-1.5 first:border-t-0 print:border-gray-200"
                  >
                    <span>
                      {p.name}
                      {p.is_captain && <span className="ml-2 text-xs text-sky-400">C</span>}
                      {p.position && <span className="ml-2 text-xs text-slate-500">{p.position}</span>}
                    </span>
                    <span className="tabular-nums">{p.is_captain ? '—' : fmt(p.sold_price)}</span>
                  </li>
                ))}
                {squad.length === 0 && <li className="px-4 py-2 text-slate-500">No players yet</li>}
              </ul>
            </section>
          )
        })}
      </div>

      {unsold.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">Not sold yet ({unsold.length})</h2>
          <p className="text-slate-300 print:text-black">{unsold.map((p) => p.name).join(', ')}</p>
        </section>
      )}
    </main>
  )
}
