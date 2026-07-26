import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Eye, EyeOff, Send, UserPlus, Upload, Download, Coins, Building2, Loader2, Trash2, Printer, Gift, FileText, Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader, StatCard } from '@/components/PageHeader'
import { SealedAmount } from '@/components/SealedAmount'
import { TxLink } from '@/components/TxLink'
import { ConnectButton } from '@/components/ConnectButton'
import { Loading } from '@/components/Loading'
import { GasBanner } from '@/components/GasBanner'
import { Card } from '@/components/ui/card'
import { shortAddr, money, period } from '@/lib/format'
import { payOpts, payBatchOpts, PAY_BATCH, setSalaryOpts, updateSalaryOpts, setSalaryBatchOpts, SALARY_BATCH, HR_PROGRAM, waitForTx } from '@/lib/aleo'
import { toBase, fromBase } from '@/lib/units'
import { downloadCsv, printDocument } from '@/lib/export'
import { addEmployee, forgetEmployee, recordPayment, type AddResult, type Company, type Person, type Payment } from '@/lib/api'
import { qk, useCompany, useCredits, useEmployees, usePayments } from '@/lib/queries'

const isAleoAddr = (a: string) => /^aleo1[a-z0-9]{58}$/.test(a)

// 添加员工的去向说明：地址已存在时 upsert 命中旧行，这有隐私含义（复活会让历史发薪记录重新具名），
// 不能悄悄发生。created 无需说明。
const ADD_NOTE: Record<AddResult['status'], string | undefined> = {
  created: undefined,
  updated: 'This address was already on the roster — its name was updated.',
  revived: 'This address was previously erased. Re-adding restores the link to their past payment records.',
}

// 导入模板：表头 + 两行示例（地址为占位符，原样导入会被 parseCsv 判为无效行而跳过）。
// ponytail: data: URL + <a download>，不走 downloadCsv —— 后者附 sha256 尾行，反而破坏再导入。
const TEMPLATE_CSV = [
  'name,address,salary',
  'Ada Lovelace,aleo1replace-with-employee-address,5000',
  'Alan Turing,aleo1replace-with-employee-address,6200',
].join('\n')

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

// 距下个发薪日的文案：今天 → "Today"，否则 "in Nd"（本月已过则滚到下月同日）。
// allPaid=本期人人已发：跳到下一期并直接给日期——此时倒数到 "Today" 是假信号（按钮已灰），
// 而 "in 31d" 不如 "Aug 25" 直观。payDay 限 1-28（CreateOrg 的 select），跨月不会溢出到下下月。
function payrollCountdown(payDay: number, allPaid: boolean, from: Date = now): string {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const next = new Date(from.getFullYear(), from.getMonth(), payDay)
  if (next < today || allPaid) next.setMonth(next.getMonth() + 1)
  if (allPaid) return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000)
  return days === 0 ? 'Today' : `in ${days}d`
}

type Wallet = Pick<ReturnType<typeof useWallet>, 'requestRecords' | 'executeTransaction' | 'transactionStatus'>

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

// 链上 accepted 之后，钱包还要扫链才发现那条新 SalaryConfig——这段延迟没有状态可查，
// 只能轮询到真的读出新金额为止（猜一个固定延迟必然要么太早要么太久）。
// 返回 false = 到点还没读到，调用方据此提示"稍后刷新"，而不是假装已经好了。
async function waitForSalary(
  requestRecords: Wallet['requestRecords'], address: string, expected: bigint,
): Promise<boolean> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if ((await fetchSalaries(requestRecords))[address]?.amount === expected) return true
    await new Promise((r) => setTimeout(r, 2_000))
  }
  return false
}

// 薪资上链确认：executeTransaction 只是提交，SalaryConfig 要落链【且被钱包索引】后才读得到。
// 后台跑 + toast 跟进（不阻塞弹窗关闭，与发薪流程同一套做法）。
// expect 为 null（批量导入，一次多人）时只等链上 accepted，不逐个校验金额。
async function sealSalary(
  wallet: Pick<Wallet, 'transactionStatus' | 'requestRecords'>, tempId: string,
  expect: { address: string; amount: bigint } | null, onDone: () => void,
): Promise<void> {
  const toastId = toast.loading('Sealing salary on-chain…')
  const fin = await waitForTx(wallet.transactionStatus, tempId)
  if (fin.status === 'pending') {
    toast.warning('Still sealing — salary not updated yet', {
      id: toastId, description: 'The roster will keep showing the old amount until it lands.',
    })
    return
  }
  if (fin.status !== 'accepted') {
    toast.error('Salary rejected on-chain', { id: toastId, description: fin.error ?? 'The roster still shows the previous amount.' })
    return
  }
  toast.loading('Sealed — waiting for your wallet to pick it up…', { id: toastId })
  const visible = expect ? await waitForSalary(wallet.requestRecords, expect.address, expect.amount) : true
  onDone()
  if (visible) toast.success('Salary sealed on-chain', { id: toastId, description: <TxLink txId={fin.txId} /> })
  else toast.warning('Sealed on-chain, but your wallet has not indexed it yet', {
    id: toastId, description: 'The roster still shows the old amount — refresh in a moment.',
  })
}

export function Employer() {
  const { connected, address, executeTransaction, requestRecords, transactionStatus } = useWallet()
  const { data: company, isPending } = useCompany()

  if (!connected || !address) {
    return (
      <Gate icon={<Building2 className="size-8 text-seal" />} text="Connect your employer wallet to open the console.">
        <ConnectButton />
      </Gate>
    )
  }
  if (isPending) {
    return <Gate icon={<Loader2 className="size-8 animate-spin text-seal" />} text="Loading your organization…">{null}</Gate>
  }
  if (!company) {
    return (
      <Gate icon={<Building2 className="size-8 text-seal" />} text="No organization on this wallet yet.">
        <Button asChild><Link to="/setup">Create organization</Link></Button>
      </Gate>
    )
  }
  return <Console company={company} address={address} executeTransaction={executeTransaction} requestRecords={requestRecords} transactionStatus={transactionStatus} />
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

function Console({ company, address, executeTransaction, requestRecords, transactionStatus }: {
  company: Company; address: string
  executeTransaction: Wallet['executeTransaction']; requestRecords: Wallet['requestRecords']
  transactionStatus: Wallet['transactionStatus']
}) {
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<Person | null>(null) // 待确认移除的员工
  const [shredding, setShredding] = useState(false)
  const [bonusFor, setBonusFor] = useState<Person | null>(null) // 待单笔付款的员工
  const [editing, setEditing] = useState<Person | null>(null)   // 待编辑的员工

  const qc = useQueryClient()
  const { hasGas } = useCredits() // 手续费不足则禁掉一切链上入口
  const { data: roster = [], isPending: loading } = useEmployees(company.id)
  const { data: payments = [] } = usePayments(company.id) // 发薪记录（后端元数据，无金额）
  // 链上 record 读取也走 query：付款/调薪后 invalidate 即重取，与后端数据同一套失效逻辑。
  const { data: salaries = {} } = useQuery({ // 地址 → 薪资(base)+uid，来自链上 SalaryConfig
    queryKey: qk.salaries(address),
    queryFn: () => fetchSalaries(requestRecords),
  })
  const { data: balance = null } = useQuery({
    queryKey: qk.balance(address, company.tokenId),
    queryFn: () => fetchBalance(requestRecords, company.tokenId, company.decimals),
  })

  // Paid = 本期已有【周期工资】记录（bonus 不占用——同期可加发，月度批仍会包含此人）。
  const paidIds = useMemo(
    () => new Set(payments.filter((p) => p.period === CURRENT_PERIOD && p.kind === 'salary').map((p) => p.personId)),
    [payments],
  )

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
  const allPaid = roster.length > 0 && pending.length === 0 // 空花名册不算"已发完"
  const sum = (list: Person[]) => list.reduce((s, e) => s + (salaryOf(e) ?? 0), 0)
  const payrollTotal = sum(roster)
  const pendingTotal = sum(pending)
  const batchTotal = sum(payable.slice(0, PAY_BATCH)) // 本批总额（余额预警用）

  function refresh() {
    void qc.invalidateQueries({ queryKey: qk.employees(company.id) })
    void qc.invalidateQueries({ queryKey: qk.salaries(address) })
    void qc.invalidateQueries({ queryKey: qk.payments(company.id) })
  }

  // 付款后：记录变了、链上余额也变了。
  function refreshAfterPay() {
    void qc.invalidateQueries({ queryKey: qk.payments(company.id) })
    void qc.invalidateQueries({ queryKey: qk.balance(address, company.tokenId) })
  }

  // 被遗忘权：后端删身份 + crypto-shred，然后链上作废 SalaryConfig（update_salary→0 消费旧 record，
  // 使其退出未花费集合——链上历史密文无法物理删除，但只有雇主 view key 可读且不再被任何读取端看到）。
  async function forget() {
    if (!removing) return
    setShredding(true)
    try {
      await forgetEmployee(removing.id)
      const cfg = salaries[removing.walletAddress]
      if (cfg) {
        try {
          await executeTransaction(updateSalaryOpts(cfg.uid, 0n))
          toast.success(`${removing.name} removed · PII shredded · on-chain config voided`)
        } catch (e) {
          // 身份已删（发不了薪），作废失败只提示——残留 record 只有雇主可读，可下次再作废。
          toast.warning('Removed & shredded, but on-chain config not voided', {
            description: String((e as Error)?.message ?? e),
          })
        }
      } else {
        toast.success(`${removing.name} removed · PII crypto-shredded`)
      }
      setRemoving(null)
      refresh()
    } catch (e) {
      toast.error('Remove failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setShredding(false)
    }
  }

  // 导出发薪历史 CSV（雇主本机文件；金额取当前链上 SalaryConfig；bonus 金额只在员工 Paystub 里，留空）。
  async function exportCsv() {
    if (payments.length === 0) {
      toast.error('No payments to export yet')
      return
    }
    const rows = [['period', 'employee', 'address', 'amount', 'token', 'kind', 'tx_id', 'date']]
    for (const p of payments) {
      const person = roster.find((r) => r.id === p.personId)
      const cfg = person ? salaries[person.walletAddress] : undefined
      rows.push([
        String(p.period),
        person?.name ?? '',
        person?.walletAddress ?? '',
        p.kind === 'bonus' ? '' : cfg ? String(fromBase(cfg.amount, company.decimals)) : '',
        company.symbol,
        p.kind,
        p.txId,
        new Date(p.createdAt).toISOString(),
      ])
    }
    await downloadCsv(`sealary-payments-${company.name.replace(/\s+/g, '-')}.csv`, rows, { company: company.name, token: company.symbol })
    toast.success(`Exported ${payments.length} payment rows`)
  }

  // 单笔临时付款（bonus/追溯/合同款）：走单笔 pay，kind=bonus 不占 Paid 徽章，同期可加发。
  async function payBonus(person: Person, amountHuman: number) {
    setBusy(true)
    try {
      const amt = toBase(amountHuman, company.decimals)
      const uid = await pickTokenUid(requestRecords, company.tokenId, amt)
      if (!uid) {
        toast.error('No Token record covers this amount', { description: `Need a single unspent ${company.symbol} record ≥ the amount — mint or consolidate first.` })
        return
      }
      const res = await executeTransaction(payOpts(uid, person.walletAddress, amt, CURRENT_PERIOD))
      const tempId = res?.transactionId
      if (!tempId) {
        toast.error('Wallet returned no transaction id')
        return
      }
      const toastId = toast.loading(`Confirming bonus → ${person.name}…`)
      const fin = await waitForTx(transactionStatus, tempId)
      if (fin.status === 'pending') {
        toast.warning('Still pending — not recorded', { id: toastId, description: 'Wait for it to settle and refresh before retrying, or you may pay twice.' })
        return
      }
      if (fin.status !== 'accepted') {
        toast.error('Transaction rejected on-chain — nothing paid', { id: toastId, description: fin.error })
        return
      }
      await recordPayment(company.id, CURRENT_PERIOD, fin.txId, [person.id], 'bonus')
        .catch(() => toast.warning('Paid on-chain, but saving history failed', { description: 'It will not appear in Payment history.' }))
      refreshAfterPay()
      toast.success(`Bonus sealed → ${person.name}`, { id: toastId, description: <TxLink txId={fin.txId} /> })
    } catch (e) {
      toast.error('Bonus failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
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
      const tempId = res?.transactionId
      if (!tempId) {
        toast.error('Wallet returned no transaction id')
        return
      }
      // executeTransaction 只是提交（临时 id）：轮询到链上 accepted 才记 Paid，
      // rejected/failed 不落库（否则员工被错标已付、下批永远跳过）。
      const toastId = toast.loading(`Confirming on-chain — ${targets.length} employee${targets.length > 1 ? 's' : ''}…`)
      const fin = await waitForTx(transactionStatus, tempId)
      if (fin.status === 'pending') {
        toast.warning('Still pending — not recorded as paid', {
          id: toastId,
          description: 'Wait for it to settle and refresh before re-running, or you may pay this batch twice.',
        })
        return
      }
      if (fin.status !== 'accepted') {
        toast.error('Transaction rejected on-chain — nobody was paid', {
          id: toastId,
          description: fin.error ?? 'Employees stay Pending; fix the cause and run the batch again.',
        })
        return
      }
      // 发薪历史记后端（只元数据：人/期/最终 tx id——金额绝不进后端）。链上已成功，落库失败仅提示。
      await recordPayment(company.id, CURRENT_PERIOD, fin.txId, targets.map((t) => t.id))
        .catch(() => toast.warning('Paid on-chain, but saving history failed', { description: 'It will not appear in Payment history.' }))
      refreshAfterPay() // 找零已变，余额一并刷新
      toast.success(`Sealed pay → ${targets.length} employee${targets.length > 1 ? 's' : ''}`, {
        id: toastId,
        description: (
          <span>
            <TxLink txId={fin.txId} />
            {payable.length > targets.length ? ' · run again for the next batch' : ''}
          </span>
        ),
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
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
            <ImportCsv
              companyId={company.id} tokenId={company.tokenId} decimals={company.decimals}
              salaries={salaries} executeTransaction={executeTransaction} transactionStatus={transactionStatus}
              requestRecords={requestRecords} onAdded={refresh} hasGas={hasGas}
            />
            <AddEmployee
              companyId={company.id} tokenId={company.tokenId} symbol={company.symbol} decimals={company.decimals}
              salaries={salaries} executeTransaction={executeTransaction} transactionStatus={transactionStatus} requestRecords={requestRecords}
              onAdded={refresh} editing={editing} onCloseEdit={() => setEditing(null)} hasGas={hasGas}
            />
          </>
        }
      />

      <GasBanner />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Payroll token" hint={shortAddr(company.tokenId, 6, 6)}>
          <span className="inline-flex items-center gap-2">
            <Coins className="size-5 text-seal" /> {company.symbol}
          </span>
        </StatCard>
        <StatCard label="Wallet balance" hint={balance === null ? 'reading wallet…' : 'unspent private records'}>
          {balance === null ? <SealedAmount amount={0} revealed={false} size="md" token={company.symbol} /> : <SealedAmount amount={balance} revealed={reveal} size="md" token={company.symbol} />}
        </StatCard>
        <StatCard label="Next payroll" hint={`${allPaid ? `${period(CURRENT_PERIOD)} all paid` : period(CURRENT_PERIOD)} · day ${company.payDay} · ${roster.length} employees`}>
          {payrollCountdown(company.payDay, allPaid)}
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
            <Button variant="ghost" size="sm" onClick={() => setReveal((v) => !v)}>
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {reveal ? 'Seal' : 'Reveal'}
            </Button>
            <RunBatchDialog batchN={batchN} payableN={payable.length} total={pendingTotal} batchTotal={batchTotal} balance={balance} reveal={reveal} onConfirm={runBatch} busy={busy} token={company.symbol} hasGas={hasGas} />
          </div>
        </div>

        {loading ? (
          <Loading label="Loading roster…" />
        ) : roster.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No employees yet — add one to run payroll.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left font-mono text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-5 py-3 font-normal">Employee</th>
                <th className="px-5 py-3 font-normal">Address</th>
                <th className="px-5 py-3 text-right font-normal">Salary</th>
                <th className="px-5 py-3 text-right font-normal">Status</th>
                <th className="w-20 px-2 py-3" />
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
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => navigator.clipboard.writeText(e.walletAddress).then(
                          () => toast.success('Address copied'),
                          () => toast.error('Copy failed'),
                        )}
                        title={e.walletAddress}
                        className="group/addr inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-seal"
                      >
                        {shortAddr(e.walletAddress)}
                        <Copy className="size-3 opacity-0 transition-opacity group-hover/addr:opacity-100" />
                      </button>
                    </td>
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
                    <td className="px-2 py-3.5 text-right">
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-seal" onClick={() => setEditing(e)} aria-label={`Edit ${e.name}`} title="Edit name / salary">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-seal" onClick={() => setBonusFor(e)} disabled={!isAleoAddr(e.walletAddress) || !hasGas} aria-label={`One-off payment to ${e.name}`} title="One-off payment (bonus)">
                          <Gift className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setRemoving(e)} aria-label={`Remove ${e.name}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 被遗忘权确认（GDPR Art.17：删身份 + 销毁其加密密钥） */}
      <Dialog open={!!removing} onOpenChange={(v) => { if (!v) setRemoving(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              Destroys their encryption key (crypto-shred) — the stored name becomes permanently unreadable and they
              leave the roster (GDPR right to be forgotten). Past payment records stay, now anonymous: period and
              transaction id only, no name, no amount — payroll history is a legal record employers must keep
              (GDPR Art. 17(3)(b)). Their sealed on-chain salary config is voided too (one wallet approval).
              Paystubs already issued belong to the employee and stay theirs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={forget} disabled={shredding}>
              <Trash2 className="size-4" /> {shredding ? 'Shredding…' : 'Remove & shred'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BonusDialog
        person={bonusFor} symbol={company.symbol} busy={busy}
        onClose={() => setBonusFor(null)}
        onConfirm={(amt) => { const p = bonusFor; setBonusFor(null); if (p) void payBonus(p, amt) }}
      />

      <PaymentHistory payments={payments} roster={roster} salaries={salaries} decimals={company.decimals} reveal={reveal} symbol={company.symbol} companyName={company.name} />

      <p className="text-center font-mono text-xs text-muted-foreground">
        Total roster · {reveal ? `${money(payrollTotal)} ${company.symbol}` : '•••••• ' + company.symbol} / period
      </p>
    </div>
  )
}

// 发薪历史：按 tx 聚合成批次行。后端只有元数据（谁/哪期/哪笔 tx）；
// 金额来自当前链上 SalaryConfig（后端无金额可回溯，调薪后历史行跟随现值）。
function PaymentHistory({ payments, roster, salaries, decimals, reveal, symbol, companyName }: {
  payments: Payment[]; roster: Person[]; salaries: Record<string, SalaryCfg>
  decimals: number; reveal: boolean; symbol: string; companyName: string
}) {
  const runs = useMemo(() => {
    const m = new Map<string, Payment[]>()
    for (const p of payments) {
      const l = m.get(p.txId)
      if (l) l.push(p)
      else m.set(p.txId, [p])
    }
    return [...m.values()]
  }, [payments])

  if (runs.length === 0) return null

  const personOf = (pid: string) => roster.find((r) => r.id === pid)
  const totalOf = (ps: Payment[]) =>
    ps.reduce((s, p) => {
      const cfg = salaries[personOf(p.personId)?.walletAddress ?? '']
      return s + (cfg ? fromBase(cfg.amount, decimals) : 0)
    }, 0)

  // 期间聚合报表（对标 PRD aggregated reports）：每期 人数/笔数/批次/总额——无姓名无地址无单人金额。
  // 总额取当前链上 SalaryConfig（与历史表同口径）；bonus 金额封在员工 Paystub 里，不计入。
  async function exportReport() {
    const byPeriod = new Map<number, Payment[]>()
    for (const p of payments) {
      const l = byPeriod.get(p.period)
      if (l) l.push(p)
      else byPeriod.set(p.period, [p])
    }
    const rows = [['period', 'employees_paid', 'salary_payments', 'bonus_payments', 'batches', 'total_salary_amount', 'token']]
    for (const [per, ps] of [...byPeriod.entries()].sort((a, b) => b[0] - a[0])) {
      const salary = ps.filter((p) => p.kind !== 'bonus')
      rows.push([
        String(per),
        String(new Set(ps.map((p) => p.personId)).size),
        String(salary.length),
        String(ps.length - salary.length),
        String(new Set(ps.map((p) => p.txId)).size),
        String(totalOf(salary)),
        symbol,
      ])
    }
    await downloadCsv(`sealary-report-${companyName.replace(/\s+/g, '-')}.csv`, rows, {
      company: companyName,
      note: 'aggregated per period; no identities; totals from current on-chain SalaryConfig; bonus amounts stay sealed and are excluded',
    })
    toast.success('Aggregated report exported', { description: 'Per-period totals only — no names, no individual amounts.' })
  }

  // 每批一张可打印回执（浏览器打印面板另存 PDF）。金额取当前链上 SalaryConfig，与表格同口径。
  function printReceipt(ps: Payment[]) {
    const first = ps[0]
    const isBonus = first.kind === 'bonus'
    const names = ps.map((p) => personOf(p.personId)?.name ?? '—')
    const ok = printDocument({
      title: isBonus ? 'Bonus receipt' : 'Payroll receipt',
      subtitle: `${companyName} · ${period(first.period)}`,
      amount: isBonus ? '— (sealed in employee record)' : `${money(totalOf(ps))} ${symbol}`,
      fields: [
        ['Employees', `${names.join(', ')} (${ps.length})`],
        ['Pay period', period(first.period)],
        ['Token', symbol],
        ['Transaction', first.txId],
        ['Date', new Date(first.createdAt).toISOString()],
      ],
      footnote:
        'Amounts are decrypted from employer-owned SalaryConfig records on-chain. The server stores only who, when, and the transaction id — never amounts.',
    })
    if (!ok) toast.error('Pop-up blocked', { description: 'Allow pop-ups to print the receipt.' })
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Payment history</h2>
          <p className="text-sm text-muted-foreground">Who &amp; when — amounts stay sealed on-chain, the server stores none.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport} title="Aggregated per-period report — no identities">
          <FileText className="size-4" /> Report
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left font-mono text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-5 py-3 font-normal">Period</th>
            <th className="px-5 py-3 font-normal">Employees</th>
            <th className="px-5 py-3 text-right font-normal">Amount</th>
            <th className="px-5 py-3 font-normal">Transaction</th>
            <th className="px-5 py-3 text-right font-normal">Date</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {runs.map((ps) => {
            const first = ps[0]
            const isBonus = first.kind === 'bonus'
            return (
              <tr key={first.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/40">
                <td className="px-5 py-3.5 font-medium">
                  {period(first.period)}
                  {isBonus && <Badge variant="outline" className="ml-2 text-muted-foreground">Bonus</Badge>}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {ps.map((p) => personOf(p.personId)?.name ?? '—').join(', ')}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {isBonus
                    ? <span className="font-mono text-xs text-muted-foreground" title="Bonus amounts live only in the employee’s sealed Paystub">— sealed</span>
                    : <SealedAmount amount={totalOf(ps)} revealed={reveal} size="sm" token={symbol} />}
                </td>
                <td className="px-5 py-3.5 text-xs">
                  <TxLink txId={first.txId} />
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-xs text-muted-foreground">
                  {new Date(first.createdAt).toLocaleDateString('en-US')}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => printReceipt(ps)} title="Print receipt (save as PDF)">
                    <Printer className="size-4" />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RunBatchDialog(
  { batchN, payableN, total, batchTotal, balance, reveal, onConfirm, busy, token, hasGas }:
  {
    batchN: number; payableN: number; total: number; batchTotal: number; balance: number | null
    reveal: boolean; onConfirm: () => void | Promise<void>; busy: boolean; token: string; hasGas: boolean
  },
) {
  const [open, setOpen] = useState(false)
  // 只判定"聚合余额都不够"的确定性不足；余额分散在多张 record 的情况由 pickTokenUid 在执行时兜底。
  const insufficient = balance != null && balance < batchTotal
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={batchN === 0 || busy || !hasGas}>
          <Send className="size-4" /> {busy ? 'Confirming…' : `Pay batch${batchN > 0 ? ` (${batchN})` : ''}`}
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
          <Row k="Batch total" v={reveal ? `${money(batchTotal)} ${token}` : `•••••• ${token}`} />
          <Row k="Pending total" v={reveal ? `${money(total)} ${token}` : `•••••• ${token}`} />
          <Row k="Public state" v="0 amounts revealed" mono />
        </div>
        {insufficient && (
          <p className="text-xs text-destructive">
            Insufficient funds{reveal ? `: ${money(balance)} ${token} on hand < ${money(batchTotal)} ${token} batch total` : ' for this batch'} — mint more {token} first.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {/* 立即关弹窗，链上确认进度走 toast（waitForTx 可达数分钟，不困在模态里） */}
          <Button disabled={busy || insufficient} onClick={() => { void onConfirm(); setOpen(false) }}>
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

// 新增 / 编辑同一个对话框：两者的落地路径完全一样（后端 upsert 姓名 + 链上 set/update 薪资），
// editing 只改预填、锁地址和文案。editing != null 时由外部控制开关。
function AddEmployee({ companyId, tokenId, symbol, decimals, salaries, executeTransaction, transactionStatus, requestRecords, onAdded, editing, onCloseEdit, hasGas }: {
  companyId: string; tokenId: string; symbol: string; decimals: number
  salaries: Record<string, SalaryCfg>
  executeTransaction: Wallet['executeTransaction']; transactionStatus: Wallet['transactionStatus']
  requestRecords: Wallet['requestRecords']; onAdded: () => void
  editing: Person | null; onCloseEdit: () => void; hasGas: boolean
}) {
  const [selfOpen, setSelfOpen] = useState(false)
  const [name, setName] = useState('')
  const [salary, setSalary] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  const open = selfOpen || !!editing
  const validAddr = isAleoAddr(address)

  // 改地址等于换人（会把历史发薪记录挪到另一个人头上），编辑时锁死。
  useEffect(() => {
    if (!editing) return
    const cfg = salaries[editing.walletAddress]
    setName(editing.name)
    setAddress(editing.walletAddress)
    setSalary(cfg ? String(fromBase(cfg.amount, decimals)) : '')
  }, [editing, salaries, decimals])

  function close() {
    setSelfOpen(false)
    if (editing) onCloseEdit()
    setName(''); setSalary(''); setAddress('')
  }

  async function submit() {
    if (!name || !salary) return
    if (!validAddr) {
      toast.error('Invalid Aleo address', { description: 'Paste the employee’s real aleo1… address to pay on-chain.' })
      return
    }
    setBusy(true)
    try {
      // 1) 后端只存身份（name/address），不含薪资。
      const added = await addEmployee(companyId, { name, walletAddress: address })
      // 2) 薪资写成链上加密 SalaryConfig（只雇主能解，后端永不接触）。
      //    已有配置 → update_salary 消费旧 record（防新旧并存按旧薪资发钱）；否则 set_salary。
      const old = salaries[address]
      const base = toBase(Number(salary), decimals)
      // 编辑时薪资没动就别发链上交易——白花 gas 还多一次钱包审批。
      const salaryChanged = !old || old.amount !== base
      let tempId: string | undefined
      if (salaryChanged) {
        const res = await executeTransaction(old ? updateSalaryOpts(old.uid, base) : setSalaryOpts(address, tokenId, base))
        tempId = res?.transactionId
      }
      toast.success(
        editing ? `${name} updated` : `${name} added`,
        { description: editing ? (salaryChanged ? undefined : 'Name only — salary unchanged.') : ADD_NOTE[added.status] },
      )
      close()
      onAdded() // 后端姓名立刻生效
      // 薪资在链上：executeTransaction 只是提交，此刻 requestRecords 读回的还是旧 SalaryConfig。
      // 不等确认就收工，界面会显示改前的金额（编辑）或 "— sealing…"（新增），看着像没生效。
      if (tempId) void sealSalary({ transactionStatus, requestRecords }, tempId, { address, amount: base }, onAdded)
    } catch (e) {
      toast.error(editing ? 'Update failed' : 'Add failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else setSelfOpen(true) }}>
      <DialogTrigger asChild>
        <Button disabled={!hasGas}><UserPlus className="size-4" /> Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{editing ? `Edit ${editing.name}` : 'Add employee'}</DialogTitle>
          <DialogDescription>Name is encrypted PII; the salary is sealed on-chain and never touches the server.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" /></Field>
          <Field label="Aleo address">
            <input
              className="field font-mono text-xs disabled:opacity-60" value={address} disabled={!!editing}
              onChange={(e) => setAddress(e.target.value.trim())} placeholder="aleo1…"
            />
            {editing
              ? <span className="mt-1 block text-xs text-muted-foreground">Locked — a different address is a different person, and their payment history would follow the old one.</span>
              : address && !validAddr && <span className="mt-1 block text-xs text-destructive">Not a valid aleo1… address</span>}
          </Field>
          <Field label={`Monthly salary (${symbol})`}><input className="field font-mono" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ''))} placeholder="12000" inputMode="numeric" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Sealing…' : editing ? 'Save changes' : 'Seal & add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportCsv({ companyId, tokenId, decimals, salaries, executeTransaction, transactionStatus, requestRecords, onAdded, hasGas }: {
  companyId: string; tokenId: string; decimals: number
  salaries: Record<string, SalaryCfg>
  executeTransaction: Wallet['executeTransaction']; transactionStatus: Wallet['transactionStatus']
  requestRecords: Wallet['requestRecords']; onAdded: () => void; hasGas: boolean
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
    let lastTempId: string | undefined
    let revived = 0 // 曾被擦除又被这次导入复活的行——批量下逐条 toast 会刷屏，汇总提示
    // ponytail: 只等最后一笔落链（顺序提交，它 accepted 时前面的基本都已落链）。要逐笔确认
    // 就得为每笔各起一个 3min 轮询，导 40 人时不值当。
    try {
      const existing = rows.filter((r) => salaries[r.address])
      const fresh = rows.filter((r) => !salaries[r.address])
      for (const row of existing) {
        const r = await addEmployee(companyId, { name: row.name, walletAddress: row.address }) // 幂等，刷新姓名
        if (r.status === 'revived') revived += 1
        const res = await executeTransaction(updateSalaryOpts(salaries[row.address].uid, toBase(row.salary, decimals)))
        lastTempId = res?.transactionId ?? lastTempId
        ok += 1; setDone(ok)
      }
      for (let i = 0; i < fresh.length; i += SALARY_BATCH) {
        const chunk = fresh.slice(i, i + SALARY_BATCH)
        for (const row of chunk) {
          const r = await addEmployee(companyId, { name: row.name, walletAddress: row.address })
          if (r.status === 'revived') revived += 1
        }
        // 补位到 8：多余槽用本组第一个地址 + amount 0（读取端按 amount>0 过滤掉）。
        const pad = chunk[0].address
        const employees = Array.from({ length: SALARY_BATCH }, (_, j) => chunk[j]?.address ?? pad)
        const amounts = Array.from({ length: SALARY_BATCH }, (_, j) => (chunk[j] ? toBase(chunk[j].salary, decimals) : 0n))
        const res = await executeTransaction(setSalaryBatchOpts(employees, amounts, tokenId))
        lastTempId = res?.transactionId ?? lastTempId
        ok += chunk.length; setDone(ok)
      }
      toast.success(`Imported ${ok}/${rows.length} · salaries sealed on-chain`, {
        description: revived > 0
          ? `${revived} previously erased address${revived > 1 ? 'es were' : ' was'} restored — their past payment records are linked again.`
          : undefined,
      })
      reset(); setOpen(false); onAdded()
      if (lastTempId) void sealSalary({ transactionStatus, requestRecords }, lastTempId, null, onAdded)
    } catch (e) {
      toast.error('Import failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!hasGas}><Upload className="size-4" /> Import CSV</Button>
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
        <Button variant="ghost" size="sm" asChild className="w-fit text-muted-foreground">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`} download="sealary-employees-template.csv">
            <Download className="size-4" /> Download template
          </a>
        </Button>
        {(rows.length > 0 || errors.length > 0) && (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <Row k="Valid rows" v={String(rows.length)} />
            {errors.length > 0 && <Row k="Skipped (invalid)" v={String(errors.length)} />}
            {busy && <Row k="Sealed" v={`${done}/${rows.length}`} mono />}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={runImport} disabled={busy || rows.length === 0}>
            <Upload className="size-4" /> {busy ? `Sealing ${done}/${rows.length}…` : `Import ${rows.length || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 单笔付款对话框（bonus/追溯/合同款）：只收金额，确认即交回 Console 的 payBonus 执行。
function BonusDialog({ person, symbol, busy, onClose, onConfirm }: {
  person: Person | null; symbol: string; busy: boolean
  onClose: () => void; onConfirm: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  useEffect(() => setAmount(''), [person])
  const n = Number(amount)
  return (
    <Dialog open={!!person} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">One-off payment to {person?.name}</DialogTitle>
          <DialogDescription>
            A single sealed payment outside the regular cycle — bonus, retro pay or contractor fee.
            It will not mark {person?.name} as paid for the period; the monthly run still includes them.
          </DialogDescription>
        </DialogHeader>
        <Field label={`Amount (${symbol})`}>
          <input className="field font-mono" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="1000" inputMode="numeric" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(n > 0)} onClick={() => onConfirm(n)}>
            <Gift className="size-4" /> Seal &amp; pay
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
