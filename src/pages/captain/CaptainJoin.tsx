import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Alert, Button, HomeLink, Input } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { useCaptainTeam } from '../../lib/captain'
import { supabase } from '../../lib/supabase'

export default function CaptainJoin() {
  const { captain } = useCaptainTeam()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (captain.status === 'joined') return <Navigate to="/captain/bid" replace />

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        // an anonymous session for this phone; the team code then links it to a team
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      const { error } = await supabase.rpc('join_team', { p_code: code })
      if (error) throw error
      navigate('/captain/bid', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <HomeLink />
      <div>
        <h1 className="text-3xl font-bold">Captain</h1>
        <p className="mt-2 text-slate-400">Enter the team code you got from the organizers. You only need to do this once.</p>
      </div>
      <form onSubmit={join} className="flex flex-col gap-4">
        <Input
          required
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. TIGER-4F7K"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="py-4 text-center font-mono text-2xl tracking-widest"
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={busy || captain.status === 'loading'} className="py-4 text-lg">
          {busy ? 'Joining…' : 'Join team'}
        </Button>
      </form>
    </main>
  )
}
