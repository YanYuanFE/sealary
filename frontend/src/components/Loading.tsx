import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// 通用加载态：居中 spinner + 文案。用在列表/区块首屏加载，避免把"还没到"渲染成"没有数据"。
export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground', className)}
    >
      <Loader2 className="size-4 animate-spin text-seal" aria-hidden />
      {label}
    </div>
  )
}
