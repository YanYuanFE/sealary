import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Database, EyeOff, Globe2, Minus, ScanEye, ShieldCheck, Stamp, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SealMark } from '@/components/brand/SealMark'
import { SealedAmount } from '@/components/SealedAmount'
import { TierBadge } from '@/components/TierBadge'
import { HeroShader } from '@/components/marketing/HeroShader'
import { tierOf, shortAddr } from '@/lib/format'

const DEMO_AMOUNT = 14200
const DEMO_THRESHOLD = 8000

type DemoState = 'sealed' | 'proven' | 'disclosed'

export function Home() {
  const [state, setState] = useState<DemoState>('sealed')
  const revealed = state === 'disclosed'
  const tier = tierOf(DEMO_AMOUNT, DEMO_THRESHOLD)

  return (
    <div className="space-y-24">
      <section className="landing-paper relative left-1/2 -mt-10 w-screen -translate-x-1/2 overflow-hidden border-b border-border/70 px-5 py-16 sm:py-20 lg:min-h-[calc(100dvh-4rem)] lg:py-24">
        <HeroShader />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(520px,0.95fr)_1.05fr]">
          <div>
            <div className="reveal" style={{ animationDelay: '0ms' }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 font-mono text-xs text-muted-foreground shadow-sm backdrop-blur-md">
                Aleo zero-knowledge payroll
              </span>
            </div>
            <h1 className="reveal mt-6 max-w-3xl font-heading text-5xl leading-[1.02] font-semibold tracking-tight text-foreground sm:text-6xl xl:text-7xl" style={{ animationDelay: '80ms' }}>
              Private payroll.
              <br />
              <span className="text-seal">Provable income.</span>
            </h1>
            <p className="reveal mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: '160ms' }}>
              Pay privately on Aleo. Prove income tiers without revealing salary amounts.
            </p>
            <div className="reveal mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '240ms' }}>
              <Button asChild size="lg" className="rounded-md bg-primary px-5">
                <Link to="/employer">
                  Open console <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-md bg-card/60 backdrop-blur">
                <Link to="/employee">View employee flow</Link>
              </Button>
            </div>
          </div>

          <div className="reveal relative min-h-[520px]" style={{ animationDelay: '180ms' }}>
            <div className="glass-proof absolute right-0 top-4 hidden w-[78%] rotate-3 rounded-2xl border border-white/60 p-5 backdrop-blur-md md:block">
              <div className="flex items-start justify-between gap-8">
                <div>
                  <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">ZK proof</p>
                  <p className="mt-3 font-mono text-sm text-foreground">proof_8e7d9c2b1a6f</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">network: aleo testnet</p>
                </div>
                <TierBadge tier={tier} />
              </div>
            </div>

            <Card className="absolute left-0 top-20 w-[82%] rotate-[-4deg] gap-0 overflow-hidden border-border/80 bg-card/90 p-0 shadow-[0_24px_70px_-42px_oklch(0.235_0.014_62/0.55)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <SealMark size={30} />
                  <div className="leading-tight">
                    <p className="font-heading text-lg font-semibold">Payslip</p>
                    <p className="font-mono text-xs text-muted-foreground">2026-07</p>
                  </div>
                </div>
                <span className="rounded-full bg-seal-soft px-3 py-1 font-mono text-[0.68rem] tracking-widest text-seal uppercase">
                  sealed
                </span>
              </div>
              <div className="px-6 py-7">
                <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Monthly salary</p>
                <div className="mt-3 flex min-h-14 items-center">
                  <SealedAmount amount={DEMO_AMOUNT} revealed={revealed} size="lg" />
                </div>
                <div className="mt-6 grid gap-3 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                  <span>owner {shortAddr('aleo1z62rhxmej9ldd9hf76xa6r5p2dm4fgvsxv90p728mrgzm4ywz5fqezlww8')}</span>
                  <span>program sealary_pay.aleo</span>
                  <span>token zUSD</span>
                  <span>record encrypted</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-border/70 bg-border/70">
                <DemoTab active={state === 'sealed'} onClick={() => setState('sealed')} icon={<Stamp className="size-4" />} label="Sealed" />
                <DemoTab active={state === 'proven'} onClick={() => setState('proven')} icon={<ShieldCheck className="size-4" />} label="Prove ≥ $8k" />
                <DemoTab active={state === 'disclosed'} onClick={() => setState('disclosed')} icon={<ScanEye className="size-4" />} label="Disclose" />
              </div>
            </Card>

            <Card className="absolute bottom-3 right-4 w-[58%] gap-0 border-proven/20 bg-card/85 p-5 shadow-[0_20px_48px_-36px_oklch(0.235_0.014_62/0.45)] backdrop-blur">
              {state === 'proven' && (
                <div className="reveal-blur">
                  <TierBadge tier={tier} />
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Verifier learns the tier for a ${DEMO_THRESHOLD.toLocaleString()} threshold. The amount stays hidden.
                  </p>
                </div>
              )}
              {state === 'disclosed' && (
                <p className="reveal-blur text-sm leading-relaxed text-muted-foreground">
                  The owner breaks the seal for one payslip and one receiving party.
                </p>
              )}
              {state === 'sealed' && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Encrypted on-chain. Colleagues, the public, and validators see no salary amount.
                </p>
              )}
            </Card>
          </div>
        </div>
      </section>

      <PrivacyMatrix />

      <FlowStory />

      <RoleEntry />
    </div>
  )
}

function RoleEntry() {
  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 border-y border-border/70 bg-secondary/35 px-5 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h2 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-foreground sm:text-5xl">
            Three consoles. One privacy model.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Each role gets a focused app surface. The landing page carries the story, the console keeps the work clear.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <RolePanel
            to="/employer"
            icon={<Building2 className="size-5" />}
            title="Employer"
            body="Register zUSD, add employees, and run a private batch pay without publishing payroll."
            cta="Open employer console"
            featured
          >
            <EmployerPreview />
          </RolePanel>

          <div className="grid gap-5">
            <RolePanel
              to="/employee"
              icon={<User className="size-5" />}
              title="Employee"
              body="Decrypt your own Paystub records, prove income, and decide when to disclose."
              cta="View employee wallet"
            >
              <EmployeePreview />
            </RolePanel>
            <RolePanel
              to="/verify"
              icon={<BadgeCheck className="size-5" />}
              title="Verifier"
              body="Request a threshold proof and receive a tier result without receiving a payslip."
              cta="Open verifier portal"
            >
              <VerifierPreview />
            </RolePanel>
          </div>
        </div>
      </div>
    </section>
  )
}

function RolePanel({
  to,
  icon,
  title,
  body,
  cta,
  children,
  featured,
}: {
  to: string
  icon: React.ReactNode
  title: string
  body: string
  cta: string
  children: React.ReactNode
  featured?: boolean
}) {
  return (
    <Link to={to} className="group block h-full">
      <Card className={`h-full gap-0 overflow-hidden border-border/80 bg-card/90 p-0 transition-all group-hover:-translate-y-0.5 group-hover:border-seal/30 group-hover:shadow-[0_18px_55px_-38px_oklch(0.235_0.014_62/0.5)] ${featured ? 'min-h-[520px]' : ''}`}>
        <div className="grid h-full gap-0 md:grid-cols-[0.95fr_1.05fr] lg:grid-cols-1 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-between border-b border-border/70 p-6 md:border-b-0 md:border-r lg:border-b lg:border-r-0 xl:border-b-0 xl:border-r">
            <div>
              <span className="grid size-11 place-items-center rounded-lg bg-secondary text-foreground ring-1 ring-border transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                {icon}
              </span>
              <h3 className="mt-5 font-heading text-3xl font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
            <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-foreground">
              {cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 group-hover:text-seal" />
            </span>
          </div>
          <div className="min-h-[260px] p-5">{children}</div>
        </div>
      </Card>
    </Link>
  )
}

function EmployerPreview() {
  const rows = [
    ['Amina Yusuf', 'Product', 'pending'],
    ['Liam OConnor', 'Engineering', 'pending'],
    ['Mei Chen', 'Design', 'finalized'],
    ['Noah Patel', 'Data', 'finalized'],
  ]

  return (
    <div className="flex h-full min-h-[360px] flex-col rounded-xl border border-border bg-background/70 p-4 shadow-inner">
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Payroll overview</p>
          <p className="mt-1 font-heading text-xl font-semibold">July pay run</p>
        </div>
        <span className="rounded-full bg-proven-soft px-3 py-1 font-mono text-xs text-proven">zUSD ready</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {['Register', 'Mint', 'Employees', 'Batch pay'].map((item) => (
          <div key={item} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
            {item}
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        {rows.map(([name, role, status]) => (
          <div key={name} className="grid grid-cols-[1.15fr_0.9fr_auto] items-center gap-3 border-b border-border/60 px-3 py-3 text-sm last:border-b-0">
            <span className="truncate text-foreground">{name}</span>
            <span className="truncate text-muted-foreground">{role}</span>
            <span className={`rounded-full px-2 py-1 font-mono text-[0.65rem] ${status === 'finalized' ? 'bg-proven-soft text-proven' : 'bg-pending-soft text-pending'}`}>
              {status}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-4">
        <div className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">
          Batch pay privately
        </div>
      </div>
    </div>
  )
}

function EmployeePreview() {
  return (
    <div className="grid h-full min-h-[240px] gap-4">
      <div className="rounded-xl border border-border bg-background/70 p-4">
        <div className="flex items-center justify-between">
          <p className="font-heading text-xl font-semibold">Paystub records</p>
          <span className="rounded-full bg-seal-soft px-3 py-1 font-mono text-xs text-seal">sealed</span>
        </div>
        <div className="mt-4 space-y-2">
          {['2026-07-31', '2026-07-15', '2026-06-30'].map((period, index) => (
            <div key={period} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${index === 0 ? 'border-seal/25 bg-seal-soft/25' : 'border-border bg-card'}`}>
              <span>{period}</span>
              <span className="font-mono text-muted-foreground">•••••• zUSD</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-proven/25 bg-proven-soft/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs tracking-wide text-proven uppercase">Generated tier</p>
            <p className="mt-1 text-sm text-muted-foreground">Proof without exact salary</p>
          </div>
          <TierBadge tier={2} />
        </div>
      </div>
    </div>
  )
}

function VerifierPreview() {
  return (
    <div className="grid h-full min-h-[240px] place-items-center">
      <div className="w-full rounded-xl border border-border bg-background/70 p-4">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Threshold request</p>
        <div className="mt-3 flex items-center rounded-lg border border-border bg-card">
          <span className="border-r border-border px-3 py-3 text-sm text-muted-foreground">zUSD</span>
          <span className="px-3 py-3 font-mono text-lg text-foreground">10,000</span>
        </div>
        <div className="mt-4 rounded-lg border border-proven/25 bg-proven-soft/35 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-2xl font-semibold text-proven">Tier B</p>
              <p className="mt-1 text-sm text-muted-foreground">Threshold met</p>
            </div>
            <CheckCircle2 className="size-7 text-proven" />
          </div>
          <div className="mt-4 border-t border-proven/20 pt-3 font-mono text-xs text-muted-foreground">
            amount hidden&nbsp;&nbsp;proof_7f3c19b2
          </div>
        </div>
      </div>
    </div>
  )
}

function FlowStory() {
  return (
    <section className="relative">
      <div className="absolute left-1/2 top-20 hidden h-px w-screen -translate-x-1/2 bg-border/70 lg:block" aria-hidden />
      <div className="grid items-start gap-10 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="lg:sticky lg:top-28">
          <h2 className="max-w-xl font-heading text-4xl leading-tight font-semibold tracking-tight text-foreground sm:text-5xl">
            One payslip. Three disclosure levels.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            The same Paystub record moves from private payroll to threshold proof to owner-approved disclosure.
          </p>
          <Button asChild variant="outline" className="mt-7 rounded-md bg-card/70">
            <Link to="/employee">
              Try the employee flow <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5">
          <FlowStep
            verb="Seal"
            caption="Private transfer"
            icon={<Stamp className="size-5" />}
            body="The employer pays with a private payroll token. The employee receives an encrypted Paystub record."
          >
            <SealedArtifact />
          </FlowStep>
          <FlowStep
            verb="Prove"
            caption="Threshold tier"
            icon={<ShieldCheck className="size-5" />}
            body="The employee proves income against a verifier threshold. The verifier receives a tier, not the salary amount."
            accent="proven"
          >
            <ProofArtifact />
          </FlowStep>
          <FlowStep
            verb="Disclose"
            caption="Single record"
            icon={<ScanEye className="size-5" />}
            body="For a bank or landlord, the employee can reveal one payslip. The rest of the wallet remains sealed."
            accent="seal"
          >
            <DisclosureArtifact />
          </FlowStep>
        </div>
      </div>
    </section>
  )
}

function FlowStep({
  verb,
  caption,
  icon,
  body,
  children,
  accent = 'neutral',
}: {
  verb: string
  caption: string
  icon: React.ReactNode
  body: string
  children: React.ReactNode
  accent?: 'neutral' | 'proven' | 'seal'
}) {
  const tone =
    accent === 'proven'
      ? 'border-proven/25 bg-proven-soft/20'
      : accent === 'seal'
        ? 'border-seal/25 bg-seal-soft/25'
        : 'border-border/80 bg-card/75'

  return (
    <Card className={`grid gap-0 overflow-hidden p-0 md:grid-cols-[0.9fr_1.1fr] ${tone}`}>
      <div className="flex flex-col justify-between border-b border-border/60 p-6 md:border-b-0 md:border-r">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-card text-foreground ring-1 ring-border">
              {icon}
            </span>
            <div>
              <h3 className="font-heading text-3xl font-semibold leading-none tracking-tight">{verb}</h3>
              <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">{caption}</p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <p className="mt-8 font-mono text-xs text-muted-foreground">// {verb.toLowerCase()} record</p>
      </div>
      <div className="min-h-[260px] p-5">{children}</div>
    </Card>
  )
}

function SealedArtifact() {
  return (
    <div className="relative grid h-full min-h-[250px] place-items-center">
      <div className="absolute inset-x-10 top-12 h-28 rounded-[2rem] border border-border bg-secondary/60 shadow-inner" />
      <Card className="relative w-full max-w-md rotate-[-3deg] gap-0 border-border/80 bg-card/95 p-0 shadow-[0_20px_48px_-34px_oklch(0.235_0.014_62/0.55)]">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Paystub record</p>
            <p className="mt-1 font-heading text-xl font-semibold">July 2026</p>
          </div>
          <SealMark size={38} />
        </div>
        <div className="px-5 py-6">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Sealed net pay</p>
          <div className="mt-3">
            <SealedAmount amount={DEMO_AMOUNT} revealed={false} size="md" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 font-mono text-[0.7rem] text-muted-foreground">
            <span>token zUSD</span>
            <span>period 2026-07</span>
            <span>hash 3f8a...b28f</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ProofArtifact() {
  return (
    <div className="relative grid h-full min-h-[250px] place-items-center">
      <div className="glass-proof absolute inset-7 rotate-2 rounded-2xl border border-white/60 backdrop-blur-md" />
      <Card className="relative w-full max-w-md gap-0 border-proven/25 bg-card/90 p-0 shadow-[0_20px_48px_-34px_oklch(0.235_0.014_62/0.45)]">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="font-mono text-xs tracking-wide text-proven uppercase">Income proof</p>
            <p className="mt-1 font-heading text-xl font-semibold">Threshold met</p>
          </div>
          <TierBadge tier={2} />
        </div>
        <div className="grid gap-4 px-5 py-6">
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Amount</p>
            <div className="mt-2">
              <SealedAmount amount={DEMO_AMOUNT} revealed={false} size="sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['A', 'B', 'C'].map((grade) => (
              <div key={grade} className={`rounded-lg border px-3 py-2 text-center ${grade === 'B' ? 'border-proven bg-proven-soft text-proven' : 'border-border bg-card text-muted-foreground'}`}>
                <p className="font-heading text-lg font-semibold">{grade}</p>
                <p className="font-mono text-[0.65rem] uppercase">{grade === 'B' ? 'match' : grade === 'A' ? 'higher' : 'lower'}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

function DisclosureArtifact() {
  return (
    <div className="relative grid h-full min-h-[250px] place-items-center">
      <Card className="relative w-full max-w-md rotate-2 gap-0 border-seal/25 bg-card/95 p-0 shadow-[0_20px_48px_-34px_oklch(0.235_0.014_62/0.48)]">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="font-mono text-xs tracking-wide text-seal uppercase">Disclosure packet</p>
            <p className="mt-1 font-heading text-xl font-semibold">ABC Bank</p>
          </div>
          <span className="rounded-full bg-seal px-3 py-1 font-mono text-xs text-seal-foreground">opened</span>
        </div>
        <div className="space-y-4 px-5 py-6">
          <div className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
            <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Gross pay</span>
            <span className="font-mono font-semibold text-foreground">$14,200 zUSD</span>
          </div>
          <div className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
            <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Period</span>
            <span>July 2026</span>
          </div>
          <div className="rounded-lg border border-seal/20 bg-seal-soft/45 p-3 text-sm text-seal">
            Revealed by the owner for one verifier.
          </div>
        </div>
      </Card>
    </div>
  )
}

const privacyRows = [
  {
    label: 'Employer',
    detail: 'Organization',
    public: 'Greenfield Ltd.',
    employee: 'Greenfield Ltd.',
    verifier: 'Verified source',
    verifierOk: true,
  },
  {
    label: 'Role',
    detail: 'Job title',
    public: 'Senior engineer',
    employee: 'Senior engineer',
    verifier: 'Senior engineer',
    verifierOk: true,
  },
  {
    label: 'Income tier',
    detail: 'Threshold proof',
    public: 'Hidden',
    employee: 'Tier B',
    verifier: 'Tier B',
    verifierOk: true,
    tier: true,
  },
  {
    label: 'Salary amount',
    detail: 'Exact number',
    public: 'Hidden',
    employee: 'Visible to owner',
    verifier: 'Hidden',
    sealed: true,
  },
  {
    label: 'Payslip',
    detail: 'Single record',
    public: 'Hidden',
    employee: 'Private record',
    verifier: 'Only if disclosed',
  },
]

function PrivacyMatrix() {
  return (
    <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_0.9fr]">
      <div className="min-w-0">
        <h2 className="max-w-[13ch] font-heading text-3xl leading-tight font-semibold tracking-tight text-foreground md:max-w-3xl md:text-5xl">
          Salary should not be public infrastructure.
        </h2>
        <p className="mt-5 max-w-[34ch] text-base leading-relaxed text-muted-foreground md:max-w-2xl md:text-lg">
          Sealary separates private payroll data from public verification. Each party receives the minimum useful answer.
        </p>

        <Card className="mt-8 max-w-full gap-0 overflow-hidden border-border/80 bg-card/80 p-0 shadow-[0_18px_50px_-42px_oklch(0.235_0.014_62/0.45)]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] border-b border-border/70 bg-secondary/45 text-sm">
                <MatrixHead label="Data view" />
                <MatrixHead icon={<Globe2 className="size-4" />} label="Public" sub="Anyone" />
                <MatrixHead icon={<User className="size-4" />} label="Employee" sub="Self" />
                <MatrixHead icon={<ShieldCheck className="size-4" />} label="Verifier" sub="Authorized" />
              </div>

              {privacyRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] border-b border-border/60 last:border-b-0">
                  <div className="px-4 py-4">
                    <p className="font-mono text-xs tracking-wide text-foreground uppercase">{row.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <PrivacyCell value={row.public} sealed={row.sealed || row.public === 'Hidden'} />
                  <PrivacyCell value={row.employee} tier={row.tier} />
                  <PrivacyCell value={row.verifier} ok={row.verifierOk} sealed={row.sealed || row.verifier === 'Hidden'} tier={row.tier} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="mt-4 grid gap-4 border-border/80 bg-card/70 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Database className="size-5" />
          </span>
          <div>
            <p className="font-mono text-xs tracking-wide text-foreground uppercase">Observed on-chain</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Outsiders see encrypted records and proofs. No salary amounts or payslip contents are visible.
            </p>
          </div>
          <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 font-mono text-xs text-muted-foreground">
            record hash&nbsp;&nbsp;6f2a...b91c
          </div>
        </Card>
      </div>

      <div className="relative">
        <div className="absolute -right-4 -top-4 hidden h-36 w-36 rounded-full bg-proven-soft/50 blur-3xl sm:block" aria-hidden />
        <PayslipSpecimen />
        <div className="mt-6 border-l border-border pl-5">
          <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Least disclosure. Maximum trust.</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Prove enough for a rental screen, loan pre-check, or audit request without turning salary into public metadata.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-seal-soft px-3 py-1 font-mono text-xs text-seal">amount hidden</span>
            <span className="rounded-full bg-proven-soft px-3 py-1 font-mono text-xs text-proven">tier verified</span>
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs text-muted-foreground">single disclosure</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function MatrixHead({ icon, label, sub }: { icon?: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="border-r border-border/70 px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-2 font-mono text-xs tracking-wide text-foreground uppercase">
        {icon}
        {label}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PrivacyCell({ value, sealed, ok, tier }: { value: string; sealed?: boolean; ok?: boolean; tier?: boolean }) {
  return (
    <div className="flex min-h-[4.75rem] items-center border-r border-border/60 px-4 py-3 last:border-r-0">
      {sealed ? (
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <EyeOff className="size-4 text-seal/75" />
          <span className="inline-block h-2.5 w-20 rounded-sm bg-foreground" />
        </span>
      ) : ok ? (
        <span className="inline-flex items-center gap-2 text-sm text-proven">
          <CheckCircle2 className="size-4" />
          {value}
        </span>
      ) : tier ? (
        <span className="inline-flex items-center gap-2 text-sm text-foreground">
          <span className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs">B</span>
          {value}
        </span>
      ) : value === 'Hidden' ? (
        <Minus className="size-4 text-muted-foreground" />
      ) : (
        <span className="text-sm text-foreground">{value}</span>
      )}
    </div>
  )
}

function PayslipSpecimen() {
  return (
    <Card className="relative mx-auto max-w-md gap-0 overflow-hidden border-border/80 bg-card/90 p-0 shadow-[0_22px_60px_-42px_oklch(0.235_0.014_62/0.55)]">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
        <div>
          <p className="font-mono text-xs tracking-widest text-seal uppercase">Payslip specimen</p>
          <h3 className="mt-2 font-heading text-2xl font-semibold">Sealed record</h3>
        </div>
        <SealMark size={44} />
      </div>
      <div className="space-y-5 px-6 py-7">
        <SpecRow label="Employee ID" value="EMP-7F3A19" />
        <SpecRow label="Pay period" value="July 2026" />
        <SpecRow label="Employer" value="Greenfield Ltd." />
        <div className="border-t border-border/70 pt-5">
          <SpecRedacted label="Gross pay" />
          <SpecRedacted label="Deductions" />
          <SpecRedacted label="Net pay" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-proven/20 bg-proven-soft/40 px-4 py-3">
          <div>
            <p className="font-mono text-xs tracking-wide text-proven uppercase">Verifier result</p>
            <p className="mt-1 text-sm text-muted-foreground">Tier visible, amount hidden</p>
          </div>
          <TierBadge tier={2} />
        </div>
      </div>
    </Card>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 text-sm">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

function SpecRedacted({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="flex items-center gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-seal/55" />
        ))}
      </span>
    </div>
  )
}

function DemoTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-2 py-3 text-sm transition-colors ${
        active ? 'bg-secondary font-medium text-foreground' : 'bg-card text-muted-foreground hover:bg-secondary/50'
      }`}
    >
      <span className={active ? 'text-seal' : ''}>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
