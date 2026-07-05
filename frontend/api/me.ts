import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'
import { unwrapKey, decryptPII } from './_lib/crypto.js'

type Pii = { name: string; salary: number }

// GET → 当前登录钱包对应的员工身份 + 所属公司（解密 PII）。未入职则 null。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' })
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  const rows = await sql`
    select p.id, p.wallet_address, p.pii_ciphertext, k.wrapped_key,
           c.id as company_id, c.name as company_name, c.symbol, c.decimals, c.token_id
    from person p
    join encryption_keys k on k.key_ref = p.key_ref
    join employment e on e.person_id = p.id
    join company c on c.id = e.company_id
    where p.wallet_address = ${wallet}
    limit 1`
  if (rows.length === 0) return res.json(null)

  const r = rows[0]
  const pii = decryptPII<Pii>(r.pii_ciphertext as Buffer, unwrapKey(r.wrapped_key as Buffer))
  return res.json({
    person: { id: r.id, walletAddress: r.wallet_address, name: pii.name, salary: pii.salary },
    company: { id: r.company_id, name: r.company_name, symbol: r.symbol, decimals: r.decimals, tokenId: r.token_id },
  })
}
