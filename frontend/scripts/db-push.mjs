// 把 schema.sql 推到 Neon（无需 psql）。从 .env.local 读 DATABASE_URL，逐条执行。
// 用法：npm run db:push
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    /* no env file */
  }
}

loadEnvFile(new URL('../.env.local', import.meta.url).pathname)

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL missing (set it in .env.local)')
  process.exit(1)
}

const sql = neon(url)
const text = readFileSync(new URL('../schema.sql', import.meta.url).pathname, 'utf8')
const stmts = text
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

for (const s of stmts) {
  await sql.query(s)
  console.log('OK  ', s.slice(0, 60).replace(/\s+/g, ' '))
}
console.log(`DONE ${stmts.length} statements`)
