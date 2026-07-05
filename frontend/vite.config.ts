import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only: run the Vercel `/api` functions in-process so plain `vite` serves
// them too — no `vercel dev` needed. Production is unaffected: api/*.ts stay
// real Vercel serverless functions and vercel.json drives prod routing.
// Add a route here when you add a new /api file.
const ROUTES: Record<string, string> = {
  'auth/nonce': '/api/auth/nonce.ts',
  'auth/verify': '/api/auth/verify.ts',
  companies: '/api/companies.ts',
  employees: '/api/employees.ts',
  persons: '/api/persons.ts',
  me: '/api/me.ts',
}

function devApi(): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        try {
          resolve(raw ? JSON.parse(raw) : undefined)
        } catch {
          resolve(undefined)
        }
      })
      req.on('error', () => resolve(undefined))
    })

  return {
    name: 'sealary-dev-api',
    configureServer(server) {
      // Expose .env / .env.local (incl. DATABASE_URL, MASTER_KEY…) to the in-process handlers.
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const url = new URL(req.url, 'http://localhost')
          const file = ROUTES[url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')]
          if (!file) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'Not found' }))
          }
          const mod = await server.ssrLoadModule(file)
          // Adapt Node req/res into the Vercel-style shape the handlers expect.
          ;(req as unknown as { query: Record<string, unknown> }).query = Object.fromEntries(url.searchParams)
          ;(req as unknown as { body: unknown }).body = await readBody(req)
          ;(res as unknown as { status: (c: number) => unknown }).status = (c: number) => {
            res.statusCode = c
            return res
          }
          ;(res as unknown as { json: (b: unknown) => unknown }).json = (b: unknown) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(b))
            return res
          }
          await (mod.default as (q: unknown, s: unknown) => unknown)(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
