// 认证会话。dev：ALLOW_DEV_AUTH 下用 x-dev-wallet 头免签名；prod：SIWA 会话 JWT（signIn 后）。
let currentWallet: string | null = null
let sessionToken: string | null = null

export function setWallet(wallet: string | null) {
  if (wallet === currentWallet) return
  currentWallet = wallet
  if (!wallet) sessionToken = null // 断开清会话
}

export function authHeaders(): Record<string, string> {
  if (sessionToken) return { authorization: `Bearer ${sessionToken}` }
  if (currentWallet && import.meta.env.DEV) return { 'x-dev-wallet': currentWallet }
  return {}
}

type SignMessage = (message: Uint8Array | string) => Promise<Uint8Array | undefined>

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// Sign in with Aleo：nonce → 钱包签名 → 服务端验签 → 存会话 JWT。
// 失败（如验签未落地）返回 false —— dev 下 authHeaders 回退到 x-dev-wallet。
export async function signIn(wallet: string, signMessage: SignMessage): Promise<boolean> {
  try {
    const { nonce } = await postJson('/api/auth/nonce', { wallet })
    // 以 UTF-8 字节签名（确定性，和后端 verify 的编码一致）。
    const sig = await signMessage(new TextEncoder().encode(nonce))
    if (!sig) return false
    // 钱包返回签名字符串（sign1…）的字节；解码回字符串给服务端 Signature.from_string。
    const signature = new TextDecoder().decode(sig)
    const { token } = await postJson('/api/auth/verify', { wallet, nonce, signature })
    if (token) {
      sessionToken = token
      return true
    }
  } catch {
    /* 回退到 dev 头 */
  }
  return false
}
