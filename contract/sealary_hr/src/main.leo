// Sealary HR —— 雇主私有薪资配置。
// 薪资加密上链、只雇主能解密，后端永不接触薪资明文（对标 DripPay：encrypted client-side, on-chain, server-blind）。
program sealary_hr.aleo {
    @noupgrade
    constructor() {}

    // 雇主私有薪资配置：owner=雇主（只雇主的 view key 能解），记录某员工的薪资。
    record SalaryConfig {
        owner: address,      // 雇主
        employee: address,   // 员工地址
        token_id: field,     // 薪资币
        amount: u128,        // 薪资（base units，链上加密不可见）
    }

    // 设置某员工薪资：产出加密 record 给雇主自己。
    fn set_salary(employee: address, token_id: field, amount: u128) -> SalaryConfig {
        return SalaryConfig {
            owner: self.signer,
            employee: employee,
            token_id: token_id,
            amount: amount,
        };
    }

    // 更新：消费旧配置、产出金额更新后的新配置。
    fn update_salary(old: SalaryConfig, amount: u128) -> SalaryConfig {
        return SalaryConfig {
            owner: old.owner,
            employee: old.employee,
            token_id: old.token_id,
            amount: amount,
        };
    }
}
