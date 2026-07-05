import { Network, type TransactionOptions } from '@provablehq/aleo-types'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'

// ── 链上配置 ──────────────────────────────────────────────
export const NETWORK = Network.TESTNET
export const PROGRAM = 'sealary_pay.aleo'
export const DECRYPT = DecryptPermission.UponRequest
export const CONNECT_PROGRAMS = [PROGRAM, 'token_registry.aleo']

// REST 查询端点（链上只读：mapping / program）。
export const ENDPOINT = 'https://api.explorer.provable.com/v1'
export const API_BASE = `${ENDPOINT}/${NETWORK}`

// 手续费（microcredits）。部署后按实际 execution 成本调。
export const FEE = 1_000_000

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
