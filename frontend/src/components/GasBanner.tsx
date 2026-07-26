import { Fuel, ExternalLink, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCredits } from '@/lib/queries'
import { FEE } from '@/lib/aleo'

const FAUCET = 'https://faucet.aleo.org/'

// 手续费不足时的页面级横幅。链上按钮同时被禁用（见各页的 hasGas），
// 拦在钱包弹窗之前——否则半途失败会留下"后端有身份、链上没薪资"的半成品。
export function GasBanner() {
  const { credits, hasGas, refetch, checking } = useCredits()
  if (hasGas) return null
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Fuel className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-foreground">Not enough Aleo credits for transaction fees</p>
          <p className="mt-1 text-muted-foreground">
            On-chain actions are disabled. Each transaction costs {FEE / 1_000_000} credit
            {credits != null && <> — this wallet holds {Number(credits) / 1_000_000}</>}. This is Aleo credits,
            not your payroll token.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:ml-3">
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={checking}>
          <RotateCw className={checking ? 'size-4 animate-spin' : 'size-4'} /> {checking ? 'Checking…' : 'Check again'}
        </Button>
        <Button size="sm" asChild>
          <a href={FAUCET} target="_blank" rel="noreferrer">
            Get testnet credits <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
