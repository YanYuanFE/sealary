// react-query 数据层：集中 queryKey 与读请求 hooks。
// 写请求后按 key invalidate 即可重取，不再手写 refresh()/setState 的重取链路。
// key 一律带钱包地址（或 companyId）：换钱包不会读到上一个钱包的缓存。
import { useQuery } from '@tanstack/react-query'
import { fetchCredits, FEE } from './aleo'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { listCompanies, listEmployees, listPayments, listDisclosures, getMe } from './api'

export const qk = {
  companies: (address: string) => ['companies', address] as const,
  me: (address: string) => ['me', address] as const,
  disclosures: (address: string) => ['disclosures', address] as const,
  employees: (companyId: string) => ['employees', companyId] as const,
  payments: (companyId: string) => ['payments', companyId] as const,
  salaries: (address: string, tokenId: string) => ['salaries', address, tokenId] as const, // 链上 SalaryConfig（钱包 record，按组织 token 过滤）
  balance: (address: string, tokenId: string) => ['balance', address, tokenId] as const,
  credits: (address: string) => ['credits', address] as const, // 手续费余额
}

// 后端请求都要已认证钱包（api.req 内部 await authReady）；未连接时不发。
function useAuthed() {
  const { connected, address } = useWallet()
  return { address: address ?? '', enabled: connected && !!address }
}

export function useCompanies() {
  const { address, enabled } = useAuthed()
  return useQuery({ queryKey: qk.companies(address), queryFn: listCompanies, enabled })
}

export function useMe() {
  const { address, enabled } = useAuthed()
  return useQuery({ queryKey: qk.me(address), queryFn: getMe, enabled })
}

export function useDisclosures() {
  const { address, enabled } = useAuthed()
  return useQuery({ queryKey: qk.disclosures(address), queryFn: listDisclosures, enabled })
}

export function useEmployees(companyId: string) {
  return useQuery({ queryKey: qk.employees(companyId), queryFn: () => listEmployees(companyId) })
}

export function usePayments(companyId: string) {
  return useQuery({ queryKey: qk.payments(companyId), queryFn: () => listPayments(companyId) })
}

// 手续费余额。hasGas=false 只在【确定】不足时出现：查不到（null）一律放行，
// 宁可让交易在钱包里失败，也不误锁一个其实有钱的账户。
export function useCredits() {
  const { connected, address, requestRecords } = useWallet()
  const q = useQuery({
    queryKey: qk.credits(address ?? ''),
    queryFn: () => fetchCredits(address!, requestRecords),
    enabled: connected && !!address,
  })
  return { credits: q.data ?? null, hasGas: q.data == null || q.data >= BigInt(FEE), refetch: q.refetch, checking: q.isFetching }
}
