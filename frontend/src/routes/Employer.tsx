import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Eye, EyeOff, Send, UserPlus, Upload, Download, Coins, Building2, Loader2 } from 'lucide-react'
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
import { payBatchOpts, PAY_BATCH, setSalaryOpts, updateSalaryOpts, setSalaryBatchOpts, SALARY_BATCH, HR_PROGRAM } from '@/lib/aleo'
import { toBase, fromBase } from '@/lib/units'
import { getCompany, listEmployees, addEmployee, type Company, type Person } from '@/lib/api'

const isAleoAddr = (a: string) => /^aleo1[a-z0-9]{58}$/.test(a)

type CsvRow = { name: string; address: string; salary: number }

// 解析 CSV：每行 name,address,salary（可含表头）。
// ponytail: 简易解析（逗号分列），姓名含逗号的边界不处理——demo 够用；要严谨换 CSV 库。
function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const rows: CsvRow[] = []
  const errors: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  lines.forEach((line, i) => {
    const [name, address, salaryStr] = line.split(',').map((p) => p.trim())
    if (i === 0 && !isAleoAddr(address ?? '')) return // 跳过表头
    if (!name || !isAleoAddr(address ?? '') || !/^\d+$/.test(salaryStr ?? '')) {
      errors.push(`Line ${i + 1}: ${line}`)
      return
    }
    rows.push({ name, address, salary: Number(salaryStr) })
  })
  // 同地址取最后一行（重复行视为修正），避免同一人产出两条 SalaryConfig。
  const byAddr = new Map<string, CsvRow>()
  for (const r of rows) byAddr.set(r.address, r)
  return { rows: [...byAddr.values()], errors }
}

const now = new Date()
const CURRENT_PERIOD = now.getFullYear() * 100 + (now.getMonth() + 1)

type Wallet = Pick<ReturnType<typeof useWallet>, 'requestRecords' | 'executeTransaction'>

// 精确匹配 token_id（\b 防 "7777field" 撞上 "17777field" 的子串）。
const hasTokenId = (recordJson: string, tokenId: string) => new RegExp(`token_id:\\s*${tokenId}\\b`).test(recordJson)

// 选发薪 Token record：匹配 token_id 且余额 ≥ 本批总额的最大一张。
// 不能拿 recs[0]：pay_batch 补位会给雇主自己留 0 额找零 record，选中它整批 underflow。
async function pickTokenUid(requestRecords: Wallet['requestRecords'], tokenId: string, need: bigint): Promise<string | undefined> {
  const recs = await requestRecords('token_registry.aleo', true, 'unspent')
  let best: { uid: string; amount: bigint } | undefined
  for (const r of recs ?? []) {
    const s = JSON.stringify(r)
    const uid = (r as { uid?: string })?.uid
    const amt = s.match(/amount:\s*(\d+)u128/)?.[1]
    if (!uid || !amt || !hasTokenId(s, tokenId)) continue
    const amount = BigInt(amt)
    if (amount >= need && (!best || amount > best.amount)) best = { uid, amount }
  }
  return best?.uid
}

async function fetchBalance(requestRecords: Wallet['requestRecords'], tokenId: string, decimals: number): Promise<number | null> {
  try {
    const recs = await requestRecords('token_registry.aleo', true, 'unspent')
    let sum = 0n
    for (const r of recs) {
      const s = JSON.stringify(r)
      if (!hasTokenId(s, tokenId)) continue
      const amt = s.match(/amount:\s*(\d+)u128/)?.[1]
      if (amt) sum += BigInt(amt)
    }
    return fromBase(sum, decimals)
  } catch {
    return null
  }
}

type SalaryCfg = { amount: bigint; uid: string } // uid 用于 update_salary 消费旧 record

// 解析雇主自有的 SalaryConfig 加密 record → { 员工地址: { 薪资(base units), uid } }。
// 薪资只在链上加密、只雇主能解——后端永不接触（PRIVACY_AUDIT 方案 D）。
// 同一员工若有多条（历史上重复 set_salary 产生），谁排后谁赢——record 无高度戳分不出新旧；
// 写入端一律走 set/update 分流（已有配置 → update_salary 消费旧的），不再制造新重复。
function parseSalaryConfigs(records: unknown[]): Record<string, SalaryCfg> {
  const out: Record<string, SalaryCfg> = {}
  for (const r of records) {
    const s = JSON.stringify(r)
    const employee = s.match(/employee:\s*(aleo1[a-z0-9]+)/)?.[1]
    const amount = s.match(/amount:\s*(\d+)u128/)?.[1]
    const uid = (r as { uid?: string })?.uid
    // amount>0 过滤掉 batch 的补位项（amount=0）。
    if (employee && amount && uid && BigInt(amount) > 0n) out[employee] = { amount: BigInt(amount), uid }
  }
  return out
}

async function fetchSalaries(requestRecords: Wallet['requestRecords']): Promise<Record<string, SalaryCfg>> {
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
  return <Console company={company} address={address} executeTransaction={executeTransaction} requestRecords={requestRecords} />
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

function Console({ company, address, executeTransaction, requestRecords }: {
  company: Company; address: string
  executeTransaction: Wallet['executeTransaction']; requestRecords: Wallet['requestRecords']
}) {
  const [roster, setRoster] = useState<Person[]>([])
  const [salaries, setSalaries] = useState<Record<string, SalaryCfg>>({}) // 地址 → 薪资(base)+uid，来自链上 SalaryConfig
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
    const cfg = salaries[e.walletAddress]
    return cfg == null ? undefined : fromBase(cfg.amount, company.decimals)
  }

  const pending = useMemo(() => roster.filter((e) => !paidIds.has(e.id)), [roster, paidIds])
  // 可发薪 = 未付 + 地址合法 + 链上已有薪资配置（否则不知道发多少）。
  const payable = useMemo(
    () => pending.filter((e) => isAleoAddr(e.walletAddress) && salaries[e.walletAddress] != null),
    [pending, salaries],
  )
  const batchN = Math.min(payable.length, PAY_BATCH) // 本批一笔发多少人
  const sum = (list: Person[]) => list.reduce((s, e) => s + (salaryOf(e) ?? 0), 0)
  const payrollTotal = sum(roster)
  const pendingTotal = sum(pending)

  function refresh() {
    listEmployees(company.id).then(setRoster).catch(() => {})
    fetchSalaries(requestRecords).then(setSalaries).catch(() => {})
  }

  // 一笔 pay_batch 发本批最多 4 人（薪资取自链上 SalaryConfig，已是 base units）。
  async function runBatch() {
    const targets = payable.slice(0, PAY_BATCH)
    if (targets.length === 0) {
      toast.error('No payable employee', { description: 'Add an employee (with a real address + salary) first.' })
      return
    }
    setBusy(true)
    try {
      // 补位到 4：多余槽用雇主自己地址 + amount 0（雇主拿到 0 额 Paystub，无害；不污染员工）。
      const tos = Array.from({ length: PAY_BATCH }, (_, i) => targets[i]?.walletAddress ?? address)
      const amounts = Array.from({ length: PAY_BATCH }, (_, i) => (targets[i] ? salaries[targets[i].walletAddress].amount : 0n))
      const need = amounts.reduce((s, a) => s + a, 0n)
      const uid = await pickTokenUid(requestRecords, company.tokenId, need)
      if (!uid) {
        toast.error('No Token record covers this batch', { description: `Need a single unspent ${company.symbol} record ≥ the batch total — mint or consolidate first.` })
        return
      }
      const res = await executeTransaction(payBatchOpts(uid, tos, amounts, CURRENT_PERIOD))
      setPaidIds((s) => {
        const n = new Set(s)
        targets.forEach((t) => n.add(t.id))
        return n
      })
      toast.success(`Sealed pay → ${targets.length} employee${targets.length > 1 ? 's' : ''}`, {
        description: (res?.transactionId ?? 'submitted') + (payable.length > targets.length ? ' · run again for the next batch' : ''),
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
            <ImportCsv
              companyId={company.id} tokenId={company.tokenId} decimals={company.decimals}
              salaries={salaries} executeTransaction={executeTransaction} onAdded={refresh}
            />
            <AddEmployee
              companyId={company.id} tokenId={company.tokenId} symbol={company.symbol} decimals={company.decimals}
              salaries={salaries} executeTransaction={executeTransaction} onAdded={refresh}
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
            <RunBatchDialog batchN={batchN} payableN={payable.length} total={pendingTotal} reveal={reveal} onConfirm={runBatch} busy={busy} token={company.symbol} />
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
  { batchN, payableN, total, reveal, onConfirm, busy, token }:
  { batchN: number; payableN: number; total: number; reveal: boolean; onConfirm: () => void | Promise<void>; busy: boolean; token: string },
) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full" disabled={batchN === 0}>
          <Send className="size-4" /> Pay batch {batchN > 0 && `(${batchN})`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Seal & send payroll</DialogTitle>
          <DialogDescription>
            Pay {batchN} employee{batchN > 1 ? 's' : ''} in one sealed transaction — {batchN} private transfers + {batchN} Paystubs, a single approval, no per-pay wait.
            {payableN > batchN ? ` ${payableN - batchN} more follow in the next batch.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <Row k="This batch" v={`${batchN} of ${payableN} payable`} />
          <Row k="Pending total" v={reveal ? `${money(total)} ${token}` : `•••••• ${token}`} />
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

function AddEmployee({ companyId, tokenId, symbol, decimals, salaries, executeTransaction, onAdded }: {
  companyId: string; tokenId: string; symbol: string; decimals: number
  salaries: Record<string, SalaryCfg>
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
      //    已有配置 → update_salary 消费旧 record（防新旧并存按旧薪资发钱）；否则 set_salary。
      const old = salaries[address]
      const base = toBase(Number(salary), decimals)
      await executeTransaction(old ? updateSalaryOpts(old.uid, base) : setSalaryOpts(address, tokenId, base))
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

function ImportCsv({ companyId, tokenId, decimals, salaries, executeTransaction, onAdded }: {
  companyId: string; tokenId: string; decimals: number
  salaries: Record<string, SalaryCfg>
  executeTransaction: Wallet['executeTransaction']; onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  function reset() { setRows([]); setErrors([]); setDone(0) }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      const parsed = parseCsv(text)
      setRows(parsed.rows); setErrors(parsed.errors); setDone(0)
      if (parsed.rows.length === 0) toast.error('No valid rows', { description: 'Expected: name,address,salary per line.' })
    })
  }

  // 身份逐个入后端（快、无钱包）；薪资按 8 人一笔 set_salary_batch 上链（审批次数 = ⌈N/8⌉）。
  // 链上已有配置的行走 update_salary 消费旧 record（batch 只会新建，重导会造成新旧并存）。
  async function runImport() {
    if (!rows.length) return
    setBusy(true); setDone(0)
    let ok = 0
    try {
      const existing = rows.filter((r) => salaries[r.address])
      const fresh = rows.filter((r) => !salaries[r.address])
      for (const row of existing) {
        await addEmployee(companyId, { name: row.name, walletAddress: row.address }) // 幂等，刷新姓名
        await executeTransaction(updateSalaryOpts(salaries[row.address].uid, toBase(row.salary, decimals)))
        ok += 1; setDone(ok)
      }
      for (let i = 0; i < fresh.length; i += SALARY_BATCH) {
        const chunk = fresh.slice(i, i + SALARY_BATCH)
        for (const row of chunk) await addEmployee(companyId, { name: row.name, walletAddress: row.address })
        // 补位到 8：多余槽用本组第一个地址 + amount 0（读取端按 amount>0 过滤掉）。
        const pad = chunk[0].address
        const employees = Array.from({ length: SALARY_BATCH }, (_, j) => chunk[j]?.address ?? pad)
        const amounts = Array.from({ length: SALARY_BATCH }, (_, j) => (chunk[j] ? toBase(chunk[j].salary, decimals) : 0n))
        await executeTransaction(setSalaryBatchOpts(employees, amounts, tokenId))
        ok += chunk.length; setDone(ok)
      }
      toast.success(`Imported ${ok}/${rows.length} · salaries sealed on-chain`)
      reset(); setOpen(false); onAdded()
    } catch (e) {
      toast.error('Import failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full"><Upload className="size-4" /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Import employees (CSV)</DialogTitle>
          <DialogDescription>
            Columns <span className="font-mono text-xs">name,address,salary</span> — one per line (header optional).
            Identity is added in one pass; salaries are sealed on-chain in batches of {SALARY_BATCH} — about one wallet approval per {SALARY_BATCH} employees.
          </DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} className="field" />
        {(rows.length > 0 || errors.length > 0) && (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <Row k="Valid rows" v={String(rows.length)} />
            {errors.length > 0 && <Row k="Skipped (invalid)" v={String(errors.length)} />}
            {busy && <Row k="Sealed" v={`${done}/${rows.length}`} mono />}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button className="rounded-full" onClick={runImport} disabled={busy || rows.length === 0}>
            <Upload className="size-4" /> {busy ? `Sealing ${done}/${rows.length}…` : `Import ${rows.length || ''}`.trim()}
          </Button>
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
