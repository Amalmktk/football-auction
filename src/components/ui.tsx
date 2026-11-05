import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-500',
  secondary: 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-slate-300 hover:bg-slate-800',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

const fieldClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-800 bg-red-950 text-red-200',
    success: 'border-emerald-800 bg-emerald-950 text-emerald-200',
    info: 'border-sky-800 bg-sky-950 text-sky-200',
  }
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles[kind]}`}>{children}</div>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Avatar({
  name,
  url,
  color = '#334155',
  size = 40,
}: {
  name: string
  url?: string | null
  color?: string
  size?: number
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </div>
  )
}

/** Small badge shown while the live connection is down. */
export function ConnectionBadge({ connected }: { connected: boolean }) {
  if (connected) return null
  return (
    <div className="fixed top-3 right-3 z-[60] flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-black shadow-lg">
      <span className="h-2 w-2 animate-pulse rounded-full bg-black" />
      Reconnecting…
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
