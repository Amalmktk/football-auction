import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import RulesModal from '../../components/RulesModal'
import { Alert, Avatar, Button, ConnectionBadge } from '../../components/ui'
import { fmt, squadLabel, useAuction } from '../../lib/auction'
import { errorMessage } from '../../lib/auth'
import { downloadPlayersCsv } from '../../lib/csv'
import { useCaptainTeam } from '../../lib/captain'
import { msLeft, useServerNow } from '../../lib/clock'
import { supabase } from '../../lib/supabase'
import type { Bid } from '../../lib/types'
import { useTable } from '../../lib/useTable'

export default function CaptainBid() {
  const { captain, recheck } = useCaptainTeam()
  if (captain.status === 'loading') return <p className="p-6 text-slate-400">Loading…</p>
  if (captain.status === 'none') return <Navigate to="/captain" replace />
  return <BidScreen teamId={captain.teamId} onAccessLost={() => void recheck()} />
}

function BidScreen({ teamId, onAccessLost }: { teamId: string; onAccessLost: () => void }) {
  const a = useAuction()
  const { rows: bids } = useTable<Bid>('bids', 'id', false)
  const now = useServerNow()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 3000)
    return () => clearTimeout(id)
  }, [flash])

  const { state, settings, currentPlayer: player, leadingTeam } = a
  const team = a.teamById.get(teamId)

  if (a.loading) return <p className="p-6 text-slate-400">Loading…</p>
  if (!state || !settings || !team) return <Alert>{a.error ?? 'Your team was not found. Ask the organizers.'}</Alert>

  const timeLeft = state.status === 'bidding' ? msLeft(state.timer_ends_at, now) : null
  const secondsLeft = timeLeft == null ? null : Math.ceil(timeLeft / 1000)
  const squad = a.squads.get(teamId) ?? []
  const leadingIsMe = state.leading_team_id === teamId
  const captainMode = settings.mode === 'captain'
  const blocker = a.bidBlocker(teamId, timeLeft)
  const iBidOnThis =
    player != null && bids.some((b) => b.player_id === player.id && b.team_id === teamId && !b.undone)

  // status line, derived from the live state
  let status: { text: string; style: string } | null = null
  if (state.status === 'sold' && player) {
    status = leadingIsMe
      ? { text: `🎉 ${player.name} is yours for ${fmt(state.current_bid)}!`, style: 'bg-emerald-600' }
      : { text: `Sold to ${leadingTeam?.name} for ${fmt(state.current_bid)}`, style: 'bg-slate-700' }
  } else if (state.status === 'unsold' && player) {
    status = { text: `${player.name} went unsold`, style: 'bg-slate-700' }
  } else if (state.status === 'bidding') {
    if (leadingIsMe) status = { text: 'You are the highest bidder', style: 'bg-emerald-600' }
    else if (iBidOnThis) status = { text: 'Outbid!', style: 'bg-red-600' }
  } else if (state.status === 'paused') {
    status = { text: 'Auction paused', style: 'bg-amber-500 text-black' }
  } else if (state.status === 'finished') {
    status = { text: 'Auction complete', style: 'bg-violet-600' }
  }

  async function bid() {
    if (a.nextBid == null) return
    setBusy(true)
    const { error } = await supabase.rpc('place_bid', { p_team_id: teamId, p_amount: a.nextBid })
    setBusy(false)
    if (error) {
      const msg = errorMessage(error)
      setFlash({ kind: 'error', text: msg })
      if (msg === 'Not allowed' || msg.includes('own team')) onAccessLost() // team code was reset
    } else {
      setFlash({ kind: 'success', text: `Bid placed: ${fmt(a.nextBid)}` })
    }
  }

  async function leave() {
    if (!confirm('Leave this team on this phone? You will need the team code to join again.')) return
    await supabase.auth.signOut()
    onAccessLost()
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 pt-4 pb-8">
      <ConnectionBadge connected={a.connected} />

      {/* my team */}
      <header className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: `${team.color}33` }}>
        <Avatar name={team.short_name} url={team.logo_url} color={team.color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{team.name}</div>
          <div className="text-xs text-slate-300">
            Squad {squadLabel(squad.length, settings.max_squad)} (min {settings.min_squad})
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-300">Purse</div>
          <div className="text-xl font-black tabular-nums">{fmt(team.purse_remaining)}</div>
          <div className="text-xs text-slate-300">Max bid {fmt(a.maxBid(teamId))}</div>
        </div>
      </header>

      {status && <div className={`rounded-xl px-4 py-3 text-center text-lg font-bold ${status.style}`}>{status.text}</div>}

      {/* current player */}
      {player && ['bidding', 'sold', 'unsold', 'paused'].includes(state.status) ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={player.name} url={player.photo_url} size={64} />
            <div className="min-w-0">
              <div className="truncate text-xl font-bold">{player.name}</div>
              <div className="text-xs text-slate-500">Base {fmt(player.base_price)}</div>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-xs text-slate-400">Current bid</div>
              <div key={state.current_bid ?? 'none'} className="animate-bid text-4xl font-black tabular-nums">
                {fmt(state.current_bid)}
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                {leadingTeam ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: leadingTeam.color }} />
                    <span className={leadingIsMe ? 'font-bold text-emerald-400' : ''}>
                      {leadingIsMe ? 'Your team' : leadingTeam.name}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">No bids yet</span>
                )}
              </div>
            </div>
            {secondsLeft != null && (
              <div
                className={`rounded-lg px-3 py-1 text-3xl font-black tabular-nums ${secondsLeft === 0 ? 'bg-red-700' : secondsLeft <= 5 ? 'bg-amber-500 text-black' : 'bg-slate-800'}`}
              >
                {secondsLeft}s
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
          {state.status === 'finished' ? 'The auction is over.' : 'Waiting for the next player…'}
        </section>
      )}

      {/* bid button */}
      {captainMode ? (
        <>
          <button
            disabled={busy || blocker != null}
            onClick={() => void bid()}
            className="rounded-2xl py-6 text-3xl font-black text-white shadow-lg transition active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: team.color }}
          >
            {blocker == null ? `Bid ${fmt(a.nextBid)}` : blockerText(blocker)}
          </button>
          {flash && <Alert kind={flash.kind}>{flash.text}</Alert>}
        </>
      ) : (
        <Alert kind="info">Phone bidding is off right now: raise your hand and the auctioneer will enter your bid.</Alert>
      )}

      {/* my squad */}
      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <h2 className="border-b border-slate-800 px-4 py-2 font-semibold">Your squad ({squad.length})</h2>
        <ul className="text-sm">
          {squad
            .slice()
            .sort((x, y) => Number(y.is_captain) - Number(x.is_captain))
            .map((p) => (
              <li key={p.id} className="flex items-center justify-between border-t border-slate-800 px-4 py-2 first:border-t-0">
                <span>
                  {p.name}
                  {p.is_captain && <span className="ml-2 text-xs text-sky-400">Captain</span>}
                </span>
                <span className="tabular-nums text-slate-400">{p.is_captain ? '—' : fmt(p.sold_price)}</span>
              </li>
            ))}
        </ul>
      </section>

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => downloadPlayersCsv(a.players, a.teams)}>
          ⬇ Player list
        </Button>
        <Button variant="secondary" onClick={() => setShowRules(true)}>
          📋 Rules
        </Button>
        <Link
          to="/results"
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700"
        >
          👥 All squads
        </Link>
        <Button variant="ghost" className="text-xs" onClick={() => void leave()}>
          Leave team on this phone
        </Button>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}

function blockerText(blocker: string) {
  switch (blocker) {
    case 'Leading':
      return 'You’re leading'
    case 'Time is up':
      return 'Time’s up'
    default:
      return blocker
  }
}
