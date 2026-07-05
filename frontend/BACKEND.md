# Sealary 链下 API（Vercel Functions，与前端同一项目）

承载 PII / 雇佣关系 / 审计，实现 TECH_DESIGN §15、BACKEND_PLAN §3。**链下不存工资金额明文**——
salary 与姓名一同 AES-256-GCM 加密进 `pii_ciphertext`。

前端与 API 是**同一个 Vercel 项目**：Vite 应用（`src/` → `dist/`）+ serverless functions（`api/`）一起部署。

## 结构

```
frontend/
  src/            前端（Vite）—— tsconfig.app 只 include src，不碰 api
  api/            Vercel serverless functions（/api/*）
    auth/nonce.ts  auth/verify.ts
    companies.ts   employees.ts   persons.ts
    _lib/          共享库（_ 前缀，Vercel 不做路由）：crypto / db / siwa
  schema.sql      Neon 建表
  tsconfig.api.json  functions 的 typecheck（npm run typecheck:api）
```

## 状态

- ✅ **编译通过**：`npm run typecheck:api`（exit 0）。
- ✅ **已自检**：`api/_lib/crypto.ts`（AES-256-GCM 往返 / 密钥包裹 / crypto-shred / 篡改检测）。
- ✅ **本地端到端已验**（真实 Neon）：companies/employees 读写 + PII 加密解密往返 + 所有权 403 全通过。
- ⚠️ **待接线**：`api/_lib/siwa.ts` 的 `verifyAleoSignature` 需 `@provablehq/sdk`（aleo wasm）落地——**未验签前不要上生产**。

## 本地开发（无需 vercel dev）

`vite.config.ts` 的 `devApi()` 插件把 `api/*.ts` 挂进 Vite dev server，`npm run dev` 一个命令同时跑前端和 API。

1. `frontend/.env.local`（gitignored）填 `DATABASE_URL`（Neon）、`MASTER_KEY`（`openssl rand -base64 32`）、
   `SESSION_SECRET`（`openssl rand -hex 32`）、`ALLOW_DEV_AUTH=true`。
2. `npm run db:push` 建表（node 脚本，免 psql）。
3. `npm run dev` → API 在 `http://localhost:5173/api/*`。
4. **dev 免签名认证**：`ALLOW_DEV_AUTH=true` 时可用 `x-dev-wallet: <地址>` 头代替会话 token 调受保护端点
   （仅本地；生产绝不设 `ALLOW_DEV_AUTH`）。

## Provision（一次性）

1. **Neon**：Vercel 项目 → Marketplace → Neon Postgres（EU region）→ 自动注入 `DATABASE_URL`。
2. **建表**：`npm run db:push`（= `psql "$DATABASE_URL" -f schema.sql`）。
3. **环境变量**（Vercel Project → Settings → Environment Variables）：
   - `MASTER_KEY` = `openssl rand -base64 32`（32 字节主密钥）
   - `SESSION_SECRET` = `openssl rand -hex 32`
   - `DATABASE_URL`（Neon 集成自动注入）
4. **部署**：`vercel --prod`（项目根 = `frontend/`；Vite + api 一起构建）。本地带 functions 调试用 `vercel dev`。

## 端点

| 方法 · 路径 | 作用 |
|---|---|
| `POST /api/auth/nonce` | 发 nonce（无状态 HMAC）|
| `POST /api/auth/verify` | 验 nonce + Aleo 签名 → 会话 JWT |
| `GET/POST /api/companies` | 读/建 当前雇主的组织 |
| `GET/POST /api/employees?companyId=` | 花名册（解密 PII）/ 加员工（加密 PII）|
| `DELETE /api/persons?id=` | 被遗忘权：crypto-shred + 级联删除 |

除 auth 外均需 `Authorization: Bearer <session-jwt>`。

## 前端接线

`src/lib/api.ts` 现用 localStorage（同步）。接后端时把各函数改为 `fetch('/api/...')`（同源，无需
`VITE_API_URL`）+ 携带会话 token；届时函数变 async，调用点加 `await`。接口形状不变。

## 硬化（留产品阶段，§15.5）

RLS 行级安全、KMS 托管主密钥、密钥轮换（`encryption_keys.version`）、DPIA/DPA、渗透测试。
