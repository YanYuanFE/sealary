# 隐私薪资 · Confidential Payroll on Aleo — 技术设计文档

> **项目名**: **Sealary**（Seal + Salary，"密封的薪资"）
> **程序 ID**: `sealary_pay.aleo`
> **赛道**: PAY（可将底层原语抽库双投 DEV）
> **一句话**: 工资默认全隐，员工可用零知识**证明"月薪 ≥ X / 收入等级"而不暴露具体数字**，也可向指定第三方**定向披露**整条薪资单。
> **文档状态**: v0.1 设计稿。文中 Leo 代码为**示意**，确切语法在脚手架阶段对着已安装的 Leo 版本敲定。

---

## 1. 定位与竞品差异

对标 Zama 生态三个获奖薪资项目（Paychain / DripPay / PayProof），它们都基于 **FHE**（链上密文计算）。本项目基于 **Aleo ZK**（链下计算 + 链上验证证明），据此扬长避短：

| 能力 | FHE 三家的做法 | 本项目（Aleo）的做法 | 谁更省力/更强 |
|------|----------------|----------------------|----------------|
| 收入证明（≥门槛 + 分档） | PayProof 用 Oracle 合约 + relayer + 密文句柄，工程量大 | 一个 transition 输入私有 record、输出 tier，天然 ZK | **Aleo 更简洁**，这是我们的核心差异化 |
| 选择性披露（给银行看整条工资单） | 三家都没做干净 | `prove_income`（零知识分档）+ `disclose`（明文），逐条本人授权 | **Aleo 原生优势** |
| 加密余额连续累加（流式发薪） | DripPay/PayProof 用 `FHE.add` 按秒累积 | Aleo 是 UTXO/record 模型，无可变加密余额 | **FHE 更顺**，我们改成周期批量发 record（见 §14） |

**取胜逻辑**：不硬抄 FHE 的流式累加；把力气全压在 Aleo 更擅长、且是评委记忆点的**「可证明的收入凭证 + 选择性披露」**上，配合双角色/三角色完整闭环和完成度信号（testnet 部署、`leo test`、薪资单导出）。

**价值层用真实代币（route A）**：薪资以 **Token Registry（`token_registry.aleo`，ARC-21）** 的私密 `Token` 承载，而非自造 record token——在 testnet 上 `register_token` + `mint_private` 一个测试稳定币（如 `zUSD`）即可，对外可讲"用隐私稳定币发薪"（对标主网 USDCx）。凭证层仍用本程序自有的 `Paystub`（见 §5）。

---

## 2. 问题与「承重墙」

- 透明链上所有转账金额公开 → 工资是最敏感的个人财务数据，全网可见是现实级 dealbreaker（同事互查、竞对情报、大额账户成靶）。
- 但完全隐藏又无法满足**收入证明**（租房、贷款、签证）和**审计合规**的现实需求。

**承重墙**：既要「金额对公众/同事不可见」，又要「本人能向特定第三方证明收入满足条件、或定向出示」。去掉 ZK，这个组合在透明链上不成立 —— 这正是评委第一刀要看的"隐私是不是刚需"。

---

## 3. 设计原则

1. **金额永不进公开状态**：Aleo 的 `async function`/finalize 输入是公开的。绝不把工资金额写进公开 `mapping`（否则个人金额以公开增量泄露）。金额全程留在私有 `record` 内。
2. **默认全隐，披露靠"证明"或"授权"**，不靠"公开累加"。
3. **逐条授权**：披露以单条薪资单为粒度，不共享整把 view key（那会泄露全部记录）。
4. **最小可跑优先**：链上 v1 聚焦三件事（发薪 / 证明 / 披露）；流式、Vesting 列入 §14 扩展。合规后端（§15）用托管服务分阶段落地，硬化项（KMS/密钥轮换）留产品阶段。

---

## 4. 系统架构

```
┌────────────────── 客户端（React + Vite）──────────────────┐
│   /employer          /employee            /verify         │
└──┬──────────────────────────────────────────┬────────────┘
   │ 链下 API（HTTPS）：PII / 雇佣 / 审计        │ 链上（wallet-adapter）：真钱 + ZK 证明
┌──▼───────────────────────────────────────┐ ┌──▼──────────────────────────────────┐
│  Vercel Functions (Node.js, Fluid Compute) │ │  Aleo 网络                           │
│   · Sign in with Aleo 验签                  │ │   · 验证 ZK 证明                      │
│   · 加密 PII 读写（AES-256-GCM）            │ │   · token_registry Token（真实薪资币）│
│   · 审计日志 / 级联删除 + crypto-shredding   │ │   · Paystub records（收入凭证）        │
│         │  RLS 行级安全                     │ │   · 公开 mapping（仅非敏感元数据）      │
│  ┌──────▼───────┐  PII 密文 / HMAC 索引     │ └──────────────────────────────────────┘
│  │ Postgres (EU) │  链上只存钱包地址(最小化) │
│  └──────────────┘                          │
└────────────────────────────────────────────┘
```

- **链上（Leo `sealary_pay.aleo` + `token_registry.aleo`）**：核心 transition + 真钱 Token + 凭证 record + 少量公开 mapping。
- **前端（React + Vite + wallet-adapter）**：三角色 UI，触发 transition、用 view key 解密 record。
- **链下后端（Vercel Functions + Postgres）**：承载 PII、雇佣关系、审计与 GDPR 合规（详见 §15）。**链上永不存 PII**（数据最小化），链下永不存工资金额（金额只在链上加密 record 里）—— 二者互补、各自最小化。

---

## 5. 链上数据模型

**两层设计**：价值层用 `token_registry.aleo`（ARC-21，route A）承载真实薪资代币；凭证层用本程序自有的 `Paystub` record 承载"可证明的收入凭证"。二者在 `pay` 中用同一个 `amount` 原子绑定。

### 5.1 价值层（来自 `token_registry.aleo`，不由本程序定义）

- 薪资以注册表的私有 `Token` record 持有（约为 `{ owner, amount, token_id, ... }`），employer→employee 用 `transfer_private` 私密转账，金额链上不可见。
- **不自己造资金池 record**（原 `Budget` 删除）：雇主的可发额度 = 他持有的 registry `Token`。
- 需一次性 bootstrap（链下脚本/一次交易）：`register_token` 注册一个测试薪资币（如 `zUSD`）→ `mint_private` 给雇主。

### 5.2 凭证层（本程序 `sealary_pay.aleo` 自有的 record）

```leo
// 工资单凭证：可反复用于证明/披露，独立于可花费的薪资代币
record Paystub {
    owner: address,     // 员工地址
    employer: address,  // 雇主地址（证明来源）
    token_id: field,    // 对应的注册表 token
    amount: u128,       // 工资金额（私有，链上不可见；与 registry Token 同为 u128）
    period: u32,        // 期数，如 202607
}
```

> Paystub 是**独立凭证**，不是薪资代币本身。这样员工能反复出示/证明收入，而**无需动用（花掉）工资**——这也是不直接拿 registry `Token` 做证明的原因。

### 5.3 为什么没有任何公开 mapping

本项目**刻意零公开 mapping**。任何公开累加（如 `total_paid: period => u64`）都会把个人金额泄露成链上增量 —— 这是与 FHE 版本最大的设计差异，也是隐私正确性的关键。三个核心功能（发薪/证明/披露）全部只经私有 record，`pay` 因此是纯 transition、无需 async/finalize，也更简单。总额审计改由链下（§15）或未来聚合证明完成。

> 推论：`pay` 不写任何公开状态，链上除了加密 record 与手续费，观察者拿不到任何**金额**信息。
> 但**无法隐藏元数据**：每笔交易的 program ID + function name 公开，观察者能看到 `sealary_pay.aleo/pay` 被调用了 N 次及其时间分布，即发薪笔数、节奏与大致员工规模——金额不漏，元数据漏。要连元数据也隐藏需混淆/批量聚合，列扩展。

---

## 6. 程序接口（transitions）

价值层直接复用 `token_registry.aleo` 现有函数（`register_token` / `mint_private` / `transfer_private`）；本程序只加"绑定 + 凭证 + 证明/披露"。

| Transition | 输入 | 输出 | 作用 |
|-----------|------|------|------|
| `pay`（**async**） | employer 的 `Token`, `to`, `amount: u128`, `period` | `(Token 找零, Token 到账, Paystub, Future)` | 原子发薪：跨程序调 `transfer_private` 转真钱 + 用**同一 `amount`** 铸 `Paystub` 凭证；透传 registry 的 Future |
| `prove_income` | `p: Paystub`, `public threshold: u128` | `(public u8 tier, public address employer, public field token_id, public u32 period, Paystub)` | 收入证明，只出等级：0=不达标,1=C(≥T),2=B(≥1.1T),3=A(≥2T)。**门槛与雇主/代币/期数一并公开**，验证者才能确认"该档位是针对自己给定的门槛、由可信雇主签发的指定代币工资单算出"（否则可用 threshold=1 或自造代币空气工资单伪造高档）；**回吐同一 Paystub 给 owner** |
| `disclose` | `p: Paystub` | `(public u128 amount, public u32 period, public address employer, public field token_id, Paystub)` | 明文披露金额+期数给第三方，并公开雇主+代币以证明"由某可信雇主签发"；回吐 Paystub |

> record 作为输入即被消费（生成 serial number），所以 `prove_income`/`disclose` 必须把**同一 Paystub 重新产出**给 owner，否则凭证会被"用掉"。

**实现（已编译通过 → Aleo instructions；完整见 `contract/sealary/src/main.leo`）**：

```leo
import token_registry.aleo;

// 分档纯逻辑：module-level helper（非 entry，可被 entry 调用；4.2.0 里顶层 fn 即私有 helper）
// 无溢出：加法用 threshold/10，乘法前不放大。0=不达标,1=C,2=B(≥1.1T),3=A(≥2T)
fn tier_of(amount: u128, threshold: u128) -> u8 {
    let tier: u8 = 0u8;
    if amount >= threshold { tier = 1u8; }
    if amount >= threshold + threshold / 10u128 { tier = 2u8; }
    if amount >= threshold * 2u128 { tier = 3u8; }
    return tier;
}

program sealary_pay.aleo {
    @noupgrade
    constructor() {}

    record Paystub {
        owner: address, employer: address, token_id: field, amount: u128, period: u32,
    }

    final fn settle(f: Final) { f.run(); }   // 组合外部 transfer_private 的 Final

    // 原子发薪：真钱私密转账 + 铸造收入凭证（同一 amount 绑定二者）
    fn pay(input: token_registry.aleo::Token, to: address, amount: u128, period: u32)
        -> (token_registry.aleo::Token, token_registry.aleo::Token, Paystub, Final) {
        // transfer_private(recipient, amount, input) -> (找零→owner, 到账→recipient, Final)
        let (change, recv, f): (token_registry.aleo::Token, token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private(to, amount, input);
        let stub: Paystub = Paystub {
            owner: to, employer: self.signer, token_id: input.token_id,
            amount: amount, period: period,
        };
        return (change, recv, stub, final { settle(f); });
    }

    // 收入证明：公开输出 等级+雇主+代币+期数（threshold 亦为公开输入），回吐凭证（委托 tier_of）
    // 公开雇主/代币是防伪的承重设计：验证者据此核对签发方与币种可信，否则档位可自造。
    fn prove_income(p: Paystub, public threshold: u128)
        -> (public u8, public address, public field, public u32, Paystub) {
        return (tier_of(p.amount, threshold), p.employer, p.token_id, p.period, p);
    }

    // 选择性披露：公开金额+期数+雇主+代币，回吐凭证
    fn disclose(p: Paystub)
        -> (public u128, public u32, public address, public field, Paystub) {
        return (p.amount, p.period, p.employer, p.token_id, p);
    }

    // 纯工具 entry：明文算等级（前端预览 + 单测入口，无隐私泄露）
    fn tier(amount: u128, threshold: u128) -> u8 {
        return tier_of(amount, threshold);
    }
}
```

> ✅ **Spike 结论（编译验证，2026-07）**：原子 `pay` **成立**。字节码含 `call token_registry.aleo/transfer_private ...` + `async pay ... finalize`，跨程序消费雇主 Token 并组合外部 future 均通过。**不需要两步兜底。** 授权层面也无障碍：`transfer_private` 无 `self.caller`/`self.signer` 校验，找零回 `input_record.owner`，记录消费只取决于雇主（签名者）。
>
> **Leo 4.x 语法要点（本次 spike 摸清）**：`transition`→`fn`；链上逻辑放 `final { }` 块、可提取为 `final fn`；外部引用用 `::`（非 `/`）；外部 async 调用返回 **`Final`**，用 `f.run()` 组合；每个 program 需一个 `@noupgrade constructor() {}`；装 leo 需 rustc ≥ 1.96。

---

## 7. 核心流程

**Bootstrap（一次性）**
```
token_registry.aleo/register_token(zUSD, ..., external_authorization_required=false)
    → 注册测试薪资币；false = 转账无需外部授权方批准（关键，否则每笔转账都要额外审批）
token_registry.aleo/mint_private(zUSD, 雇主, 总额) → 雇主得到一枚 Token（amount: u128）
```

**发薪（雇主）**
```
for 每个员工: sealary_pay.aleo/pay(雇主的 Token, 员工地址, 金额, 期数)
             → (员工 Token, 找零 Token, Paystub_i)
链上只见：N 次私密转账 + N 条加密 Paystub，无任何公开金额
（用找零 Token 作为下一次 pay 的 input，链式发薪）
```

**查看工资（员工）**
```
钱包连接 → view key 解密：
  · registry Token → 实际到账余额（可花费）
  · Paystub        → 工资凭证（金额+期数，用于证明/披露）
仅本人可见
```

**收入证明（员工 → 验证者）**
```
验证者在 /verify 提交 threshold
员工用某条 Paystub 执行 prove_income(p, threshold) → 链上可验证输出 tier
验证者只学到：等级(A/B/C 或不达标)；永远不知道确切金额
```

**选择性披露（员工 → 银行）**
```
员工对指定工资单执行 disclose(p) → 公开 (amount, period)，且证明这是本人持有的真实工资单
比 prove_income 更强：直接给出数字，但仍是逐条、本人授权、可验证来源
```

---

## 8. 隐私模型矩阵

| 数据 | 公众/同事 | 本人 | 指定第三方 | 机制 |
|------|:---:|:---:|:---:|------|
| 个人工资金额（未披露） | ❌ | ✅ | 视授权 | Paystub record 加密 |
| "月薪 ≥ 门槛 / 等级" | ❌ | ✅ | ✅（经证明） | `prove_income` 公开 tier + 雇主 + 代币 |
| 整条工资单（**一经 disclose**） | ⚠️ 金额可见，身份不关联 | ✅ | ✅（可关联身份） | `disclose` 公开 amount/period/雇主/代币 |

> ⚠️ **disclose 是不可逆的公开操作，非"定向发送"**：其公开输出永久写入公链，全世界可见。公众看到的是"某雇主签发的一笔 amount+period"，但**不含员工地址**（owner 不在公开输出里），故金额可见而身份不关联；只有拿到该 txId 的指定第三方（银行）才能把它对上具体的人。因此 disclose 应作为员工对单条工资单的**审慎、一次性**动作，而非默认披露路径——日常走 `prove_income`（只出档位、金额永不落公开）。
>
> **与 §15 GDPR 的张力（如实标注）**：链上明文金额一旦 disclose 即**永久不可删**，被遗忘权（crypto-shredding）只能覆盖链下 PII，覆盖不到已 disclose 的链上金额。产品化需在 UI 明确告知"此操作不可撤销、金额将永久上链"，并把 disclose 限定在用户显式、单条、知情同意的场景。

---

## 9. 选择性披露设计（差异化重点）

三档披露强度，全部**逐条、本人授权、可验证来源**：

1. **零知识门槛证明** `prove_income` —— 逐条、只证"够不够/什么档"，最隐私。用于租房/信用初筛。
2. **可验证明文披露** `disclose` —— 逐条、本人主动公开某条工资单的确切金额，且证明其为真实、由某雇主签发。用于贷款正式核验。
3. **（扩展）全量审计 view-key 移交** —— 注意 Aleo view key 一解即**全部**记录，做不到"只解一条"。所以这一档只用于**监管全量审计**（监管本就要看全），日常逐条披露走 1/2，不动 view key。

> FHE 三家止步于"本人门户解密自己"，第三方要么看不到、要么只有一个 bool。我们提供**「零知识证明 ↔ 明文披露」两级、逐条授权**（全量审计另作监管专用档），这是 Aleo view-key 模型的天然优势，也是本项目的记忆点。

---

## 10. 前端（三角色）

| 路由 | 角色 | 功能 |
|------|------|------|
| `/employer` | 雇主 | 注册/铸造薪资币（Token Registry）、加员工、批量发薪、**发薪当次**导出本批薪资单 PDF/CSV |

> **导出的数据从哪来（解决"链下不存金额"的矛盾）**：`pay` 的产物（到账 Token、Paystub）都加密给**员工**，雇主事后**无法**从链上重新解出历史金额（发送方只在构造交易那一刻持有明文）。因此 v1 的导出限定在**发薪当次**：前端此刻本就持有整批 `{to, amount, period, token_id}` 明文，直接生成 CSV/PDF，**既不违反"链下永不存金额"，也无需事后解密**。
>
> **升级路径（产品阶段）**：若雇主需长期、跨设备的发薪历史，给 `pay` 增加一个 `owner = employer` 的回执 record（如 `PayReceipt { owner: employer, to, amount, token_id, period }`）——金额留在**链上加密**、由雇主用自己的 view key 解密，仍守住"链下零金额"承重墙。这比"把金额落到链下 DB"干净得多，故不选后者。列 P2。
| `/employee` | 员工 | 自动发现雇佣关系、view key 解密工资、生成收入证明、授权披露 |
| `/verify` | 第三方 | 提交门槛、接收 tier 结果、（可选）接收披露的明文工资单 |

栈：React + Vite + React Router（客户端路由，上述 `/employer` 等为 SPA 路由）+ **shadcn/ui**（Tailwind + Radix，CLI 复制组件，无运行时依赖）+ `@demox-labs/aleo-wallet-adapter`（或官方 wallet-adapter）+ Aleo SDK（record 解密、transition 调用）。

---

## 11. 测试计划

**分档逻辑（唯一会算错的地方，重点覆盖）**：抽成纯 helper `tier_of(amount, threshold)`，
经公开 entry `tier` 暴露给测试。边界 7 用例：`99→0, 100→C, 109→C, 110→B, 199→B, 200→A` +
大数不溢出。**已 `leo run` 验证 7/7 通过**（`contract/sealary/verify_tier.sh`）。

**其余靠 `leo build` 保证**：`pay`（已由 spike 编译验证跨程序调用 + Final 组合）、
`prove_income`/`disclose`（record 外壳，纯取字段/委托 tier_of，无独立逻辑）。

> ⚠️ **`leo test` 暂不可执行**：`tests/test_sealary.leo` 能编译，但 `leo test` 在本地测试链
> 部署依赖 `token_registry.aleo` 时被拒（该线上程序无 constructor，违反 V9 规则）。
> 故边界验证走 `leo run`（`verify_tier.sh`）。待 leo 升级或配置自定义 devnet 后切回 `leo test`。
> 另注：测试程序**无法构造外部 record**（`Paystub` 只能由 `sealary_pay.aleo` 自身创建），
> 这也是分档逻辑走 `tier` 纯 entry、而非直接测 `prove_income` 的原因。

**前端 E2E（Playwright，少量关键路径）**：发薪→员工解密→生成证明→验证者看到 tier 但看不到金额。

---

## 12. 里程碑（6 周）

| 周 | 目标 | 验证标准 |
|----|------|----------|
| 1 | ~~spike 跨程序 `transfer_private`~~ ✅ 已完成（原子成立）+ 写 `sealary_pay.aleo` 三 fn | `leo build` 通过、`leo run` 各跑通一次 |
| 2 | `leo test` 全绿（含边界值） | 上述测试用例全过 |
| 3 | 前端骨架 + wallet-adapter + `/employer` 发薪 | 能对真实测试网地址发薪、链上生成 record |
| 4 | `/employee` 解密 + 收入证明 | view key 解密工资、`prove_income` 端到端 |
| 5 | `/verify` + `disclose` + 薪资单导出 | 三角色闭环、导出 PDF/CSV |
| 6 | 部署 testnet + 打磨 + 录 Demo + 提交文档 | 有部署地址、Demo 站、演示视频 |

> 上表是**ZK 核心闭环**的 6 周线。真实产品的**合规后端（§15）**另计约 2–3 周：可与前端并行（专人负责），或作为黑客松后的产品阶段。黑客松交付建议 = ZK 核心 + 最小合规后端（钱包登录 + 加密 PII + 审计 + 可删除），其余硬化进路线图。

---

## 13. 技术栈

| 层 | 选型 |
|----|------|
| 合约 | Leo（`sealary_pay.aleo`）→ Aleo instructions |
| 依赖程序 | `token_registry.aleo`（ARC-21，价值层，`leo add` 引入）|
| 网络 | Aleo Testnet（transition 手续费需 faucet 领测试 credits）|
| 前端 | React + Vite + React Router + TypeScript + Tailwind + shadcn/ui |
| 链接入 | Aleo Wallet Adapter + Aleo SDK（record 解密 / 证明生成 / transition 提交） |
| 后端 API | Vercel Functions（Node.js, Fluid Compute）|
| 数据库 | Postgres via **Vercel Marketplace → Neon Serverless Postgres**（原生集成，自动注入连接串；EU region；RLS 行级安全）|
| 鉴权 | Sign in with Aleo（钱包签名验签，无密码）|
| 链下加密 | Node `crypto`：AES-256-GCM（PII）+ HMAC-SHA256（可搜索索引）|
| 测试 | `leo test`（合约）+ Playwright（前端关键路径）+ API 单测 |

---

## 14. 范围外 / 扩展 / 风险

**v1 明确不做（YAGNI，避免做不完）**：
- **流式发薪**：Aleo UTXO 模型不适合连续累加。用"周期批量发 record"近似；真要流式，扩展期用"链下计时 + 定期结算"。
- **Vesting 金库、多签**：PayProof 的加分项，v1 不做。
- **价值层选型（已定 route A）**：v1 用 **Token Registry** 在 testnet 自 mint 一个测试稳定币 `zUSD` 做真实私密发薪；对标主网 **USDCx**（Circle，机构级，2026-01 上主网，testnet 不可用故本地模拟）。**兜底**：若跨程序集成受阻（见风险），退回自发 record token 作为价值层，凭证层不变。
- **GDPR 合规（改为分阶段做，见 §15）**：产品目标要求这套。用托管服务（Postgres RLS + Node crypto + 钱包鉴权）把它变成配置而非重写；v1 交最小合规后端，密钥轮换/KMS/DPIA 留产品硬化阶段。
- **多期收入聚合证明**：v1 只对单条工资单证明；聚合需把多条 record 传入一个 transition 或用累加器 record，列扩展。
- **收入证明的出示人绑定/新鲜性（v1 仍开放）**：`prove_income` 现已公开 `employer`/`token_id`/`period`，堵住了"自造空气工资单伪造高档"（验证者核对签发雇主与币种），但**未绑定"回应某验证者的某次请求、且出示人 = 凭证持有者"**——理论上员工 A 可出示有钱同事 B 的历史证明交易（交易不公开执行者身份）。收入场景影响有限（借来的高收入证明对 A 无实益且易穿帮），产品化时加 `public verifier: address` + `public nonce: field` 入参并公开回吐即可绑定（参考 PayProof 绑 `msg.sender`）。列 P2。

**风险**：
- ~~跨程序 `transfer_private` 所有权语义~~ → ✅ **已 spike 编译验证，原子 `pay` 成立**（见 §6），两步兜底不需要。
- 私隐薪资是 PAY 赛道较明显的点子，可能撞车 → 靠 `prove_income` 分档 + `disclose` 两级披露 + 完成度分层取胜。
- Leo 语法/工具链首次上手成本 + Token Registry 接口对齐 → 第 1-2 周预留调试缓冲。
- 整数分档溢出/整除误差 → 测试覆盖边界值。

---

## 15. 后端与合规（GDPR）—— 面向真实产品

目标从"黑客松 demo"升级为"真实薪资 SaaS 产品"，需要链下后端承载 PII、雇佣关系与合规。核心原则：**用托管服务把 GDPR 的大部分变成配置而非代码**；auth、DB 安全、加密算法一律用成熟件，不自造（安全/合规属于"绝不为省事而简化"的部分，但实现要懒）。

### 15.1 职责边界（双向数据最小化）

| | 链上（Aleo） | 链下（Postgres） |
|---|---|---|
| 存什么 | 钱包地址、加密 Token、Paystub 凭证、公开元数据 | 姓名/邮箱/证件号等 PII（密文）、雇佣关系、审计日志 |
| **不**存什么 | 任何 PII | 任何工资金额明文 |
| 隐私手段 | ZK record 加密 | AES-256-GCM + RLS |

工资金额只活在链上加密 record；身份 PII 只活在链下密文 —— 任何一侧被攻破都拿不到完整画像。

### 15.2 链下数据模型（PII 全部加密存储）

```
company(id, employer_wallet, name, region)
person(id, wallet_address, pii_ciphertext, key_ref, tax_id_hmac, created_at)
employment(id, company_id, person_id, role, status)     -- FK ON DELETE CASCADE
access_audit_log(id, actor_wallet, action, target_id, ts)  -- append-only
encryption_keys(key_ref, wrapped_key, version, active)  -- per-person 密钥，被主密钥包裹
```

- `pii_ciphertext`：姓名/邮箱/证件号打包后 AES-256-GCM 加密，密钥是该 person 的 per-person key。
- `tax_id_hmac`：证件号的 HMAC-SHA256，用于"按证件号查人"而不存明文。
- 链上钱包地址是链上链下的关联键。

### 15.3 GDPR 条款 → 实现映射

| GDPR 要求 | 实现 | 阶段 |
|-----------|------|------|
| Art.25 隐私设计 | 默认加密、链上无 PII、链下无金额 | v1 |
| Art.32 安全 | AES-256-GCM 静态加密 + TLS 传输 + RLS 访问控制 | v1 |
| Art.17 **被遗忘权** | **crypto-shredding**：删该 person 的 `encryption_keys` 行 → 密文永久不可解；配合 `ON DELETE CASCADE` 清雇佣/关联 | v1 |
| Art.5(2) 可问责 | `access_audit_log` 记录所有 PII 访问（append-only） | v1 |
| 访问控制 | Postgres RLS（按 wallet/role 隔离行）+ 处理器内所有权校验 | v1 |
| 数据可搜索不泄露 | 证件号用 HMAC 索引，不存明文 | v1 |
| 数据驻留 | DB 选 EU region | v1（选区即可） |
| 密钥轮换 | `encryption_keys.version` 追踪，滚动重加密 | 硬化 |
| 密钥管理 | 主密钥从 env var 迁 KMS（AWS KMS/供应商） | 硬化 |
| DPIA / DPA / 渗透测试 | 文档 + 第三方 | 硬化 |

> **crypto-shredding 为什么优于物理删除**：分布式系统里备份/副本很难保证物理擦净；只要 per-person 密钥销毁，所有副本里的密文都同时失效且**可向监管证明**已不可解。

### 15.4 鉴权：Sign in with Aleo

无密码。用户用钱包对后端下发的 nonce 签名 → 后端用其 Aleo 地址验签 → 发短期会话 token。好处：不存密码、不存额外 PII、天然与链上身份一致。

### 15.5 v1（黑客松）做多少 vs 产品硬化

- **v1 必做**：钱包登录、加密 PII 存取、审计日志、级联删除 + crypto-shred、RLS、HMAC 查询、EU region。这些靠托管服务 + 少量 helper 就能落地。
- **产品硬化（后续）**：KMS、密钥轮换、DPIA/DPA 文档、备份加密、渗透测试、SOC2 之类。
- ⚠️ **时间提醒**：这层给原 6 周排期额外加约 **2–3 周**。建议：黑客松阶段优先交付 **ZK 核心（发薪/证明/披露）+ 最小合规后端**，把硬化项明确列为产品路线图；评委看到"合规是设计进去的、且有清晰硬化计划"，比硬塞半成品 KMS 更值分。

---

## 附录 A：与 FHE 三家的能力对照（速查）

| 功能 | Paychain | DripPay | PayProof | 本项目 v1 |
|------|:---:|:---:|:---:|:---:|
| 双角色闭环 | ✅ | ✅ | ✅(三角色) | ✅(三角色) |
| 批量发薪 | ✅ | ✅ | 流式 | ✅ 周期批量 |
| 本人解密工资 | ✅ | ✅ | ✅ | ✅ |
| 收入证明(分档) | ❌ | ⏳规划 | ✅ | ✅ |
| 逐条明文披露 | ❌ | ❌ | ❌ | ✅（差异化） |
| 合规叙事 | GDPR 全套 | 导出 | Subgraph | 选择性披露 + GDPR（§15，分阶段） |
| 底层 | FHE | FHE | FHE | **Aleo ZK** |
