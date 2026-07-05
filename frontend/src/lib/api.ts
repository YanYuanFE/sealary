// 组织 / 花名册数据层 —— 调后端 /api（同源，Vercel functions；本地由 vite devApi 插件服务）。
// 认证：认证钱包由 authHeaders() 携带（dev x-dev-wallet / prod SIWA JWT）。
// §15 合规：链下不存工资金额【明文】——salary 与姓名一同在服务端 AES-256-GCM 加密存储。
import { authHeaders } from './auth'

export type Company = {
  id: string
  name: string
  region: string
  tokenId: string
  symbol: string
  decimals: number
}

export type Person = {
  id: string
  name: string
  title: string
  walletAddress: string
  salary: number // 人类单位；发薪时经 toBase(salary, company.decimals) 上链
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
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

// 员工视角：按认证钱包取自己的身份 + 公司。未入职则 null。
export function getMe() {
  return req<{ person: Person; company: Company } | null>('/me')
}
