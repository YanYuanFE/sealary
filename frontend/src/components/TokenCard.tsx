import { useEffect, useRef, useState } from 'react'
import { Coins, Loader2, CircleAlert, CircleCheck } from 'lucide-react'
import { fetchTokenInfo, type TokenInfo } from '@/lib/units'
import { shortAddr } from '@/lib/format'

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; info: TokenInfo } | { kind: 'error' }

// 输入 token_id → 链上拉取代币信息、渲染确认卡；拉不到则报错。防抖 400ms。
// onResolved：把有效 TokenInfo（或 null）上抛给父组件用于启用/禁用提交。
// resolve：可换解析器（默认 registry 的 fetchTokenInfo；ARC-22 传 fetchArc22TokenInfo）。
// errorHint：解析失败时的提示；缺省用 registry 的 token_id 格式指路。
export function TokenCard({ tokenId, onResolved, resolve = fetchTokenInfo, errorHint }: {
  tokenId: string
  onResolved: (info: TokenInfo | null) => void
  resolve?: (id: string) => Promise<TokenInfo | null>
  errorHint?: React.ReactNode
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(timer.current)
    const id = tokenId.trim()
    if (!id) {
      setState({ kind: 'idle' })
      onResolved(null)
      return
    }
    setState({ kind: 'loading' })
    timer.current = setTimeout(async () => {
      const info = await resolve(id).catch(() => null)
      setState(info ? { kind: 'ok', info } : { kind: 'error' })
      onResolved(info)
    }, 400)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId, resolve])

  if (state.kind === 'idle') return null

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Looking up token on-chain…
      </div>
    )
  }

  if (state.kind === 'error') {
    // 程序名（xxx.aleo）不是 token_id——registry 映射键是 field 字面量，这类输入单独指路。
    const looksLikeField = /^\d+field$/.test(tokenId.trim())
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
        <CircleAlert className="size-4 shrink-0" />
        {errorHint ?? (looksLikeField ? (
          <span>This token_id is not registered in token_registry — double-check it.</span>
        ) : (
          <span>
            Not a token_id. Enter the <span className="font-mono">field</span> value the token was registered
            with (e.g. <span className="font-mono">7777field</span>) — a program name won’t resolve.
          </span>
        ))}
      </div>
    )
  }

  const { info } = state
  return (
    <div className="rounded-lg border border-proven/25 bg-proven-soft/20 p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-proven-soft text-proven">
          <Coins className="size-4" />
        </span>
        <span className="font-heading text-base font-semibold">{info.symbol || info.name}</span>
        <CircleCheck className="size-4 text-proven" />
        <span className="ml-auto font-mono text-xs text-muted-foreground">{info.decimals} decimals</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Kv k="Name" v={info.name} />
        <Kv k="Admin" v={shortAddr(info.admin)} mono />
        <Kv k="Ext-auth" v={info.extAuthRequired ? 'required' : 'none'} />
        <Kv k="token_id" v={shortAddr(info.tokenId, 6, 6)} mono />
      </div>
    </div>
  )
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'font-mono text-foreground' : 'font-medium text-foreground'}>{v}</span>
    </div>
  )
}
