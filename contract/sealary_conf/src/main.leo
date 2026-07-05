// Sealary 薪资配置 —— 雇主私有、链上加密、后端全盲（对标 DripPay 的加密薪资）。
// 单条 set_salary + 定长批量 set_salary_batch（Aleo transition 输出固定，批量靠定长 K + 补位）。
program sealary_conf.aleo {
    @noupgrade
    constructor() {}

    // 雇主私有薪资配置：owner=雇主（只雇主 view key 能解），记录某员工的薪资。
    record SalaryConfig {
        owner: address,      // 雇主
        employee: address,   // 员工地址
        token_id: field,     // 薪资币
        amount: u128,        // 薪资（base units，链上加密不可见）
    }

    // 单条设置（加员工时用，不补位、零浪费）。
    fn set_salary(employee: address, token_id: field, amount: u128) -> SalaryConfig {
        return SalaryConfig { owner: self.signer, employee: employee, token_id: token_id, amount: amount };
    }

    // 更新：消费旧配置、产出金额更新后的新配置。
    fn update_salary(old: SalaryConfig, amount: u128) -> SalaryConfig {
        return SalaryConfig { owner: old.owner, employee: old.employee, token_id: old.token_id, amount: amount };
    }

    // 批量设置（CSV 导入用）：一笔 tx 设最多 8 人。不足 8 位由前端补位（amount=0），
    // 读取端按 amount>0 过滤掉补位项。把审批次数从 N 降到 ⌈N/8⌉。
    fn set_salary_batch(token_id: field, employees: [address; 8], amounts: [u128; 8])
        -> (SalaryConfig, SalaryConfig, SalaryConfig, SalaryConfig, SalaryConfig, SalaryConfig, SalaryConfig, SalaryConfig) {
        return (
            SalaryConfig { owner: self.signer, employee: employees[0u8], token_id: token_id, amount: amounts[0u8] },
            SalaryConfig { owner: self.signer, employee: employees[1u8], token_id: token_id, amount: amounts[1u8] },
            SalaryConfig { owner: self.signer, employee: employees[2u8], token_id: token_id, amount: amounts[2u8] },
            SalaryConfig { owner: self.signer, employee: employees[3u8], token_id: token_id, amount: amounts[3u8] },
            SalaryConfig { owner: self.signer, employee: employees[4u8], token_id: token_id, amount: amounts[4u8] },
            SalaryConfig { owner: self.signer, employee: employees[5u8], token_id: token_id, amount: amounts[5u8] },
            SalaryConfig { owner: self.signer, employee: employees[6u8], token_id: token_id, amount: amounts[6u8] },
            SalaryConfig { owner: self.signer, employee: employees[7u8], token_id: token_id, amount: amounts[7u8] },
        );
    }
}
