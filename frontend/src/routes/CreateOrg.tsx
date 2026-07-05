import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Building2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { TokenCard } from '@/components/TokenCard'
import { ConnectButton } from '@/components/ConnectButton'
import { createCompany, getCompanyByWallet } from '@/lib/api'
import type { TokenInfo } from '@/lib/units'

export function CreateOrg() {
  const navigate = useNavigate()
  const { connected, address } = useWallet()
  const [name, setName] = useState('')
  const [region, setRegion] = useState('EU')
  const [tokenId, setTokenId] = useState('')
  const [token, setToken] = useState<TokenInfo | null>(null)

  const existing = connected && address ? getCompanyByWallet(address) : undefined
  const ready = connected && !!address && name.trim() !== '' && !!token

  function submit() {
    if (!ready || !address || !token) return
    createCompany({ employerWallet: address, name: name.trim(), region, tokenId: tokenId.trim(), symbol: token.symbol || token.name, decimals: token.decimals })
    toast.success(`Organization “${name.trim()}” created`, { description: `Payroll token ${token.symbol || token.name} · ${token.decimals} decimals` })
    navigate('/employer')
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
          <Button className="rounded-full" onClick={() => navigate('/employer')}>
            Go to console <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <Field label="Company name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Labs" />
          </Field>
          <Field label="Data region">
            <select className="field" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="EU">EU</option>
              <option value="US">US</option>
            </select>
          </Field>
          <Field label="Payroll token_id">
            <input className="field font-mono text-xs" value={tokenId} onChange={(e) => setTokenId(e.target.value.trim())} placeholder="7777field" />
          </Field>
          <TokenCard tokenId={tokenId} onResolved={setToken} />
          <Button className="w-full rounded-full" disabled={!ready} onClick={submit}>
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
