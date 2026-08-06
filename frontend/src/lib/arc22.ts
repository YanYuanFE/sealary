// ARC-22（USDCx/USAD 家族）代币驱动：程序名 field 编码、冻结名单非成员证明、发薪交易构造。
// 发薪走 sealary_pay_arc22.aleo 的动态分发（call.dynamic），代币程序 id 是运行时参数。
import type { TransactionOptions } from '@provablehq/aleo-types'
import { API_BASE, FEE, NETWORK, ARC22_PROGRAM } from './aleo'
import { u128ToAscii, type TokenInfo } from './units'

// 程序名（含或不含 .aleo 后缀）→ field：snarkVM Identifier 编码 = 名字 ASCII 字节小端整数。
export function progField(program: string): string {
  const name = program.replace(/\.aleo$/, '')
  let n = 0n
  for (let i = name.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(name.charCodeAt(i))
  return `${n}field`
}

// progField 的逆变换：field → 程序名。解不出合法标识符（不是程序 id 编码的 field）返回 null。
export function fieldToProg(field: string): string | null {
  let n = 0n
  try {
    n = BigInt(field.replace(/field$/, ''))
  } catch {
    return null
  }
  let name = ''
  while (n > 0n) {
    name += String.fromCharCode(Number(n & 0xffn))
    n >>= 8n
  }
  return /^[a-z][a-z0-9_]*$/.test(name) ? `${name}.aleo` : null
}

// 代币元数据：ARC-22 代币的 token_info mapping（key 恒为 true）。查不到 / 结构不符 → null。
export async function fetchArc22TokenInfo(program: string): Promise<TokenInfo | null> {
  if (!/^[a-z0-9_]+\.aleo$/.test(program)) return null
  const res = await fetch(`${API_BASE}/program/${program}/mapping/token_info/true?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'string') return null
  const field = (re: RegExp) => body.match(re)?.[1]
  const name = field(/name:\s*(\d+)u128/)
  const symbol = field(/symbol:\s*(\d+)u128/)
  const decimals = field(/decimals:\s*(\d+)u8/)
  if (!name || !decimals) return null
  return {
    tokenId: progField(program),
    name: u128ToAscii(BigInt(name)),
    symbol: u128ToAscii(BigInt(symbol ?? name)),
    decimals: Number(decimals),
    admin: '', // ARC-22 的 token_info 无 admin 字段（治理在 multisig core），展示层留空
    supply: BigInt(field(/supply:\s*(\d+)u128/) ?? '0'),
    maxSupply: BigInt(field(/max_supply:\s*(\d+)u128/) ?? '0'),
    extAuthRequired: false,
  }
}

// 冻结名单非成员证明：拉当前 merkle 树（Provable v2 端点），本地算 exclusion proof——
// 付款人地址不出本机（隐私）。返回 Leo 字面量 "[{siblings: [...], leaf_index: Nu32}, {...}]"，
// 直接作为 pay/pay_batch 的 proofs 输入。付款人固定是雇主，同一树下批量可复用同一份。
export async function freezeProofs(tokenProgram: string, sender: string): Promise<string> {
  const freezeProg = tokenProgram.replace(/_stablecoin\.aleo$/, '_freezelist.aleo')
  const res = await fetch(`https://api.explorer.provable.com/v2/${NETWORK}/programs/${freezeProg}/compliance/freeze-list`)
  if (!res.ok) throw new Error(`freeze list unavailable for ${freezeProg} (HTTP ${res.status})`)
  const raw = (await res.json()) as string[]
  // SealanceMerkleTree 拖 wasm（Poseidon4），按需加载，别进首屏 bundle。
  const { SealanceMerkleTree } = await import('@provablehq/sdk')
  const t = new SealanceMerkleTree()
  const tree = t.convertTreeToBigInt(raw)
  // 深度 16：合约 MerkleProof.siblings 是 [field; 16]（SDK 文档示例的 15 会差一个 sibling，链上拒收）。
  const [left, right] = t.getLeafIndices(tree, sender)
  return t.formatMerkleProof([t.getSiblingPath(tree, left, 16), t.getSiblingPath(tree, right, 16)])
}

// pay(token_prog, input: dyn record, to, amount, period, proofs)
export function payArc22Opts(
  tokenProgram: string, tokenUid: string, to: string, amount: bigint, period: number, proofs: string,
): TransactionOptions {
  return {
    program: ARC22_PROGRAM,
    function: 'pay',
    inputs: [
      progField(tokenProgram),
      { type: 'record', program: tokenProgram, recordname: 'Token', uid: tokenUid },
      to,
      `${amount}u128`,
      `${period}u32`,
      proofs,
    ],
    fee: FEE,
  }
}

// pay_batch(token_prog, input, tos: [address;4], amounts: [u128;4], period, proofs)
export function payBatchArc22Opts(
  tokenProgram: string, tokenUid: string, tos: string[], amounts: bigint[], period: number, proofs: string,
): TransactionOptions {
  return {
    program: ARC22_PROGRAM,
    function: 'pay_batch',
    inputs: [
      progField(tokenProgram),
      { type: 'record', program: tokenProgram, recordname: 'Token', uid: tokenUid },
      `[${tos.join(', ')}]`,
      `[${amounts.map((a) => `${a}u128`).join(', ')}]`,
      `${period}u32`,
      proofs,
    ],
    fee: FEE,
  }
}
