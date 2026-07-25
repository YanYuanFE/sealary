import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { toast } from 'sonner'
import { Wallet, LogOut, Copy, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { shortAddr } from '@/lib/format'

export function ConnectButton() {
  const { connected, connecting, address, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  if (connected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-seal/40">
          <span className="grid size-5 place-items-center rounded-full bg-proven-soft text-proven">
            <Wallet className="size-3" strokeWidth={2.5} />
          </span>
          <span className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</span>
          <ChevronDown className="size-3 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() =>
              navigator.clipboard.writeText(address).then(
                () => toast.success('Address copied'),
                () => toast.error('Copy failed'),
              )
            }
          >
            <Copy /> Copy address
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => disconnect().catch(() => {})}>
            <LogOut /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button size="sm" className="rounded-full" disabled={connecting} onClick={() => setVisible(true)}>
      <Wallet className="size-4" />
      {connecting ? 'Connecting…' : 'Connect wallet'}
    </Button>
  )
}
