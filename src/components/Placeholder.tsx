import { Link } from 'react-router'

export default function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-3xl font-bold">{title}</h1>
      {note && <p className="text-slate-400">{note}</p>}
      <Link to="/" className="text-sky-400 hover:underline">
        ← Home
      </Link>
    </main>
  )
}
