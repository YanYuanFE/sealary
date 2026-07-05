import { useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/SealMark'
import { ConnectButton } from '@/components/ConnectButton'
import { setWallet, signIn } from '@/lib/auth'

const nav = [
  { to: '/employer', label: 'Employer' },
  { to: '/employee', label: 'Employee' },
  { to: '/verify', label: 'Verify' },
]

// 连钱包 → 绑定认证钱包 + 尝试 SIWA 登录（拿会话 JWT；dev 下失败则回退 x-dev-wallet）。
function useAuthSync() {
  const { connected, address, signMessage } = useWallet()
  useEffect(() => {
    setWallet(connected && address ? address : null)
    if (connected && address && signMessage) void signIn(address, signMessage)
  }, [connected, address, signMessage])
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useAuthSync()
  return (
    <div className="paper-bg flex min-h-screen flex-col text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>

      <footer className="mt-16 border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-1 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-base text-foreground">Sealed salary, provable income.</span>
          <span className="font-mono text-xs">
            built on Aleo · sealary_pay.aleo · testnet
          </span>
        </div>
      </footer>
    </div>
  )
}
