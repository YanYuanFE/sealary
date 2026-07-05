#!/usr/bin/env bash
# 验证 tier 分档边界逻辑。用 leo run（leo test 目前受 token_registry 本地部署限制无法执行）。
# 用法: ./verify_tier.sh
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

# "amount threshold expected"，threshold=100：99→0 100→C 109→C 110→B 199→B 200→A，末条测大数不溢出
cases=(
  "99 100 0" "100 100 1" "109 100 1" "110 100 2" "199 100 2" "200 100 3"
  "1000000000000 500000000000 3"
)
pass=0; fail=0
for c in "${cases[@]}"; do
  set -- $c
  got=$(leo run tier "${1}u128" "${2}u128" --network testnet 2>&1 \
        | sed 's/\x1b\[[0-9;]*m//g' | grep "•" | grep -oE "[0-9]+u8" | sed 's/u8//')
  if [ "$got" = "$3" ]; then pass=$((pass+1)); echo "PASS tier($1,$2)=$got"; \
  else fail=$((fail+1)); echo "FAIL tier($1,$2)=$got expected $3"; fi
done
echo "-----"; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
