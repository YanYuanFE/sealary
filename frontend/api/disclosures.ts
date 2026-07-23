import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// 披露留痕（谁在何时向谁披露了什么——只元数据，无金额）。
// GET → 当前钱包自己的留痕；POST { kind, period, txId, party? } → prove/disclose 上链 accepted 后记一条。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const rows = await sql`
      select id, kind, period, party, tx_id as "txId", created_at as "createdAt"
      from disclosure where wallet = ${wallet}
      order by created_at desc limit 100`
    return res.json(rows)
  }

  if (req.method === 'POST') {
    const { kind, period, txId, party } = req.body ?? {}
    if ((kind !== 'prove' && kind !== 'disclose') || !period || !txId)
      return res.status(400).json({ error: 'kind (prove|disclose), period, txId required' })
    const rows = await sql`
      insert into disclosure (wallet, kind, period, party, tx_id)
      values (${wallet}, ${kind}, ${period}, ${party || null}, ${txId})
      returning id, kind, period, party, tx_id as "txId", created_at as "createdAt"`
    await audit(wallet, `paystub.${kind}`, String(txId))
    return res.json(rows[0])
  }

  return res.status(405).json({ error: 'method' })
}
