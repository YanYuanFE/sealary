# Sealary — 合约（Leo）

Aleo 上的 `sealary.aleo`：私密发薪 + 收入证明（分档）+ 选择性披露。

- 设计见 [`../docs/TECH_DESIGN.md`](../docs/TECH_DESIGN.md) §5–6
- 价值层依赖 `token_registry.aleo`（ARC-21）
- 需 leo ≥ 4.2（rustc ≥ 1.96）：`cargo install leo-lang`

## 目录

- `sealary/` — 正式合约（`src/main.leo` + `tests/`）
- `spike/` — 跨程序 `transfer_private` 的最小验证例（已确认原子 `pay` 可行）

## 接口（`sealary/src/main.leo`）

| fn | 说明 |
|----|------|
| `pay` | 原子发薪：跨程序 `transfer_private` 转真钱 + 铸 `Paystub` 凭证 |
| `prove_income(p, threshold)` | 只输出等级 tier（0/C/B/A），回吐凭证 |
| `disclose(p)` | 公开金额+期数，回吐凭证 |
| `tier(amount, threshold)` | 纯工具：明文算等级（前端预览 + 单测入口） |
| `tier_of` | 内部 helper，分档逻辑本体 |

## 常用命令

```bash
cd sealary
leo build --network testnet          # 编译 → Aleo instructions
./verify_tier.sh                     # 验证 tier 分档边界（7 用例，走 leo run）
leo run tier 110u128 100u128 --network testnet   # 单跑
```

## 已知限制：`leo test` 暂不可执行

`tests/test_sealary.leo` 能编译，但 `leo test` 会在本地测试链部署依赖
`token_registry.aleo` 时失败——该线上程序无 constructor，被 V9 规则拒绝部署。
分档边界改用 `./verify_tier.sh`（`leo run`）验证，已 7/7 通过。
待 leo 版本升级或改用自定义 devnet（`--consensus-heights`）后再切回 `leo test`。
