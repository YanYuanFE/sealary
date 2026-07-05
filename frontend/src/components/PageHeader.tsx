export function PageHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string
  title: string
  desc?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <p className="font-mono text-xs tracking-widest text-seal uppercase">{eyebrow}</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {desc && <p className="mt-3 text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-4">
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-2 font-heading text-2xl font-semibold text-foreground">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
