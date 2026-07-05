import type { VercelRequest, VercelResponse } from '@vercel/node'
import { issueNonce } from '../_lib/siwa.js'

// POST { wallet } → { nonce }。客户端用钱包对 nonce 签名后调 /auth/verify。
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const wallet = req.body?.wallet
  if (!wallet) return res.status(400).json({ error: 'wallet required' })
  return res.json(issueNonce(wallet))
}
