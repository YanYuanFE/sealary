// 组织 / 花名册数据层。
// ponytail: 现用 localStorage 作演示存储（同步）。后端（本项目 ../../api，同 Vercel 部署）就绪后，
//           把各函数实现换成 fetch('/api/...')（同源）+ 会话 token；届时这些函数变 async，
//           调用点（CreateOrg / Employer / Employee）需相应加 await。接口形状不变。
// §15 合规：链下不存工资金额【明文】。salary 与姓名一同视作 PII，真后端里 AES-256-GCM 加密存储
//           （§15.2 的 pii_ciphertext），此处 localStorage 演示态明文占位。

export type Company = {
  id: string
  employerWallet: string
  name: string
  region: string
  tokenId: string
  symbol: string
  decimals: number
  createdAt: number
}

export type Person = {
  id: string
  companyId: string
  name: string
  title: string
  walletAddress: string
  salary: number // 人类单位；发薪时经 toBase(salary, company.decimals) 上链
}

const KEY = 'sealary.store.v1'

type Store = { companies: Company[]; people: Person[] }

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as Store
  } catch {
    return { companies: [], people: [] }
  }
}

function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function getCompanyByWallet(wallet: string): Company | undefined {
  return read().companies.find((c) => c.employerWallet === wallet)
}

export function createCompany(input: Omit<Company, 'id' | 'createdAt'>): Company {
  const s = read()
  const company: Company = { ...input, id: crypto.randomUUID(), createdAt: Date.now() }
  s.companies.push(company)
  write(s)
  return company
}

export function listEmployees(companyId: string): Person[] {
  return read().people.filter((p) => p.companyId === companyId)
}

export function addEmployee(input: Omit<Person, 'id'>): Person {
  const s = read()
  const person: Person = { ...input, id: crypto.randomUUID() }
  s.people.push(person)
  write(s)
  return person
}

// 员工视角：按钱包地址找到自己所属的雇佣与公司（用于 /employee 身份展示）。
export function getPersonByWallet(wallet: string): { person: Person; company: Company } | undefined {
  const s = read()
  const person = s.people.find((p) => p.walletAddress === wallet)
  if (!person) return undefined
  const company = s.companies.find((c) => c.id === person.companyId)
  if (!company) return undefined
  return { person, company }
}
