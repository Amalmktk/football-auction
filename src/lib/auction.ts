import { useMemo } from 'react'
import type { AuctionState, Increment, Player, Settings, Team } from './types'
import { useSingleRow, useTable } from './useTable'

export function nextIncrement(bid: number, increments: Increment[]): number {
  for (const inc of increments) {
    if (inc.upto == null || bid < inc.upto) return inc.step
  }
  return 10
}

/** "5/10" when there's a maximum squad size, just "5" when there isn't. */
export const squadLabel = (count: number, max: number | null | undefined) => (max == null ? `${count}` : `${count}/${max}`)

export const fmt =(n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-IN'))

/**
 * Everything a live screen needs: auction state, settings, teams, players (all kept
 * live via Realtime), plus the same rule calculations the database enforces, so
 * buttons can be disabled before a bid would be rejected.
 */
export function useAuction() {
  const stateQ = useSingleRow<AuctionState>('auction_state')
  const settingsQ = useSingleRow<Settings>('settings')
  const teamsQ = useTable<Team>('teams', 'name')
  const playersQ = useTable<Player>('players', 'name')

  const state = stateQ.row
  const settings = settingsQ.row
  const teams = teamsQ.rows
  const players = playersQ.rows

  const derived = useMemo(() => {
    const teamById = new Map(teams.map((t) => [t.id, t]))
    const squads = new Map<string, Player[]>(teams.map((t) => [t.id, []]))
    for (const p of players) if (p.team_id) squads.get(p.team_id)?.push(p)

    // players still to be auctioned (the one on the block is excluded, as in the database)
    const pool = players.filter((p) => p.status === 'available' || p.status === 'unsold')
    const minBase = pool.length ? Math.min(...pool.map((p) => p.base_price)) : 0

    const currentPlayer = state?.current_player_id ? players.find((p) => p.id === state.current_player_id) : undefined
    const leadingTeam = state?.leading_team_id ? teamById.get(state.leading_team_id) : undefined

    let nextBid: number | null = null
    if (state?.status === 'bidding' && currentPlayer && settings) {
      nextBid =
        state.current_bid == null
          ? currentPlayer.base_price
          : state.current_bid + nextIncrement(state.current_bid, settings.increments)
    }

    const squadSize = (teamId: string) => squads.get(teamId)?.length ?? 0

    /** max_bid = purse_remaining − (min_squad − current_squad − 1) × lowest_base_price */
    const maxBid = (teamId: string) => {
      const t = teamById.get(teamId)
      if (!t || !settings) return 0
      return t.purse_remaining - Math.max(settings.min_squad - squadSize(teamId) - 1, 0) * minBase
    }

    /** Why this team can't bid right now, or null if it can. */
    const bidBlocker = (teamId: string, timeLeftMs: number | null): string | null => {
      if (!state || !settings) return 'Loading'
      if (state.status === 'paused') return 'Paused'
      if (state.status !== 'bidding' || nextBid == null) return 'Bidding closed'
      if (timeLeftMs != null && timeLeftMs <= 0) return 'Time is up'
      if (state.leading_team_id === teamId) return 'Leading'
      if (settings.max_squad != null && squadSize(teamId) >= settings.max_squad) return 'Squad full'
      if (nextBid > maxBid(teamId)) return 'Not enough purse'
      return null
    }

    const recentSold = players
      .filter((p) => p.status === 'sold' && !p.is_captain && p.sold_at)
      .sort((a, b) => b.sold_at!.localeCompare(a.sold_at!))

    return { teamById, squads, pool, currentPlayer, leadingTeam, nextBid, squadSize, maxBid, bidBlocker, recentSold }
  }, [teams, players, state, settings])

  return {
    state,
    settings,
    teams,
    players,
    ...derived,
    loading: stateQ.loading || settingsQ.loading || teamsQ.loading || playersQ.loading,
    connected: stateQ.connected && settingsQ.connected && teamsQ.connected && playersQ.connected,
    error: stateQ.error || settingsQ.error || teamsQ.error || playersQ.error,
  }
}
