import { cn } from '@/lib/utils'

// 蜡封印章 —— Sealary 的品牌标记。锯齿边圆盘 + S 字母组，封蜡红 + 内嵌浮雕。
export function SealMark({ size = 28, className }: { size?: number; className?: string }) {
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    const r = i % 2 === 0 ? 50 : 45.5
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`
  }).join(' ')

  return (
    <span
      className={cn('seal-emboss inline-grid place-items-center rounded-full bg-seal text-seal-foreground', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="p-[15%]">
        <polygon points={pts} fill="currentColor" opacity={0.9} />
        <circle cx="50" cy="50" r="38" fill="none" stroke="oklch(1 0 0 / 0.5)" strokeWidth="1.5" strokeDasharray="2 3" />
        <text
          x="50" y="50" dy="0.34em" textAnchor="middle"
          fontFamily="Fraunces Variable, serif" fontWeight={600} fontSize="46"
          fill="oklch(1 0 0 / 0.92)"
        >
          S
        </text>
      </svg>
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <SealMark size={30} />
      <span className="font-heading text-[1.35rem] leading-none font-semibold tracking-tight text-foreground">
        Sealary
      </span>
    </span>
  )
}
