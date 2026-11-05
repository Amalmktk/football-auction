import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Load a whole table, then keep it live: any insert/update/delete on the table
 * (via Supabase Realtime) triggers a re-fetch. Also re-fetches whenever the
 * subscription (re)connects, so a screen never shows stale data after Wi-Fi drops.
 * Tables here are small (tens of rows), so re-fetching is simpler and safer than patching.
 */
export function useTable<T>(table: string, orderBy?: string, ascending = true) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(true)

  const reload = useCallback(async () => {
    let query = supabase.from(table).select('*')
    if (orderBy) query = query.order(orderBy, { ascending, nullsFirst: false })
    const { data, error } = await query
    if (error) {
      setError(error.message)
    } else {
      setRows(data as T[])
      setError(null)
    }
    setLoading(false)
  }, [table, orderBy, ascending])

  useEffect(() => {
    const channel = supabase
      .channel(`table:${table}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        void reload()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          void reload()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false)
        }
      })
    // phones and laptops that slept may have missed changes: refresh when the page is visible again
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [table, reload])

  return { rows, loading, error, connected, reload }
}

/** For the single-row tables (settings, auction_state). */
export function useSingleRow<T>(table: string) {
  const { rows, ...rest } = useTable<T>(table)
  return { row: rows[0] as T | undefined, ...rest }
}
