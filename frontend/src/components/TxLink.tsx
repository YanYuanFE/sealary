import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { EXPLORER_TX } from '@/lib/aleo'
import { shortAddr } from '@/lib/format'

// tx id 是要发给验证方的东西，光能跳转不够——截断显示的字符串没法手抄。
function CopyTx({ txId }: { txId: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(txId).then(
        () => toast.success('Transaction id copied'),
        () => toast.error('Copy failed'),
      )}
      title="Copy full transaction id"
      aria-label="Copy transaction id"
      className="text-muted-foreground/60 transition-colors hover:text-seal"
    >
      <Copy className="size-3" />
    </button>
  )
}

// 交易 id → 区块浏览器链接（toast/表格通用）。
// 非 at1… 的是钱包临时 id（落链时链上 id 还没生成，见 waitForTx）：explorer 查不到，标注原因而非裸串。
export function TxLink({ txId }: { txId?: string }) {
  if (!txId) return <>submitted</>
  if (!txId.startsWith('at1')) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="font-mono text-muted-foreground"
          title={`${txId} — wallet-local id, no on-chain transaction id was recorded for this run`}
        >
          {shortAddr(txId, 10, 8)}
        </span>
        <CopyTx txId={txId} />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={EXPLORER_TX(txId)}
        target="_blank"
        rel="noreferrer"
        className="font-mono underline underline-offset-2 hover:text-seal"
      >
        {shortAddr(txId, 10, 8)} ↗
      </a>
      <CopyTx txId={txId} />
    </span>
  )
}
