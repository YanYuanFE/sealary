// SPIKE — 只验证：能否在一个 fn 里把外部 token_registry.aleo::Token
// 透传给嵌套跨程序 transfer_private，并组合（"await"）其 Final。
import token_registry.aleo;

program spike.aleo {
    @noupgrade
    constructor() {}

    record Paystub {
        owner: address,
        employer: address,
        token_id: field,
        amount: u128,
        period: u32,
    }

    // Leo 4.x：外部 async 调用返回 Final；用本地 final fn 在链上组合它。
    final fn settle(f: Final) {
        f.run();
    }

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
}
