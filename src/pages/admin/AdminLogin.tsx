import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Alert, Button, Field, HomeLink, Input } from '../../components/ui'
import { useAdminStatus } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const status = useAdminStatus()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'admin') return <Navigate to="/admin/auction" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) {
      await supabase.auth.signOut()
      setError('This account is not an admin.')
      setBusy(false)
      return
    }
    navigate('/admin/auction', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <HomeLink />
      <h1 className="text-2xl font-bold">Admin login</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Link to="/admin/signup" className="text-center text-sm text-sky-400 hover:underline">
          New organizer? Sign up, then ask an admin to add you
        </Link>
      </form>
    </main>
  )
}
