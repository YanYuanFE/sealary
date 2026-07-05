import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { Wallet, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shortAddr } from '@/lib/format'

export function ConnectButton() {
  const { connected, connecting, address, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  if (connected && address) {
    return (
      <button
        onClick={() => disconnect().catch(() => {})}
        className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-seal/40"
        title="Disconnect"
      >
        <span className="grid size-5 place-items-center rounded-full bg-proven-soft text-proven">
          <Wallet className="size-3" strokeWidth={2.5} />
        </span>
        <span className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</span>
        <LogOut className="size-3 text-muted-foreground/60 group-hover:text-seal" />
      </button>
    )
  }

  return (
    <Button size="sm" className="rounded-full" disabled={connecting} onClick={() => setVisible(true)}>
      <Wallet className="size-4" />
      {connecting ? 'Connecting…' : 'Connect wallet'}
    </Button>
  )
}
