import { Link } from 'react-router-dom'
import { Building2, KeyRound, BadgeCheck, Wallet, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { PAY_BATCH, SALARY_BATCH, HR_PROGRAM, PROGRAM } from '@/lib/aleo'

// 三角色操作指南。数字（批次大小、程序名）从 lib/aleo 取，改常量时文档跟着变，不会写死过期。
export function Docs() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Docs"
        title="How to use Sealary"
        desc="Three roles, one wallet each. Employers run payroll, employees hold and prove their payslips, verifiers check a proof without ever seeing an amount."
      />

      <Section icon={<Wallet className="size-5 text-seal" />} title="Getting started" anchor="start">
        <p>Everything runs on <strong>Aleo Testnet</strong>. You need a wallet before any page will do anything.</p>
        <Steps>
          <Step n={1} title="Install Shield">
            Get the <A href="https://shield.aleo.org">Shield wallet</A> and switch the network to <Code>Testnet</Code>.
            Sealary asks for decrypt permission on <Code>{PROGRAM}</Code>, <Code>{HR_PROGRAM}</Code> and{' '}
            <Code>token_registry.aleo</Code> — that permission is what lets your own records be read locally.
          </Step>
          <Step n={2} title="Fund it with testnet credits">
            Every on-chain action costs a fee in <strong>Aleo credits</strong> — separate from your payroll token.
            Get some at <A href="https://faucet.aleo.org/">faucet.aleo.org</A>. Without them Sealary disables every
            on-chain button rather than letting the transaction fail halfway.
          </Step>
          <Step n={3} title="Connect">
            Hit <strong>Connect wallet</strong> in the header. Your wallet signs a one-off login message
            (Sign in with Aleo) — no password, no email. The session lasts 7 days and survives refreshes.
          </Step>
        </Steps>
        <Note>
          Salary amounts are <strong>never</strong> sent to the server. They live in encrypted records that only
          your wallet key can open. The backend stores names (encrypted), plus who was paid in which period.
        </Note>
      </Section>

      <Section icon={<Building2 className="size-5 text-seal" />} title="For employers" anchor="employers">
        <Steps>
          <Step n={1} title="Create your organization">
            Go to <Nav to="/setup">Setup</Nav>. You need a payroll token that already exists on-chain — its{' '}
            <Code>token_id</Code> (a <Code>…field</Code> value from <Code>token_registry.aleo</Code>). The demo uses
            zUSD, <Code>7777field</Code>, 6 decimals, issued by <Code>contract/sealary/bootstrap.sh</Code>.
            Paste the id and Sealary reads the symbol and decimals off-chain to confirm you picked the right one.
            Pick a <strong>pay day</strong> (1–28) — the console counts down to it.
          </Step>
          <Step n={2} title="Add employees">
            Name and Aleo address go to the backend (the name AES-256-GCM encrypted, per-person key).
            The <strong>salary never does</strong> — it's sealed into an on-chain <Code>SalaryConfig</Code> record
            only your wallet can decrypt. One wallet approval per employee.
            <br />
            Bulk instead: <strong>Import CSV</strong> with <Code>name,address,salary</Code> per line (header optional,
            there's a template to download). Salaries are sealed {SALARY_BATCH} per transaction, so importing 40 people
            is {Math.ceil(40 / SALARY_BATCH)} approvals, not 40.
          </Step>
          <Step n={3} title="Run payroll">
            <strong>Pay batch</strong> pays up to {PAY_BATCH} employees in a single transaction — {PAY_BATCH} private
            transfers plus {PAY_BATCH} sealed Paystubs, one approval. Repeat until Pending hits zero. The button greys
            out when nobody is payable: either everyone's already paid this period, or their salary isn't on-chain yet.
            <br />
            Off-cycle payment? The <strong>gift</strong> icon on a roster row sends a one-off amount (bonus, retro pay,
            contractor fee) without marking that person as paid for the month.
          </Step>
          <Step n={4} title="Edit, remove, export">
            The <strong>pencil</strong> icon edits a name or salary — the address is locked, because a different
            address is a different person and their payment history would follow the old one. Changing only the name
            costs no gas.
            <br />
            The <strong>trash</strong> icon is GDPR erasure: it destroys that employee's encryption key, so their
            stored name becomes permanently unreadable and they leave the roster. Past payment records stay but go
            anonymous — period and transaction id only. Payroll history is a legal record employers must keep.
            <br />
            <strong>Export</strong> gives you payment history as CSV; <strong>Report</strong> gives per-period totals
            with no identities. Every export ends with a <Code>#&nbsp;sealary-export … sha256=…</Code> line covering
            the rows above it — strip that line, hash the rest, compare, and you know the file wasn't edited.
          </Step>
        </Steps>
      </Section>

      <Section icon={<KeyRound className="size-5 text-seal" />} title="For employees" anchor="employees">
        <Steps>
          <Step n={1} title="Unlock your payslips">
            Connect on <Nav to="/employee">Employee</Nav> and hit <strong>Decrypt with view key</strong>. Decryption
            happens in your browser — nothing is sent anywhere. If you see nothing, you haven't been paid yet on this
            wallet.
          </Step>
          <Step n={2} title="Prove your income without revealing it">
            Drag the threshold slider to whatever a landlord or lender is asking for, then{' '}
            <strong>Generate proof</strong>. The transaction publishes a <strong>tier</strong> and nothing else:
            <TierTable />
            Send the resulting transaction id to whoever asked. They learn the tier, the issuing employer and the
            token — never the number.
          </Step>
          <Step n={3} title="Or disclose one payslip in full">
            <strong>Disclose</strong> breaks the seal on a single period on purpose — the amount becomes public on
            that transaction. Use it when a tier isn't enough. You note who you're sending it to, and it lands in
            your personal <strong>disclosure log</strong> so there's a record of who saw what, and when.
          </Step>
        </Steps>
        <Note>
          Payslips are yours. They are records in <em>your</em> wallet — removing you from the roster doesn't take
          them away, and your employer can't decrypt them.
        </Note>
      </Section>

      <Section icon={<BadgeCheck className="size-5 text-seal" />} title="For verifiers" anchor="verifiers">
        <p>
          Someone sent you a transaction id. Paste it into <Nav to="/verify">Verify</Nav> — it starts with{' '}
          <Code>at1…</Code> — and you get back the income tier, the employer who issued the payslip, and the token it
          was paid in.
        </p>
        <p>
          You don't need a wallet, an account, or the employee's cooperation. The proof was verified by the Aleo
          network when the transaction landed; Sealary just reads the public output. Check that the issuing employer
          is who the applicant claims to work for — that's what stops someone minting themselves a fake payslip.
        </p>
        <Note>
          A <strong>disclosed</strong> payslip is different: there the exact amount is public on the transaction,
          because the employee chose to break the seal.
        </Note>
      </Section>

      <Card className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Ready to try it? Start by creating an organization.</p>
        <Button asChild>
          <Link to="/setup">Create organization <ArrowRight className="size-4" /></Link>
        </Button>
      </Card>
    </div>
  )
}

// tierOf 的边界（lib/format.ts）：<T → 0，≥T → 1，≥1.1T → 2，≥2T → 3。
function TierTable() {
  const rows: [string, string][] = [
    ['Tier 0', 'below the threshold'],
    ['Tier 1', 'at or above the threshold'],
    ['Tier 2', 'at least 1.1× the threshold'],
    ['Tier 3', 'at least 2× the threshold'],
  ]
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/80">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([tier, meaning]) => (
            <tr key={tier} className="border-b border-border/50 last:border-0">
              <td className="w-24 px-4 py-2">
                <Badge variant="outline" className="font-mono text-xs">{tier}</Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ icon, title, anchor, children }: {
  icon: React.ReactNode; title: string; anchor: string; children: React.ReactNode
}) {
  return (
    <section id={anchor} className="scroll-mt-20">
      <Card className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">{icon} {title}</h2>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </Card>
    </section>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-4">{children}</ol>
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary font-mono text-xs font-semibold text-foreground">
        {n}
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-seal/20 bg-seal-soft/30 p-3 text-sm text-muted-foreground">{children}</p>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-seal">
      {children}
    </a>
  )
}

function Nav({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="font-medium text-foreground underline underline-offset-2 hover:text-seal">{children}</Link>
}
