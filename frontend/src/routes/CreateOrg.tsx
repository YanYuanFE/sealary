import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { toast } from 'sonner'
import { Building2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { TokenCard } from '@/components/TokenCard'
import { ConnectButton } from '@/components/ConnectButton'
import { createCompany, getCompany, type Company } from '@/lib/api'
import type { TokenInfo } from '@/lib/units'

// 公司所在国：ISO-2 国家码（对齐 Paychain 的 country_code 做法——自由输入，datalist 只是提示）。
const COUNTRIES: [string, string][] = [
  ['ES', 'Spain'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['PT', 'Portugal'], ['IE', 'Ireland'], ['BE', 'Belgium'], ['AT', 'Austria'], ['PL', 'Poland'],
  ['SE', 'Sweden'], ['DK', 'Denmark'], ['FI', 'Finland'], ['GB', 'United Kingdom'], ['CH', 'Switzerland'],
  ['US', 'United States'], ['CA', 'Canada'], ['BR', 'Brazil'], ['MX', 'Mexico'], ['AR', 'Argentina'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['HK', 'Hong Kong'], ['AU', 'Australia'],
  ['IN', 'India'], ['AE', 'UAE'], ['NG', 'Nigeria'], ['ZA', 'South Africa'],
]

export function CreateOrg() {
  const navigate = useNavigate()
  const { connected, address } = useWallet()
  const [name, setName] = useState('')
  const [region, setRegion] = useState('ES') // ISO-2 国家码（DB 列仍叫 region）
  const [payDay, setPayDay] = useState(25) // 每月发薪日
  const [tokenId, setTokenId] = useState('')
  const [token, setToken] = useState<TokenInfo | null>(null)
  const [existing, setExisting] = useState<Company | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (connected && address) getCompany().then(setExisting).catch(() => setExisting(null))
    else setExisting(null)
  }, [connected, address])

  const ready = connected && !!address && name.trim() !== '' && /^[A-Z]{2}$/.test(region) && !!token && !busy

  async function submit() {
    if (!ready || !address || !token) return
    setBusy(true)
    try {
      await createCompany({ name: name.trim(), region, tokenId: tokenId.trim(), symbol: token.symbol || token.name, decimals: token.decimals, payDay })
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
          <Button className="rounded-full" onClick={() => navigate('/employer')}>
            Go to console <ArrowRight className="size-4" />
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <Field label="Company name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Labs" />
          </Field>
          <Field label="Country (ISO-2)">
            <input
              className="field font-mono uppercase" value={region} maxLength={2}
              onChange={(e) => setRegion(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder="ES" list="iso-countries"
            />
            <datalist id="iso-countries">
              {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </datalist>
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
