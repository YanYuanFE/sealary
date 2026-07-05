import type { VercelRequest, VercelResponse } from '@vercel/node'
import { nonceValid, verifyAleoSignature, mintSession } from '../_lib/siwa.js'

// POST { wallet, nonce, signature } → { token }。验 nonce 新鲜性 + Aleo 签名，发短期会话 JWT。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const { wallet, nonce, signature } = req.body ?? {}
  if (!wallet || !nonce || !signature) return res.status(400).json({ error: 'wallet, nonce, signature required' })
  if (!nonceValid(wallet, nonce)) return res.status(401).json({ error: 'stale or invalid nonce' })

  const ok = await verifyAleoSignature(wallet, nonce, signature)
  if (!ok) return res.status(401).json({ error: 'signature' })

  return res.json({ token: await mintSession(wallet) })
}
