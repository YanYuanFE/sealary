# Sealary — Confidential Payroll on Aleo

> **Seal + Salary.** Pay salaries in a private stablecoin where amounts never touch public state — then let employees **prove** their income tier in zero knowledge, or **disclose** a single verifiable payslip, without ever handing over their view key.

Payroll is the most sensitive personal financial data there is. On a transparent chain every colleague, competitor and attacker can read it; fully hiding it breaks the real-world need for income proofs (renting, loans, visas) and audits. Sealary resolves that tension with three primitives:

| | What happens | Who learns what |
|---|---|---|
| **Pay** | Atomic transition: private `transfer_private` of a real ARC-21 token **+** a sealed `Paystub` credential, bound to the same amount | Public sees *nothing* — no amounts, no recipient identity |
| **Prove** | Employee runs `prove_income(paystub, threshold)` | Verifier learns a **tier** (A/B/C/below) for their threshold, plus the issuing employer & token — **never the amount** |
| **Disclose** | Employee runs `disclose(paystub)` on one payslip | Exact amount + period go public, provably signed by a real employer — a deliberate, per-record, irreversible act |

Salaries themselves are configured as **employer-owned encrypted records** (`sealary_conf.aleo/SalaryConfig`) — the backend never sees a single amount, in any direction.

## Live on Aleo Testnet

| Program | Purpose |
|---|---|
| [`sealary_payroll.aleo`](https://testnet.explorer.provable.com/program/sealary_payroll.aleo) | `pay` · `pay_batch` (4 per tx) · `prove_income` · `disclose` · `tier` |
| [`sealary_conf.aleo`](https://testnet.explorer.provable.com/program/sealary_conf.aleo) | `set_salary` · `update_salary` · `set_salary_batch` (8 per tx) |
| [`token_registry.aleo`](https://testnet.explorer.provable.com/program/token_registry.aleo) | ARC-21 value layer — test stablecoin **zUSD** (`token_id = 7777field`, 6 decimals) |

`pay_batch` paying 4 employees in a single transaction has been executed end-to-end on testnet (fee ≈ 0.024 credits).

## Why Aleo (vs FHE payroll)

FHE payroll projects (Paychain / DripPay / PayProof on Zama) keep amounts encrypted on-chain but leave **employee addresses fully public**, and income proofs require oracle contracts + relayers. On Aleo:

- An income proof is **one transition**: private record in, public tier out. No oracle, no relayer.
- The record model hides the **recipient**, not just the amount.
- Zero public mappings by design — any public accumulator would leak individual amounts as deltas.

What we trade away: no streaming/continuous accrual (UTXO model) — we batch per period instead.

## Architecture

```
┌────────────── React + Vite (SPA) ───────────────┐
│  /employer      /employee      /verify   /setup │
└──┬────────────────────────────────────────┬─────┘
   │ HTTPS — identity only (PII, roster)    │ wallet-adapter — money & proofs
┌──▼─────────────────────────────┐  ┌───────▼───────────────────────────┐
│ Vercel Functions + Neon (EU)   │  │ Aleo Testnet                      │
│ · Sign-in with Aleo (SIWA)     │  │ · token_registry Token (private)  │
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
  sealary/        # sealary_payroll.aleo — pay / prove / disclose (+ tests, bootstrap.sh, verify_tier.sh)
  sealary_conf/   # sealary_conf.aleo — encrypted salary configs
  spike/          # minimal cross-program transfer_private feasibility spike
frontend/
  src/            # SPA: employer / employee / verifier consoles
  api/            # Vercel Functions: SIWA auth, encrypted PII, payments & disclosure metadata
  schema.sql      # Postgres schema (idempotent, `npm run db:push`)
```

## Quickstart

**Prerequisites**: Node ≥ 20 · Leo ≥ 4.2 (`cargo install leo-lang`, rustc ≥ 1.96) · [Shield wallet](https://shield.aleo.org) on Testnet with faucet credits · a Neon Postgres database.

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

1. **Employer** — connect Shield → `/setup`: create the org against your `token_id` → add employees (name goes to the backend encrypted; **salary is sealed on-chain**, one wallet approval) or import a `name,address,salary` CSV (salaries batch-sealed 8 per tx) → **Pay batch**: one approval pays up to 4 employees privately and mints their Paystubs.
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
- `prove_income` is not yet bound to a verifier nonce, so a proof tx could in theory be replayed by someone it wasn't issued to. Low impact for income proofs; the fix (public `verifier` + `nonce` inputs) needs a contract redeploy.

## Roadmap

Multi-period aggregated proofs · verifier-bound proofs · employer `PayrollReceipt` snapshots · mainnet USDCx as the value layer · KMS + key rotation · Playwright E2E.

---

Built for the Aleo hackathon (PAY track).
