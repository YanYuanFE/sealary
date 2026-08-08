# Sealary — Confidential Payroll on Aleo

> **Seal + Salary.** Pay salaries in a private stablecoin where amounts never touch public state — then let employees **prove** their income tier in zero knowledge, or **disclose** a single verifiable payslip, without ever handing over their view key.

Payroll is the most sensitive personal financial data there is. On a transparent chain every colleague, competitor and attacker can read it; fully hiding it breaks the real-world need for income proofs (renting, loans, visas) and audits. Sealary resolves that tension with three primitives:

| | What happens | Who learns what |
|---|---|---|
| **Pay** | Atomic transition: private `transfer_private` of a real token (ARC-21, or an ARC-22 stablecoin like USDCx) **+** a sealed `Paystub` credential, bound to the same amount | Public sees *nothing* — no amounts, no recipient identity |
| **Prove** | Employee runs `prove_income(paystub, threshold)` | Verifier learns a **tier** (A/B/C/below) for their threshold, plus the issuing employer & token — **never the amount** |
| **Disclose** | Employee runs `disclose(paystub)` on one payslip | Exact amount + period go public, provably signed by a real employer — a deliberate, per-record, irreversible act |

Salaries themselves are configured as **employer-owned encrypted records** (`sealary_conf.aleo/SalaryConfig`) — the backend never sees a single amount, in any direction.

## Live on Aleo Testnet

| Program | Purpose |
|---|---|
| [`sealary_payroll_v2.aleo`](https://testnet.explorer.provable.com/program/sealary_payroll_v2.aleo) | ARC-21 payroll: `pay` · `pay_batch` (4 per tx) · `prove_income` (verifier + nonce bound) · `disclose` · `tier` |
| [`sealary_pay_arc22.aleo`](https://testnet.explorer.provable.com/program/sealary_pay_arc22.aleo) | ARC-22 payroll via **dynamic dispatch** — same four transitions, any compliant stablecoin (USDCx family) |
| [`sealary_conf.aleo`](https://testnet.explorer.provable.com/program/sealary_conf.aleo) | `set_salary` · `update_salary` · `set_salary_batch` (8 per tx) |
| [`token_registry.aleo`](https://testnet.explorer.provable.com/program/token_registry.aleo) | ARC-21 value layer — test stablecoin **zUSD** (`token_id = 7777field`, 6 decimals) |

`pay_batch` paying 4 employees in a single transaction has been executed end-to-end on testnet (fee ≈ 0.024 credits).

### Any token, one contract each way

Aleo has two token worlds, and payroll should not care which one a company banks in:

- **ARC-21 registry tokens** (zUSD, bridged vUSDC/vETH) — `sealary_payroll_v2.aleo` imports `token_registry.aleo` statically and pays by `token_id`.
- **ARC-22 compliant stablecoins** (Circle's **USDCx**, USAD) — each is its own program with a freeze list, so there is nothing to import statically. `sealary_pay_arc22.aleo` calls them by **runtime program id** (`ARC22@(token_prog)::transfer_private`, Leo 4.4 / ARC-0009), which means *one* deployed contract covers the whole family — no redeploy per token. The employer's freeze-list non-membership proof is built in the browser (Provable SDK), so the paying address is never sent to an API; a batch reuses one proof across all four transfers.

Both mint the same `Paystub` credential in the same atomic transition, so proofs, disclosure and the verifier page work identically whichever token an organization runs on.

**Executed on testnet**: [`at1sk2g36…qvcqmwl`](https://testnet.explorer.provable.com/transaction/at1sk2g360f0ezmwecqrprm98dysdc9z7t96phwajy7rx7msqua9ygqvcqmwl) — one USDCx payroll run, 5 transitions (4 dynamically dispatched `transfer_private` + `pay_batch`), 4 employees paid and 4 sealed Paystubs minted, every input a ciphertext and no amount in public state. Fee ≈ 0.095 credits — ~4× the ARC-21 run, the cost of USDCx's in-circuit freeze-list proof.

## Why Aleo

Sealary uses Aleo's private record model to keep payroll data confidential while still producing verifiable income claims:

- An income proof is **one transition**: private record in, public tier out. No oracle, no relayer.
- The record model hides the **recipient**, not just the amount.
- Zero public mappings by design — any public accumulator would leak individual amounts as deltas.

What we trade away: no streaming/continuous accrual (UTXO model) — we batch per period instead.

## Architecture

```
┌───────────────── React + Vite (SPA) ─────────────────┐
│ /employer  /employer/:id  /employee  /verify  /setup │
└──┬─────────────────────────────────────────────┬─────┘
   │ HTTPS — identity only (PII, roster)         │ wallet-adapter — money & proofs
┌──▼─────────────────────────────┐  ┌────────────▼──────────────────────┐
│ Vercel Functions + Neon (EU)   │  │ Aleo Testnet                      │
│ · Sign-in with Aleo (SIWA)     │  │ · ARC-21 / ARC-22 Token (private) │
│ · AES-256-GCM PII, per-person  │  │ · Paystub records (credential)    │
│   DEK + crypto-shredding       │  │ · SalaryConfig records (employer) │
│ · append-only audit log        │  │ · ZK proofs verified on-chain     │
│ · NO salary amounts, ever      │  │ · NO PII, ever                    │
└────────────────────────────────┘  └───────────────────────────────────┘
```

**Double data-minimization**: amounts live only in encrypted on-chain records; identity PII lives only as off-chain ciphertext. Compromising either side yields no complete picture.

## Repository layout

```
contract/
  sealary/        # sealary_payroll_v2.aleo — pay / prove / disclose (+ tests, bootstrap.sh, verify_tier.sh)
  sealary_arc22/  # sealary_pay_arc22.aleo — same, for ARC-22 stablecoins via dynamic dispatch
  sealary_conf/   # sealary_conf.aleo — encrypted salary configs
  spike/          # minimal cross-program transfer_private feasibility spike
frontend/
  src/            # SPA: employer / employee / verifier consoles
  api/            # Vercel Functions: SIWA auth, encrypted PII, payments & disclosure metadata
  schema.sql      # Postgres schema (idempotent, `npm run db:push`)
```

## Quickstart

**Prerequisites**: Node ≥ 20 · Leo ≥ 4.2, or **≥ 4.4 for `sealary_arc22/`** (dynamic dispatch) · [Shield wallet](https://shield.aleo.org) on Testnet with faucet credits · a Neon Postgres database.

### Contracts

```bash
cd contract/sealary
leo build --network testnet     # compile to Aleo instructions
./verify_tier.sh                # tier boundary check — 7/7 via leo run
./bootstrap.sh <employer_address>   # one-time: register zUSD + mint_private to the employer
```

### Frontend + API

```bash
cd frontend
npm install                     # .npmrc handles legacy peer deps (React 19)
cat > .env.local <<EOF
DATABASE_URL=postgres://...     # Neon connection string
MASTER_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
EOF
npm run db:push                 # apply schema.sql to Neon (idempotent)
npm run dev                     # vite serves the SPA and /api in one process
```

Production deploys as a single Vercel project (`api/*.ts` become serverless functions).

## Demo walkthrough (three roles)

1. **Employer** — connect Shield → `/setup`: create an org against a registry `token_id` or an ARC-22 stablecoin program (one wallet can run several orgs, one token each; `/employer` lists them) → add employees (name goes to the backend encrypted; **salary is sealed on-chain**, one wallet approval) or import a `name,address,salary` CSV (salaries batch-sealed 8 per tx) → **Pay batch**: one approval pays up to 4 employees privately and mints their Paystubs.
2. **Employee** — connect → decrypt payslips with your view key → drag the threshold slider → **Generate proof** → send the tx id to whoever asked. Or **Disclose** one payslip (with the recipient noted in your personal disclosure log). Export payslips as CSV / print as PDF.
3. **Verifier** — paste the tx id at `/verify` → see the tier, issuing employer and token. The amount never crossed the wire.

Extras worth showing: one-off **bonus** payments that don't disturb the monthly cycle, per-period **aggregated reports** (no identities), and **tamper-evident exports** — every CSV ends with a `# sealary-export … sha256=…` footer; strip the footer, hash the rest, compare.

## Testing

- Tier logic (the only arithmetic that can go wrong): `verify_tier.sh` — 7/7 boundary cases via `leo run`, including a no-overflow large-number case.
- Self-checks with known vectors: unit scaling (5/5), PII crypto (4/4), CSV escaping + export hashing (3/3).
- `leo test` compiles but can't run yet: the local test chain rejects deploying the on-chain `token_registry.aleo` (no constructor, V9 rule) — boundary checks run via `leo run` instead.

## Compliance posture (GDPR, designed-in)

- **Art. 17 right to be forgotten**: removing an employee crypto-shreds their per-person encryption key (all ciphertext copies become permanently undecryptable) and voids their on-chain `SalaryConfig` (`update_salary → 0`).
- **Art. 5(2) accountability**: append-only audit log for every PII access and every disclosure.
- Passwordless **Sign-in with Aleo**: nonce → wallet signature → short-lived JWT.
- Searchable-but-not-stored tax IDs via HMAC index; EU data residency.

## Honest limitations

- `disclose` is **irreversible**: the amount lands on a public chain forever (the UI says so). The public sees amount + employer, but not the employee's address — only the holder of the tx id can link it to a person.
- Transaction **metadata** (call counts and timing of `pay`) is visible even though amounts are not; mitigations (padding, batching windows) are on the roadmap.
- Employer-side payment history shows amounts from the *current* `SalaryConfig` (the chain encrypts historical amounts to the employee, not the employer); a raise rewrites displayed history. Fix (employer-owned `PayrollReceipt` snapshot record) is designed, not deployed.
- On the ARC-22 path, `pay`/`pay_batch` are proven end-to-end on testnet, but `prove_income` and `disclose` **have not been exercised against an ARC-22 `Paystub`** — the transitions are byte-identical in logic to the ARC-21 ones that have been, and the record layout is the same, but the tx receipts are on the ARC-21 program.
- ARC-22 is still a **Draft** standard; `sealary_pay_arc22.aleo` targets the interface as deployed by USDCx today, and a signature change in the final ARC would need a redeploy.
- USDCx-family transfers emit a `ComplianceRecord` to the issuer's compliance address by design — private to the public, readable by the regulator. That is the point of a compliant stablecoin, but it is a weaker privacy guarantee than an ARC-21 token, where only the two parties can read the transfer.

## Roadmap

Multi-period aggregated proofs · employer `PayrollReceipt` snapshots · mainnet USDCx as the value layer · a generic ARC-20 variant (same dispatch trick, third token family) · KMS + key rotation · Playwright E2E.

---

Built for the Aleo hackathon (PAY track).
