import { Network, type TransactionOptions } from '@provablehq/aleo-types'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'

// ── 链上配置 ──────────────────────────────────────────────
export const NETWORK = Network.TESTNET
export const PROGRAM = 'sealary_payroll.aleo' // pay + pay_batch + prove_income + disclose + tier
export const HR_PROGRAM = 'sealary_conf.aleo' // 雇主私有薪资配置（加密 record，后端不存薪资）
export const DECRYPT = DecryptPermission.UponRequest
export const CONNECT_PROGRAMS = [PROGRAM, HR_PROGRAM, 'token_registry.aleo']

// REST 查询端点（链上只读：mapping / program）。
export const ENDPOINT = 'https://api.explorer.provable.com/v1'
export const API_BASE = `${ENDPOINT}/${NETWORK}`

// 手续费（microcredits）。部署后按实际 execution 成本调。
export const FEE = 1_000_000

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
  while (Date.now() < deadline) {
    try {
      const r = await transactionStatus(tempId)
      const status = r.status.toLowerCase()
      if (status === 'accepted') return { status: 'accepted', txId: r.transactionId ?? tempId }
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

// prove_income(p: Paystub, public threshold: u128)
export function proveIncomeOpts(paystubUid: string, threshold: number | bigint): TransactionOptions {
  return {
    program: PROGRAM,
    function: 'prove_income',
    inputs: [
      { type: 'record', program: PROGRAM, recordname: 'Paystub', uid: paystubUid },
      `${threshold}u128`,
    ],
    fee: FEE,
  }
}

// disclose(p: Paystub)
export function discloseOpts(paystubUid: string): TransactionOptions {
  return {
    program: PROGRAM,
    function: 'disclose',
    inputs: [{ type: 'record', program: PROGRAM, recordname: 'Paystub', uid: paystubUid }],
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
