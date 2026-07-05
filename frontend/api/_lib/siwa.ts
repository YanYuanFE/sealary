// Sign in with Aleo（TECH_DESIGN §15.4）：钱包对 nonce 签名 → 服务端验签 → 发短期会话。
// 无密码、不存额外 PII、与链上身份一致。
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes, createHmac } from 'node:crypto'

const SESSION_TTL = '2h'

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET env missing')
  return new TextEncoder().encode(s)
}

// 无状态 nonce：HMAC(wallet|expiry) —— 免存表。客户端回传 wallet+nonce，服务端重算校验。
export function issueNonce(wallet: string): { nonce: string; expiresAt: number } {
  const expiresAt = Date.now() + 5 * 60_000
  const nonce = createHmac('sha256', secret()).update(`${wallet}|${expiresAt}`).digest('hex') + '.' + expiresAt
  return { nonce, expiresAt }
}

export function nonceValid(wallet: string, nonce: string): boolean {
  const [, expStr] = nonce.split('.')
  const expiresAt = Number(expStr)
  if (!expiresAt || Date.now() > expiresAt) return false
  const expect = createHmac('sha256', secret()).update(`${wallet}|${expiresAt}`).digest('hex') + '.' + expiresAt
  return nonce === expect
}

// 验证 Aleo 钱包对 message 的签名。
// ⚠️ 需 @provablehq/sdk（aleo wasm）落地：Account/Signature.verify(address, message, signature)。
// 脚手架先留接口；接线时用 SDK 实现，未验签前不要上生产。
export async function verifyAleoSignature(_address: string, _message: string, _signature: string): Promise<boolean> {
  throw new Error('verifyAleoSignature: wire @provablehq/sdk signature verification before use')
}

export async function mintSession(wallet: string): Promise<string> {
  return new SignJWT({ wallet }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(SESSION_TTL).sign(secret())
}

export async function readSession(token: string): Promise<{ wallet: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return { wallet: String(payload.wallet) }
  } catch {
    return null
  }
}

// 会话辅助：从 Authorization: Bearer <jwt> 取已认证钱包。
export async function authWallet(req: { headers: Record<string, string | string[] | undefined> }): Promise<string | null> {
  const h = req.headers['authorization']
  const token = (Array.isArray(h) ? h[0] : h)?.replace(/^Bearer /, '')
  if (!token) return null
  const s = await readSession(token)
  return s?.wallet ?? null
}

export { randomBytes }
