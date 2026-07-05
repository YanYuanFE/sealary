// Sealary — 隐私薪资：私密发薪 + 分档收入证明 + 选择性披露。
// 价值层复用 token_registry.aleo（真钱 Token）；本程序发凭证 Paystub 并做证明/披露。
// 设计见 ../../TECH_DESIGN.md。
import token_registry.aleo;

// 收入分档纯逻辑（module-level，可被测试直接调用，无需构造 record）。
// 0=不达标, 1=C(>=T), 2=B(>=1.1T), 3=A(>=2T)。无溢出：加法用 threshold/10，不预先放大。
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

program sealary_pay.aleo {
    @noupgrade
    constructor() {}

    // 工资单凭证：可反复用于证明/披露，独立于可花费的薪资代币。
    record Paystub {
        owner: address,     // 员工
        employer: address,  // 雇主（证明来源）
        token_id: field,    // 对应的注册表 token
        amount: u128,       // 工资金额（私有，链上不可见）
        period: u32,        // 期数，如 202607u32
    }

    // 组合外部 transfer_private 返回的 Final（链上结算）。
    final fn settle(f: Final) {
        f.run();
    }

    // 原子发薪：跨程序私密转账真钱 + 用同一 amount 铸 Paystub 凭证。
    // transfer_private(recipient, amount, input) -> (找零→owner, 到账→recipient, Final)
    fn pay(input: token_registry.aleo::Token, to: address, amount: u128, period: u32)
        -> (token_registry.aleo::Token, token_registry.aleo::Token, Paystub, Final) {
        let (change, recv, f): (token_registry.aleo::Token, token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private(to, amount, input);
        let stub: Paystub = Paystub {
            owner: to,
            employer: self.signer,
            token_id: input.token_id,
            amount: amount,
            period: period,
        };
        return (change, recv, stub, final { settle(f); });
    }

    // 收入证明：输入私有凭证 + 公开门槛，公开输出 等级 + 雇主 + 代币 + 期数。
    // 验证者据此确认「该 tier 是针对自己提交的 threshold、由可信雇主签发的指定代币工资单算出」，
    // 否则员工可用 threshold=1 或自造代币的空气工资单伪造高档位。回吐凭证给 owner。
    fn prove_income(p: Paystub, public threshold: u128)
        -> (public u8, public address, public field, public u32, Paystub) {
        return (tier_of(p.amount, threshold), p.employer, p.token_id, p.period, p);
    }

    // 纯工具：给定明文金额与门槛返回等级。不涉隐私（入参均为调用方明文），
    // 供前端预览分档 + 单测直接覆盖 tier_of 边界。
    fn tier(amount: u128, threshold: u128) -> u8 {
        return tier_of(amount, threshold);
    }

    // 选择性披露：本人主动、可验证地公开 金额+期数+雇主+代币。
    // 附带雇主+代币，第三方才能确认这是「某可信雇主签发的指定代币工资单」而非自造。回吐凭证给 owner。
    fn disclose(p: Paystub)
        -> (public u128, public u32, public address, public field, Paystub) {
        return (p.amount, p.period, p.employer, p.token_id, p);
    }
}
