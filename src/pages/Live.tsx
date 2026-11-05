import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar, ConnectionBadge } from '../components/ui'
import { fmt, squadLabel, useAuction } from '../lib/auction'
import { msLeft, useServerNow } from '../lib/clock'
import { createAudio, playBid, playSold, playUnsold } from '../lib/sound'
import type { Team } from '../lib/types'

const SOLD_MOMENT_MS = 5000
const UNSOLD_MOMENT_MS = 3000

// confetti pieces are generated once (random positions, colors, timing)
const CONFETTI_COLORS = ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#f97316', '#a78bfa', '#ffffff']
const CONFETTI = Array.from({ length: 120 }, (_, i) => ({
  left: Math.random() * 100,
  delay: Math.random() * 1.2,
  duration: 2.5 + Math.random() * 2,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  rotate: Math.random() * 360,
}))

export default function Live() {
  const a = useAuction()
  const now = useServerNow(150)
  const audio = useRef<AudioContext | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const [started, setStarted] = useState(false)

  const { state, settings, currentPlayer: player, leadingTeam } = a

  // Fresh SOLD / UNSOLD moments (derived from the server timestamp, so a reload doesn't replay them)
  const sinceUpdate = state ? now - new Date(state.updated_at).getTime() : Infinity
  const soldMoment = state?.status === 'sold' && sinceUpdate < SOLD_MOMENT_MS
  const unsoldMoment = state?.status === 'unsold' && sinceUpdate < UNSOLD_MOMENT_MS

  // Sounds: play once per new event
  const lastSound = useRef<string | null>(null)
  useEffect(() => {
    if (!state) return
    const key = `${state.status}:${state.current_player_id}:${state.current_bid}`
    if (lastSound.current === null) {
      lastSound.current = key // first load: stay quiet
      return
    }
    if (key === lastSound.current) return
    lastSound.current = key
    const fresh = Date.now() - new Date(state.updated_at).getTime() < 10_000
    if (!fresh) return
    if (state.status === 'sold') playSold(audio.current)
    else if (state.status === 'unsold') playUnsold(audio.current)
    else if (state.status === 'bidding' && state.current_bid != null) playBid(audio.current)
  }, [state])

  // Keep the screen awake; the lock is released when the tab is hidden, so re-request it
  useEffect(() => {
    if (!started) return
    const onVisible = async () => {
      if (document.visibilityState === 'visible') {
        try {
          wakeLock.current = await navigator.wakeLock.request('screen')
        } catch {
          // not supported or not allowed: fine
        }
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [started])

  async function startDisplay() {
    audio.current ??= createAudio()
    await audio.current?.resume().catch(() => undefined)
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      // fullscreen may be blocked; the display still works
    }
    try {
      wakeLock.current = await navigator.wakeLock.request('screen')
    } catch {
      // ignore
    }
    setStarted(true)
  }

  if (a.loading || !state || !settings) {
    return <div className="flex h-screen items-center justify-center bg-black text-3xl text-slate-400">Loading…</div>
  }

  const timeLeft = state.status === 'bidding' ? msLeft(state.timer_ends_at, now) : null
  const totalMs = settings.bid_timer_seconds * 1000
  const showStage = player && ['bidding', 'sold', 'unsold'].includes(state.status)

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white select-none">
      <ConnectionBadge connected={a.connected} />

      {/* header */}
      <header className="flex items-center justify-between px-[2vw] py-[1.2vh]">
        <div className="text-[1.8vw] font-bold tracking-wide">⚽ {settings.tournament_name}</div>
        <div className="text-[1.3vw] text-slate-400">
          {state.round === 'reauction' ? 'Re-auction round' : 'Player auction'}
        </div>
      </header>

      {/* stage */}
      <main className="flex min-h-0 flex-1 gap-[2vw] px-[2vw]">
        {showStage ? (
          <>
            {/* player card, ~60% */}
            <section className="relative flex w-[60%] items-center gap-[3vw] rounded-[2vw] bg-white/5 p-[3vw]">
              <div className="shrink-0">
                {player.photo_url ? (
                  <img
                    src={player.photo_url}
                    alt={player.name}
                    className="h-[28vw] max-h-[52vh] w-[22vw] rounded-[1.5vw] object-cover shadow-2xl"
                  />
                ) : (
                  <div className="flex h-[28vw] max-h-[52vh] w-[22vw] items-center justify-center rounded-[1.5vw] bg-slate-700 text-[8vw] font-black text-slate-300">
                    {initials(player.name)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[4.5vw] leading-none font-black">{player.name}</div>
                <div className="mt-[2vh] flex flex-wrap gap-[1vw] text-[2vw]">
                  {player.position && <Chip>{positionName(player.position)}</Chip>}
                </div>
                <div className="mt-[3vh] text-[1.8vw] text-slate-300">
                  Base price <b className="text-white">{fmt(player.base_price)}</b>
                </div>
              </div>

              {state.status === 'sold' && !soldMoment && leadingTeam && (
                <Stamp color={leadingTeam.color}>SOLD</Stamp>
              )}
              {state.status === 'unsold' && !unsoldMoment && <Stamp color="#dc2626">UNSOLD</Stamp>}
            </section>

            {/* bid panel, ~40% */}
            <section
              className="flex w-[40%] flex-col items-center justify-center rounded-[2vw] p-[2vw] transition-colors duration-500"
              style={{ backgroundColor: leadingTeam ? `${leadingTeam.color}33` : 'rgba(255,255,255,0.05)' }}
            >
              <div className="text-[2vw] tracking-widest text-slate-300 uppercase">
                {state.status === 'sold' ? 'Sold for' : state.current_bid == null ? 'Opening bid' : 'Current bid'}
              </div>
              <div key={state.current_bid ?? 'none'} className="animate-bid text-[10vw] leading-none font-black tabular-nums">
                {fmt(state.current_bid ?? player.base_price)}
              </div>
              <div className="mt-[2vh] flex h-[7vw] items-center gap-[1vw]">
                {leadingTeam ? (
                  <>
                    <Avatar name={leadingTeam.short_name} url={leadingTeam.logo_url} color={leadingTeam.color} size={vw(6)} />
                    <span className="text-[3vw] font-bold">{leadingTeam.name}</span>
                  </>
                ) : (
                  state.status === 'bidding' && <span className="text-[2.2vw] text-slate-400">Waiting for the first bid…</span>
                )}
              </div>
              {state.status === 'bidding' && timeLeft != null && <CountdownRing msLeft={timeLeft} totalMs={totalMs} />}
            </section>
          </>
        ) : (
          <BetweenPlayers status={state.status} a={a} />
        )}
      </main>

      {/* ticker: last three sold */}
      <div className="flex items-center gap-[2vw] px-[2vw] py-[1.2vh] text-[1.4vw]">
        <span className="font-semibold text-slate-400 uppercase">Recently sold</span>
        {a.recentSold.length === 0 && <span className="text-slate-500">—</span>}
        {a.recentSold.slice(0, 3).map((p) => {
          const t = p.team_id ? a.teamById.get(p.team_id) : undefined
          return (
            <span key={p.id} className="flex items-center gap-[0.6vw]">
              <span className="h-[1vw] w-[1vw] rounded-full" style={{ backgroundColor: t?.color }} />
              {p.name} → {t?.short_name} <b>{fmt(p.sold_price)}</b>
            </span>
          )
        })}
      </div>

      {/* bottom strip: every team */}
      <footer className="flex gap-[0.6vw] px-[1vw] pb-[1.5vh]">
        {a.teams.map((t) => (
          <TeamTile
            key={t.id}
            team={t}
            squad={a.squadSize(t.id)}
            max={settings.max_squad}
            leading={state.leading_team_id === t.id && state.status === 'bidding'}
          />
        ))}
      </footer>

      {/* full-screen moments */}
      {soldMoment && player && leadingTeam && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center" style={{ backgroundColor: `${leadingTeam.color}ee` }}>
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${c.left}%`,
                backgroundColor: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                rotate: `${c.rotate}deg`,
              }}
            />
          ))}
          <div className="animate-pop-in text-center drop-shadow-[0_0.3vw_0.6vw_rgba(0,0,0,0.5)]">
            <div className="text-[12vw] leading-none font-black tracking-tight">SOLD!</div>
            <div className="mt-[3vh] text-[4.5vw] font-bold">{player.name}</div>
            <div className="mt-[2vh] flex items-center justify-center gap-[1.5vw] text-[3.5vw]">
              <Avatar name={leadingTeam.short_name} url={leadingTeam.logo_url} color={leadingTeam.color} size={vw(7)} />
              to {leadingTeam.name} for <b>{fmt(state.current_bid)}</b>
            </div>
          </div>
        </div>
      )}
      {unsoldMoment && player && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/95">
          <div className="animate-pop-in text-center">
            <div className="text-[10vw] leading-none font-black text-red-500">UNSOLD</div>
            <div className="mt-[3vh] text-[4vw] font-bold">{player.name}</div>
            <div className="mt-[1vh] text-[2vw] text-slate-400">Returns in the re-auction round</div>
          </div>
        </div>
      )}

      {/* start button (enables full screen, sound and keep-awake) */}
      {!started && (
        <button
          onClick={() => void startDisplay()}
          className="absolute right-[1.5vw] bottom-[14vh] z-50 rounded-xl bg-sky-600 px-6 py-3 text-xl font-bold shadow-2xl hover:bg-sky-500"
        >
          ▶ Start display
        </button>
      )}
    </div>
  )
}

function BetweenPlayers({ status, a }: { status: string; a: ReturnType<typeof useAuction> }) {
  const settings = a.settings!
  const leftToGo = a.pool.length
  let title = 'Next player coming up…'
  let subtitle = `${leftToGo} player${leftToGo === 1 ? '' : 's'} left`
  if (status === 'idle') {
    title = 'The auction starts soon'
    subtitle = ''
  } else if (status === 'paused') {
    title = 'Auction paused'
    subtitle = 'We’ll be right back'
  } else if (status === 'finished') {
    title = 'Auction complete!'
    subtitle = 'Final squads are on the results page'
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center rounded-[2vw] bg-white/5 p-[3vw] text-center">
      <div className="animate-pop-in text-[6vw] leading-tight font-black">{title}</div>
      {subtitle && <div className="mt-[2vh] text-[2.4vw] text-slate-300">{subtitle}</div>}
      {status === 'idle' && (
        <div className="mt-[5vh] grid grid-cols-2 gap-x-[4vw] gap-y-[1.5vh] text-left text-[1.9vw] text-slate-200">
          <div>💰 Purse per team</div>
          <b>{fmt(settings.starting_purse)}</b>
          <div>👥 Squad size</div>
          <b>
            {settings.max_squad == null
              ? `At least ${settings.min_squad} players`
              : `${settings.min_squad} to ${settings.max_squad} players`}
          </b>
          <div>⏱️ Bid timer</div>
          <b>{settings.bid_timer_seconds} seconds, resets on every bid</b>
          <div>📈 Raises</div>
          <b>
            {settings.increments
              .map((inc, i) => {
                const prev = settings.increments[i - 1]?.upto
                return inc.upto == null
                  ? `+${inc.step}${prev ? ` from ${prev}` : ''}`
                  : `+${inc.step} below ${inc.upto}`
              })
              .join(', ')}
          </b>
        </div>
      )}
    </section>
  )
}

function TeamTile({ team, squad, max, leading }: { team: Team; squad: number; max: number | null; leading: boolean }) {
  return (
    <div
      className={`min-w-0 flex-1 rounded-[0.8vw] border-t-[0.5vh] bg-white/5 px-[0.8vw] py-[1vh] transition ${leading ? 'scale-105 bg-white/15' : ''}`}
      style={{ borderColor: team.color }}
    >
      <div className="truncate text-[1.3vw] font-bold">{team.short_name}</div>
      <div className="text-[1.8vw] leading-tight font-black tabular-nums">{fmt(team.purse_remaining)}</div>
      <div className="text-[1vw] text-slate-400">
        {squadLabel(squad, max)} players
      </div>
    </div>
  )
}

function CountdownRing({ msLeft, totalMs }: { msLeft: number; totalMs: number }) {
  const r = 45
  const circumference = 2 * Math.PI * r
  const fraction = Math.max(0, Math.min(1, msLeft / totalMs))
  const seconds = Math.ceil(msLeft / 1000)
  const color = seconds === 0 ? '#ef4444' : seconds <= 5 ? '#f59e0b' : '#22c55e'
  return (
    <div className="relative mt-[3vh] h-[11vw] w-[11vw]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 150ms linear, stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[3.5vw] font-black tabular-nums" style={{ color }}>
        {seconds === 0 ? '0' : seconds}
      </div>
    </div>
  )
}

function Stamp({ color, children }: { color: string; children: string }) {
  return (
    <div
      className="animate-stamp absolute top-[8%] right-[6%] rounded-[1vw] border-[0.6vw] px-[2vw] py-[0.5vw] text-[5vw] font-black tracking-widest"
      style={{ borderColor: color, color }}
    >
      {children}
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white/10 px-[1.2vw] py-[0.4vh]">{children}</span>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function positionName(p: string) {
  return { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' }[p] ?? p
}

/** Pixel size from viewport width, for components that take a numeric size. */
function vw(n: number) {
  return Math.round((window.innerWidth * n) / 100)
}
