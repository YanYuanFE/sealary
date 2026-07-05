// Neon serverless Postgres 客户端。连接串由 Vercel Marketplace 集成自动注入（DATABASE_URL）。
import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)

// append-only 审计（§15.3 Art.5(2)）。
export async function audit(actorWallet: string, action: string, targetId?: string) {
  await sql`insert into access_audit_log (actor_wallet, action, target_id) values (${actorWallet}, ${action}, ${targetId ?? null})`
}
