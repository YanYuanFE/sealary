#!/usr/bin/env bash
# Bootstrap zUSD 测试薪资币：register_token + mint_private 给雇主。
# 依赖线上 testnet 的 token_registry.aleo（ARC-21）。跑之前先备好凭证：
#   在 contract/sealary/.env 里写 PRIVATE_KEY=... / NETWORK=testnet / ENDPOINT=https://api.explorer.provable.com/v1
#   （或用同名环境变量传入；leo execute 会自动读取）
# 用法：./bootstrap.sh <employer_aleo_address> [mint_amount]
#   employer 必须是上面 PRIVATE_KEY 对应的地址（register 设 self.caller 为 admin，mint 也须由 admin 发）。
set -euo pipefail

EMPLOYER="${1:?用法: ./bootstrap.sh <employer_aleo_address> [mint_amount]（employer 须为 PRIVATE_KEY 对应地址）}"
AMOUNT="${2:-1000000000000}"          # 默认铸 1e12（decimals=6 → 1,000,000 zUSD）

# ── zUSD 参数 ────────────────────────────────────────────────
# ponytail: token_id 固定用下面这个 field。若 register 报 already-registered（撞了别人先注册的 id），
#           换成另一个随机大 field 即可；mint 会自动跟着用同一个变量，不会不一致。
TOKEN_ID="7777field"
NAME="1146312058u128"                 # "zUSD" 的 ASCII 编码（仅供浏览器显示，不影响功能）
SYMBOL="1146312058u128"
DECIMALS="6u8"
MAX_SUPPLY="1000000000000000u128"
EXT_AUTH="false"                      # 关键：转账无需外部授权方批准（TECH_DESIGN §7），否则每笔 pay 都要额外审批
AUTH_UNTIL="4294967295u32"            # max u32：铸出的 Token 完全授权、可直接 transfer_private

LOC="token_registry.aleo"

echo "▶ register_token: zUSD ($TOKEN_ID), ext_auth=$EXT_AUTH, admin=$EMPLOYER"
leo execute "$LOC/register_token" \
  "$TOKEN_ID" "$NAME" "$SYMBOL" "$DECIMALS" "$MAX_SUPPLY" "$EXT_AUTH" "$EMPLOYER" \
  --broadcast --yes

echo "▶ mint_private: ${AMOUNT} → $EMPLOYER"
leo execute "$LOC/mint_private" \
  "$TOKEN_ID" "$EMPLOYER" "${AMOUNT}u128" "$EXT_AUTH" "$AUTH_UNTIL" \
  --broadcast --yes

echo "✅ done. 雇主现持有一枚 zUSD Token record，前端 requestRecords('token_registry.aleo') 可见；"
echo "   记下 TOKEN_ID=$TOKEN_ID，pay 时作为 input Token 的 token_id。"
