import { useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { ArrowUpRight, BookOpen, Code2, Globe2, Menu, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/SealMark'
import { ConnectButton } from '@/components/ConnectButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setWallet, signIn } from '@/lib/auth'

const nav = [
  { to: '/employer', label: 'Employer' },
  { to: '/employee', label: 'Employee' },
  { to: '/verify', label: 'Verify' },
  { to: '/docs', label: 'Docs' },
]

const productLinks = [
  { href: '/employer', label: 'Employer console' },
  { href: '/employee', label: 'Employee wallet' },
  { href: '/verify', label: 'Verify a proof' },
  { href: '/docs', label: 'Sealary docs' },
]

const developerLinks = [
  { href: 'https://github.com/YanYuanFE/sealary', label: 'GitHub repository' },
  { href: 'https://developer.aleo.org/', label: 'Aleo developer docs' },
  { href: 'https://testnet.explorer.provable.com/program/sealary_payroll_v2.aleo', label: 'Payroll program' },
  { href: 'https://testnet.explorer.provable.com/program/sealary_conf.aleo', label: 'Salary config program' },
]

// 连钱包 → 绑定认证钱包 + SIWA 登录（拿会话 JWT；已有未过期会话则静默恢复，不弹签名）。
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

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="Open navigation">
                  <Menu className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 md:hidden">
                {nav.map((n) => (
                  <DropdownMenuItem key={n.to} asChild>
                    <NavLink
                      to={n.to}
                      className={({ isActive }) =>
                        cn(
                          'w-full px-2.5 py-2',
                          isActive && 'bg-secondary font-medium text-foreground',
                        )
                      }
                    >
                      {n.label}
                    </NavLink>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>

      <footer className="relative mt-24 overflow-hidden border-t border-border/70 bg-card/55">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_30%,oklch(0.47_0.145_32/0.09),transparent_55%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-5 py-14 sm:py-16">
          <div className="grid gap-12 md:grid-cols-[1.35fr_0.7fr_1fr] lg:gap-20">
            <div className="max-w-md">
              <Link to="/" className="inline-flex">
                <Wordmark />
              </Link>
              <p className="mt-6 font-heading text-2xl leading-snug font-semibold text-foreground">
                Sealed salary, provable income.
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Private payroll records on Aleo, with useful income proofs that leave the salary amount sealed.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-proven/20 bg-proven-soft/40 px-3 py-1.5 font-mono text-xs text-proven">
                <ShieldCheck className="size-3.5" />
                live on Aleo testnet
              </div>
            </div>

            <FooterLinkGroup title="Product" icon={<BookOpen className="size-4" />} links={productLinks} />
            <FooterLinkGroup title="Developers" icon={<Code2 className="size-4" />} links={developerLinks} external />
          </div>

          <div className="mt-12 grid gap-4 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span>© 2026 Sealary</span>
              <span className="inline-flex items-center gap-1.5">
                <Globe2 className="size-3.5 text-seal" />
                Aleo testnet
              </span>
              <span>Open-source hackathon project</span>
            </div>
            <a
              href="https://testnet.explorer.provable.com/program/sealary_payroll_v2.aleo"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-foreground transition-colors hover:text-seal"
            >
              sealary_payroll_v2.aleo
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FooterLinkGroup({
  title,
  icon,
  links,
  external,
}: {
  title: string
  icon: React.ReactNode
  links: { href: string; label: string }[]
  external?: boolean
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-mono text-xs tracking-wide text-foreground uppercase">
        <span className="text-seal">{icon}</span>
        {title}
      </h2>
      <nav aria-label={`${title} footer navigation`} className="mt-5 grid gap-3">
        {links.map((item) =>
          external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
              <ArrowUpRight className="size-3.5 opacity-45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </a>
          ) : (
            <Link
              key={item.href}
              to={item.href}
              className="group inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
              <ArrowUpRight className="size-3.5 rotate-45 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          ),
        )}
      </nav>
    </div>
  )
}
