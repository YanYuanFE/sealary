import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'

// DELETE ?id → 被遗忘权（§15.3 Art.17）：crypto-shred，部分擦除。
// 只删 encryption_keys 行 → wrapped DEK 消失 → 姓名密文永久不可解；person 行留下承载 payment 外键，
// 发薪元数据（期数/tx，无姓名无金额）作为法定审计线索保留（Art.17(3)(b)）。
// key_ref 置 null 后 employees 的 inner join 落空，该员工自动退出花名册。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method' })
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  const id = String(req.query.id ?? '')
  // 仅允许删自己组织内的员工（person 按 company_id 租户隔离，删不到别家的行）。
  const own = await sql`
    select p.key_ref from person p
    join company c on c.id = p.company_id
    where p.id = ${id} and c.employer_wallet = ${wallet}`
  if (own.length === 0) return res.status(403).json({ error: 'not your employee' })
  const keyRef = own[0].key_ref

  if (!keyRef) return res.json({ shredded: true }) // 已擦除过，幂等
  await sql`delete from encryption_keys where key_ref = ${keyRef}` // crypto-shred（person.key_ref 随之置 null）
  await audit(wallet, 'employee.forget', id)
  return res.json({ shredded: true })
}
