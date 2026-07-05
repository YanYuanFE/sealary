import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// GET  → 当前雇主的组织；POST { name, region, tokenId, symbol, decimals } → 创建。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const rows = await sql`select id, name, region, token_id as "tokenId", symbol, decimals, pay_day as "payDay" from company where employer_wallet = ${wallet}`
    return res.json(rows[0] ?? null)
  }

  if (req.method === 'POST') {
    const { name, region, tokenId, symbol, decimals, payDay } = req.body ?? {}
    if (!name || !tokenId || symbol == null || decimals == null) return res.status(400).json({ error: 'name, tokenId, symbol, decimals required' })
    // region = 公司所在国 ISO-2 码（对齐 Paychain 的 country_code；列名沿用 region）
    if (!/^[A-Z]{2}$/.test(String(region ?? ''))) return res.status(400).json({ error: 'region must be an ISO-2 country code' })
    const pd = Number(payDay)
    if (!Number.isInteger(pd) || pd < 1 || pd > 28) return res.status(400).json({ error: 'payDay must be 1-28' })
    const rows = await sql`
      insert into company (employer_wallet, name, region, token_id, symbol, decimals, pay_day)
      values (${wallet}, ${name}, ${region}, ${tokenId}, ${symbol}, ${decimals}, ${pd})
      on conflict (employer_wallet) do update set name = excluded.name, token_id = excluded.token_id, symbol = excluded.symbol, decimals = excluded.decimals, pay_day = excluded.pay_day
      returning id, name, region, token_id as "tokenId", symbol, decimals, pay_day as "payDay"`
    await audit(wallet, 'company.create', String(rows[0].id))
    return res.json(rows[0])
  }

  return res.status(405).json({ error: 'method' })
}
