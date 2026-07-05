import { EXPLORER_TX } from '@/lib/aleo'
import { shortAddr } from '@/lib/format'

// 交易 id → 区块浏览器链接（toast/表格通用）。拿不到 at1… id 时退回纯文本。
export function TxLink({ txId }: { txId?: string }) {
  if (!txId?.startsWith('at1')) return <>{txId ?? 'submitted'}</>
  return (
    <a
      href={EXPLORER_TX(txId)}
      target="_blank"
      rel="noreferrer"
      className="font-mono underline underline-offset-2 hover:text-seal"
    >
      {shortAddr(txId, 10, 8)} ↗
    </a>
  )
}
