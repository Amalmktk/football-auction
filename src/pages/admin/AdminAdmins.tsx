import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Input, PageHeader } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

interface AdminRow {
  admin_id: string
  admin_email: string
}

interface RequestRow {
  request_id: string
  request_email: string
  requested_at: string
  email_confirmed: boolean
}

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [adminsRes, requestsRes, userRes] = await Promise.all([
      supabase.rpc('list_admins'),
      supabase.rpc('list_admin_requests'),
      supabase.auth.getUser(),
    ])
    const err = adminsRes.error || requestsRes.error
    if (err) setMessage({ kind: 'error', text: errorMessage(err) })
    setAdmins((adminsRes.data ?? []) as AdminRow[])
    setRequests((requestsRes.data ?? []) as RequestRow[])
    setMe(userRes.data.user?.id ?? null)
  }, [])

  useEffect(() => {
    // load() only sets state after the network requests return, so this is a normal fetch-on-mount
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    // new sign-ups can arrive while the page is open
    const id = setInterval(() => void load(), 15000)
    return () => clearInterval(id)
  }, [load])

  async function call(fn: string, args: Record<string, unknown>, success: string) {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
      return false
    }
    setMessage({ kind: 'success', text: success })
    void load()
    return true
  }

  async function addByEmail(e: FormEvent) {
    e.preventDefault()
    if (await call('add_admin', { p_email: email }, `${email.trim()} is now an admin.`)) setEmail('')
  }

  const signupUrl = `${window.location.origin}/admin/signup`

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Admins" />

      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      {/* pending requests */}
      <section>
        <h2 className="mb-1 font-semibold">
          Access requests{' '}
          {requests.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">{requests.length}</span>
          )}
        </h2>
        <p className="mb-3 text-sm text-slate-400">
          People who signed up at{' '}
          <a href={signupUrl} className="text-sky-400 hover:underline">
            {signupUrl}
          </a>{' '}
          and are waiting to become admins.
        </p>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-500">No pending requests.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-amber-700/60">
            {requests.map((r) => (
              <li key={r.request_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{r.request_email}</div>
                  <div className="text-xs text-slate-500">
                    Signed up {new Date(r.requested_at).toLocaleString()}
                    {!r.email_confirmed && <span className="ml-2 text-amber-400">· email not confirmed yet</span>}
                  </div>
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void call('approve_admin_request', { p_user_id: r.request_id }, `${r.request_email} is now an admin.`)
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Decline ${r.request_email}? Their account will be deleted.`))
                      void call('decline_admin_request', { p_user_id: r.request_id }, `Declined ${r.request_email}.`)
                  }}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        )}
        {requests.some((r) => !r.email_confirmed) && (
          <p className="mt-2 text-xs text-slate-500">
            Unconfirmed accounts can be approved, but they can only log in after clicking the link in their confirmation
            email.
          </p>
        )}
      </section>

      {/* current admins */}
      <section>
        <h2 className="mb-3 font-semibold">Current admins</h2>
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
          {admins.map((a) => (
            <li key={a.admin_id} className="flex items-center justify-between px-4 py-3">
              <span>
                {a.admin_email}
                {a.admin_id === me && <span className="ml-2 text-xs text-slate-500">(you)</span>}
              </span>
              {a.admin_id !== me && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Remove admin access for ${a.admin_email}?`))
                      void call('remove_admin', { p_user_id: a.admin_id }, `Removed ${a.admin_email}.`)
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* manual add */}
      <section>
        <h2 className="mb-1 font-semibold">Add by email</h2>
        <p className="mb-3 text-sm text-slate-400">The person must have signed up first.</p>
        <form onSubmit={addByEmail} className="flex gap-2">
          <Input type="email" required placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={busy}>
            Make admin
          </Button>
        </form>
      </section>
    </div>
  )
}
