"use client";

/**
 * components/wallet/SolanaWalletProvider.tsx
 *
 * Wraps children with the Solana wallet adapter context.
 * Uses Phantom + Solflare as primary wallets.
 * Falls back to UnsafeBurner in development for easy testing.
 */

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

// Import default wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

const SOLANA_NETWORK = clusterApiUrl("devnet");

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_NETWORK}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
