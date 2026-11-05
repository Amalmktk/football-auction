import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Device clocks differ; the timer must follow the server's clock.
let offsetMs = 0
let syncing: Promise<void> | null = null

export function syncServerClock(): Promise<void> {
  if (!syncing) {
    syncing = (async () => {
      const t0 = Date.now()
      const { data, error } = await supabase.rpc('server_time')
      const t1 = Date.now()
      if (error || !data) {
        syncing = null // try again next time
        return
      }
      offsetMs = new Date(data as string).getTime() - (t0 + t1) / 2
    })()
  }
  return syncing
}

export const serverNow = () => Date.now() + offsetMs

/** Server-corrected "now", re-rendering every `intervalMs`. */
export function useServerNow(intervalMs = 200): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    void syncServerClock()
    const id = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Milliseconds left until `endsAt` (never negative), or null when there's no timer. */
export function msLeft(endsAt: string | null | undefined, now: number): number | null {
  if (!endsAt) return null
  return Math.max(0, new Date(endsAt).getTime() - now)
}
