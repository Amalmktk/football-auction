import { Navigate, NavLink, Outlet } from 'react-router'
import { Button } from '../../components/ui'
import { useAdminStatus } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

const nav = [
  { to: '/admin/auction', label: 'Auction' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function AdminLayout() {
  const status = useAdminStatus()

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
  }
  if (status === 'signed-out') {
    return <Navigate to="/admin/login" replace />
  }
  if (status === 'not-admin') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">Not an admin</h1>
        <p className="text-slate-400">
          This account is signed in but isn&apos;t marked as an admin. Add a row for it in the{' '}
          <code>profiles</code> table with <code>role = &apos;admin&apos;</code>.
        </p>
        <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-4 font-bold">⚽ Auction admin</span>
          <nav className="flex flex-wrap gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href="/live" target="_blank" rel="noreferrer" className="text-sm text-sky-400 hover:underline">
              Open TV display ↗
            </a>
            <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
