import { useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, PageHeader, Select } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { Increment, Settings } from '../../lib/types'
import { useSingleRow } from '../../lib/useTable'

type Draft = Omit<Settings, 'id'>

export default function AdminSettings() {
  const { row, error: loadError } = useSingleRow<Settings>('settings')
  if (loadError) return <Alert>{loadError}</Alert>
  if (!row) return <p className="text-slate-400">Loading…</p>
  // The form takes a snapshot when settings first load; later live updates don't overwrite edits in progress.
  return <SettingsForm initial={row} />
}

/**
 * Can every team complete its minimum squad with this purse, whatever happens? Uses the same
 * worst case as the bidding rule (see reserveCheck in lib/auction.ts): each team must afford its
 * remaining slots even with the most expensive of the cheapest players needed league-wide.
 * Returns a message if not, or null. Too few players is allowed (more can be added later).
 */
async function budgetProblem(d: Draft): Promise<string | null> {
  const [teamsRes, playersRes] = await Promise.all([
    supabase.from('teams').select('id'),
    supabase.from('players').select('team_id, status, base_price, is_captain'),
  ])
  if (teamsRes.error) throw teamsRes.error
  if (playersRes.error) throw playersRes.error
  const players = playersRes.data
  const prices = players
    .filter((p) => !p.is_captain && (p.status === 'available' || p.status === 'unsold'))
    .map((p) => p.base_price as number)
    .sort((x, y) => x - y)
  const needs = teamsRes.data.map(
    (t) => Math.max(d.min_squad - players.filter((p) => p.team_id === t.id).length, 0),
  )
  const total = needs.reduce((s, n) => s + n, 0)
  if (total === 0 || total > prices.length) return null
  const fillers = prices.slice(0, total)
  const biggestNeed = Math.max(...needs)
  const worst = fillers.slice(fillers.length - biggestNeed).reduce((s, x) => s + x, 0)
  if (d.starting_purse < worst) {
    return `Purse too small: with these base prices a team may need up to ${worst.toLocaleString('en-IN')} points to fill its ${biggestNeed} remaining squad places, so nobody could bid. Raise the purse to at least ${worst.toLocaleString('en-IN')} or lower base prices.`
  }
  return null
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState<Draft>(() => {
    const { id: _id, ...rest } = initial
    return rest
  })
  // last saved values, to tell which fields this save changes
  const saved = useRef<Draft>(draft)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })
  const setIncrement = (i: number, patch: Partial<Increment>) =>
    set(
      'increments',
      draft.increments.map((inc, j) => (j === i ? { ...inc, ...patch } : inc)),
    )

  function validate(d: Draft): string | null {
    if (!d.tournament_name.trim()) return 'Tournament name is required.'
    if (d.starting_purse <= 0) return 'Starting purse must be positive.'
    if (d.min_squad < 1) return 'Minimum squad size must be at least 1.'
    if (d.max_squad != null && d.max_squad < d.min_squad) return 'Maximum squad size can’t be below the minimum.'
    if (d.bid_timer_seconds < 5) return 'Bid timer must be at least 5 seconds.'
    if (d.increments.length === 0) return 'Add at least one bid increment.'
    for (let i = 0; i < d.increments.length; i++) {
      const inc = d.increments[i]
      if (inc.step <= 0) return 'Every increment step must be positive.'
      const isLast = i === d.increments.length - 1
      if (!isLast && (inc.upto == null || inc.upto <= 0)) return 'Every increment except the last needs an "up to" amount.'
      if (!isLast && i > 0 && inc.upto! <= d.increments[i - 1].upto!) return 'Increment "up to" amounts must increase.'
    }
    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    const d: Draft = {
      ...draft,
      tournament_name: draft.tournament_name.trim(),
      // the last band always covers everything above
      increments: draft.increments.map((inc, i) => (i === draft.increments.length - 1 ? { ...inc, upto: null } : inc)),
    }
    const invalid = validate(d)
    if (invalid) return setMessage({ kind: 'error', text: invalid })
    setBusy(true)
    try {
      const prev = saved.current
      const moneyChanged =
        d.starting_purse !== prev.starting_purse || d.min_squad !== prev.min_squad || d.max_squad !== prev.max_squad

      if (moneyChanged) {
        // Purse and squad sizes are only safe to change before anyone is bought:
        // changing them mid-auction could leave a team unable to complete its squad.
        const [soldRes, stateRes] = await Promise.all([
          supabase.from('players').select('id', { count: 'exact', head: true }).eq('status', 'sold').eq('is_captain', false),
          supabase.from('auction_state').select('status').eq('id', 1).single(),
        ])
        if (soldRes.error) throw soldRes.error
        if (stateRes.error) throw stateRes.error
        if ((soldRes.count ?? 0) > 0 || ['bidding', 'paused'].includes(stateRes.data.status)) {
          setMessage({
            kind: 'error',
            text: 'Players have already been bought or are up for bidding, so the purse and squad sizes are locked. Use “Reset auction…” on the Auction console first, then change them.',
          })
          return
        }
      }

      if (moneyChanged) {
        const problem = await budgetProblem(d)
        if (problem) {
          setMessage({ kind: 'error', text: problem })
          return
        }
      }

      const { error } = await supabase.from('settings').update(d).eq('id', 1)
      if (error) throw error

      // nobody bought yet: give every team the new purse straight away
      if (d.starting_purse !== prev.starting_purse) {
        const { error: purseError } = await supabase
          .from('teams')
          .update({ purse_remaining: d.starting_purse })
          .not('id', 'is', null)
        if (purseError) throw purseError
      }
      saved.current = d
      setMessage({ kind: 'success', text: 'Settings saved.' })
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-8">
      <PageHeader title="Settings">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </PageHeader>

      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Tournament name">
            <Input value={draft.tournament_name} onChange={(e) => set('tournament_name', e.target.value)} />
          </Field>
        </div>
        <Field
          label="Starting purse per team (points)"
          hint="Saving applies it to every team. Locked once players are bought (reset the auction to change it)."
        >
          <Input type="number" min={1} value={draft.starting_purse} onChange={(e) => set('starting_purse', num(e.target.value))} />
        </Field>
        <Field label="Bid timer (seconds)" hint="Resets on every new bid.">
          <Input
            type="number"
            min={5}
            value={draft.bid_timer_seconds}
            onChange={(e) => set('bid_timer_seconds', num(e.target.value))}
          />
        </Field>
        <Field label="Minimum squad size" hint="Including the captain.">
          <Input type="number" min={1} value={draft.min_squad} onChange={(e) => set('min_squad', num(e.target.value))} />
        </Field>
        <Field label="Maximum squad size" hint="Optional. A team that reaches it can't bid any more.">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              disabled={draft.max_squad == null}
              placeholder="No limit"
              value={draft.max_squad ?? ''}
              onChange={(e) => set('max_squad', num(e.target.value))}
            />
            <label className="flex shrink-0 items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={draft.max_squad == null}
                onChange={(e) => set('max_squad', e.target.checked ? null : Math.max(draft.min_squad, 10))}
              />
              No maximum
            </label>
          </div>
        </Field>
        <Field
          label="Bidding"
          hint="Admin can always tap a team's button for captains who raise their hands. Switch to “Admin only” if phones or Wi-Fi give trouble."
        >
          <Select value={draft.mode} onChange={(e) => set('mode', e.target.value as Draft['mode'])}>
            <option value="captain">Phones + admin (captains bid on phones or raise hands)</option>
            <option value="auctioneer">Admin only (captains raise hands)</option>
          </Select>
        </Field>
      </section>
      <p className="text-sm text-slate-400">“Next player” picks a random player from those not yet auctioned.</p>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Bid increments</h2>
          <p className="text-sm text-slate-400">
            The next bid is always the current bid plus the step for its band. Example: +10 below 200, +20 from 200.
          </p>
        </div>
        {draft.increments.map((inc, i) => {
          const isLast = i === draft.increments.length - 1
          return (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <Field label="When the current bid is below">
                {isLast ? (
                  <div className="px-3 py-2 text-slate-400">anything (and above)</div>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    value={inc.upto ?? ''}
                    onChange={(e) => setIncrement(i, { upto: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Raise by">
                <Input type="number" min={1} value={inc.step} onChange={(e) => setIncrement(i, { step: num(e.target.value) })} />
              </Field>
              {draft.increments.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => set('increments', draft.increments.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              )}
            </div>
          )
        })}
        <Button
          variant="secondary"
          onClick={() => {
            const prev = draft.increments.slice(0, -1)
            const last = draft.increments[draft.increments.length - 1]
            const lastUpto = prev.length ? (prev[prev.length - 1].upto ?? 0) : 0
            set('increments', [...prev, { upto: lastUpto + 100, step: last?.step ?? 10 }, { upto: null, step: (last?.step ?? 10) * 2 }])
          }}
        >
          Add band
        </Button>
      </section>
    </form>
  )
}
