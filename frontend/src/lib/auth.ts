// 认证会话。dev：ALLOW_DEV_AUTH 下用 x-dev-wallet 头免签名；prod：SIWA 会话 JWT（signIn 后）。
let currentWallet: string | null = null
let sessionToken: string | null = null
let pending: Promise<boolean> | null = null // in-flight / 已落定的 signIn（防重复弹签名窗）

export function setWallet(wallet: string | null) {
  if (wallet === currentWallet) return
  currentWallet = wallet
  sessionToken = null // 断开或换钱包都清旧会话（旧 token 属于旧钱包）
  pending = null
}

export function authHeaders(): Record<string, string> {
  if (sessionToken) return { authorization: `Bearer ${sessionToken}` }
  if (currentWallet && import.meta.env.DEV) return { 'x-dev-wallet': currentWallet }
  return {}
}

// API 层在首个请求前 await：等 signIn 落定（拿到 token / 失败回退），消除 prod 下 401 竞态。
// 先让出一个微任务：子组件 effect 先于 AppShell 的 signIn effect 执行，同步读 pending 会拿到 null。
export async function authReady(): Promise<void> {
  await Promise.resolve()
  await pending
}

type SignMessage = (message: Uint8Array | string) => Promise<Uint8Array | undefined>

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

async function doSignIn(wallet: string, signMessage: SignMessage): Promise<boolean> {
  try {
    const { nonce } = await postJson('/api/auth/nonce', { wallet })
    // 以 UTF-8 字节签名（确定性，和后端 verify 的编码一致）。
    const sig = await signMessage(new TextEncoder().encode(nonce))
    if (!sig) return false
    // 钱包返回签名字符串（sign1…）的字节；解码回字符串给服务端 Signature.from_string。
    const signature = new TextDecoder().decode(sig)
    const { token } = await postJson('/api/auth/verify', { wallet, nonce, signature })
    if (token && wallet === currentWallet) {
      sessionToken = token
      return true
    }
  } catch {
    /* 回退到 dev 头 */
  }
  return false
}

// Sign in with Aleo：nonce → 钱包签名 → 服务端验签 → 存会话 JWT。
// 幂等：已有会话直接返回；同一钱包只发起一次（signMessage 引用变化不再重复弹窗）。
export function signIn(wallet: string, signMessage: SignMessage): Promise<boolean> {
  if (sessionToken && wallet === currentWallet) return Promise.resolve(true)
  if (!pending) pending = doSignIn(wallet, signMessage)
  return pending
}
