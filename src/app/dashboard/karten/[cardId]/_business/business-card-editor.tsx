'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Spinner } from '@/components/ui/misc'
import { saveBusinessCardAction } from '@/actions/business-cards'
import type { BusinessEditorData, EditorContact } from '@/lib/business-cards/editor-service'
import { cn } from '@/lib/utils'
import { CompanyPanel } from './company-panel'
import { DesignPanel } from './design-panel'
import {
  draftFromData,
  emptyContact,
  sameDraft,
  toSaveInput,
  type DraftContact,
  type EditorDraft,
} from './editor-state'
import { PassPreview, type PreviewPlatform, type PreviewRole } from './pass-preview'
import { PeoplePanel } from './people-panel'
import { WalletLinkDialog } from './wallet-link-dialog'

/**
 * Der Editor einer Visitenkarte.
 *
 * Alles wird im Browser gesammelt und mit **einem** Knopf gespeichert — Aussehen,
 * Firmendaten, neue, geänderte und entfernte Personen. Rechts daneben die Vorschau, wie
 * die Karte im Wallet aussieht, umschaltbar zwischen Apple und Google und zwischen der
 * Karte der Person selbst (mit Code zur Scan-Seite) und der, die andere bekommen.
 */

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string }

export function BusinessCardEditor({ data }: { data: BusinessEditorData }) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<EditorDraft>(() => draftFromData(data))
  const [baseline, setBaseline] = React.useState<EditorDraft>(() => draftFromData(data))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [save, setSave] = React.useState<SaveState>({ kind: 'idle' })
  const [openKey, setOpenKey] = React.useState<string | null>(data.contacts[0]?.id ?? null)
  const [platform, setPlatform] = React.useState<PreviewPlatform>('apple')
  const [role, setRole] = React.useState<PreviewRole>('HOLDER')
  const [walletFor, setWalletFor] = React.useState<EditorContact | null>(null)

  const dirty = !sameDraft(draft, baseline)
  const saved = React.useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts])

  // Nach dem Speichern liefert der Server frische Daten (Zahlen, Links). Übernommen werden
  // sie nur, wenn im Editor nichts Ungespeichertes steht — sonst ginge Eingegebenes verloren.
  const latestDraft = React.useRef(draft)
  latestDraft.current = draft
  const latestBaseline = React.useRef(baseline)
  latestBaseline.current = baseline
  React.useEffect(() => {
    if (!sameDraft(latestDraft.current, latestBaseline.current)) return
    const fresh = draftFromData(data)
    setDraft(fresh)
    setBaseline(fresh)
  }, [data])

  // Ungespeichertes nicht stillschweigend verlieren.
  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (next: (d: EditorDraft) => EditorDraft) => {
    setDraft(next)
    if (save.kind === 'saved' || save.kind === 'error') setSave({ kind: 'idle' })
  }

  const changeContact = (key: string, patch: Partial<DraftContact>) =>
    update((d) => ({ ...d, contacts: d.contacts.map((c) => (c.key === key ? { ...c, ...patch } : c)) }))

  const addContact = () => {
    const key = `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    update((d) => ({ ...d, contacts: [...d.contacts, emptyContact(key)] }))
    setOpenKey(key)
  }

  const removeContact = (key: string) => {
    const target = draft.contacts.find((c) => c.key === key)
    if (!target) return
    update((d) => ({
      ...d,
      contacts: d.contacts.filter((c) => c.key !== key),
      deletedContactIds: target.id ? [...d.deletedContactIds, target.id] : d.deletedContactIds,
    }))
    if (openKey === key) setOpenKey(null)
  }

  const undoDeletes = () =>
    update((d) => {
      const restored = baseline.contacts.filter((c) => c.id && d.deletedContactIds.includes(c.id))
      return { ...d, contacts: [...d.contacts, ...restored], deletedContactIds: [] }
    })

  const discard = () => {
    setDraft(baseline)
    setErrors({})
    setSave({ kind: 'idle' })
  }

  const submit = React.useCallback(async () => {
    setSave({ kind: 'saving' })
    setErrors({})
    try {
      const result = await saveBusinessCardAction(toSaveInput(data.cardId, draft))
      if (!result.success) {
        const fields = result.error.fields ?? {}
        setErrors(fields)
        setSave({ kind: 'error', message: result.error.message })
        // Die erste Person mit einem Fehler aufklappen, damit man ihn sieht.
        const firstContact = Object.keys(fields)
          .map((k) => /^contacts\.(\d+)/.exec(k)?.[1])
          .find((i): i is string => i !== undefined)
        if (firstContact !== undefined) setOpenKey(draft.contacts[Number(firstContact)]?.key ?? null)
        return
      }
      // Neue Personen bekommen ihre Id; der Schlüssel bleibt, damit die Auswahl stehen bleibt.
      const created = result.data.createdContactIds
      const next: EditorDraft = {
        ...draft,
        contacts: draft.contacts.map((c) => (c.id === null && created[c.key] ? { ...c, id: created[c.key]!, key: created[c.key]! } : c)),
        deletedContactIds: [],
      }
      if (openKey && created[openKey]) setOpenKey(created[openKey]!)
      setDraft(next)
      setBaseline(next)
      setSave({ kind: 'saved', at: new Date() })
      router.refresh()
    } catch {
      setSave({ kind: 'error', message: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' })
    }
  }, [data.cardId, draft, openKey, router])

  // Strg/Cmd+S speichert, wie man es aus jedem Editor kennt.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && save.kind !== 'saving') void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, save.kind, submit])

  const previewContact = draft.contacts.find((c) => c.key === openKey) ?? draft.contacts[0] ?? null
  const previewSaved = previewContact?.id ? saved.get(previewContact.id) : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6">
      <div className="mb-5 space-y-1">
        <Link href="/dashboard/karten" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" />
          Alle Karten
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[18px] font-semibold text-ink">{data.cardName}</h1>
          <Badge tone="accent">Visitenkarte</Badge>
          {data.publishedVersion === null ? <Badge tone="neutral">Noch nicht gespeichert</Badge> : null}
        </div>
        <p className="text-[12.5px] text-ink-3">{data.orgName ?? 'Keinem Kunden zugewiesen'}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <PeoplePanel
            cardId={data.cardId}
            contacts={draft.contacts}
            saved={saved}
            openKey={openKey}
            onOpen={setOpenKey}
            onChange={changeContact}
            onAdd={addContact}
            onRemove={removeContact}
            pendingDeletes={draft.deletedContactIds.length}
            onUndoDeletes={undoDeletes}
            onWalletLink={setWalletFor}
            errors={errors}
          />
          <CompanyPanel
            company={draft.company}
            onChange={(patch) => update((d) => ({ ...d, company: { ...d.company, ...patch } }))}
            errors={errors}
          />
          <DesignPanel
            cardId={data.cardId}
            design={draft.design}
            onChange={(patch) => update((d) => ({ ...d, design: { ...d.design, ...patch } }))}
            errors={errors}
          />
        </div>

        <aside className="order-first lg:order-none">
          <div className="space-y-3 lg:sticky lg:top-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">Vorschau</p>
              <Segmented
                value={platform}
                onChange={setPlatform}
                options={[
                  ['apple', 'Apple'],
                  ['google', 'Google'],
                ]}
              />
            </div>
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                ['HOLDER', 'Wie andere sie bekommen'],
                ['OWNER', 'Eigene Karte der Person'],
              ]}
              full
            />
            <PassPreview
              design={draft.design}
              company={draft.company}
              contact={previewContact}
              scanUrl={previewSaved?.scanUrl ?? null}
              platform={platform}
              role={role}
            />
            <p className="text-center text-[11.5px] leading-snug text-ink-3">
              {previewContact
                ? `Zeigt ${`${previewContact.firstName} ${previewContact.lastName}`.trim() || 'die neue Person'} — eine andere Person aufklappen, um sie zu sehen.`
                : 'Lege eine Person an, um ihre Karte zu sehen.'}
            </p>
          </div>
        </aside>
      </div>

      <SaveBar state={save} dirty={dirty} onSave={() => void submit()} onDiscard={discard} />
      <WalletLinkDialog contact={walletFor} onClose={() => setWalletFor(null)} />
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  full,
}: {
  value: T
  onChange: (v: T) => void
  options: ReadonlyArray<readonly [T, string]>
  full?: boolean
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', full && 'flex w-full')}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
            full && 'flex-1',
            value === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Unten fest: ein Knopf für alles, und immer sichtbar, ob noch etwas offen ist. */
function SaveBar({
  state,
  dirty,
  onSave,
  onDiscard,
}: {
  state: SaveState
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  const saving = state.kind === 'saving'
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
          {state.kind === 'error' ? (
            <>
              <CircleAlert className="size-4 shrink-0 text-danger" />
              <span className="truncate text-danger">{state.message}</span>
            </>
          ) : dirty ? (
            <span className="text-ink-2">Ungespeicherte Änderungen</span>
          ) : state.kind === 'saved' ? (
            <>
              <Check className="size-4 shrink-0 text-ok" />
              <span className="text-ok">Gespeichert — ausgegebene Karten aktualisieren sich von selbst.</span>
            </>
          ) : (
            <span className="text-ink-3">Alles gespeichert</span>
          )}
        </p>
        {dirty ? (
          <Button variant="ghost" disabled={saving} onClick={onDiscard}>
            Verwerfen
          </Button>
        ) : null}
        <Button variant="primary" disabled={!dirty || saving} onClick={onSave}>
          {saving ? <Spinner /> : null}
          Speichern
        </Button>
      </div>
    </div>
  )
}
