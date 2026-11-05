import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type CaptainStatus = { status: 'loading' } | { status: 'none' } | { status: 'joined'; teamId: string }

/** Which team this phone has joined (from the caller's own profile row). */
export function useCaptainTeam() {
  const [captain, setCaptain] = useState<CaptainStatus>({ status: 'loading' })

  const check = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession()
    const session = auth.session
    if (!session) return setCaptain({ status: 'none' })
    const { data } = await supabase.from('profiles').select('role, team_id').eq('user_id', session.user.id).maybeSingle()
    if (data?.role === 'captain' && data.team_id) setCaptain({ status: 'joined', teamId: data.team_id as string })
    else setCaptain({ status: 'none' })
  }, [])

  useEffect(() => {
    // check() only sets state after network calls return
    // oxlint-disable-next-line react/set-state-in-effect
    void check()
  }, [check])

  return { captain, recheck: check }
}
