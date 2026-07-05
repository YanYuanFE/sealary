// 金额单位口径（BACKEND_PLAN §4.2）：链上一律 base units，展示一律人类可读。
// 所有金额进出链都过 toBase/fromBase，杜绝散落缩放。
import { API_BASE } from './aleo'

// 人类值 → base units（human × 10^decimals）。
// ponytail: 用 Number 乘法，salary 量级（≤ ~1e9 × 1e6 < 2^53）无精度问题；更大金额需切字符串定点。
export function toBase(human: number, decimals: number): bigint {
  return BigInt(Math.round(human * 10 ** decimals))
}

// base units → 人类值（raw / 10^decimals），供展示。
export function fromBase(raw: bigint | string | number, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals
}

// u128 编码的 ASCII 解码（token_registry 的 name/symbol；小端字节序）。
export function u128ToAscii(n: bigint): string {
  let s = ''
  while (n > 0n) {
    const c = Number(n & 0xffn)
    if (c >= 32 && c < 127) s += String.fromCharCode(c) // 只取可打印字符
    n >>= 8n
  }
  return s
}

export type TokenInfo = {
  tokenId: string
  name: string
  symbol: string
  decimals: number
  admin: string
  supply: bigint
  maxSupply: bigint
  extAuthRequired: boolean
}

// 从 token_registry 拉取代币信息（建组织时校验 token_id）。未注册 / 拉不到 → null。
export async function fetchTokenInfo(tokenId: string): Promise<TokenInfo | null> {
  const url = `${API_BASE}/program/token_registry.aleo/mapping/registered_tokens/${tokenId}?t=${Date.now()}`
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  if (!res.ok) return null
  const body = await res.json() // 命中：Aleo struct 明文串；未命中：null
  if (!body || typeof body !== 'string') return null

  const field = (re: RegExp) => body.match(re)?.[1]
  const name = field(/name:\s*(\d+)u128/)
  const symbol = field(/symbol:\s*(\d+)u128/)
  const decimals = field(/decimals:\s*(\d+)u8/)
  const admin = field(/admin:\s*(aleo1[a-z0-9]+)/)
  if (!name || !decimals || !admin) return null // 结构不完整视为无效

  return {
    tokenId,
    name: u128ToAscii(BigInt(name)),
    symbol: u128ToAscii(BigInt(symbol ?? name)),
    decimals: Number(decimals),
    admin,
    supply: BigInt(field(/supply:\s*(\d+)u128/) ?? '0'),
    maxSupply: BigInt(field(/max_supply:\s*(\d+)u128/) ?? '0'),
    extAuthRequired: field(/external_authorization_required:\s*(true|false)/) === 'true',
  }
}
