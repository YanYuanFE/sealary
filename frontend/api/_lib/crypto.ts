// PII 加密（AES-256-GCM）+ crypto-shredding（TECH_DESIGN §15.3）。
// 分层密钥：env 主密钥 → 包裹 per-person DEK → DEK 加密 PII。
// 被遗忘权 = 删 encryption_keys 行（wrapped DEK 消失）→ 所有副本里的 pii_ciphertext 永久不可解。
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

const ALG = 'aes-256-gcm'

function masterKey(): Buffer {
  const b64 = process.env.MASTER_KEY
  if (!b64) throw new Error('MASTER_KEY env missing (base64 of 32 bytes)')
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error('MASTER_KEY must decode to 32 bytes')
  return key
}

// iv(12) || tag(16) || ciphertext
function seal(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv(ALG, key, iv)
  const ct = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct])
}

function open(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const ct = blob.subarray(28)
  const d = createDecipheriv(ALG, key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

export function newDek(): Buffer {
  return randomBytes(32)
}

export function wrapKey(dek: Buffer): Buffer {
  return seal(dek, masterKey())
}

export function unwrapKey(wrapped: Buffer): Buffer {
  return open(wrapped, masterKey())
}

// PII 对象（含 salary）→ 密文。dek 为该 person 的数据密钥。
export function encryptPII(obj: unknown, dek: Buffer): Buffer {
  return seal(Buffer.from(JSON.stringify(obj), 'utf8'), dek)
}

export function decryptPII<T>(blob: Buffer, dek: Buffer): T {
  return JSON.parse(open(blob, dek).toString('utf8')) as T
}

// 证件号可搜索索引（不存明文）。
export function taxIdHmac(taxId: string): string {
  return createHmac('sha256', masterKey()).update(taxId).digest('hex')
}
