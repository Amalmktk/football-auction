import type { ReactNode } from 'react'
import { describeIncrements, fmt } from '../lib/auction'
import type { Player, Settings, Team } from '../lib/types'
import { useSingleRow, useTable } from '../lib/useTable'
import { Modal } from './ui'

/** Auction rules, built from the live settings, teams and players. */
export default function RulesModal({ onClose }: { onClose: () => void }) {
  const { row: s } = useSingleRow<Settings>('settings')
  const { rows: teams } = useTable<Team>('teams')
  const { rows: players } = useTable<Player>('players')

  const auctioned = players.filter((p) => !p.is_captain)
  const prices = auctioned.map((p) => p.base_price)
  const minBase = prices.length ? Math.min(...prices) : null
  const maxBase = prices.length ? Math.max(...prices) : null
  const needAfterCaptain = s ? Math.max(s.min_squad - 2, 0) : 0 // slots still to fill after the captain and this purchase

  return (
    <Modal title="Auction rules" onClose={onClose}>
      {!s ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5 text-sm leading-relaxed text-slate-300">
          <Facts>
            <Fact label="Teams">{teams.length}</Fact>
            <Fact label="Players in the auction">{auctioned.length}</Fact>
            <Fact label="Purse per team">{fmt(s.starting_purse)} points</Fact>
            <Fact label="Squad size">
              {s.max_squad == null ? `At least ${s.min_squad}` : `${s.min_squad} to ${s.max_squad}`} players (captain
              included)
            </Fact>
            <Fact label="Base price">
              {minBase == null ? '—' : minBase === maxBase ? fmt(minBase) : `${fmt(minBase)} to ${fmt(maxBase)}`} points
            </Fact>
            <Fact label="Bid timer">{s.bid_timer_seconds} seconds</Fact>
          </Facts>

          <Section title="Bid raises">
            <p>Every bid is the current bid plus a fixed step. The app calculates it, so nobody types amounts:</p>
            <ul className="mt-1 list-disc pl-5">
              {describeIncrements(s.increments).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-1">The first bid on a player is their base price.</p>
          </Section>

          <Section title="How bidding works">
            <ul className="list-disc space-y-1 pl-5">
              {s.mode === 'captain' ? (
                <li>
                  Captains bid by tapping <b>Bid</b> on their phone, or by raising a hand for the auctioneer.
                </li>
              ) : (
                <li>Captains bid by raising a hand; the auctioneer enters the bid.</li>
              )}
              <li>A team can’t bid twice in a row: someone else has to bid first.</li>
              <li>
                The {s.bid_timer_seconds}-second timer restarts on every bid. When it reaches zero, bidding closes and the
                auctioneer confirms <b>SOLD</b> to the highest bidder, or <b>UNSOLD</b> if nobody bid.
              </li>
              <li>If two bids arrive at the same moment, the first one counts.</li>
              <li>Players are put up in random order.</li>
            </ul>
          </Section>

          <Section title="Budget and squad rules">
            <ul className="list-disc space-y-1 pl-5">
              <li>Captains are already in their teams, at no cost.</li>
              <li>
                A team must always keep enough points to complete its minimum squad of {s.min_squad} at the lowest base
                price. Its <b>maximum bid</b> is shown live on the console and the captain’s phone.
                {minBase != null && needAfterCaptain > 0 && (
                  <span className="text-slate-400">
                    {' '}
                    Example: at the start, with only the captain, a team must keep {needAfterCaptain} × {fmt(minBase)} ={' '}
                    {fmt(needAfterCaptain * minBase)} back, so it can bid up to{' '}
                    {fmt(s.starting_purse - needAfterCaptain * minBase)} on one player.
                  </span>
                )}
              </li>
              {s.max_squad != null && <li>A team with {s.max_squad} players is full and can’t bid any more.</li>}
              <li>
                Every team must be able to reach {s.min_squad} players. A team can’t bid if winning that player would
                leave too few players for the other teams to reach the minimum. The extra spots go to whoever wins them
                first.
              </li>
              <li>Unsold players come back in a re-auction round after everyone has been offered.</li>
            </ul>
          </Section>

          <Section title="Fair play">
            <ul className="list-disc space-y-1 pl-5">
              <li>The auctioneer can pause the auction for any dispute and undo a mistaken bid or sale.</li>
              <li>The organizers’ decision is final.</li>
            </ul>
          </Section>
        </div>
      )}
    </Modal>
  )
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-800 p-3">{children}</dl>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-100">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 font-semibold text-slate-100">{title}</h3>
      {children}
    </section>
  )
}
