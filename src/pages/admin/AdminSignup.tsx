import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Alert, Button, Field, HomeLink, Input } from '../../components/ui'
import { supabase } from '../../lib/supabase'

export default function AdminSignup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'confirm-email' | 'signed-up' | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin/login` },
    })
    setBusy(false)
    if (error) return setError(error.message)
    if (data.session) {
      // email confirmation is off: don't leave them signed in as a non-admin
      await supabase.auth.signOut()
      setDone('signed-up')
    } else {
      setDone('confirm-email')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <HomeLink />
      <h1 className="text-2xl font-bold">Admin sign up</h1>
      {done ? (
        <div className="space-y-4">
          <Alert kind="success">
            {done === 'confirm-email'
              ? 'Account created. Check your email and click the confirmation link.'
              : 'Account created.'}{' '}
            Then ask an existing admin to add <b>{email.trim()}</b> on the Admins page. Until then this account can&apos;t
            control anything.
          </Alert>
          <Link to="/admin/login" className="text-sky-400 hover:underline">
            Go to login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-400">
            Signing up doesn&apos;t give admin access by itself: an existing admin has to add you.
          </p>
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>
          <Link to="/admin/login" className="text-center text-sm text-sky-400 hover:underline">
            Already have an account? Log in
          </Link>
        </form>
      )}
    </main>
  )
}
