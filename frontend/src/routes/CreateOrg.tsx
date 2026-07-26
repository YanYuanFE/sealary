import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Building2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { TokenCard } from '@/components/TokenCard'
import { ConnectButton } from '@/components/ConnectButton'
import { createCompany } from '@/lib/api'
import { qk, useCompany } from '@/lib/queries'
import type { TokenInfo } from '@/lib/units'

export function CreateOrg() {
  const navigate = useNavigate()
  const { connected, address } = useWallet()
  const [name, setName] = useState('')
  const [payDay, setPayDay] = useState(25) // 每月发薪日
  const [tokenId, setTokenId] = useState('')
  const [token, setToken] = useState<TokenInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const { data: existing } = useCompany()

  const ready = connected && !!address && name.trim() !== '' && !!token && !busy

  async function submit() {
    if (!ready || !address || !token) return
    setBusy(true)
    try {
      const created = await createCompany({ name: name.trim(), tokenId: tokenId.trim(), symbol: token.symbol || token.name, decimals: token.decimals, payDay })
      qc.setQueryData(qk.company(address), created) // 免得 /employer 用旧的 null 缓存显示"还没有组织"
      toast.success(`Organization “${name.trim()}” created`, { description: `Payroll token ${token.symbol || token.name} · ${token.decimals} decimals` })
      navigate('/employer')
    } catch (e) {
      toast.error('Create failed', { description: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <PageHeader
        eyebrow="Setup"
        title="Create your organization"
        desc="Bind your company to a payroll token. Pay runs draw from a registered token you already hold — issue one first with the bootstrap script, then reference its token_id here."
      />

      {!connected ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Building2 className="size-8 text-seal" />
          <p className="text-sm text-muted-foreground">Connect your employer wallet to create an organization.</p>
          <ConnectButton />
        </Card>
      ) : existing ? (
        <Card className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">This wallet already owns an organization:</p>
          <div className="font-heading text-lg font-semibold">{existing.name}</div>
          <Button onClick={() => navigate('/employer')}>
            Go to console <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <Field label="Company name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Labs" />
          </Field>
          <Field label="Pay day (monthly)">
            <select className="field" value={payDay} onChange={(e) => setPayDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Day {d}</option>
              ))}
            </select>
          </Field>
          <Field label="Payroll token_id">
            <input className="field font-mono text-xs" value={tokenId} onChange={(e) => setTokenId(e.target.value.trim())} placeholder="7777field" />
          </Field>
          <TokenCard tokenId={tokenId} onResolved={setToken} />
          <Button className="w-full" disabled={!ready} onClick={submit}>
            Create organization <ArrowRight className="size-4" />
          </Button>
        </Card>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
