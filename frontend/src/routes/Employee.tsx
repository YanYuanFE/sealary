import { useState } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { KeyRound, ShieldCheck, ScanEye, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/PageHeader'
import { SealedAmount } from '@/components/SealedAmount'
import { TierBadge } from '@/components/TierBadge'
import { SealMark } from '@/components/brand/SealMark'
import { tierOf, period, shortAddr, money } from '@/lib/format'
import { PROGRAM, proveIncomeOpts, discloseOpts } from '@/lib/aleo'
import { fetchTokenInfo, toBase, fromBase } from '@/lib/units'
import { getPersonByWallet } from '@/lib/api'

// 只取子组件真正用到的钱包方法（避免要求整个 WalletContextState）。
type Wallet = Pick<ReturnType<typeof useWallet>, 'connected' | 'address' | 'requestRecords' | 'executeTransaction'>
type Stub = { uid: string; amount: bigint; period: number; employer: string; tokenId: string }

// 从 requestRecords 的密文明文里解析 Paystub 字段（best-effort，钱包返回结构不定 → 正则兜底）。
function parsePaystubs(records: unknown[]): Stub[] {
  const out: Stub[] = []
  for (const r of records) {
    const s = JSON.stringify(r)
    const amount = s.match(/amount:\s*(\d+)u128/)?.[1]
    const per = s.match(/period:\s*(\d+)u32/)?.[1]
    const uid = (r as { uid?: string })?.uid
    if (amount && per && uid) {
      out.push({
        uid,
        amount: BigInt(amount),
        period: Number(per),
        employer: s.match(/employer:\s*(aleo1[a-z0-9]+)/)?.[1] ?? '',
        tokenId: s.match(/token_id:\s*(\w*field)/)?.[1] ?? '',
      })
    }
  }
  return out.sort((a, b) => b.period - a.period)
}

export function Employee() {
  const { connected, address, requestRecords, executeTransaction } = useWallet()
  const [stubs, setStubs] = useState<Stub[] | null>(null)
  const [decimals, setDecimals] = useState(6)
  const [symbol, setSymbol] = useState('zUSD')
  const [loading, setLoading] = useState(false)

  const identity = connected && address ? getPersonByWallet(address) : undefined

  async function decrypt() {
    if (!connected || !address || !requestRecords) {
      toast.error('Connect your wallet', { description: 'Your view key decrypts the records.' })
      return
    }
    setLoading(true)
    try {
      const records = await requestRecords(PROGRAM, true, 'unspent')
      const parsed = parsePaystubs(records)
      if (parsed[0]?.tokenId) {
        const info = await fetchTokenInfo(parsed[0].tokenId).catch(() => null)
        if (info) { setDecimals(info.decimals); setSymbol(info.symbol || info.name) }
      }
      setStubs(parsed)
      toast.success(parsed.length ? `${parsed.length} payslips decrypted` : 'No sealed payslips found')
    } catch (e) {
      toast.error('Decrypt failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Employee console"
        title="Your payslips are yours."
        desc="Only your view key can open these records. Prove your income tier or disclose a payslip — nothing leaves without your signature."
      />

      {stubs === null ? (
        <Locked loading={loading} onUnlock={decrypt} />
      ) : (
        <div className="reveal space-y-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <IdentityCard address={address!} name={identity?.person.name} title={identity?.person.title}
              employer={identity?.company.name} latest={stubs[0]} decimals={decimals} />
            <ProvePanel latest={stubs[0]} decimals={decimals} symbol={symbol}
              wallet={{ connected, address, requestRecords, executeTransaction }} />
          </div>
          <Payslips stubs={stubs} decimals={decimals} symbol={symbol}
            wallet={{ connected, address, requestRecords, executeTransaction }} />
        </div>
      )}
    </div>
  )
}

function Locked({ loading, onUnlock }: { loading: boolean; onUnlock: () => void }) {
  return (
    <Card className="mx-auto max-w-lg items-center gap-0 border-dashed py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-secondary text-seal">
        <Lock className="size-6" />
      </span>
      <h2 className="mt-5 font-heading text-2xl font-semibold">Sealed payslips</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Sign with your Aleo view key to decrypt the Paystub records only you can read.
      </p>
      <Button size="lg" className="mt-6 rounded-full" onClick={onUnlock} disabled={loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {loading ? 'Decrypting…' : 'Decrypt with view key'}
      </Button>
    </Card>
  )
}

function IdentityCard({ address, name, title, employer, latest, decimals }: {
  address: string; name?: string; title?: string; employer?: string; latest?: Stub; decimals: number
}) {
  return (
    <Card className="gap-0 p-6">
      <div className="flex items-center gap-3">
        <SealMark size={40} />
        <div>
          <p className="font-heading text-lg font-semibold">{name ?? 'You'}</p>
          <p className="text-sm text-muted-foreground">{title ?? 'Employee'}</p>
        </div>
      </div>
      <div className="mt-6 space-y-3 border-t border-border/70 pt-5 text-sm">
        <Line k="Address" v={shortAddr(address)} />
        <Line k="Latest salary" v={latest ? <SealedAmount amount={fromBase(latest.amount, decimals)} revealed size="sm" /> : '—'} />
        <Line k="Employer" v={employer ?? (latest?.employer ? shortAddr(latest.employer) : '—')} />
      </div>
    </Card>
  )
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground">{v}</span>
    </div>
  )
}

// 核心差异化：输入门槛 -> 得到 tier，金额始终封着。
function ProvePanel({ latest, decimals, symbol, wallet }: { latest?: Stub; decimals: number; symbol: string; wallet: Wallet }) {
  const [threshold, setThreshold] = useState(8000)
  const [busy, setBusy] = useState(false)
  const salary = latest ? fromBase(latest.amount, decimals) : 0
  const tier = tierOf(salary, threshold)

  async function generate() {
    if (!latest) { toast.error('No payslip to prove against'); return }
    const { connected, address, requestRecords, executeTransaction } = wallet
    if (!connected || !address || !executeTransaction || !requestRecords) {
      toast.error('Connect your wallet'); return
    }
    setBusy(true)
    try {
      // §4.2：threshold 也转 base units，与链上 Paystub.amount 同口径，否则 tier 算错。
      const res = await executeTransaction(proveIncomeOpts(latest.uid, toBase(threshold, decimals)))
      toast.success('Proof submitted on-chain', { description: res?.transactionId ?? 'submitted' })
    } catch (e) {
      toast.error('Proof failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-0 border-proven/25 bg-proven-soft/20 p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-proven" />
        <h2 className="font-heading text-lg font-semibold">Prove income</h2>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Generate a zero-knowledge proof that your salary meets a threshold. The verifier learns the tier — never the amount.
      </p>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium">Threshold ({symbol})</span>
        <input
          type="range" min={2000} max={30000} step={500}
          value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-[oklch(0.5_0.09_152)]"
        />
        <div className="mt-1 flex justify-between font-mono text-sm">
          <span className="text-muted-foreground">≥</span>
          <span className="font-semibold text-foreground">{money(threshold)}</span>
        </div>
      </label>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-3.5 text-seal/70" />
          Your salary stays <span className="font-mono text-seal/70">••••••</span>
        </div>
        <TierBadge tier={tier} />
      </div>

      <Button className="mt-4 rounded-full" onClick={generate} disabled={busy || !latest}>
        <ShieldCheck className="size-4" /> {busy ? 'Generating…' : 'Generate proof'}
      </Button>
    </Card>
  )
}

function Payslips({ stubs, decimals, symbol, wallet }: { stubs: Stub[]; decimals: number; symbol: string; wallet: Wallet }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card">
      <div className="border-b border-border/70 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold">Payslips</h2>
        <p className="text-sm text-muted-foreground">Decrypted for your eyes. Choose what to share, per record.</p>
      </div>
      {stubs.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No sealed payslips yet — ask your employer to run pay.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left font-mono text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-5 py-3 font-normal">Period</th>
              <th className="px-5 py-3 font-normal">Token</th>
              <th className="px-5 py-3 text-right font-normal">Amount</th>
              <th className="px-5 py-3 text-right font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {stubs.map((s) => (
              <tr key={s.uid} className="border-b border-border/50 last:border-0 hover:bg-secondary/40">
                <td className="px-5 py-3.5 font-medium">{period(s.period)}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{symbol} · {shortAddr(s.tokenId, 4, 4)}</td>
                <td className="px-5 py-3.5 text-right"><SealedAmount amount={fromBase(s.amount, decimals)} revealed size="sm" /></td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-2">
                    <DiscloseDialog stub={s} decimals={decimals} symbol={symbol} wallet={wallet} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DiscloseDialog({ stub, decimals, symbol, wallet }: { stub: Stub; decimals: number; symbol: string; wallet: Wallet }) {
  const [open, setOpen] = useState(false)
  const [party, setParty] = useState('')
  const [busy, setBusy] = useState(false)
  const amount = fromBase(stub.amount, decimals)

  async function breakSeal() {
    const { connected, address, executeTransaction } = wallet
    if (!connected || !address || !executeTransaction) { toast.error('Connect your wallet'); return }
    setBusy(true)
    try {
      const res = await executeTransaction(discloseOpts(stub.uid))
      toast.success('Seal broken on-chain', { description: res?.transactionId ?? 'submitted' })
      setOpen(false); setParty('')
    } catch (e) {
      toast.error('Disclosure failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full text-seal hover:bg-seal-soft/40 hover:text-seal">
          <ScanEye className="size-4" /> Disclose
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Break the seal</DialogTitle>
          <DialogDescription>
            Reveal the exact amount for period {period(stub.period)} to one party. This is a deliberate, verifiable disclosure
            — the amount goes public on-chain, but no one links it to you without the tx.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-seal/25 bg-seal-soft/25 p-4">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Amount to disclose</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{money(amount)} <span className="text-sm text-muted-foreground">{symbol}</span></p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Recipient</span>
          <input className="field" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Meridian Bank" />
        </label>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="rounded-full" onClick={breakSeal} disabled={busy}>
            <ScanEye className="size-4" /> {busy ? 'Breaking…' : 'Break seal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
