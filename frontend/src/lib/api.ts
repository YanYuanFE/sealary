// 组织 / 花名册数据层 —— 调后端 /api（同源，Vercel functions；本地由 vite devApi 插件服务）。
// 认证：authHeaders() 携带 SIWA 会话 JWT（dev/prod 同一条路）。
// §15 合规：链下不存工资金额【明文】——salary 与姓名一同在服务端 AES-256-GCM 加密存储。
import { authHeaders, authReady } from './auth'

export type Company = {
  id: string
  name: string
  region: string
  tokenId: string
  symbol: string
  decimals: number
}

// 后端只存身份 PII（name/address）——薪资绝不进后端（隐私红线，见 PRIVACY_AUDIT）。
// 薪资在链上加密 record sealary_conf.aleo/SalaryConfig（雇主自有），前端另行读取。
export type Person = {
  id: string
  name: string
  walletAddress: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  await authReady() // 等 signIn 落定，避免 prod 下首个请求无 token 被 401
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// 当前雇主的组织（认证钱包）。未建则 null。
export function getCompany() {
  return req<Company | null>('/companies')
}

export function createCompany(input: Omit<Company, 'id'>) {
  return req<Company>('/companies', { method: 'POST', body: JSON.stringify(input) })
}

export function listEmployees(companyId: string) {
  return req<Person[]>(`/employees?companyId=${encodeURIComponent(companyId)}`)
}

export function addEmployee(companyId: string, input: Omit<Person, 'id'>) {
  return req<Person>('/employees', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
}

// 发薪记录（仅元数据：谁/哪期/哪笔 tx——无金额，金额在链上加密）。
export type Payment = {
  id: string
  personId: string
  period: number
  txId: string
  createdAt: string
}

export function listPayments(companyId: string) {
  return req<Payment[]>(`/payments?companyId=${encodeURIComponent(companyId)}`)
}

export function recordPayment(companyId: string, period: number, txId: string, personIds: string[]) {
  return req<{ ok: boolean }>('/payments', { method: 'POST', body: JSON.stringify({ companyId, period, txId, personIds }) })
}

// 被遗忘权（GDPR Art.17）：删员工 + crypto-shred 其 PII 密钥，密文永久不可解。
export function forgetEmployee(personId: string) {
  return req<{ shredded: boolean }>(`/persons?id=${encodeURIComponent(personId)}`, { method: 'DELETE' })
}

// 员工视角：按认证钱包取自己的身份 + 公司。未入职则 null。
export function getMe() {
  return req<{ person: Person; company: Company } | null>('/me')
}
