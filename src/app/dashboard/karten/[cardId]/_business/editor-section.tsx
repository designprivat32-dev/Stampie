/** Ein Abschnitt des Visitenkarten-Editors — Rahmen, Titel, Beschreibung. */
export function EditorSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {description ? <p className="text-[12.5px] text-ink-3">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
