import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Eye, EyeOff, Send, UserPlus, Download, Coins, Building2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader, StatCard } from '@/components/PageHeader'
import { SealedAmount } from '@/components/SealedAmount'
import { ConnectButton } from '@/components/ConnectButton'
import { Card } from '@/components/ui/card'
import { shortAddr, money, period } from '@/lib/format'
import { payOpts, setSalaryOpts, HR_PROGRAM } from '@/lib/aleo'
import { toBase, fromBase } from '@/lib/units'
import { getCompany, listEmployees, addEmployee, type Company, type Person } from '@/lib/api'

const isAleoAddr = (a: string) => /^aleo1[a-z0-9]{58}$/.test(a)

const now = new Date()
const CURRENT_PERIOD = now.getFullYear() * 100 + (now.getMonth() + 1)

type Wallet = Pick<ReturnType<typeof useWallet>, 'requestRecords' | 'executeTransaction'>

async function firstTokenUid(requestRecords: Wallet['requestRecords']): Promise<string | undefined> {
  const recs = await requestRecords('token_registry.aleo', true, 'unspent')
  return (recs?.[0] as { uid?: string })?.uid
}

async function fetchBalance(requestRecords: Wallet['requestRecords'], tokenId: string, decimals: number): Promise<number | null> {
  try {
    const recs = await requestRecords('token_registry.aleo', true, 'unspent')
    let sum = 0n
    for (const r of recs) {
      const s = JSON.stringify(r)
      if (!s.includes(tokenId)) continue
      const amt = s.match(/amount:\s*(\d+)u128/)?.[1]
      if (amt) sum += BigInt(amt)
    }
    return fromBase(sum, decimals)
  } catch {
    return null
  }
}

// 解析雇主自有的 SalaryConfig 加密 record → { 员工地址: 薪资(base units) }。
// 薪资只在链上加密、只雇主能解——后端永不接触（PRIVACY_AUDIT 方案 D）。
function parseSalaryConfigs(records: unknown[]): Record<string, bigint> {
  const out: Record<string, bigint> = {}
  for (const r of records) {
    const s = JSON.stringify(r)
    const employee = s.match(/employee:\s*(aleo1[a-z0-9]+)/)?.[1]
    const amount = s.match(/amount:\s*(\d+)u128/)?.[1]
    if (employee && amount) out[employee] = BigInt(amount)
  }
  return out
}

async function fetchSalaries(requestRecords: Wallet['requestRecords']): Promise<Record<string, bigint>> {
  try {
    return parseSalaryConfigs(await requestRecords(HR_PROGRAM, true, 'unspent'))
  } catch {
    return {}
  }
}

export function Employer() {
  const { connected, address, executeTransaction, requestRecords } = useWallet()
  const [company, setCompany] = useState<Company | null | undefined>(undefined) // undefined=加载中

  useEffect(() => {
    if (connected && address) getCompany().then(setCompany).catch(() => setCompany(null))
    else setCompany(null)
  }, [connected, address])

  if (!connected || !address) {
    return (
      <Gate icon={<Building2 className="size-8 text-seal" />} text="Connect your employer wallet to open the console.">
        <ConnectButton />
      </Gate>
    )
  }
  if (company === undefined) {
    return <Gate icon={<Loader2 className="size-8 animate-spin text-seal" />} text="Loading your organization…">{null}</Gate>
  }
  if (!company) {
    return (
      <Gate icon={<Building2 className="size-8 text-seal" />} text="No organization on this wallet yet.">
        <Button asChild className="rounded-full"><Link to="/setup">Create organization</Link></Button>
      </Gate>
    )
  }
  return <Console company={company} executeTransaction={executeTransaction} requestRecords={requestRecords} />
}

function Gate({ icon, text, children }: { icon: React.ReactNode; text: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 p-10 text-center">
      {icon}
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </Card>
  )
}

function Console({ company, executeTransaction, requestRecords }: {
  company: Company
  executeTransaction: Wallet['executeTransaction']; requestRecords: Wallet['requestRecords']
}) {
  const [roster, setRoster] = useState<Person[]>([])
  const [salaries, setSalaries] = useState<Record<string, bigint>>({}) // 地址 → 薪资(base)，来自链上 SalaryConfig
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    listEmployees(company.id).then(setRoster).catch(() => setRoster([]))
    fetchSalaries(requestRecords).then(setSalaries).catch(() => setSalaries({}))
    fetchBalance(requestRecords, company.tokenId, company.decimals).then(setBalance)
  }, [company.id, requestRecords, company.tokenId, company.decimals])

  // 某员工的薪资（人类值）；未设置/待上链则 undefined。
  const salaryOf = (e: Person): number | undefined => {
    const base = salaries[e.walletAddress]
    return base == null ? undefined : fromBase(base, company.decimals)
  }

  const pending = useMemo(() => roster.filter((e) => !paidIds.has(e.id)), [roster, paidIds])
  // 可发薪 = 未付 + 地址合法 + 链上已有薪资配置（否则不知道发多少）。
  const payTarget = useMemo(
    () => pending.find((e) => isAleoAddr(e.walletAddress) && salaries[e.walletAddress] != null),
    [pending, salaries],
  )
  const sum = (list: Person[]) => list.reduce((s, e) => s + (salaryOf(e) ?? 0), 0)
  const payrollTotal = sum(roster)
  const pendingTotal = sum(pending)

  function refresh() {
    listEmployees(company.id).then(setRoster).catch(() => {})
    fetchSalaries(requestRecords).then(setSalaries).catch(() => {})
  }

  async function runBatch() {
    const next = payTarget
    if (!next) {
      toast.error('No payable employee', { description: 'Add an employee (with a real address + salary) first.' })
      return
    }
    setBusy(true)
    try {
      const uid = await firstTokenUid(requestRecords)
      if (!uid) {
        toast.error('No payroll Token record', { description: `Mint ${company.symbol} to this wallet first (bootstrap.sh).` })
        return
      }
      // 薪资取自链上 SalaryConfig（已是 base units），直接付。
      const res = await executeTransaction(payOpts(uid, next.walletAddress, salaries[next.walletAddress], CURRENT_PERIOD))
      setPaidIds((s) => new Set(s).add(next.id))
      toast.success(`Sealed pay → ${next.name}`, {
        description: (res?.transactionId ?? 'submitted') + (pending.length > 1 ? ' · run again for the next（链式发薪）' : ''),
      })
    } catch (e) {
      toast.error('Pay failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Employer console"
        title="Run payroll, privately."
        desc={`Pay ${company.name} in ${company.symbol}. Salaries live encrypted on-chain — the server never sees them. Each pay is a private transfer + a sealed Paystub.`}
        actions={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => toast('Export coming with the backend')}>
              <Download className="size-4" /> Export
            </Button>
            <AddEmployee
              companyId={company.id} tokenId={company.tokenId} symbol={company.symbol} decimals={company.decimals}
              executeTransaction={executeTransaction} onAdded={refresh}
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Payroll token" hint={shortAddr(company.tokenId, 6, 6)}>
          <span className="inline-flex items-center gap-2">
            <Coins className="size-5 text-seal" /> {company.symbol}
          </span>
        </StatCard>
        <StatCard label="Funded" hint={balance === null ? 'on-chain' : 'unspent balance'}>
          {balance === null ? <SealedAmount amount={0} revealed={false} size="md" token={company.symbol} /> : <SealedAmount amount={balance} revealed={reveal} size="md" token={company.symbol} />}
        </StatCard>
        <StatCard label="This period" hint={`${roster.length} employees`}>
          {period(CURRENT_PERIOD)}
        </StatCard>
        <StatCard label="Pending" hint={`${pending.length} unpaid`}>
          <SealedAmount amount={pendingTotal} revealed={reveal} size="md" token={company.symbol} />
        </StatCard>
      </div>

      <div className="rounded-xl border border-border/80 bg-card">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-semibold">Roster</h2>
            <p className="text-sm text-muted-foreground">Salaries are encrypted on-chain (only you can decrypt) — never stored on the server.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setReveal((v) => !v)}>
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {reveal ? 'Seal' : 'Reveal'}
            </Button>
            <RunBatchDialog count={pending.length} total={pendingTotal} reveal={reveal} onConfirm={runBatch} busy={busy} nextName={payTarget?.name} token={company.symbol} />
          </div>
        </div>

        {roster.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No employees yet — add one to run payroll.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-3 font-normal">Employee</th>
                <th className="px-5 py-3 font-normal">Address</th>
                <th className="px-5 py-3 text-right font-normal">Salary</th>
                <th className="px-5 py-3 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((e) => {
                const s = salaryOf(e)
                return (
                  <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/40">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-foreground">{e.name}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{shortAddr(e.walletAddress)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {s == null
                        ? <span className="font-mono text-xs text-muted-foreground">— sealing…</span>
                        : <SealedAmount amount={s} revealed={reveal} size="sm" token={company.symbol} />}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {paidIds.has(e.id)
                        ? <Badge variant="outline" className="border-proven/30 bg-proven-soft/50 text-proven">Paid</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Pending</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-center font-mono text-xs text-muted-foreground">
        Total roster · {reveal ? `${money(payrollTotal)} ${company.symbol}` : '•••••• ' + company.symbol} / period
      </p>
    </div>
  )
}

function RunBatchDialog(
  { count, total, reveal, onConfirm, busy, nextName, token }:
  { count: number; total: number; reveal: boolean; onConfirm: () => void | Promise<void>; busy: boolean; nextName?: string; token: string },
) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full" disabled={count === 0}>
          <Send className="size-4" /> Pay next{nextName ? ` · ${nextName}` : ''} {count > 0 && `(${count})`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Seal & send one payslip</DialogTitle>
          <DialogDescription>
            One private transfer to {nextName ?? 'the next employee'}, minting a Paystub bound to the same amount.
            Chained: the change record funds the next pay.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <Row k="Recipient" v={`${nextName ?? '1 employee'} (1 of ${count})`} />
          <Row k="Remaining total" v={reveal ? `${money(total)} ${token}` : `•••••• ${token}`} />
          <Row k="Public state" v="0 amounts revealed" mono />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={busy} onClick={async () => { await onConfirm(); setOpen(false) }}>
            <Send className="size-4" /> {busy ? 'Sealing…' : 'Confirm & seal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'font-mono text-proven' : 'font-medium text-foreground'}>{v}</span>
    </div>
  )
}

function AddEmployee({ companyId, tokenId, symbol, decimals, executeTransaction, onAdded }: {
  companyId: string; tokenId: string; symbol: string; decimals: number
  executeTransaction: Wallet['executeTransaction']; onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [salary, setSalary] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  const validAddr = isAleoAddr(address)

  async function submit() {
    if (!name || !salary) return
    if (!validAddr) {
      toast.error('Invalid Aleo address', { description: 'Paste the employee’s real aleo1… address to pay on-chain.' })
      return
    }
    setBusy(true)
    try {
      // 1) 后端只存身份（name/address），不含薪资。
      await addEmployee(companyId, { name, walletAddress: address })
      // 2) 薪资写成链上加密 SalaryConfig（只雇主能解，后端永不接触）。
      await executeTransaction(setSalaryOpts(address, tokenId, toBase(Number(salary), decimals)))
      toast.success(`${name} added · salary sealed on-chain`)
      setName(''); setSalary(''); setAddress(''); setOpen(false)
      onAdded()
    } catch (e) {
      toast.error('Add failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full"><UserPlus className="size-4" /> Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Add employee</DialogTitle>
          <DialogDescription>Name is encrypted PII; the salary is sealed on-chain and never touches the server.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" /></Field>
          <Field label="Aleo address">
            <input className="field font-mono text-xs" value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="aleo1…" />
            {address && !validAddr && <span className="mt-1 block text-xs text-destructive">Not a valid aleo1… address</span>}
          </Field>
          <Field label={`Monthly salary (${symbol})`}><input className="field font-mono" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ''))} placeholder="12000" inputMode="numeric" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={busy}>{busy ? 'Sealing…' : 'Seal & add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
