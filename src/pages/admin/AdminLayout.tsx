import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router'
import { Button } from '../../components/ui'
import { useAdminStatus } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

const nav = [
  { to: '/admin/auction', label: 'Auction' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/admins', label: 'Admins' },
]

function usePendingRequests(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const load = async () => {
      const { data } = await supabase.rpc('list_admin_requests')
      setCount(Array.isArray(data) ? data.length : 0)
    }
    void load()
    const id = setInterval(() => void load(), 30000)
    return () => clearInterval(id)
  }, [enabled])
  return count
}

export default function AdminLayout() {
  const status = useAdminStatus()
  const pending = usePendingRequests(status === 'admin')

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
  }
  if (status === 'signed-out') {
    return <Navigate to="/admin/login" replace />
  }
  if (status === 'not-admin') {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">Waiting for approval</h1>
        <p className="text-slate-400">
          Your account isn&apos;t an admin yet. Ask an existing admin to approve you: they&apos;ll see your request on
          the <b>Admins</b> page. Then log in again.
        </p>
        <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
        <Link to="/" className="text-center text-sm text-slate-400 hover:text-white">
          ← Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 font-bold hover:text-sky-300" title="Home">
            ⚽ Auction admin
          </Link>
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
                {n.to === '/admin/admins' && pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black">{pending}</span>
                )}
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
