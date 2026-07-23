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

-- 发薪日（每月几号，1-28）：建组织时选，控制台倒计时用
alter table company add column if not exists pay_day int not null default 25;

create table if not exists encryption_keys (
  key_ref     uuid primary key default gen_random_uuid(),
  wrapped_key bytea not null,                     -- per-person DEK，被 env 主密钥包裹
  version     int  not null default 1,
  active      boolean not null default true
);

create table if not exists person (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id) on delete cascade, -- 租户边界
  wallet_address text not null,                   -- 员工钱包（pay 收款方）；同钱包可受雇多家公司，每家一行
  pii_ciphertext bytea not null,                  -- {name} AES-256-GCM 密文
  key_ref        uuid not null references encryption_keys(key_ref),
  tax_id_hmac    text,                            -- 证件号 HMAC-SHA256（可搜索，不存明文）
  created_at     timestamptz not null default now()
);

-- 迁移：person 原为全局唯一 wallet_address（另一公司添加同钱包会覆盖密文/密钥，还能删除对方的
-- person 级联掉雇佣与支付记录）→ 改按 (company_id, wallet_address) 租户隔离。
-- employment 的归属折进 person.company_id 后删表（role/status 无代码引用）。
create table if not exists employment (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade
);
alter table person add column if not exists company_id uuid references company(id) on delete cascade;
update person p set company_id = e.company_id from employment e where e.person_id = p.id and p.company_id is null;
delete from person where company_id is null;
alter table person alter column company_id set not null;
alter table person drop constraint if exists person_wallet_address_key;
drop table if exists employment;
create unique index if not exists idx_person_company_wallet on person(company_id, wallet_address);

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

-- 发薪类型：salary=周期工资（Paid 徽章依据）| bonus=同期加发/临时付款（不占用 Paid）
alter table payment add column if not exists kind text not null default 'salary';

-- 披露留痕（对标 PRD"谁在何时向谁披露了什么"）：员工每次 prove/disclose 记一条元数据。
-- 只存 期数/接收方(自报)/tx——金额绝不进后端。
create table if not exists disclosure (
  id         uuid primary key default gen_random_uuid(),
  wallet     text not null,                 -- 披露人（员工钱包）
  kind       text not null,                 -- 'prove' | 'disclose'
  period     int  not null,
  party      text,                          -- 声称的接收方（如 Meridian Bank）
  tx_id      text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_disclosure_wallet on disclosure(wallet);

-- append-only 审计（§15.3 Art.5(2)）
create table if not exists access_audit_log (
  id         bigserial primary key,
  actor_wallet text not null,
  action     text not null,
  target_id  text,
  ts         timestamptz not null default now()
);

create index if not exists idx_person_taxhmac on person(tax_id_hmac);
