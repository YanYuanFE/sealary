import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, audit } from './_lib/db.js'
import { authWallet } from './_lib/siwa.js'
import { newDek, wrapKey, unwrapKey, encryptPII, decryptPII, taxIdHmac } from './_lib/crypto.js'

type Pii = { name: string } // 薪资绝不进后端（PRIVACY_AUDIT）——只加密身份 PII

// 校验该 company 属当前雇主。
async function ownCompany(wallet: string, companyId: string): Promise<boolean> {
  const rows = await sql`select 1 from company where id = ${companyId} and employer_wallet = ${wallet}`
  return rows.length > 0
}

// GET ?companyId → 花名册（解密 PII，无薪资）；POST { companyId, name, walletAddress, taxId? } → 加员工。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = await authWallet(req)
  if (!wallet) return res.status(401).json({ error: 'auth' })

  if (req.method === 'GET') {
    const companyId = String(req.query.companyId ?? '')
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })
    const rows = await sql`
      select p.id, p.wallet_address, p.pii_ciphertext, k.wrapped_key
      from person p join encryption_keys k on k.key_ref = p.key_ref
      where p.company_id = ${companyId}`
    await audit(wallet, 'roster.read', companyId)
    const roster = rows.map((r) => {
      const pii = decryptPII<Pii>(r.pii_ciphertext as Buffer, unwrapKey(r.wrapped_key as Buffer))
      return { id: r.id, walletAddress: r.wallet_address, name: pii.name }
    })
    return res.json(roster)
  }

  if (req.method === 'POST') {
    const { companyId, name, walletAddress, taxId } = req.body ?? {}
    if (!companyId || !name || !walletAddress) return res.status(400).json({ error: 'companyId, name, walletAddress required' })
    if (!(await ownCompany(wallet, companyId))) return res.status(403).json({ error: 'not your company' })

    const dek = newDek()
    const keyRows = await sql`insert into encryption_keys (wrapped_key) values (${wrapKey(dek)}) returning key_ref`
    const keyRef = keyRows[0].key_ref
    const cipher = encryptPII({ name } satisfies Pii, dek)
    // person 按 (company_id, wallet_address) 租户隔离：同钱包在别家公司是另一行/另一把 DEK，互不覆盖。
    // 幂等：本公司重复添加 / 重导 CSV → 覆盖 PII 并指向新 DEK（旧 key 行成孤儿，无害），不撞 unique 500。
    const personRows = await sql`
      insert into person (company_id, wallet_address, pii_ciphertext, key_ref, tax_id_hmac)
      values (${companyId}, ${walletAddress}, ${cipher}, ${keyRef}, ${taxId ? taxIdHmac(taxId) : null})
      on conflict (company_id, wallet_address) do update
        set pii_ciphertext = excluded.pii_ciphertext, key_ref = excluded.key_ref,
            tax_id_hmac = coalesce(excluded.tax_id_hmac, person.tax_id_hmac)
      returning id`
    const personId = personRows[0].id
    await audit(wallet, 'employee.add', String(personId))
    return res.json({ id: personId, walletAddress, name })
  }

  return res.status(405).json({ error: 'method' })
}
