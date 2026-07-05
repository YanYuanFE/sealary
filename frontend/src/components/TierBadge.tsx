import { cn } from '@/lib/utils'
import { TIERS, type Tier } from '@/lib/format'

// 收入等级徽章 A/B/C（— 表示不达标）。达标用植物绿，不达标用中性。
export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const t = TIERS[tier]
  const ok = tier > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs tracking-wide',
        ok
          ? 'border-proven/25 bg-proven-soft/60 text-proven'
          : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-5 place-items-center rounded-full font-heading text-[0.8rem] font-semibold',
          ok ? 'bg-proven text-proven-foreground' : 'bg-muted-foreground/20 text-muted-foreground',
        )}
      >
        {t.code}
      </span>
      <span className="pr-0.5 not-italic">{t.hint}</span>
    </span>
  )
}
