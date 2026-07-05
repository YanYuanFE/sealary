// 展示层格式化 —— 纯函数，无副作用。

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function period(p: number): string {
  const s = String(p)
  return `${s.slice(0, 4)}·${s.slice(4)}` // 202607 -> 2026·07
}

export type Tier = 0 | 1 | 2 | 3

// 合约：0=不达标, 1=C(>=T), 2=B(>=1.1T), 3=A(>=2T)
export const TIERS: Record<Tier, { code: string; name: string; hint: string }> = {
  0: { code: '—', name: 'Below', hint: 'below threshold' },
  1: { code: 'C', name: 'Meets', hint: '≥ threshold' },
  2: { code: 'B', name: 'Strong', hint: '≥ 1.1× threshold' },
  3: { code: 'A', name: 'High', hint: '≥ 2× threshold' },
}

export function tierOf(amount: number, threshold: number): Tier {
  if (amount >= threshold * 2) return 3
  if (amount >= threshold + threshold / 10) return 2
  if (amount >= threshold) return 1
  return 0
}
