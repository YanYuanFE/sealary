-- Sealary 链下 schema（TECH_DESIGN §15.2 / BACKEND_PLAN §3.2）。
-- 原则：链下不存工资金额【明文】；PII（含 salary）AES-256-GCM 加密存 pii_ciphertext。
-- 在 Neon（EU region）执行一次。

create extension if not exists pgcrypto;

create table if not exists company (
  id            uuid primary key default gen_random_uuid(),
  employer_wallet text not null unique,          -- 雇主钱包地址（链上链下关联键）
  name          text not null,
  region        text not null default 'EU',
  token_id      text not null,                   -- 薪资币 token_id（field），雇主自带
  symbol        text not null,
  decimals      int  not null,
  created_at    timestamptz not null default now()
);

create table if not exists encryption_keys (
  key_ref     uuid primary key default gen_random_uuid(),
  wrapped_key bytea not null,                     -- per-person DEK，被 env 主密钥包裹
  version     int  not null default 1,
  active      boolean not null default true
);

create table if not exists person (
  id             uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,            -- 员工钱包（pay 收款方）
  pii_ciphertext bytea not null,                  -- {name,title,salary} AES-256-GCM 密文
  key_ref        uuid not null references encryption_keys(key_ref),
  tax_id_hmac    text,                            -- 证件号 HMAC-SHA256（可搜索，不存明文）
  created_at     timestamptz not null default now()
);

create table if not exists employment (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  role       text not null default 'employee',
  status     text not null default 'active',
  unique (company_id, person_id)
);

-- 发薪记录（仅元数据：谁/哪期/哪笔 tx——金额绝不进后端，雇主端金额从链上 SalaryConfig 解）
create table if not exists payment (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  period     int  not null,
  tx_id      text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_company on payment(company_id);

-- append-only 审计（§15.3 Art.5(2)）
create table if not exists access_audit_log (
  id         bigserial primary key,
  actor_wallet text not null,
  action     text not null,
  target_id  text,
  ts         timestamptz not null default now()
);

create index if not exists idx_employment_company on employment(company_id);
create index if not exists idx_person_taxhmac on person(tax_id_hmac);
