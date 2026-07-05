# Sealary — TODO

隐私薪资 dApp（Aleo）。设计见 [`TECH_DESIGN.md`](./TECH_DESIGN.md)。
状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成。优先级 P0（阻塞上线）> P1 > P2（硬化/加分）。

黑客松时间线：提交 2026-08-14 · Demo Day 8/15–16。

---

## ✅ 已完成

- [x] 技术设计文档（TECH_DESIGN.md，§1–15）
- [x] 合约 `sealary_pay.aleo`：`pay` / `prove_income` / `disclose` / `tier` / `tier_of`，`leo build` 通过
- [x] spike 验证原子 `pay`（跨程序 `transfer_private` 可行）
- [x] tier 分档边界 7/7（`contract/sealary/verify_tier.sh`）
- [x] 修正证明/披露可见性：`prove_income`/`disclose` 输出改 `public`、`threshold` 改公开输入，并公开 `employer`/`token_id`/`period`（防自造工资单伪造档位）；字节码验证 + 边界仍 7/7
- [x] 前端 UI（React+Vite，4 页，Sealary 亮色主题，UI-only）
- [x] 钱包集成迁移到 **provablehq**（`@provablehq/aleo-wallet-adaptor-*`）：Shield + Leo 双钱包 + 内置弹窗选择（`WalletModalProvider`），连接实测通过
- [x] Employee 的 prove/disclose 接真实 `executeTransaction`（record 用 `uid` 锚定；连钱包走链）
- [x] **前端全站去 mock**：删 `mock.ts`；Employer 花名册/公司来自 `lib/api`、余额尽力读链上；Employee 解密真实 Paystub（`requestRecords`）；Verify 凭 `prove_income` tx id 读公开输出（tier+employer+token+threshold，永不见金额）
- [x] **创建组织流程**（`/setup`）：输入 name/region/token_id → `TokenCard` 链上校验代币信息（拉不到禁用提交）→ 建组织
- [x] **金额口径统一**（`lib/units.ts` toBase/fromBase + u128→ascii，自检 5/5）：链上 base units、展示人类可读，pay/prove 两端同缩放
- [x] **后端脚手架**（`frontend/api/`）：schema（5 表）+ 服务端 AES-256-GCM PII 加密（自检 4/4）+ crypto-shred + SIWA 结构 + companies/employees/persons handlers + README。**未 provision、未端到端验**

---

## P0 · 链上上线（阻塞真实交易）

- [x] 浏览器装钱包（Shield）+ 弹窗选择连通；切 testnet
- [x] 账户 faucet 领测试 credits（领到 20 credits）
- [x] 部署合约 `sealary_pay.aleo` @ testnet（tx `at1ztq0dthhgfkpzt4exndge82n2xyu775hk7mhsqufr84jsj42qyzqc84p5s`，费 6.37 credits）
- [x] 注册薪资币 `zUSD`（token_id `7777field`, ext_auth=false；tx `at1zuhwv364dshz2x9krcu0paprld5tznrdycmsjzhyy084fvupzgzstvpfz5`）
- [x] `mint_private(zUSD, 雇主, 1e12)` 给雇主账户（tx `at1dl6dwx2zr83dukhxkaelel9cerg3utvem8fcutdgpwhujwu7rsfquj2ry9`）
- [ ] 端到端联调：连钱包 → Employee `requestRecords('sealary_pay.aleo', true, 'unspent')` 取到 Paystub → 用其 `uid` 走 `executeTransaction` prove/disclose 真实上链（**uid 锚定路径仅按类型实现，未真机验证**）
- [ ] 确认实际 execution 手续费，调 `lib/aleo.ts` 的 `FEE`

## P0 · 合约剩余

- [ ] `leo test` 阻塞项：token_registry 无 constructor 致本地测试链部署被拒 → 试 `--consensus-heights` 或自定义 devnet 恢复 `leo test`（当前用 `verify_tier.sh` 代替）
- [x] bootstrap 脚本：一键 register_token + mint（`contract/sealary/bootstrap.sh`，待真机广播验证）

## P1 · 前端剩余接线

- [x] Employer 发薪接 `payOpts`/`executeTransaction`（取未花费 zUSD Token uid 作 input；连钱包时**单笔链式**发下一个地址合法的员工，seed 假地址自动跳过；AddEmployee 支持粘贴真实地址）。金额用人类单位未按 decimals 缩放（与 threshold 同单位）。待真机验证
- [x] Verify 页接真实证明流（读 `prove_income` 公开输出，展示雇主/代币，校验来源）
- [~] 空态/错误态：未连钱包/未建组织/无 Paystub/token 校验失败 已覆盖；交易失败 toast 已覆盖
- [ ] Employer 「发行薪资币」UI（可选，把 bootstrap 的 register_token/mint 搬进前端；当前用脚本）
- [ ] 交易状态轮询（pending/finalized）+ 成功后刷新 records（现为乐观更新）

## P1 · 后端与合规（TECH_DESIGN §15；脚手架已落 `frontend/api/`（与前端同项目），见 BACKEND_PLAN）

- [x] Vercel Functions API 骨架（auth/companies/employees/persons handlers）
- [x] Postgres schema（company/person/employment/audit_log/encryption_keys）— `frontend/schema.sql`
- [~] Sign in with Aleo：nonce（无状态 HMAC）+ 会话 JWT 已写；**`verifyAleoSignature` 待用 `@provablehq/sdk` 落地**
- [x] PII 加密：AES-256-GCM per-person DEK + 证件号 HMAC（`frontend/api/_lib/crypto.ts`，自检 4/4）
- [x] 审计日志（append-only）+ 被遗忘权（crypto-shred + 级联删除，`persons.ts`）
- [ ] **Provision + 端到端联调**：Neon（EU）+ Vercel 部署 + env（MASTER_KEY/SESSION_SECRET）+ 前端 `api.ts` 换 fetch（变 async，调用点加 await）
- [ ] 处理器内所有权校验已做；RLS 行级安全留硬化

## P2 · 硬化 / 加分（TECH_DESIGN §14–15）

- [ ] `prove_income` 加验证者绑定 + nonce（防证明复用）
- [ ] 多期收入聚合证明
- [ ] KMS + 密钥轮换 + DPIA/DPA 文档
- [ ] 接主网 USDCx（替代 zUSD）作真实稳定币叙事
- [ ] 前端 E2E（Playwright：发薪→解密→证明→验证者看 tier 不见金额）
- [ ] 薪资单 PDF/CSV 导出（真实实现，当前为 toast）

## P2 · 黑客松提交

- [ ] 部署前端（Vercel）+ 拿到 Demo 站 URL
- [ ] 录 Demo 视频（60s：sealed → prove 得 tier 金额仍封 → disclose）
- [ ] 提交文档（README + 架构图 + 合约地址）

---

## 已知风险 / 决策记录

- 钱包生态：Shield 只在 provablehq（`@provablehq/aleo-wallet-adaptor-*`）生态，与旧 demox adapter 接口不兼容 → 整迁到 provablehq，用其 `react-ui` 内置弹窗（`WalletModalProvider`）。仍需 `--legacy-peer-deps`（React 19）
- provablehq Puzzle adapter 传递依赖 `@puzzlehq/types` 发布原始 `.ts`，撞 `erasableSyntaxOnly`/`verbatimModuleSyntax`，Vite 打包报错 → 暂不装 Puzzle（Shield+Leo 够用）；要加需 vite `optimizeDeps.exclude` 或放宽 tsconfig
- provablehq 交易/记录语义与 demox 不同：record 入参用 `{type:'record',program,recordname,uid}` 引用（uid 来自 `RecordEnvelope.uid`）；`connect(network)` 只收 network，decryptPermission/programs 移到 Provider
- `motion` 库在 React19+Vite8 下 `animate` 不触发 → 已改 CSS 入场动画
- Leo 4.x 语法（`fn`/`final`/`::`/`f.run()`/外部 async 返回 `Final`）见 TECH_DESIGN §6
- 装 leo 需 rustc ≥ 1.96
- 程序名改 `sealary` → `sealary_pay`：Aleo 命名空间费按名长收 `~10^(10−len)` credits，`sealary`(7)=1000 credits 部署不起；≥10 字符降到 1 credit。程序 ID 全量改（合约/前端 PROGRAM/文档），目录仍叫 `contract/sealary`
- 部署账户地址 `aleo1z62rhxmej9ldd9hf76xa6r5p2dm4fgvsxv90p728mrgzm4ywz5fqezlww8`（= 雇主 = zUSD admin）。私钥在 `contract/sealary/.env`（已 gitignore，勿提交）
