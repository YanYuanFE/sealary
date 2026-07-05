// 认证会话：SIWA 会话 JWT（signIn 后）。dev/prod 同一条路，无免签旁路。
let currentWallet: string | null = null
let sessionToken: string | null = null
let pending: Promise<boolean> | null = null // in-flight / 已落定的 signIn（防重复弹签名窗）

// 会话 JWT 持久化（按钱包分 key）：刷新后恢复，免每次重新签名登录。JWT 自带 exp，本地即可判有效。
const tokenKey = (wallet: string) => `sealary.jwt.${wallet}`

function loadToken(wallet: string): string | null {
  try {
    const t = localStorage.getItem(tokenKey(wallet))
    if (!t) return null
    const { exp } = JSON.parse(atob(t.split('.')[1])) as { exp?: number }
    if (typeof exp === 'number' && exp * 1000 > Date.now() + 60_000) return t
    localStorage.removeItem(tokenKey(wallet)) // 过期清掉，走重签
  } catch {
    /* 损坏视为无 */
  }
  return null
}

export function setWallet(wallet: string | null) {
  if (wallet === currentWallet) return
  currentWallet = wallet
  pending = null
  sessionToken = wallet ? loadToken(wallet) : null // 换钱包不串会话；刷新/重连恢复本钱包的
}

export function authHeaders(): Record<string, string> {
  return sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}
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
      localStorage.setItem(tokenKey(wallet), token) // 刷新后 loadToken 恢复
      return true
    }
  } catch {
    /* 登录失败 → 无会话，受保护端点返回 401 */
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
