# Sealary — 去 Mock · 创建组织 · 后端 落地方案

> 承接现状：合约已部署（`sealary_pay.aleo` @ testnet）、zUSD 已 register+mint、pay/prove/disclose 真机跑通。
> 缺口：前端多处 mock、无「创建组织」步骤、后端未实现。设计依据见 [`TECH_DESIGN.md`](./TECH_DESIGN.md) §15。
> 本文只排方案与顺序，不含实现代码。

---

## 1. 核心心智：链上 vs 链下，谁存什么

**这三块缺口是同一层的三个面。** 根因：链上**没有**「组织 / 花名册 / 雇佣关系 / 姓名」这些概念——按 §15 设计它们全是**链下 PII**。花名册之所以是 mock，是因为没有后端存它。所以「创建组织」和「去 mock」都以后端为前提，但**能从链上推出来的数据不需要后端**。

| 概念 | 存在哪 | 现状 |
|------|--------|------|
| 钱包地址、zUSD Token、Paystub record | 链上 | ✅ 已有 |
| 工资金额 | 仅链上加密 record | ✅ 已有（永不落链下） |
| 公司名 / 区域 / 花名册 / 雇佣关系 | 链下 Postgres | ❌ 无处存（→ mock） |
| 员工姓名 / 邮箱 / 证件号（PII） | 链下密文 | ❌ 无处存（→ mock） |
| 验证方请求 | 链下 or 临时 | ❌ mock |

---

## 2. 去 Mock 映射表（`frontend/src/lib/mock.ts` 逐项）

| mock 字段 | 真实来源 | 需后端？ | 归属 Phase |
|-----------|----------|:---:|:---:|
| `company.funded`（余额） | `requestRecords('token_registry.aleo','unspent')` 累加 zUSD Token.amount | **否** | 0 |
| `myStubs`（员工工资单） | `requestRecords('sealary_pay.aleo')` 解密 Paystub（amount/period/employer/token_id） | **否** | 0 |
| `me`（当前用户身份） | 钱包 `address` + 后端 `GET /me`（取姓名） | 部分 | 0→1 |
| `company`（名/区域/period） | 后端 `GET /companies/mine` | 是 | 1 |
| `employees`（花名册） | 后端 `GET /companies/:id/employees` | 是 | 1 |
| `verifyRequests` | 后端 `GET /verify-requests`（或演示态临时） | 是（可延后） | 1/2 |

> **Phase 0 关键结论**：Employee 页的工资单与余额**现在就能去 mock，零后端**——这是性价比最高的第一刀，让「发薪→员工看到真记录→证明」整条 demo 自洽。

---

## 3. 后端设计（§15 的操作化）

### 3.1 技术栈（沿用 §13）
- **Vercel Functions**（Node.js）——无状态 API 层。
- **Neon Serverless Postgres**（Vercel Marketplace，EU region）——自动注入连接串。
- **鉴权**：Sign in with Aleo（钱包 `signMessage`，provablehq `useWallet` 已暴露）。
- **加密**：Node `crypto` AES-256-GCM（PII）+ HMAC-SHA256（证件号索引）。

### 3.2 数据表（照搬 §15.2，标注用途）
```
company(id, employer_wallet, name, region, token_id, created_at)
  -- token_id = 链上注册的 zUSD field，链上链下的组织锚点
person(id, wallet_address, pii_ciphertext, key_ref, tax_id_hmac, created_at)
employment(id, company_id, person_id, role, status)      -- FK ON DELETE CASCADE
access_audit_log(id, actor_wallet, action, target_id, ts) -- append-only
encryption_keys(key_ref, wrapped_key, version, active)    -- per-person 密钥，被 env 主密钥包裹
```
新增点：`company.token_id`（§15.2 没有，这里加，作为组织 ↔ 链上薪资币的关联键）。

### 3.3 鉴权流程（SIWA，无密码）
```
POST /auth/nonce   { wallet } → { nonce }
  客户端：signMessage(nonce)
POST /auth/verify  { wallet, signature } → { sessionToken }   // 服务端验签发短期会话
```

### 3.4 API 端点（最小集）
| 端点 | 作用 | Phase |
|------|------|:---:|
| `POST /auth/nonce` · `POST /auth/verify` | SIWA 登录 | 1 |
| `POST /companies` | 创建组织（见 §4） | 1 |
| `GET /companies/mine` | 雇主看自己的组织 | 1 |
| `POST /companies/:id/employees` | 加员工（PII 加密存） | 1 |
| `GET /companies/:id/employees` | 花名册（去 mock） | 1 |
| `GET /me` | 员工看自己身份 | 1 |
| `DELETE /persons/:id` | 被遗忘权：crypto-shred（删 `encryption_keys` 行 + 级联） | 2 |

### 3.5 合规（GDPR）
表结构和 GDPR 条款映射见 §15.3，**不重复**。Phase 1 只需：加密存 PII + 审计日志 + EU region。硬化（KMS/密钥轮换/DPIA）见 §15.5，留产品阶段。

---

## 4. 创建组织流程（决策 4：雇主自带薪资 token_id）

**代币发行与建组织解耦**。薪资币的 `register_token` + `mint` 是**前置动作**，不塞进建组织流程；建组织时雇主**输入一个已存在的薪资 token_id**（field，如 `7777field`），组织只是引用它。多个组织可引用同一 token_id（不强制每组织独立）。

**前置（一次性，独立）**：`register_token` + `mint_private` 用 `bootstrap.sh`（已实现）或一个独立「发行薪资币」动作产出 `token_id`。

**建组织流程**：
```
1. 连钱包 → SIWA 登录
2. 输入：公司名、区域、薪资 token_id
3. 【必做·前端链上校验】输入 token_id 即拉取代币信息、渲染卡片；拉不到则报错、禁用提交（见 §4.1）
4. POST /companies { name, region, token_id } → 存公司行，绑定 employer_wallet + token_id
5. 完成：Employer 页 company 从 GET /companies/mine 读，pay 用该 token_id 的 Token record 作 input
```
> `company.token_id` = 用户输入值（非平台生成）。TODO P1「Employer 注册/铸币 UI」降级为可选的独立「发行代币」步骤，不阻塞建组织。

### 4.1 token_id 前端校验（纯前端 + 链上读，零后端，可最先落）

输入/失焦 token_id → `GET {ENDPOINT}/testnet/program/token_registry.aleo/mapping/registered_tokens/<token_id>`：

- **拉到（200 + 非 null）**：返回是 Aleo struct 明文串，解析出字段并渲染「代币确认卡」——
  `{ token_id, name, symbol, decimals, supply, max_supply, admin, external_authorization_required }`。
  - `name`/`symbol` 是 **u128 编码的 ASCII**（如 `1146312058u128` = "zUSD"），需一个 `u128→ascii` 小工具解码展示。
  - 展示 symbol / decimals / admin，让雇主肉眼确认「这是我的薪资币」。（可再校验 `admin == 当前钱包` 给个「你是该币 admin」的标记，非强制。）
- **拉不到（404 / null）**：红字提示「该 token_id 未在 token_registry 注册，请检查」，**禁用「创建组织」按钮**。
- 边界：空输入不请求；防抖；请求失败（网络）与「未注册」区分文案。

> 实测返回样例（zUSD, token_id `7777field`）：`{ token_id: 7777field, name: 1146312058u128, symbol: 1146312058u128, decimals: 6u8, supply: …, max_supply: …, admin: aleo1z62… }`。

### 4.2 金额单位口径（已定：链上 base units，展示人类可读）

标准代币口径（同 USDC）：**链上一律 base units（`人类值 × 10^decimals`），展示层一律 `÷ 10^decimals` 转人类可读**。`decimals` 来自 §4.1 的代币信息（建组织时取，随 `company` 存或按 token_id 复查）。

**必须同口径的每个触点**（Phase A 要一起改）：

| 触点 | 现状 | 改为 |
|------|------|------|
| Employer `pay` amount | 人类值未缩放（`payOpts(uid, addr, salary, …)`，有 `ponytail:` 注释） | `salary × 10^decimals`（base units） |
| Employee/Verify `prove_income` threshold | 人类值 | **`threshold × 10^decimals`**（关键：不缩放则 `amount(base) ≥ threshold(human)` tier 算错） |
| `disclose` 读回的 amount | — | 公开输出是 base units，展示 `÷ 10^decimals` |
| Paystub 展示（去 mock 后） | mock 人类值 | `requestRecords` 解密得 base units，`÷ 10^decimals` 展示 |
| 余额 / funded 展示 | mock 人类值 | Token.amount 是 base units，`÷ 10^decimals` 展示 |

> tier 正确性：`tier_of` 比的是 amount 与 threshold 的**比值**（T、1.1T、2T），只要两者**同为 base units**，比值不变、tier 完全一致——所以合约无需改，只要前端两端同缩放。
> 收敛点：加一个 `toBase(human, decimals)` / `fromBase(raw, decimals)` 工具，所有金额进出链都过它，杜绝散落的缩放。

**加员工**（组织建成后）：
```
employer 填 姓名/职位/PII + 员工钱包地址 → 前端 AES 加密 PII（或服务端加密）
  → POST /companies/:id/employees { wallet_address, pii_ciphertext, role }
  → 员工地址即 pay 的收款方（已接线），花名册从后端读
```

---

## 5. 落地分期（决策 1：一次性上后端）

一次性交付 = 下面 A 一个大 push（含链上去 mock + 后端 + 建组织），B 紧随，C 列路线图。

| 阶段 | 内容 | 验收 | 估时 |
|:---:|------|------|------|
| **A** | ① 链上去 mock：Employee 工资单（`requestRecords` 解密 Paystub）+ 余额<br>② 后端地基：Neon + Vercel + SIWA + schema<br>③ 建组织流程（雇主输入 token_id）+ 加员工（服务端加密 PII）<br>④ `company`/`employees` 去 mock（读后端） | 新雇主能登录→建组织→加员工→发薪；Employee 看真实 Paystub；全页无 mock（除 verifyRequests） | ~数天 |
| **B** | 合规硬化：审计日志 + crypto-shred（被遗忘权）+ RLS + HMAC 查询 | 删员工后密文不可解；PII 全程密文；越权被 RLS 拦 | ~2 天 |
| **C** | KMS / 密钥轮换 / DPIA；防证明复用 = `prove_income` 加 `verifier`+`nonce` 绑定（②，改合约、**无需 DB**）；verifyRequests 落库（③，收件箱/看板，可选） | §15.5 硬化清单 + 防复用 | 产品阶段 |

> A 阶段里「链上去 mock」不依赖后端，可最先落、边搭后端边并行。verifyRequests 走临时态（决策 3），不入 A。

---

## 6. 决策记录（已定）

1. ✅ **一次性上后端**：不分 Phase 0 先行，A 阶段一个 push 交付（含链上去 mock + 后端 + 建组织）。
2. ✅ **PII 加密在服务端**：密钥不进浏览器，标准做法。
3. ✅ **verifyRequests 临时态**（验证方现填 threshold → 员工当场 `prove_income` → 读链上 tx 的 tier），**不落库**，不入 A。
   > 更正前述「落库才能防复用」——**nonce 绑定 ≠ 数据库**。防证明复用（防旧证明/跨验证方复用）可用「验证方现场生成 nonce → 链接/二维码传给员工 → `prove_income` 带 `verifier`+`nonce` 公开入参 → 验证方核对链上 nonce」实现，**零后端**，只需一次合约改动（记为 ②，见 §5-C）。落库（记为 ③：员工收件箱 / 验证方看板 / 服务端签发 nonce）是产品打磨，与 ② 可分开、均放 C。黑客松只做临时态 ①。
4. ✅ **雇主自带薪资 token_id**：代币发行（register+mint）与建组织解耦，建组织时输入已存在的 token_id，不强制每组织独立 token。见 §4。
```
