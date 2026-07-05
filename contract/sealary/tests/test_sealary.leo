// Sealary 单元测试：分档逻辑 tier_of 的边界值。
// tier_of 是纯逻辑（不吃 record），是唯一会算错的地方，重点覆盖。
// pay 已由 spike 编译验证；prove_income/disclose 只是 record 外壳，靠 leo build 保证。
import sealary_pay.aleo;

program test_sealary.aleo {
    @noupgrade
    constructor() {}

    // threshold = 100u128；边界：99→0, 100→C(1), 109→C(1), 110→B(2), 199→B(2), 200→A(3)
    @test
    fn test_below_threshold() {
        assert_eq(sealary_pay.aleo::tier(99u128, 100u128), 0u8);
    }

    @test
    fn test_c_at_threshold() {
        assert_eq(sealary_pay.aleo::tier(100u128, 100u128), 1u8);
    }

    @test
    fn test_c_just_below_b() {
        assert_eq(sealary_pay.aleo::tier(109u128, 100u128), 1u8);
    }

    @test
    fn test_b_at_1_1x() {
        assert_eq(sealary_pay.aleo::tier(110u128, 100u128), 2u8);
    }

    @test
    fn test_b_just_below_a() {
        assert_eq(sealary_pay.aleo::tier(199u128, 100u128), 2u8);
    }

    @test
    fn test_a_at_2x() {
        assert_eq(sealary_pay.aleo::tier(200u128, 100u128), 3u8);
    }

    // 大数不溢出：threshold*2 接近上界仍正确分档
    @test
    fn test_large_no_overflow() {
        assert_eq(sealary_pay.aleo::tier(1_000_000_000_000u128, 500_000_000_000u128), 3u8);
    }
}
