// The 'test_spike' test program.
import spike.aleo;
program test_spike.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = spike.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
