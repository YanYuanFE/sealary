import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// 发薪记录（仅元数据，无金额——薪资金额绝不进后端，见 PRIVACY_AUDIT）。
// GET ?companyId → 记录列表；POST { companyId, period, txId, personIds } → 记一批（pay_batch 成功后调）。
async function ownCompany(wallet: string, companyId: string): Promise<boolean> {
  const rows = await sql`select 1 from company where id = ${companyId} and employer_wallet = ${wallet}`
  return rows.length > 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const companyId = String(req.query.companyId ?? '')
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })
    const rows = await sql`
      select id, person_id as "personId", period, tx_id as "txId", created_at as "createdAt"
      from payment where company_id = ${companyId}
      order by created_at desc limit 200`
    return res.json(rows)
  }

  if (req.method === 'POST') {
    const { companyId, period, txId, personIds } = req.body ?? {}
    if (!companyId || !period || !txId || !Array.isArray(personIds) || personIds.length === 0)
      return res.status(400).json({ error: 'companyId, period, txId, personIds required' })
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })
    for (const pid of personIds)
      await sql`insert into payment (company_id, person_id, period, tx_id) values (${companyId}, ${pid}, ${period}, ${txId})`
    await audit(wallet, 'payment.record', String(txId))
    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'method' })
}
