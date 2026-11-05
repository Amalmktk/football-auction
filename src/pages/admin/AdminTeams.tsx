import { useState, type FormEvent } from 'react'
import { Alert, Avatar, Button, Field, Input, Modal, PageHeader } from '../../components/ui'
import { errorMessage } from '../../lib/auth'
import { uploadPhoto } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import type { Player, Settings, Team } from '../../lib/types'
import { useSingleRow, useTable } from '../../lib/useTable'

interface TeamDraft {
  id?: string
  name: string
  short_name: string
  color: string
  captain_name: string
  logo_url: string | null
}

const emptyDraft: TeamDraft = { name: '', short_name: '', color: '#1f6feb', captain_name: '', logo_url: null }

export default function AdminTeams() {
  const { rows: teams, error: loadError } = useTable<Team>('teams', 'name')
  const { rows: players } = useTable<Player>('players')
  const { row: settings } = useSingleRow<Settings>('settings')
  const [editing, setEditing] = useState<TeamDraft | null>(null)
  const [codes, setCodes] = useState<{ team: string; code: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const squadCount = (teamId: string) => players.filter((p) => p.team_id === teamId).length

  async function generateCodes(targets: Team[]) {
    const what = targets.length === 1 ? `a new join code for ${targets[0].name}` : `new join codes for all ${targets.length} teams`
    if (!confirm(`Create ${what}? Any phone that joined with an old code will need the new one.`)) return
    setBusy(true)
    setError(null)
    const result: { team: string; code: string }[] = []
    for (const team of targets) {
      const { data, error } = await supabase.rpc('set_team_code', { p_team_id: team.id })
      if (error) {
        setError(`${team.name}: ${errorMessage(error)}`)
        break
      }
      result.push({ team: team.name, code: data as string })
    }
    setBusy(false)
    if (result.length) setCodes(result)
  }

  async function removeTeam(team: Team) {
    if (!confirm(`Delete ${team.name}? This only works if no players were bought by this team.`)) return
    setError(null)
    // the captain is stored as a player belonging to the team; remove them first
    const { error: capError } = await supabase.from('players').delete().eq('team_id', team.id).eq('is_captain', true)
    if (capError) return setError(errorMessage(capError))
    const { error } = await supabase.from('teams').delete().eq('id', team.id)
    if (error) setError(errorMessage(error))
  }

  return (
    <div>
      <PageHeader title="Teams">
        <Button variant="secondary" disabled={busy || teams.length === 0} onClick={() => void generateCodes(teams)}>
          Generate all join codes
        </Button>
        <Button onClick={() => setEditing(emptyDraft)}>Add team</Button>
      </PageHeader>

      {(loadError || error) && (
        <div className="mb-4">
          <Alert>{loadError || error}</Alert>
        </div>
      )}

      {teams.length === 0 ? (
        <p className="text-slate-400">No teams yet. Add one to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div key={team.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={team.short_name} url={team.logo_url} color={team.color} size={48} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{team.name}</div>
                  <div className="text-sm text-slate-400">
                    {team.short_name} · Captain: {team.captain_name || '—'}
                  </div>
                </div>
                <span className="ml-auto h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  Purse <b>{team.purse_remaining}</b>
                </span>
                <span>
                  Squad <b>{squadCount(team.id)}</b>
                  {settings?.max_squad != null && <span className="text-slate-500"> / {settings.max_squad}</span>}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      id: team.id,
                      name: team.name,
                      short_name: team.short_name,
                      color: team.color,
                      captain_name: team.captain_name ?? '',
                      logo_url: team.logo_url,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void generateCodes([team])}>
                  Join code
                </Button>
                <Button variant="ghost" onClick={() => void removeTeam(team)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && settings && (
        <TeamForm
          draft={editing}
          players={players}
          startingPurse={settings.starting_purse}
          onClose={() => setEditing(null)}
        />
      )}

      {codes && <CodesModal codes={codes} onClose={() => setCodes(null)} />}
    </div>
  )
}

function TeamForm({
  draft: initial,
  players,
  startingPurse,
  onClose,
}: {
  draft: TeamDraft
  players: Player[]
  startingPurse: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const logo_url = logoFile ? await uploadPhoto(logoFile, 'teams') : draft.logo_url
      const fields = {
        name: draft.name.trim(),
        short_name: draft.short_name.trim().toUpperCase(),
        color: draft.color,
        captain_name: draft.captain_name.trim() || null,
        logo_url,
      }

      let teamId = draft.id
      if (teamId) {
        const { error } = await supabase.from('teams').update(fields).eq('id', teamId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('teams')
          .insert({ ...fields, purse_remaining: startingPurse })
          .select('id')
          .single()
        if (error) throw error
        teamId = data.id as string
      }

      // The captain is pre-assigned: stored as a player already sold to this team at price 0.
      const captain = players.find((p) => p.is_captain && p.team_id === teamId)
      if (fields.captain_name) {
        const { error } = captain
          ? await supabase.from('players').update({ name: fields.captain_name }).eq('id', captain.id)
          : await supabase.from('players').insert({
              name: fields.captain_name,
              is_captain: true,
              status: 'sold',
              team_id: teamId,
              sold_price: 0,
              base_price: 1,
            })
        if (error) throw error
      } else if (captain) {
        const { error } = await supabase.from('players').delete().eq('id', captain.id)
        if (error) throw error
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={draft.id ? 'Edit team' : 'Add team'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team name">
            <Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Short name" hint="Shown on the TV, e.g. TIG. Also the join code prefix.">
            <Input
              required
              maxLength={8}
              value={draft.short_name}
              onChange={(e) => setDraft({ ...draft, short_name: e.target.value })}
            />
          </Field>
          <Field label="Captain name" hint="Added to the squad automatically, at no cost.">
            <Input value={draft.captain_name} onChange={(e) => setDraft({ ...draft, captain_name: e.target.value })} />
          </Field>
          <Field label="Team color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900"
              />
              <span className="text-slate-400">{draft.color}</span>
            </div>
          </Field>
        </div>
        <Field label="Logo (optional)">
          <div className="flex items-center gap-3">
            <Avatar
              name={draft.short_name || draft.name}
              url={logoFile ? URL.createObjectURL(logoFile) : draft.logo_url}
              color={draft.color}
              size={48}
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-400"
            />
            {(draft.logo_url || logoFile) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setLogoFile(null)
                  setDraft({ ...draft, logo_url: null })
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
            {busy ? 'Saving…' : 'Save team'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CodesModal({ codes, onClose }: { codes: { team: string; code: string }[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const all = codes.map((c) => `${c.team}: ${c.code}`).join('\n')

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Modal title={codes.length === 1 ? 'Join code' : 'Join codes'} onClose={onClose}>
      <div className="space-y-4">
        <Alert kind="info">
          Copy these now. Codes are stored scrambled, so they can't be shown again; generate a new one if lost.
        </Alert>
        <ul className="space-y-2">
          {codes.map((c) => (
            <li key={c.team} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
              <span className="truncate text-slate-300">{c.team}</span>
              <span className="font-mono text-lg font-bold tracking-wider">{c.code}</span>
              <Button variant="ghost" onClick={() => void copy(c.code, c.team)}>
                {copied === c.team ? 'Copied' : 'Copy'}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          {codes.length > 1 && (
            <Button variant="secondary" onClick={() => void copy(all, '__all')}>
              {copied === '__all' ? 'Copied' : 'Copy all'}
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
