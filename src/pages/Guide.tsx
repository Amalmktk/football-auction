import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { HomeLink } from '../components/ui'

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'organizers', label: 'Organizers' },
  { id: 'captains', label: 'Captains' },
  { id: 'tv', label: 'TV screen' },
  { id: 'everyone', label: 'Everyone else' },
  { id: 'faq', label: 'FAQ' },
]

/** User manual: how the auction works for each role. Static, no data needed. */
export default function Guide() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 leading-relaxed text-slate-300">
      <HomeLink />
      <header>
        <h1 className="text-3xl font-bold text-white">📖 How it works</h1>
        <p className="mt-2">
          A step-by-step guide for organizers, captains and spectators. Open it on any phone or laptop, with nothing to
          install.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="overview" title="Overview">
        <p>
          Each team starts with a captain and a purse of points. Players come up one at a time in random order, and
          teams bid for them. The highest bid when the timer runs out wins the player. When the auction ends, every team
          has a full squad.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Screen to="/admin/login" title="Organizers" who="Laptop">
            Set up teams and players, and run the auction.
          </Screen>
          <Screen to="/captain" title="Captains" who="Phone">
            Join with a team code and tap to bid.
          </Screen>
          <Screen to="/live" title="Live auction" who="TV / projector">
            Big screen showing the current player, bids and timer.
          </Screen>
          <Screen to="/results" title="Squads" who="Anyone">
            Every team’s players and what they cost.
          </Screen>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Everything updates live on every screen. The exact numbers (purse, squad size, timer, bid steps) are in{' '}
          <b>📋 Rules</b> on the home page.
        </p>
      </Section>

      <Section id="organizers" title="Organizers: set up before the day">
        <Steps>
          <Step title="Log in">
            Go to <b>Organizers</b> on the home page and log in with the admin account from the organizers. A new
            organizer can sign up there and get approved by an existing admin on the <b>Admins</b> page.
          </Step>
          <Step title="Settings">
            Set the tournament name, purse per team, bid timer, minimum and maximum squad size (captain included), and
            bid steps. For <b>Bidding</b>, choose whether captains bid from their phones or only the admin enters bids.
          </Step>
          <Step title="Teams">
            <b>Add team</b> for each team: name, short name (e.g. TIG), captain name and colour. The captain joins the
            squad automatically, at no cost.
          </Step>
          <Step title="Players">
            <b>Add player</b> one by one (name, base price, optional photo), or use <b>Import CSV</b>. Download the{' '}
            <b>CSV template</b> to see the format: <code className="text-slate-200">name,base_price,photo_url</code>.
          </Step>
          <Step title="Join codes">
            On <b>Teams</b>, press <b>Generate all join codes</b> and send each captain their own code (e.g. TIG-4F7K).
            Keep codes private: anyone with a code can bid for that team. Making a new code signs out phones that used
            the old one.
          </Step>
          <Step title="Screens">
            Open <b>Live auction</b> on the TV or projector, and ask captains to join on their phones before you
            start.
          </Step>
        </Steps>
      </Section>

      <Section id="organizers-run" title="Organizers: run the auction">
        <p>
          Everything happens on <b>Auction console</b>.
        </p>
        <Steps>
          <Step title="Next player">Puts a random player up for bidding and starts the timer.</Step>
          <Step title="Take bids">
            Captains tap <b>Bid</b> on their phones. If a captain raises a hand instead, press that team’s button under{' '}
            <b>Bid for a team</b>. The app works out the bid amount, and the timer restarts on every bid.
          </Step>
          <Step title="SOLD or UNSOLD">
            When the timer hits zero, press <b>SOLD</b> to give the player to the highest bidder, or <b>UNSOLD</b> if
            nobody bid. Unsold players come back in a re-auction round at the end.
          </Step>
          <Step title="Repeat">Press Next player again until everyone is sold.</Step>
        </Steps>
        <Tips>
          <li>
            <b>↶ Undo last</b> reverses the last bid, sale, unsold or player start.
          </li>
          <li>
            <b>⏸ Pause all</b> freezes every screen for a dispute or break. <b>▶ Resume</b> continues.
          </li>
          <li>
            <b>Restart timer</b> gives everyone a fresh countdown on the current player.
          </li>
          <li>
            <b>Put a specific player up</b> lets you choose the next player instead of picking at random.
          </li>
          <li>
            A team button shows why that team can’t bid (e.g. <i>Squad full</i>, <i>Over max bid</i>,{' '}
            <i>Other teams still need players</i>).
          </li>
          <li>
            <b>Finish auction…</b> ends the auction when every squad is complete but players are left over, so the
            screens show “Auction complete”.
          </li>
          <li>
            <b>Reset auction…</b> clears all sales and bids. Use it after a practice run, never during the real auction.
          </li>
        </Tips>
      </Section>

      <Section id="captains" title="Captains">
        <Steps>
          <Step title="Join">
            Open the site on your phone, tap <b>Captains</b> and enter the team code from the organizers. You only do
            this once, and the phone remembers it.
          </Step>
          <Step title="Watch">
            You’ll see the player on the block, the current bid, the timer, your purse and your <b>Max bid</b>.
          </Step>
          <Step title="Bid">
            Tap <b>Bid</b> to raise by the next step. You can’t bid twice in a row, and if two bids arrive at the same
            moment, the first one counts.
          </Step>
        </Steps>
        <Tips>
          <li>
            <b>Max bid</b> is the most you can spend on this player while still keeping enough points to fill your
            minimum squad.
          </li>
          <li>
            Once you reach the minimum, you can buy extra players up to the maximum, if you have the points and the
            other teams can still fill their squads.
          </li>
          <li>
            Keep the screen on. If the page goes stale, refresh it. You stay joined.
          </li>
        </Tips>
      </Section>

      <Section id="tv" title="TV screen">
        <p>
          Open <b>Live auction</b> on the laptop connected to the TV and make the browser full screen (F11). It shows the
          current player, the leading team, the countdown and a celebration on every sale. Nothing needs clicking.
        </p>
      </Section>

      <Section id="everyone" title="Everyone else">
        <p>
          Open <b>Live auction</b> to follow along on your phone, or <b>Squads</b> to see every team’s players and
          prices. <b>Export CSV</b> on Squads downloads the results as a spreadsheet.
        </p>
      </Section>

      <Section id="faq" title="FAQ">
        <Faq q="Want to try it before the real auction?">
          Organizers can do a practice run: add a few test teams and players, give the join codes to friends, run a few
          rounds, then <b>Reset auction…</b> and delete the test data.
        </Faq>
        <Faq q="My Bid button is greyed out. Why?">
          The button says why: you are already leading, the timer ran out, the auction is paused, your squad is full,
          the bid is over your max bid (you must keep enough points to fill the rest of your squad), or the other
          teams still need the remaining players.
        </Faq>
        <Faq q="The join code doesn’t work.">
          Check for typos (it isn’t case sensitive). If the organizers made a new code, the old one stops working and
          phones that used it are signed out. Ask them for the latest code and join again.
        </Faq>
        <Faq q="Someone bid by mistake.">Tell the auctioneer. They can undo the last bid or sale.</Faq>
        <Faq q="Who has the final say?">The organizers.</Faq>
      </Section>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function Screen({ to, title, who, children }: { to: string; title: string; who: string; children: ReactNode }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-sky-500">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-white">{title}</span>
        <span className="text-xs text-slate-500">{who}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">{children}</p>
    </Link>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-3 space-y-3 [counter-reset:step]">{children}</ol>
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 [counter-increment:step]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white before:content-[counter(step)]" />
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-sm">{children}</div>
      </div>
    </li>
  )
}

function Tips({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-1 text-sm font-semibold text-white">Good to know</div>
      <ul className="list-disc space-y-1 pl-5 text-sm">{children}</ul>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-slate-800 py-3">
      <summary className="cursor-pointer font-medium text-white marker:text-slate-500">{q}</summary>
      <p className="mt-2 text-sm">{children}</p>
    </details>
  )
}
