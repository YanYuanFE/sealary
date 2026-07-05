import { useState } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, Lock, EyeOff, Send, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { TierBadge } from '@/components/TierBadge'
import { money, shortAddr, period, type Tier } from '@/lib/format'
import { API_BASE } from '@/lib/aleo'
import { fetchTokenInfo, fromBase } from '@/lib/units'

type Result = {
  tier: Tier
  employer: string
  tokenId: string
  period: number
  threshold: number // 人类值（已按 decimals 还原）
  symbol: string
}

const strip = (v: unknown) => String(v ?? '').replace(/u\d+$/, '').replace(/field$/, '')

// 拉取 prove_income 交易，解析其公开输出/输入。临时态：验证方凭员工给的 tx id 核验，无需数据库。
async function fetchProveResult(txId: string): Promise<Omit<Result, 'threshold' | 'symbol'> & { thresholdBase: string } | null> {
  const res = await fetch(`${API_BASE}/transaction/${txId.trim()}`)
  if (!res.ok) return null
  const tx = await res.json()
  const transitions = tx?.execution?.transitions ?? []
  const t = transitions.find((x: { program?: string; function?: string }) => x.program === 'sealary_pay.aleo' && x.function === 'prove_income')
  if (!t) return null
  // 公开输出顺序：tier(u8), employer(address), token_id(field), period(u32)
  const pub = (t.outputs ?? []).filter((o: { type?: string }) => o.type === 'public').map((o: { value?: string }) => o.value)
  // 公开输入里含 threshold(u128)
  const thresholdBase = ((t.inputs ?? []).find((i: { type?: string; value?: string }) => i.type === 'public')?.value) ?? '0u128'
  if (pub.length < 4) return null
  return {
    tier: Number(strip(pub[0])) as Tier,
    employer: String(pub[1]),
    tokenId: String(pub[2]),
    period: Number(strip(pub[3])),
    thresholdBase: String(thresholdBase),
  }
}

export function Verify() {
  const [txId, setTxId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function verify() {
    if (!txId.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const r = await fetchProveResult(txId)
      if (!r) {
        toast.error('No prove_income attestation in this tx', { description: 'Paste the tx id of the employee’s Generate-proof transaction.' })
        return
      }
      const info = await fetchTokenInfo(r.tokenId).catch(() => null)
      const decimals = info?.decimals ?? 0
      setResult({
        tier: r.tier,
        employer: r.employer,
        tokenId: r.tokenId,
        period: r.period,
        threshold: fromBase(strip(r.thresholdBase), decimals),
        symbol: info?.symbol || info?.name || 'token',
      })
      toast.success('Attestation verified · amount never disclosed')
    } catch (e) {
      toast.error('Verify failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Verifier console"
        title="Check income. See a grade, not a number."
        desc="Paste the employee’s proof transaction. You learn the tier, the issuing employer and the token — never the exact salary."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="gap-0 p-6">
          <h2 className="font-heading text-lg font-semibold">Verify an attestation</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The employee runs <span className="font-mono text-xs">Generate proof</span> and sends you the transaction id.
          </p>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium">prove_income transaction id</span>
            <input className="field font-mono text-xs" value={txId} onChange={(e) => setTxId(e.target.value.trim())} placeholder="at1…" />
          </label>
          <Button className="mt-6 rounded-full" onClick={verify} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {busy ? 'Verifying…' : 'Verify proof'}
          </Button>
        </Card>

        <Card className="justify-center gap-0 border-dashed p-6">
          {!result ? (
            <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
              <span className="grid size-12 place-items-center rounded-full bg-secondary">
                <BadgeCheck className="size-6" />
              </span>
              <p className="mt-4 text-sm">Awaiting a proof — the result shows a tier only.</p>
            </div>
          ) : (
            <div className="reveal-blur">
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Attestation</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-proven/25 bg-proven-soft/30 p-4">
                  <p className="text-xs text-muted-foreground">You receive</p>
                  <div className="mt-2"><TierBadge tier={result.tier} /></div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">for ≥ {money(result.threshold)} {result.symbol}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-4">
                  <p className="text-xs text-muted-foreground">You never see</p>
                  <div className="mt-2 flex items-center gap-2 font-mono text-lg text-seal/60">
                    <Lock className="size-4" /> ••••••
                  </div>
                  <p className="mt-2 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <EyeOff className="size-3" /> exact amount
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 border-t border-border/70 pt-4 text-sm">
                <Kv k="Issued by" v={shortAddr(result.employer)} />
                <Kv k="Token" v={`${result.symbol} · ${shortAddr(result.tokenId, 4, 4)}`} />
                <Kv k="Period" v={period(result.period)} />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-proven">
                <ShieldCheck className="size-3.5" /> Verified against a real employer-signed payslip. No amount crossed the wire.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground">{v}</span>
    </div>
  )
}
