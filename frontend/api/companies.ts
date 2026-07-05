import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// GET  → 当前雇主的组织；POST { name, region, tokenId, symbol, decimals } → 创建。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const rows = await sql`select id, name, region, token_id as "tokenId", symbol, decimals from company where employer_wallet = ${wallet}`
    return res.json(rows[0] ?? null)
  }

  if (req.method === 'POST') {
    const { name, region, tokenId, symbol, decimals } = req.body ?? {}
    if (!name || !tokenId || symbol == null || decimals == null) return res.status(400).json({ error: 'name, tokenId, symbol, decimals required' })
    const rows = await sql`
      insert into company (employer_wallet, name, region, token_id, symbol, decimals)
      values (${wallet}, ${name}, ${region ?? 'EU'}, ${tokenId}, ${symbol}, ${decimals})
      on conflict (employer_wallet) do update set name = excluded.name, token_id = excluded.token_id, symbol = excluded.symbol, decimals = excluded.decimals
      returning id, name, region, token_id as "tokenId", symbol, decimals`
    await audit(wallet, 'company.create', String(rows[0].id))
    return res.json(rows[0])
  }

  return res.status(405).json({ error: 'method' })
}
