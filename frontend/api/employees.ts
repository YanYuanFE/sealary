import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'
import { newDek, wrapKey, unwrapKey, encryptPII, decryptPII, taxIdHmac } from './_lib/crypto.js'

type Pii = { name: string; salary: number }

// 校验该 company 属当前雇主。
async function ownCompany(wallet: string, companyId: string): Promise<boolean> {
  const rows = await sql`select 1 from company where id = ${companyId} and employer_wallet = ${wallet}`
  return rows.length > 0
}

// GET ?companyId → 花名册（解密 PII）；POST { companyId, name, title, walletAddress, salary, taxId? } → 加员工（加密 PII）。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const companyId = String(req.query.companyId ?? '')
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })
    const rows = await sql`
      select p.id, p.wallet_address, p.pii_ciphertext, k.wrapped_key
      from employment e join person p on p.id = e.person_id join encryption_keys k on k.key_ref = p.key_ref
      where e.company_id = ${companyId}`
    await audit(wallet, 'roster.read', companyId)
    const roster = rows.map((r) => {
      const pii = decryptPII<Pii>(r.pii_ciphertext as Buffer, unwrapKey(r.wrapped_key as Buffer))
      return { id: r.id, walletAddress: r.wallet_address, name: pii.name, salary: pii.salary }
    })
    return res.json(roster)
  }

  if (req.method === 'POST') {
    const { companyId, name, walletAddress, salary, taxId } = req.body ?? {}
    if (!companyId || !name || !walletAddress || salary == null) return res.status(400).json({ error: 'companyId, name, walletAddress, salary required' })
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })

    const dek = newDek()
    const keyRows = await sql`insert into encryption_keys (wrapped_key) values (${wrapKey(dek)}) returning key_ref`
    const keyRef = keyRows[0].key_ref
    const cipher = encryptPII({ name, salary } satisfies Pii, dek)
    const personRows = await sql`
      insert into person (wallet_address, pii_ciphertext, key_ref, tax_id_hmac)
      values (${walletAddress}, ${cipher}, ${keyRef}, ${taxId ? taxIdHmac(taxId) : null})
      returning id`
    const personId = personRows[0].id
    await sql`insert into employment (company_id, person_id) values (${companyId}, ${personId})`
    await audit(wallet, 'employee.add', String(personId))
    return res.json({ id: personId, walletAddress, name, salary })
  }

  return res.status(405).json({ error: 'method' })
}
