import { Lock, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { money } from '@/lib/format'

type Size = 'sm' | 'md' | 'lg'
const sizes: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-[2.75rem] leading-none',
}

// 金额的两态：密封（●●●● + 印章，链上默认）↔ 揭示（mono 数字 + 破封）。
export function SealedAmount({
  amount,
  revealed,
  size = 'md',
  className,
  token = 'zUSD',
}: {
  amount: number
  revealed: boolean
  size?: Size
  className?: string
  token?: string
}) {
  return (
    <span className={cn('tabular inline-flex items-baseline gap-2 font-mono', sizes[size], className)}>
      {revealed ? (
        <span key="clear" className="reveal-blur inline-flex items-baseline gap-1.5 font-semibold text-foreground">
          <ShieldCheck className="size-[0.7em] self-center text-seal" strokeWidth={2.5} />
          {money(amount)}
          <span className="text-[0.5em] font-normal tracking-widest text-muted-foreground">{token}</span>
        </span>
      ) : (
        <span className="sealed-mark inline-flex items-center gap-1.5 text-muted-foreground">
          <Lock className="size-[0.62em] text-seal/70" strokeWidth={2.5} />
          <span className="tracking-[0.15em] text-seal/60 select-none">••••••</span>
          <span className="text-[0.5em] font-normal tracking-widest text-muted-foreground/70">{token}</span>
        </span>
      )}
    </span>
  )
}
