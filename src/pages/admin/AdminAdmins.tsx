import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Input, PageHeader } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

interface AdminRow {
  admin_id: string
  admin_email: string
}

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data, error }, { data: user }] = await Promise.all([supabase.rpc('list_admins'), supabase.auth.getUser()])
    if (error) setMessage({ kind: 'error', text: errorMessage(error) })
    else setAdmins((data ?? []) as AdminRow[])
    setMe(user.user?.id ?? null)
  }, [])

  useEffect(() => {
    // load() only sets state after the network request returns, so this is a normal fetch-on-mount
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('add_admin', { p_email: email })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: errorMessage(error) })
    setMessage({ kind: 'success', text: `${email.trim()} is now an admin.` })
    setEmail('')
    void load()
  }

  async function remove(a: AdminRow) {
    if (!confirm(`Remove admin access for ${a.admin_email}?`)) return
    setMessage(null)
    const { error } = await supabase.rpc('remove_admin', { p_user_id: a.admin_id })
    if (error) return setMessage({ kind: 'error', text: errorMessage(error) })
    void load()
  }

  const signupUrl = `${window.location.origin}/admin/signup`

  return (
    <div className="max-w-2xl">
      <PageHeader title="Admins" />

      <div className="mb-6 space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Adding a new admin</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            They sign up at{' '}
            <a href={signupUrl} className="text-sky-400 hover:underline">
              {signupUrl}
            </a>{' '}
            (and confirm their email if asked).
          </li>
          <li>You enter their email below and click Make admin.</li>
        </ol>
      </div>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input type="email" required placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={busy}>
          Make admin
        </Button>
      </form>

      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}

      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {admins.map((a) => (
          <li key={a.admin_id} className="flex items-center justify-between px-4 py-3">
            <span>
              {a.admin_email}
              {a.admin_id === me && <span className="ml-2 text-xs text-slate-500">(you)</span>}
            </span>
            {a.admin_id !== me && (
              <Button variant="ghost" onClick={() => void remove(a)}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
