import { useMemo } from 'react'
import type { AuctionState, Increment, Player, Settings, Team } from './types'
import { useSingleRow, useTable } from './useTable'

export function nextIncrement(bid: number, increments: Increment[]): number {
  for (const inc of increments) {
    if (inc.upto == null || bid < inc.upto) return inc.step
  }
  return 10
}

/** Human-readable bid steps, e.g. ["+10 while the bid is below 200", "+20 from 200 upwards"]. */
export function describeIncrements(increments: Increment[]): string[] {
  return increments.map((inc, i) => {
    const from = increments[i - 1]?.upto
    if (inc.upto == null) return from ? `+${inc.step} from ${from} upwards` : `+${inc.step} on every bid`
    return from ? `+${inc.step} from ${from} up to ${inc.upto}` : `+${inc.step} while the bid is below ${inc.upto}`
  })
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
    const poolPrices = pool.map((p) => p.base_price).sort((x, y) => x - y)

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

    /**
     * Squad-completion check if `teamId` wins the player on the block. Mirrors bid_check() in the database.
     *
     * After the sale every team must still be able to reach min_squad. The players that will fill those
     * slots are the N cheapest left in the pool (N = all teams' remaining slots). Each team must be able to
     * afford its own slots even if it ends up with the most expensive of those N: that way, whoever buys
     * what, nobody can be squeezed out.
     *
     *   maxBid       = this team's purse − its worst-case cost for its remaining slots
     *   othersShort  = another team could no longer complete its squad (not enough players or points)
     */
    const reserveCheck = (teamId: string) => {
      if (!settings) return { maxBid: 0, othersShort: true }
      const needOf = (id: string) => Math.max(settings.min_squad - squadSize(id) - (id === teamId ? 1 : 0), 0)
      const total = teams.reduce((sum, t) => sum + needOf(t.id), 0)
      if (total > poolPrices.length) return { maxBid: 0, othersShort: true }
      const fillers = poolPrices.slice(0, total) // ascending
      const worstCost = (n: number) => fillers.slice(fillers.length - n).reduce((sum, x) => sum + x, 0)
      let maxBid = 0
      let othersShort = false
      for (const t of teams) {
        const worst = worstCost(needOf(t.id))
        if (t.id === teamId) maxBid = t.purse_remaining - worst
        else if (t.purse_remaining < worst) othersShort = true
      }
      return { maxBid, othersShort }
    }

    const maxBid = (teamId: string) => reserveCheck(teamId).maxBid

    /** Why this team can't bid right now, or null if it can. */
    const bidBlocker = (teamId: string, timeLeftMs: number | null): string | null => {
      if (!state || !settings) return 'Loading'
      if (state.status === 'paused') return 'Paused'
      if (state.status !== 'bidding' || nextBid == null) return 'Bidding closed'
      if (timeLeftMs != null && timeLeftMs <= 0) return 'Time is up'
      if (state.leading_team_id === teamId) return 'Leading'
      if (settings.max_squad != null && squadSize(teamId) >= settings.max_squad) return 'Squad full'
      const check = reserveCheck(teamId)
      if (check.othersShort) return 'Other teams still need players'
      if (nextBid > check.maxBid) return 'Over max bid'
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
