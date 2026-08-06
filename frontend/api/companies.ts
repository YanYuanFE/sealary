import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// GET  → 当前雇主的组织列表；POST { name, tokenId, symbol, decimals, payDay } → 创建。
// 一个钱包可建多个组织；token_id 每钱包唯一（链上记录只带 token_id，靠它区分组织）。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const rows = await sql`select id, name, token_id as "tokenId", symbol, decimals, pay_day as "payDay", token_family as "tokenFamily", token_program as "tokenProgram" from company where employer_wallet = ${wallet} order by created_at`
    return res.json(rows)
  }

  if (req.method === 'POST') {
    const { name, tokenId, symbol, decimals, payDay, tokenFamily = 'registry', tokenProgram = null } = req.body ?? {}
    if (!name || !tokenId || symbol == null || decimals == null) return res.status(400).json({ error: 'name, tokenId, symbol, decimals required' })
    if (tokenFamily !== 'registry' && tokenFamily !== 'arc22') return res.status(400).json({ error: 'tokenFamily must be registry or arc22' })
    if (tokenFamily === 'arc22' && !tokenProgram) return res.status(400).json({ error: 'tokenProgram required for arc22' })
    const pd = Number(payDay)
    if (!Number.isInteger(pd) || pd < 1 || pd > 28) return res.status(400).json({ error: 'payDay must be 1-28' })
    const rows = await sql`
      insert into company (employer_wallet, name, token_id, symbol, decimals, pay_day, token_family, token_program)
      values (${wallet}, ${name}, ${tokenId}, ${symbol}, ${decimals}, ${pd}, ${tokenFamily}, ${tokenProgram})
      on conflict (employer_wallet, token_id) do nothing
      returning id, name, token_id as "tokenId", symbol, decimals, pay_day as "payDay", token_family as "tokenFamily", token_program as "tokenProgram"`
    if (rows.length === 0) return res.status(409).json({ error: 'this token already backs one of your organizations — each organization needs its own token' })
    await audit(wallet, 'company.create', String(rows[0].id))
    return res.json(rows[0])
  }

  return res.status(405).json({ error: 'method' })
}
