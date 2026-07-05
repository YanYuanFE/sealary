import { useMemo } from 'react'
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield'
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo'
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css'
import { DECRYPT, NETWORK, CONNECT_PROGRAMS } from '@/lib/aleo'

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [
      new ShieldWalletAdapter(),
      new LeoWalletAdapter({ appName: 'Sealary' }),
    ],
    [],
  )
  return (
    <AleoWalletProvider
      wallets={wallets}
      network={NETWORK}
      decryptPermission={DECRYPT}
      programs={CONNECT_PROGRAMS}
      autoConnect
    >
      <WalletModalProvider network={NETWORK}>{children}</WalletModalProvider>
    </AleoWalletProvider>
  )
}
