import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Alert, Avatar, Button, Field, Input, Modal, PageHeader, Select } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { CSV_TEMPLATE, DEFAULT_BASE_PRICE, parsePlayersCsv, type ParsedImport } from '../../lib/csv'
import { uploadPhoto } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { POSITIONS, type Player, type PlayerStatus, type Position, type Team } from '../../lib/types'
import { useTable } from '../../lib/useTable'

type Filter = 'all' | PlayerStatus

const statusStyles: Record<PlayerStatus, string> = {
  available: 'bg-slate-800 text-slate-300',
  on_block: 'bg-amber-900 text-amber-200',
  sold: 'bg-emerald-900 text-emerald-200',
  unsold: 'bg-red-950 text-red-300',
}

interface PlayerDraft {
  id?: string
  is_captain: boolean
  name: string
  department: string
  position: Position | ''
  rating: string
  category: string
  base_price: string
  auction_order: string
  photo_url: string | null
}

const emptyDraft: PlayerDraft = {
  is_captain: false,
  name: '',
  department: '',
  position: '',
  rating: '',
  category: '',
  base_price: String(DEFAULT_BASE_PRICE),
  auction_order: '',
  photo_url: null,
}

function toDraft(p: Player): PlayerDraft {
  return {
    id: p.id,
    is_captain: p.is_captain,
    name: p.name,
    department: p.department ?? '',
    position: p.position ?? '',
    rating: p.rating?.toString() ?? '',
    category: p.category ?? '',
    base_price: p.base_price.toString(),
    auction_order: p.auction_order?.toString() ?? '',
    photo_url: p.photo_url,
  }
}

export default function AdminPlayers() {
  const { rows: players, error: loadError } = useTable<Player>('players', 'auction_order')
  const { rows: teams } = useTable<Team>('teams', 'name')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PlayerDraft | null>(null)
  const [importing, setImporting] = useState<ParsedImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: players.length, available: 0, on_block: 0, sold: 0, unsold: 0 }
    players.forEach((p) => c[p.status]++)
    return c
  }, [players])

  const visible = players.filter(
    (p) =>
      (filter === 'all' || p.status === filter) &&
      (!search || `${p.name} ${p.department ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  )

  async function onCsvChosen(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setImporting(await parsePlayersCsv(file))
    } catch (err) {
      setError(`Could not read the CSV: ${errorMessage(err)}`)
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function removePlayer(p: Player) {
    if (!confirm(`Delete ${p.name}?`)) return
    setError(null)
    const { error } = await supabase.from('players').delete().eq('id', p.id)
    if (error) {
      setError(
        error.code === '23503'
          ? `${p.name} has bids or is on the block, so can't be deleted. Reset the auction first.`
          : errorMessage(error),
      )
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'players-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader title="Players">
        <Button variant="ghost" onClick={downloadTemplate}>
          CSV template
        </Button>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Import CSV
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void onCsvChosen(e.target.files?.[0])}
        />
        <Button onClick={() => setEditing(emptyDraft)}>Add player</Button>
      </PageHeader>

      {(loadError || error) && (
        <div className="mb-4">
          <Alert>{loadError || error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'available', 'sold', 'unsold'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm capitalize ${filter === f ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {f} ({counts[f]})
          </button>
        ))}
        <Input
          placeholder="Search name or department"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      {players.length === 0 ? (
        <p className="text-slate-400">No players yet. Add them one by one or import a CSV.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Cat</th>
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Team / price</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visible.map((p) => {
                const team = p.team_id ? teamById.get(p.team_id) : undefined
                return (
                  <tr key={p.id} className="hover:bg-slate-900/60">
                    <td className="px-3 py-2 text-slate-500">{p.auction_order ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} url={p.photo_url} size={32} />
                        <div>
                          <div className="font-medium">
                            {p.name}
                            {p.is_captain && (
                              <span className="ml-2 rounded bg-sky-900 px-1.5 py-0.5 text-xs text-sky-200">Captain</span>
                            )}
                          </div>
                          {p.department && <div className="text-xs text-slate-500">{p.department}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{p.position ?? '—'}</td>
                    <td className="px-3 py-2">{p.rating ?? '—'}</td>
                    <td className="px-3 py-2">{p.category ?? '—'}</td>
                    <td className="px-3 py-2">{p.is_captain ? '—' : p.base_price}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${statusStyles[p.status]}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {team ? (
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                          {team.short_name}
                          <span className="text-slate-400">{p.sold_price ?? ''}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" onClick={() => setEditing(toDraft(p))}>
                        Edit
                      </Button>
                      {!p.is_captain && (
                        <Button variant="ghost" onClick={() => void removePlayer(p)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PlayerForm draft={editing} onClose={() => setEditing(null)} />}
      {importing && (
        <ImportModal
          parsed={importing}
          nextOrder={Math.max(0, ...players.map((p) => p.auction_order ?? 0)) + 1}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  )
}

function PlayerForm({ draft: initial, onClose }: { draft: PlayerDraft; onClose: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<PlayerDraft>) => setDraft({ ...draft, ...patch })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const photo_url = photoFile ? await uploadPhoto(photoFile, 'players') : draft.photo_url
      const fields = {
        department: draft.department.trim() || null,
        position: draft.position || null,
        rating: draft.rating ? Number(draft.rating) : null,
        category: draft.category.trim().toUpperCase() || null,
        photo_url,
        // name, base price and order don't apply to captains (name is managed on the Teams page)
        ...(draft.is_captain
          ? {}
          : {
              name: draft.name.trim(),
              base_price: Number(draft.base_price),
              auction_order: draft.auction_order ? Number(draft.auction_order) : null,
            }),
      }
      const { error } = draft.id
        ? await supabase.from('players').update(fields).eq('id', draft.id)
        : await supabase.from('players').insert(fields)
      if (error) throw error
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={draft.id ? 'Edit player' : 'Add player'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" hint={draft.is_captain ? 'Captain names are changed on the Teams page.' : undefined}>
              <Input required disabled={draft.is_captain} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="Department">
            <Input value={draft.department} onChange={(e) => set({ department: e.target.value })} />
          </Field>
          <Field label="Position">
            <Select value={draft.position} onChange={(e) => set({ position: e.target.value as Position | '' })}>
              <option value="">—</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Skill rating (1–10)">
            <Input type="number" min={1} max={10} value={draft.rating} onChange={(e) => set({ rating: e.target.value })} />
          </Field>
          <Field label="Category" hint="e.g. A for star players">
            <Input maxLength={4} value={draft.category} onChange={(e) => set({ category: e.target.value })} />
          </Field>
          {!draft.is_captain && (
            <>
              <Field label="Base price">
                <Input
                  required
                  type="number"
                  min={1}
                  value={draft.base_price}
                  onChange={(e) => set({ base_price: e.target.value })}
                />
              </Field>
              <Field label="Auction order" hint="Used when player order is Manual.">
                <Input type="number" value={draft.auction_order} onChange={(e) => set({ auction_order: e.target.value })} />
              </Field>
            </>
          )}
        </div>
        <Field label="Photo (optional)">
          <div className="flex items-center gap-3">
            <Avatar name={draft.name} url={photoFile ? URL.createObjectURL(photoFile) : draft.photo_url} size={48} />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-400"
            />
            {(draft.photo_url || photoFile) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPhotoFile(null)
                  set({ photo_url: null })
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save player'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ImportModal({ parsed, nextOrder, onClose }: { parsed: ParsedImport; nextOrder: number; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function doImport() {
    setBusy(true)
    setError(null)
    // rows without an auction order go after the existing players, in file order
    const unordered = parsed.rows.filter((r) => r.auction_order == null)
    const rows = parsed.rows.map((r) => ({ ...r, auction_order: r.auction_order ?? nextOrder + unordered.indexOf(r) }))
    const { error } = await supabase.from('players').insert(rows)
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
      return
    }
    onClose()
  }

  return (
    <Modal title="Import players" onClose={onClose}>
      <div className="space-y-4">
        <p>
          <b>{parsed.rows.length}</b> player{parsed.rows.length === 1 ? '' : 's'} ready to import.
        </p>
        {parsed.rows.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
            {parsed.rows.map((r, i) => (
              <li key={i}>
                {r.name} · {r.position ?? '—'} · {r.base_price}
              </li>
            ))}
          </ul>
        )}
        {parsed.errors.length > 0 && (
          <Alert>
            <p className="mb-1 font-medium">{parsed.errors.length} row(s) will be skipped:</p>
            <ul className="max-h-40 list-disc overflow-y-auto pl-5">
              {parsed.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || parsed.rows.length === 0} onClick={() => void doImport()}>
            {busy ? 'Importing…' : `Import ${parsed.rows.length}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
