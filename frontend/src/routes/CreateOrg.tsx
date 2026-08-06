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
import { createCompany, type Company } from '@/lib/api'
import { qk } from '@/lib/queries'
import { fetchArc22TokenInfo, progField } from '@/lib/arc22'
import type { TokenInfo } from '@/lib/units'

export function CreateOrg() {
  const navigate = useNavigate()
  const { connected, address } = useWallet()
  const [name, setName] = useState('')
  const [payDay, setPayDay] = useState(25) // 每月发薪日
  const [family, setFamily] = useState<Company['tokenFamily']>('registry')
  const [tokenId, setTokenId] = useState('') // registry: field id；arc22: 代币程序名
  const [token, setToken] = useState<TokenInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  const ready = connected && !!address && name.trim() !== '' && !!token && !busy

  async function submit() {
    if (!ready || !address || !token) return
    setBusy(true)
    try {
      const arc22 = family === 'arc22'
      const created = await createCompany({
        name: name.trim(),
        // arc22 的 token_id 存程序 id 的 field 编码——与链上 SalaryConfig/Paystub 同值，读取端不分家族。
        tokenId: arc22 ? progField(tokenId.trim()) : tokenId.trim(),
        symbol: token.symbol || token.name,
        decimals: token.decimals,
        payDay,
        tokenFamily: family,
        tokenProgram: arc22 ? tokenId.trim() : null,
      })
      qc.setQueryData(qk.companies(address), (old: Company[] | undefined) => [...(old ?? []), created]) // 免得列表/详情用旧缓存显示"还没有组织"
      toast.success(`Organization “${name.trim()}” created`, { description: `Payroll token ${token.symbol || token.name} · ${token.decimals} decimals` })
      navigate(`/employer/${created.id}`)
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
          <Field label="Token type">
            <div className="grid grid-cols-2 gap-2">
              {([['registry', 'Registry token', 'token_registry.aleo (zUSD, vUSDC…)'], ['arc22', 'Compliant stablecoin', 'ARC-22 program (USDCx…)']] as const).map(([f, label, hint]) => (
                <button
                  key={f} type="button"
                  onClick={() => { setFamily(f); setTokenId(''); setToken(null) }}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${family === f ? 'border-seal bg-seal/5' : 'border-border hover:border-seal/40'}`}
                >
                  <span className="block font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label={family === 'arc22' ? 'Token program' : 'Payroll token_id'}>
            <input
              className="field font-mono text-xs" value={tokenId}
              onChange={(e) => setTokenId(e.target.value.trim())}
              placeholder={family === 'arc22' ? 'test_usdcx_stablecoin.aleo' : '7777field'}
            />
          </Field>
          {family === 'arc22' ? (
            <TokenCard
              tokenId={tokenId} onResolved={setToken} resolve={fetchArc22TokenInfo}
              errorHint={<span>No ARC-22 token found — enter the stablecoin program name, e.g. <span className="font-mono">test_usdcx_stablecoin.aleo</span>.</span>}
            />
          ) : (
            <TokenCard tokenId={tokenId} onResolved={setToken} />
          )}
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
