# Sealary 隐私审计 —— 对标 Zama 获奖薪资项目

> 目的:逐项对比我们当前实现与 Zama FHE 薪资获奖项目(DripPay / Paychain)的隐私模型,
> 找出未达红线之处,给出修改方案。承接 [`TECH_DESIGN.md`](./TECH_DESIGN.md) §15、[`BACKEND_PLAN.md`](./BACKEND_PLAN.md)。

---

## 1. 隐私红线(两边共识)

**工资金额对任何一方(公众、同事、平台服务器)都不可见,除非本人授权披露。**
Zama 项目的硬约束:**金额在客户端加密 → 链上以密文存储/计算 → 任何后端服务器都拿不到明文。**

---

## 2. Zama 获奖项目怎么做的

| 项目 | 关键做法 | 来源 |
|---|---|---|
| **DripPay** | 薪资**浏览器客户端加密**→上链存为 **FHE 密文(euint)**;合约在密文上 `FHE.add`;雇主"update salaries—all on encrypted values";员工用 EIP-712 签名解密自己的余额;`FHE.allow` 每员工 ACL。**后端不见明文。** | community.zama.org DripPay |
| **Paychain** | 非托管薪资 SaaS;"amounts **encrypted end-to-end** using FHE";GDPR by design;"settled onchain **without exposing any financial data**"。有 SaaS 后端(存组织/员工),但**金额端到端加密、不经明文**。 | Zama Dev Program S1 Winners |

**共同点**:后端(若有)只承载 HR/组织/身份数据;**金额永远是客户端加密 + 链上密文,服务器全盲**。

---

## 3. 我们当前实现的数据流(逐项)

| 数据 | 在哪加密 | 存哪 | 谁能看到明文 |
|---|---|---|---|
| 工资金额(**发薪后**) | 链上(`transfer_private` + `Paystub` record) | 链上加密 record | 仅员工(view key) ✅ |
| 工资金额(**配置/发薪前**) | ❌ 明文 `POST /api/employees {salary}` → 服务端 AES 加密 | 后端 Postgres(密文) | **服务器在传输/内存里看得到明文** ⚠️ |
| 员工姓名(PII) | 明文传输 → 服务端 AES-256-GCM | 后端 Postgres(密文)+ crypto-shred | 服务器传输中可见 |
| 收入证明 tier | 链上 `prove_income` | 公开输出 tier + 雇主 + 代币 + 期数 | 公众可见 tier(金额不露)✅ |
| 选择性披露 | 链上 `disclose` | **公开输出金额,永久上链** | 公众可见金额(不关联身份)⚠️ |
| 元数据(发薪笔数/时间) | — | 链上交易 | 公众可见调用次数/节奏 |
| 雇佣关系图 | — | 后端 Postgres + RLS | 平台可见 |

---

## 4. 逐项对比 & 差距

| 数据 | 我们 | Zama 金标 | 判定 |
|---|---|---|---|
| 工资(发薪后) | 链上加密 record,仅员工解 | 链上 FHE 密文,仅员工解 | ✅ **达标** |
| **工资(配置/发薪前)** | **明文经后端**,服务端加密落库 | 客户端加密→链上密文,**服务器全盲** | ❌ **主要差距(未达红线)** |
| 收入证明(分档) | tier 公开、金额不露 | 门槛证明、金额不露 | ✅ 达标(未绑验证者,P2) |
| 选择性披露 | 金额**永久公开上链**、不关联身份 | FHE 向**指定方** re-encrypt 揭示,不全局公开 | ⚠️ 更弱(公开但不关联 vs 只给一方) |
| 姓名 PII | 明文传输→服务端加密+crypto-shred | Paychain 有 SaaS 后端存 PII、GDPR 加密 | ⚠️ 传输中可见,但 SaaS 常规、可接受 |
| 元数据 | pay 调用次数/时间公开 | fhEVM tx 元数据同样公开 | ≈ 相当 |
| 雇佣关系图 | 后端 + RLS | DripPay 链上合约(地址公开) | ≈ 相当 |

### 结论

- **核心隐私(工资对外不可见)在"发薪后"已达标**:金额只在链上加密 record 里,服务器碰不到。
- **唯一实质性差距**:**"配置/发薪前的薪资"明文流经后端** —— 违背项目自身 §15 红线,也是 Zama 项目明确避免的。**这是必须修的。**
- 其余为次要(姓名传输,SaaS 常规)、设计选择(disclose 公开但不关联,§8 已记)或已知路线(prove nonce 绑定,P2)。

---

## 5. 修改方案(按优先级)

### P0 — 薪资不进后端(达红线,方案 D)—— ✅ 已实现

> 状态:**已落地并验证**。`sealary_conf.aleo` 已部署 testnet(tx `at1flh8kex…`);`set_salary`(单条)+ `set_salary_batch`
> (8 人一笔,tx `at1450n8fz…`)链上执行确认产出加密 SalaryConfig;后端 `salary` 全移除,强塞也被丢弃;
> 前端加员工链上写、CSV 导入走 batch、花名册链上读解、发薪用链上金额;build+typecheck 全绿。

薪资改为**链上加密、雇主自有 record**,后端**彻底不存薪资**。对标 DripPay 的"加密薪资上链"。

- **合约**:新增独立小程序 `sealary_conf.aleo`(不动已部署的 `sealary_pay.aleo`):
  ```leo
  record SalaryConfig { owner: address /*雇主*/, employee: address, token_id: field, amount: u128 }
  fn set_salary(employee, token_id, amount) -> SalaryConfig   // owner = self.signer
  fn update_salary(old: SalaryConfig, amount) -> SalaryConfig // 消费旧、产新
  ```
  只雇主的 view key 能解密自己的 `SalaryConfig`;服务器永远看不到。
- **前端(Employer)**:
  - 加员工 = 后端存 `{name, address}`(无薪资)+ 链上 `executeTransaction(set_salary(address, tokenId, toBase(salary,decimals)))`。
  - 花名册 = `requestRecords('sealary_conf.aleo','unspent')` 解密 `SalaryConfig`,按地址匹配员工,`fromBase` 展示。
  - 发薪 = 用解密出的 `SalaryConfig.amount`。
- **后端**:`Person` 去掉 `salary`;`Pii` 只剩 `{name}`;`employees`/`me` handler 不再收/存/返 salary。
- **部署**:`leo deploy sealary_conf.aleo`(名 10 字符→命名空间费 ~1 credit,总 ~6 credits;余额 13.6 够)。

### P1 — 文档如实标注 disclose 的公开性(不改代码)

`disclose` 是"金额永久公开上链、不关联身份",弱于 FHE 的"定向 re-encrypt"。§8 已记,产品化路线:定向披露(把金额加密给指定验证方地址,而非公开)。列扩展。

### P2 — prove_income 绑定验证者 + nonce(防复用/借用)

见 BACKEND_PLAN §6 决策 3。改合约(sealary_pay 需重部署,或放 sealary_conf 同批)。产品硬化。

### P3(可选) — 姓名客户端加密

若要"服务器对姓名也全盲":雇主浏览器加密姓名后再上传。但 Aleo 签名带随机数,无法从钱包稳定派生密钥(见 BACKEND_PLAN),需本地密钥/口令,复杂度高、收益小。**黑客松不做**,姓名维持服务端 AES(GDPR SaaS 常规)。

---

## 6. 实施顺序(本次)

1. `sealary_conf.aleo`:写合约 → `leo build` → `leo deploy`(已起草 `contract/sealary_conf/`)。
2. 后端:`employees.ts`/`me.ts`/`api.ts` 移除 salary,`Pii={name}`。
3. 前端 `lib/aleo.ts`:加 `HR_PROGRAM` + `setSalaryOpts`。
4. 前端 `Employer.tsx`:加员工写 SalaryConfig;花名册读解 SalaryConfig;发薪用其金额。
5. 验证:build + typecheck;dev 端到端(加员工→链上 SalaryConfig→花名册显示→发薪);确认 `POST /api/employees` 不再含 salary。
6. 文档同步:TECH_DESIGN §5/§15、TODO、BACKEND_PLAN。
