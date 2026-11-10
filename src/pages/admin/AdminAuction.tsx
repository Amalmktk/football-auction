import { useEffect, useState } from 'react'
import { Alert, Avatar, Button, ConnectionBadge, Select } from '../../components/ui'
import { fmt, squadLabel, useAuction } from '../../lib/auction'
import { errorMessage } from '../../lib/auth'
import { msLeft, useServerNow } from '../../lib/clock'
import { supabase } from '../../lib/supabase'
import type { Bid } from '../../lib/types'
import { useTable } from '../../lib/useTable'

const statusLabel: Record<string, string> = {
  idle: 'Not started',
  bidding: 'Bidding',
  sold: 'Sold',
  unsold: 'Unsold',
  paused: 'Paused',
  finished: 'Finished',
}

const statusStyle: Record<string, string> = {
  idle: 'bg-slate-700',
  bidding: 'bg-emerald-600',
  sold: 'bg-sky-600',
  unsold: 'bg-red-700',
  paused: 'bg-amber-500 text-black',
  finished: 'bg-violet-600',
}

export default function AdminAuction() {
  const a = useAuction()
  const { rows: bids } = useTable<Bid>('bids', 'id', false)
  const now = useServerNow()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')

  // clear error messages after a few seconds
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(id)
  }, [error])

  const { state, settings, currentPlayer: player, leadingTeam } = a

  async function run(fn: string, args?: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  if (a.loading) return <p className="text-slate-400">Loading…</p>
  if (a.error || !state || !settings) return <Alert>{a.error ?? 'Could not load the auction.'}</Alert>

  const timeLeft = state.status === 'bidding' ? msLeft(state.timer_ends_at, now) : null
  const secondsLeft = timeLeft == null ? null : Math.ceil(timeLeft / 1000)
  const isBidding = state.status === 'bidding'
  const isPaused = state.status === 'paused'
  const canStartNext = !isBidding && !isPaused
  const playerBids = player ? bids.filter((b) => b.player_id === player.id) : []
  const available = a.pool.filter((p) => p.status === 'available')
  const unsold = a.pool.filter((p) => p.status === 'unsold')

  function sell() {
    if (!player || !leadingTeam || state?.current_bid == null) return
    void run('sell_current', undefined, `SOLD: ${player.name} to ${leadingTeam.name} for ${fmt(state.current_bid)}?`)
  }

  function markUnsold() {
    if (!player) return
    const warn =
      state?.current_bid != null
        ? `There is a bid of ${fmt(state.current_bid)}. Mark ${player.name} UNSOLD anyway?`
        : `Mark ${player.name} UNSOLD?`
    void run('mark_unsold', undefined, warn)
  }

  function resetAuction() {
    const typed = prompt(
      'This clears ALL bids and sales, puts every player back in the pool and restores team purses.\nTeams, players and settings are kept.\n\nType RESET to confirm.',
    )
    if (typed === 'RESET') void run('reset_auction')
  }

  return (
    <div className="space-y-6">
      <ConnectionBadge connected={a.connected} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Auction console</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusStyle[state.status]}`}>
          {statusLabel[state.status]}
          {isPaused && state.paused_status ? ` (was ${statusLabel[state.paused_status].toLowerCase()})` : ''}
        </span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">
          {state.round === 'main' ? 'Main round' : 'Re-auction round'}
        </span>
        <span className="text-sm text-slate-400">
          {available.length} available · {unsold.length} unsold ·{' '}
          {settings.mode === 'captain' ? 'Phones + admin bidding' : 'Admin-only bidding'}
        </span>
      </div>

      {error && <Alert>{error}</Alert>}
      {settings.mode === 'auctioneer' && (
        <Alert kind="info">Admin-only bidding: phone bidding is off. Tap a team when its captain raises a hand.</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------ left: player, bid, actions */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            {player ? (
              <div className="flex flex-wrap items-center gap-5">
                <Avatar name={player.name} url={player.photo_url} size={112} />
                <div className="min-w-0 flex-1">
                  <div className="text-3xl font-bold">{player.name}</div>
                  <div className="mt-1 text-sm text-slate-500">Base price {fmt(player.base_price)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">
                    {state.status === 'sold' ? 'Sold for' : 'Current bid'}
                  </div>
                  <div key={state.current_bid ?? 'none'} className="animate-bid text-6xl font-black tabular-nums">
                    {fmt(state.current_bid)}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2 text-lg">
                    {leadingTeam ? (
                      <>
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: leadingTeam.color }} />
                        {leadingTeam.name}
                      </>
                    ) : (
                      <span className="text-slate-500">No bids yet</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-slate-400">
                {state.status === 'finished'
                  ? 'Auction finished: no players left.'
                  : 'No player on the block. Click “Next player” or put a specific player up.'}
              </p>
            )}

            {player && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
                {isBidding && (
                  <span
                    className={`rounded-lg px-3 py-1 text-2xl font-bold tabular-nums ${secondsLeft === 0 ? 'bg-red-700' : secondsLeft != null && secondsLeft <= 5 ? 'bg-amber-500 text-black' : 'bg-slate-800'}`}
                  >
                    {secondsLeft === 0 ? 'Time up' : `${secondsLeft}s`}
                  </span>
                )}
                {state.status === 'sold' && leadingTeam && (
                  <span className="text-lg font-semibold text-sky-300">
                    SOLD to {leadingTeam.name} for {fmt(state.current_bid)}
                  </span>
                )}
                {state.status === 'unsold' && <span className="text-lg font-semibold text-red-300">UNSOLD</span>}
                {isBidding && secondsLeft === 0 && (
                  <span className="text-sm text-slate-400">Bidding closed: confirm SOLD or UNSOLD, or restart the timer.</span>
                )}
              </div>
            )}
          </section>

          {/* team bid buttons */}
          <section>
            <h2 className="mb-2 font-semibold">
              Bid for a team (captain raised hand){' '}
              {a.nextBid != null && <span className="text-slate-400">· next bid {fmt(a.nextBid)}</span>}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {a.teams.map((t) => {
                const blocker = a.bidBlocker(t.id, timeLeft)
                const leading = state.leading_team_id === t.id
                return (
                  <button
                    key={t.id}
                    disabled={busy || blocker != null}
                    onClick={() => void run('place_bid', { p_team_id: t.id, p_amount: a.nextBid })}
                    className={`rounded-xl border-2 bg-slate-900 p-3 text-left transition enabled:hover:bg-slate-800 disabled:opacity-60 ${leading ? 'ring-2 ring-emerald-400' : ''}`}
                    style={{ borderColor: t.color }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{t.name}</span>
                      <span className="text-lg font-bold">
                        {blocker ? (
                          <span className={`text-sm ${leading ? 'text-emerald-400' : 'text-slate-400'}`}>{blocker}</span>
                        ) : (
                          `Bid ${fmt(a.nextBid)}`
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Purse {fmt(t.purse_remaining)} · Max {fmt(a.maxBid(t.id))} · Squad{' '}
                      {squadLabel(a.squadSize(t.id), settings.max_squad)}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* main actions */}
          <section className="flex flex-wrap gap-2">
            <Button disabled={busy || !canStartNext} onClick={() => void run('next_player')}>
              Next player
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={busy || !isBidding || state.current_bid == null}
              onClick={sell}
            >
              SOLD
            </Button>
            <Button variant="danger" disabled={busy || !isBidding} onClick={markUnsold}>
              UNSOLD
            </Button>
            <Button variant="secondary" disabled={busy || !isBidding} onClick={() => void run('reset_timer')}>
              Restart timer
            </Button>
            <Button
              variant="secondary"
              disabled={busy || isPaused}
              onClick={() => void run('undo_last', undefined, 'Undo the last action (bid, sale, unsold or player start)?')}
            >
              ↶ Undo last
            </Button>
            {isPaused ? (
              <Button className="ml-auto bg-amber-500 text-black hover:bg-amber-400" disabled={busy} onClick={() => void run('resume')}>
                ▶ Resume
              </Button>
            ) : (
              <Button variant="secondary" className="ml-auto" disabled={busy} onClick={() => void run('pause')}>
                ⏸ Pause all
              </Button>
            )}
          </section>

          {/* pick a specific player */}
          <section className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 p-4">
            <div className="min-w-60 flex-1">
              <div className="mb-1 text-sm font-medium text-slate-300">Put a specific player up</div>
              <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a player…</option>
                {available.length > 0 && (
                  <optgroup label="Available">
                    {available.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · base {p.base_price}
                      </option>
                    ))}
                  </optgroup>
                )}
                {unsold.length > 0 && (
                  <optgroup label="Unsold (re-auction)">
                    {unsold.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · base {p.base_price}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={busy || !pick || !canStartNext}
              onClick={() => {
                void run('start_player', { p_player_id: pick })
                setPick('')
              }}
            >
              Put up for bidding
            </Button>
          </section>
        </div>

        {/* ------------------------------------------------ right: teams, history */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900">
            <h2 className="border-b border-slate-800 px-4 py-2 font-semibold">Teams</h2>
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-4 py-1 text-left font-normal">Team</th>
                  <th className="px-2 py-1 text-right font-normal">Purse</th>
                  <th className="px-2 py-1 text-right font-normal">Max</th>
                  <th className="px-4 py-1 text-right font-normal">Squad</th>
                </tr>
              </thead>
              <tbody>
                {a.teams.map((t) => {
                  const squad = a.squads.get(t.id) ?? []
                  return (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="px-4 py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.short_name}                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(t.purse_remaining)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(a.maxBid(t.id))}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {squadLabel(squad.length, settings.max_squad)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900">
            <h2 className="border-b border-slate-800 px-4 py-2 font-semibold">Bid history{player ? `: ${player.name}` : ''}</h2>
            {playerBids.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No bids.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto text-sm">
                {playerBids.map((b) => {
                  const t = a.teamById.get(b.team_id)
                  return (
                    <li
                      key={b.id}
                      className={`flex justify-between border-t border-slate-800 px-4 py-1.5 first:border-t-0 ${b.undone ? 'text-slate-600 line-through' : ''}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t?.color }} />
                        {t?.name ?? '?'}
                      </span>
                      <span className="tabular-nums">
                        {fmt(b.amount)}{' '}
                        <span className="text-xs text-slate-500">
                          {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900">
            <h2 className="border-b border-slate-800 px-4 py-2 font-semibold">Recently sold</h2>
            {a.recentSold.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">Nothing sold yet.</p>
            ) : (
              <ul className="text-sm">
                {a.recentSold.slice(0, 6).map((p) => {
                  const t = p.team_id ? a.teamById.get(p.team_id) : undefined
                  return (
                    <li key={p.id} className="flex justify-between border-t border-slate-800 px-4 py-1.5 first:border-t-0">
                      <span>{p.name}</span>
                      <span className="text-slate-400">
                        {t?.short_name} · {fmt(p.sold_price)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {state.status !== 'finished' && (
            <section className="rounded-xl border border-slate-800 p-4">
              <h2 className="font-semibold">Finish</h2>
              <p className="mt-1 mb-3 text-sm text-slate-400">
                End the auction even if players are left over (e.g. every squad is complete and nobody wants the
                rest). Screens then show “Auction complete”.
              </p>
              <Button
                variant="secondary"
                disabled={busy || isBidding || isPaused}
                onClick={() =>
                  void run(
                    'finish_auction',
                    undefined,
                    a.pool.length > 0
                      ? `Finish the auction with ${a.pool.length} player(s) still unsold?`
                      : 'Finish the auction?',
                  )
                }
              >
                Finish auction…
              </Button>
            </section>
          )}

          <section className="rounded-xl border border-red-900/60 p-4">
            <h2 className="font-semibold text-red-300">Reset</h2>
            <p className="mt-1 mb-3 text-sm text-slate-400">
              After a rehearsal: clear all bids and sales and restore purses. Teams, players and settings stay.
            </p>
            <Button variant="danger" disabled={busy} onClick={resetAuction}>
              Reset auction…
            </Button>
          </section>
        </div>
      </div>
    </div>
  )
}
