// Small synthesized sounds (no audio files). Browsers only allow audio after a
// user click, so the TV's "Start display" button creates the AudioContext.

export function createAudio(): AudioContext | null {
  try {
    return new AudioContext()
  } catch {
    return null
  }
}

function tone(ctx: AudioContext, freq: number, start: number, length: number, volume = 0.25, type: OscillatorType = 'triangle') {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

/** Rising fanfare for SOLD. */
export function playSold(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  ;[523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.25))
  tone(ctx, 1046.5, t + 0.36, 0.9, 0.3)
  tone(ctx, 783.99, t + 0.36, 0.9, 0.15)
}

/** Short blip for a new bid. */
export function playBid(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== 'running') return
  tone(ctx, 880, ctx.currentTime, 0.12, 0.12, 'sine')
}

/** Low tone for UNSOLD. */
export function playUnsold(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  tone(ctx, 392, t, 0.3, 0.2)
  tone(ctx, 311.13, t + 0.25, 0.6, 0.2)
}
