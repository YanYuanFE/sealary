// Sealary × ARC-22 —— 合规稳定币（USDCx/USAD 家族）发薪：动态分发调代币 + 原子铸 Paystub。
// 无静态代币依赖：代币程序 id 是运行时参数（ARC-0009 dynamic dispatch），一个合约通吃全家族。
// 接口签名对齐已部署的 test_usdcx_stablecoin.aleo / usdcx_stablecoin.aleo（ARC-0022 Draft 同形）。
// 需要 leo >= 4.4.0（call.dynamic / dyn record / std::ctx）。

// 收入分档纯逻辑（与 sealary_payroll_v2 同一规则）：0=不达标, 1=C(>=T), 2=B(>=1.1T), 3=A(>=2T)。
fn tier_of(amount: u128, threshold: u128) -> u8 {
    let tier: u8 = 0u8;
    if amount >= threshold {
        tier = 1u8;
    }
    if amount >= threshold + threshold / 10u128 {
        tier = 2u8;
    }
    if amount >= threshold * 2u128 {
        tier = 3u8;
    }
    return tier;
}

// 冻结名单非成员证明（与 USDCx 的 MerkleProof 结构一致，深度 16）。
export struct MerkleProof {
    siblings: [field; 16u32],
    leaf_index: u32,
}

// ARC-22 合规代币接口：私密转账要求付款人提供 2 个相邻叶子的非成员证明，
// 并抄送一条 ComplianceRecord 给发行方合规地址（对公众仍私密）。
export interface Arc22 {
    record Token;
    record ComplianceRecord;
    fn transfer_private(to: address, amount: u128, input: Token, proofs: [MerkleProof; 2u32])
        -> (ComplianceRecord, Token, Token, Final);
}

program sealary_pay_arc22.aleo {
    @noupgrade
    constructor() {}

    // 工资单凭证：与 sealary_payroll_v2 的 Paystub 同构；token_id 存代币程序 id（field 编码），
    // 与 registry 版的 token_id 同一个字段语义——验证方按 (employer, token_id) 认来源。
    record Paystub {
        owner: address,     // 员工
        employer: address,  // 雇主（证明来源）
        token_id: field,    // ARC-22 代币程序 id（dispatch 同一个 field）
        amount: u128,       // 工资金额（私有）
        period: u32,        // 期数，如 202608u32
    }

    final fn settle(f: Final) {
        f.run();
    }

    // 原子发薪：动态分发调 ARC-22 transfer_private + 用同一 amount 铸 Paystub。
    // proofs 证雇主（付款人）不在冻结名单；ComplianceRecord 原样回吐（归合规地址，钱包自动路由）。
    fn pay(token_prog: field, input: dyn record, to: address, amount: u128, period: u32, proofs: [MerkleProof; 2u32])
        -> (dyn record, dyn record, dyn record, Paystub, Final) {
        let (comp, change, recv, f): (dyn record, dyn record, dyn record, Final) =
            Arc22@(token_prog)::transfer_private(to, amount, input, proofs);
        let stub: Paystub = Paystub {
            owner: to,
            employer: std::ctx::signer(),
            token_id: token_prog,
            amount: amount,
            period: period,
        };
        return (comp, change, recv, stub, final { settle(f); });
    }

    final fn settle4(f0: Final, f1: Final, f2: Final, f3: Final) {
        f0.run();
        f1.run();
        f2.run();
        f3.run();
    }

    // 批量发薪（一笔 tx 最多 4 人）：链式复用找零。付款人始终是雇主，
    // 同一份 proofs 四笔复用（非成员证明只关乎付款人地址，找零 owner 不变）。
    // 不足 4 人由前端补位（to=雇主自己, amount=0）。
    fn pay_batch(token_prog: field, input: dyn record, tos: [address; 4], amounts: [u128; 4], period: u32, proofs: [MerkleProof; 2u32])
        -> (dyn record, dyn record, dyn record, dyn record, dyn record, dyn record, dyn record, dyn record, dyn record, Paystub, Paystub, Paystub, Paystub, Final) {
        let (c0, ch0, r0, f0): (dyn record, dyn record, dyn record, Final) =
            Arc22@(token_prog)::transfer_private(tos[0u8], amounts[0u8], input, proofs);
        let (c1, ch1, r1, f1): (dyn record, dyn record, dyn record, Final) =
            Arc22@(token_prog)::transfer_private(tos[1u8], amounts[1u8], ch0, proofs);
        let (c2, ch2, r2, f2): (dyn record, dyn record, dyn record, Final) =
            Arc22@(token_prog)::transfer_private(tos[2u8], amounts[2u8], ch1, proofs);
        let (c3, ch3, r3, f3): (dyn record, dyn record, dyn record, Final) =
            Arc22@(token_prog)::transfer_private(tos[3u8], amounts[3u8], ch2, proofs);
        let employer: address = std::ctx::signer();
        let s0: Paystub = Paystub { owner: tos[0u8], employer: employer, token_id: token_prog, amount: amounts[0u8], period: period };
        let s1: Paystub = Paystub { owner: tos[1u8], employer: employer, token_id: token_prog, amount: amounts[1u8], period: period };
        let s2: Paystub = Paystub { owner: tos[2u8], employer: employer, token_id: token_prog, amount: amounts[2u8], period: period };
        let s3: Paystub = Paystub { owner: tos[3u8], employer: employer, token_id: token_prog, amount: amounts[3u8], period: period };
        return (c0, c1, c2, c3, ch3, r0, r1, r2, r3, s0, s1, s2, s3, final { settle4(f0, f1, f2, f3); });
    }

    // 收入证明 / 选择性披露：与 sealary_payroll_v2 完全同构（绑定 threshold/employer/token/verifier/nonce），
    // 只是 Paystub 来自本程序、token_id 是代币程序 id。验证方语义不变。
    fn prove_income(p: Paystub, public threshold: u128, public verifier: address, public nonce: field)
        -> (public u8, public address, public field, public u32, public address, public field, Paystub) {
        return (tier_of(p.amount, threshold), p.employer, p.token_id, p.period, verifier, nonce, p);
    }

    fn disclose(p: Paystub)
        -> (public u128, public u32, public address, public field, Paystub) {
        return (p.amount, p.period, p.employer, p.token_id, p);
    }
}
