import { Network, type TransactionOptions } from '@provablehq/aleo-types'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'

// ── 链上配置 ──────────────────────────────────────────────
export const NETWORK = Network.TESTNET
export const PROGRAM = 'sealary_payroll_v2.aleo' // pay + pay_batch + prove_income + disclose + tier
export const HR_PROGRAM = 'sealary_conf.aleo' // 雇主私有薪资配置（加密 record，后端不存薪资）
export const DECRYPT = DecryptPermission.UponRequest
// ARC-22（USDCx 家族）发薪程序：动态分发调代币（pay/pay_batch/prove_income/disclose），见 lib/arc22.ts。
export const ARC22_PROGRAM = 'sealary_pay_arc22.aleo'
export const KNOWN_ARC22 = ['test_usdcx_stablecoin.aleo', 'usdcx_stablecoin.aleo']
// credits.aleo 也要授权：手续费余额判断需要读私有 credits record，否则只能看到 public 那一半。
export const CONNECT_PROGRAMS = [PROGRAM, HR_PROGRAM, ARC22_PROGRAM, 'token_registry.aleo', 'credits.aleo', ...KNOWN_ARC22]

// REST 查询端点（链上只读：mapping / program）。
export const ENDPOINT = 'https://api.explorer.provable.com/v1'
export const API_BASE = `${ENDPOINT}/${NETWORK}`

// 手续费（microcredits）。部署后按实际 execution 成本调。
export const FEE = 1_000_000

// 手续费余额（microcredits）= public mapping + 私有 credits record。钱包付费时两者都能用，
// 只查一边会把有钱的钱包判成没钱。返回 null = 查不出来（网络问题），调用方此时【不应】拦截——
// 误拦一个本可发出的交易，比放行一个注定失败的更糟。
type RequestRecords = (program: string, includePlaintext: boolean, statusFilter?: 'unspent') => Promise<unknown[]>

export async function fetchCredits(address: string, requestRecords: RequestRecords): Promise<bigint | null> {
  let total: bigint | null = null
  try {
    const res = await fetch(`${API_BASE}/program/credits.aleo/mapping/account/${address}?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as unknown // 命中：'123u64'；未命中：null（余额为 0，不是查询失败）
    total = typeof body === 'string' ? BigInt(body.match(/^(\d+)u64$/)?.[1] ?? '0') : 0n
  } catch {
    return null // 网络失败 → 不确定 → 不拦截
  }
  try {
    for (const r of await requestRecords('credits.aleo', true, 'unspent')) {
      const m = JSON.stringify(r).match(/microcredits:\s*(\d+)u64/)
      if (m) total += BigInt(m[1])
    }
  } catch {
    // 钱包未授权 credits.aleo（老连接）→ 只按 public 判断，可能偏低
  }
  return total
}

// 区块浏览器交易链接（testnet）。
export const EXPLORER_TX = (txId: string) => `https://testnet.explorer.provable.com/transaction/${txId}`

// ── 交易确认 ──────────────────────────────────────────────
// executeTransaction 返回的是钱包的【临时】id，不等于落链结果：需轮询 transactionStatus，
// accepted 后 response.transactionId 才是链上最终 id（explorer 可查）。
export type TxOutcome = { status: 'accepted' | 'rejected' | 'failed' | 'pending'; txId: string; error?: string }

export async function waitForTx(
  transactionStatus: (tempId: string) => Promise<{ status: string; transactionId?: string; error?: string }>,
  tempId: string,
): Promise<TxOutcome> {
  const deadline = Date.now() + 180_000 // ponytail: 3min 定值，testnet 通常几十秒落链；不够真机再调
  let acceptedAt: number | null = null // 已 accepted 但链上 id 尚未生成的起点
  while (Date.now() < deadline) {
    try {
      const r = await transactionStatus(tempId)
      const status = r.status.toLowerCase()
      // transactionId 是「已生成才有」：accepted 后再宽限 20s 等它，否则钱包临时 id 会被当成链上 id
      // 存进发薪历史，explorer 永远打不开。等不到就照记——漏记会导致重复付款，比断链严重。
      if (status === 'accepted') {
        if (r.transactionId) return { status: 'accepted', txId: r.transactionId }
        acceptedAt ??= Date.now()
        if (Date.now() - acceptedAt > 20_000) return { status: 'accepted', txId: tempId }
      }
      if (status === 'rejected' || status === 'failed') return { status, txId: r.transactionId ?? tempId, error: r.error }
    } catch {
      // 刚广播查不到 / 网络抖动 → 继续轮询
    }
    await new Promise((r) => setTimeout(r, 4_000))
  }
  return { status: 'pending', txId: tempId }
}

// ── 交易构造器（provablehq executeTransaction 的 TransactionOptions，对应 TECH_DESIGN §6）──
// record 入参不再直接塞对象：用 { type:'record', program, recordname, uid } 引用，
// uid 来自 requestRecords 返回的 RecordEnvelope.uid（Shield 等 conforming 钱包填充）。

// prove_income(p: Paystub, threshold, verifier, nonce)
// verifier/nonce 公开回吐：转发给第三方时 verifier 对不上，旧证明重放时 nonce 对不上。
// program 参数：Paystub 属于铸它的程序（registry 版 = PROGRAM，arc22 版 = ARC22_PROGRAM），
// 两程序的 prove_income 同构，record 只能喂回原程序。
export function proveIncomeOpts(
  paystubUid: string, threshold: number | bigint, verifier: string, nonce: string, program: string = PROGRAM,
): TransactionOptions {
  return {
    program,
    function: 'prove_income',
    inputs: [
      { type: 'record', program, recordname: 'Paystub', uid: paystubUid },
      `${threshold}u128`,
      verifier,
      nonce,
    ],
    fee: FEE,
  }
}

// 每次证明用一个新 nonce（field）。crypto.getRandomValues → 十进制 field 字面量。
export function newNonce(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return `${[...b].reduce((n, x) => (n << 8n) | BigInt(x), 0n)}field`
}

// disclose(p: Paystub)——program 语义同 proveIncomeOpts。
export function discloseOpts(paystubUid: string, program: string = PROGRAM): TransactionOptions {
  return {
    program,
    function: 'disclose',
    inputs: [{ type: 'record', program, recordname: 'Paystub', uid: paystubUid }],
    fee: FEE,
  }
}

// set_salary(employee: address, token_id: field, amount: u128) —— 产出加密 SalaryConfig（owner=雇主）。
// amount 为 base units；薪资只上链（加密），绝不发后端。
export function setSalaryOpts(employee: string, tokenId: string, amount: bigint): TransactionOptions {
  return {
    program: HR_PROGRAM,
    function: 'set_salary',
    inputs: [employee, tokenId, `${amount}u128`],
    fee: FEE,
  }
}

// update_salary(old: SalaryConfig, amount: u128) —— 消费旧配置产新配置。
// 已有配置的员工必须走这里而不是 set_salary，否则新旧两条 record 并存、读取端谁后谁赢（可能按旧薪资发钱）。
export function updateSalaryOpts(oldUid: string, amount: bigint): TransactionOptions {
  return {
    program: HR_PROGRAM,
    function: 'update_salary',
    inputs: [
      { type: 'record', program: HR_PROGRAM, recordname: 'SalaryConfig', uid: oldUid },
      `${amount}u128`,
    ],
    fee: FEE,
  }
}

// set_salary_batch(token_id, employees: [address;8], amounts: [u128;8]) —— 一笔 tx 设最多 8 人。
// employees/amounts 必须正好 8 项（调用方补位：多余槽用任意有效地址 + amount 0，读取端按 amount>0 过滤）。
export const SALARY_BATCH = 8
export function setSalaryBatchOpts(employees: string[], amounts: bigint[], tokenId: string): TransactionOptions {
  const emp = `[${employees.join(', ')}]`
  const amt = `[${amounts.map((a) => `${a}u128`).join(', ')}]`
  return { program: HR_PROGRAM, function: 'set_salary_batch', inputs: [tokenId, emp, amt], fee: FEE }
}

// pay(input: token_registry Token, to, amount: u128, period: u32)
export function payOpts(tokenUid: string, to: string, amount: number | bigint, period: number): TransactionOptions {
  return {
    program: PROGRAM,
    function: 'pay',
    inputs: [
      { type: 'record', program: 'token_registry.aleo', recordname: 'Token', uid: tokenUid },
      to,
      `${amount}u128`,
      `${period}u32`,
    ],
    fee: FEE,
  }
}

// pay_batch(input Token, tos: [address;4], amounts: [u128;4], period) —— 一笔 tx 发 4 人，
// 链式复用找零、免"等找零 finalize"串行。tos/amounts 必须正好 4 项（调用方补位：多余槽 amount 0）。
export const PAY_BATCH = 4
export function payBatchOpts(tokenUid: string, tos: string[], amounts: bigint[], period: number): TransactionOptions {
  return {
    program: PROGRAM,
    function: 'pay_batch',
    inputs: [
      { type: 'record', program: 'token_registry.aleo', recordname: 'Token', uid: tokenUid },
      `[${tos.join(', ')}]`,
      `[${amounts.map((a) => `${a}u128`).join(', ')}]`,
      `${period}u32`,
    ],
    fee: FEE,
  }
}
