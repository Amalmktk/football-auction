import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AdminStatus = 'loading' | 'signed-out' | 'not-admin' | 'admin'

async function checkAdmin(session: Session | null): Promise<AdminStatus> {
  if (!session) return 'signed-out'
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return 'not-admin'
  return data ? 'admin' : 'not-admin'
}

/** Whether the current browser session belongs to an admin (checked on the server). */
export function useAdminStatus(): AdminStatus {
  const [status, setStatus] = useState<AdminStatus>('loading')

  useEffect(() => {
    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase advises not to call other Supabase methods inside this callback directly.
      setTimeout(() => {
        void checkAdmin(session).then((s) => {
          if (active) setStatus(s)
        })
      }, 0)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return status
}

/** Supabase error messages from our database functions are already human-readable. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}
