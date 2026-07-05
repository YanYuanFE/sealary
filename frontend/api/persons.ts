import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// DELETE ?id → 被遗忘权（§15.3 Art.17）：crypto-shred。
// 删 person（级联 employment）+ 删其 encryption_keys 行 → wrapped DEK 消失 → 所有副本密文永久不可解。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method' })
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  const id = String(req.query.id ?? '')
  // 仅允许删自己组织内的员工。
  const own = await sql`
    select p.key_ref from person p
    join employment e on e.person_id = p.id
    join company c on c.id = e.company_id
    where p.id = ${id} and c.employer_wallet = ${wallet}`
  if (own.length === 0) return res.status(403).json({ error: 'not your employee' })
  const keyRef = own[0].key_ref

  await sql`delete from person where id = ${id}`          // 级联删 employment
  await sql`delete from encryption_keys where key_ref = ${keyRef}` // crypto-shred
  await audit(wallet, 'employee.forget', id)
  return res.json({ shredded: true })
}
