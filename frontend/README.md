# Sealary — 前端

三角色 dApp UI（React + Vite）。当前为 **UI-only**（mock 数据，未接链/后端）。

- 设计见 [`../TECH_DESIGN.md`](../TECH_DESIGN.md) §10
- 主题："Sealed salary, provable income." 暖纸亮色 + 封蜡红品牌色 + 植物绿=verified
- 栈：React 19 + Vite 8 + TS 6 + Tailwind v4 + shadcn/ui + react-router
- 字体：Fraunces（display）/ Geist（UI）/ Geist Mono（data）

## 命令

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## 结构

```
src/
├── App.tsx                 # 路由（/ /employer /employee /verify）
├── index.css               # 主题（oklch 变量）+ 动画工具
├── lib/{format,mock}.ts     # 格式化 + 演示假数据
├── components/
│   ├── brand/SealMark.tsx  # 蜡封 logo
│   ├── SealedAmount.tsx    # ●●●● 密封 ↔ 揭示（核心记忆点）
│   ├── TierBadge.tsx       # 收入等级 A/B/C
│   └── layout/AppShell.tsx
└── routes/{Home,Employer,Employee,Verify}.tsx
```

> 入场动画用 CSS（`.reveal` / `.reveal-blur`），不依赖 JS 动画库。

## 链集成（已接基础层）

- 钱包：Demox/Leo wallet-adapter（`src/providers.tsx` 包 `WalletProvider`；`ConnectButton` 用 `useWallet`）
- 网络：`testnetbeta`（`src/lib/aleo.ts` 的 `NETWORK`）
- 交易构造器：`src/lib/aleo.ts` 的 `proveIncomeTx` / `discloseTx` / `payTx`（对应 §6）
- 已接线：Employee 的 **Generate proof** / **Break seal** —— 连钱包时走真实 `requestTransaction`，否则 demo 态

### 上线还需（你的环境/密钥）

1. 浏览器装 **Leo / Puzzle 钱包**扩展，切到 testnet
2. **部署合约**：`cd ../contract/sealary && leo deploy --network testnet`（账户需 faucet 领的测试 credits）
3. **发薪资币**：用 `token_registry.aleo` 注册 `zUSD`（`external_authorization_required=false`）+ `mint_private` 给雇主
4. 之后 Employee 页连钱包 → `requestRecords('sealary.aleo')` 能取到 Paystub → prove/disclose 真实上链

> Employer 的批量发薪（`payTx`，需 zUSD Token record）与 Verify 仍为 demo，待 zUSD 就绪后同样按 `src/lib/aleo.ts` 接线。
