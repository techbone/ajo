'use client'

import type { ReactNode } from 'react'
import { useAjo } from './ajo-provider'
import { Button, Card, Notice } from './ui'
import { shortAddress } from '@/lib/format'

/**
 * Connect, then prove ownership. Two separate things: connecting exposes an
 * address, signing proves you control it.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const {
    ready,
    hasProvider,
    wallets,
    activeWallet,
    walletAddress,
    session,
    busy,
    notice,
    connect,
    disconnect,
    authenticate,
    switchAccount,
  } = useAjo()

  if (!ready) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-2" />
  }

  if (!hasProvider) {
    return (
      <Card tone="warn">
        <h2 className="font-semibold text-warn">No wallet found</h2>
        <p className="mt-2 text-sm text-muted">
          Open Ajo inside Nimiq Pay — Mini Apps, then Custom URL — or use a browser with a
          wallet extension installed.
        </p>
      </Card>
    )
  }

  if (session) return <>{children}</>

  const pitch = (
    <Card>
      <h2 className="text-lg font-semibold">Join a savings circle</h2>
      <p className="mt-2 text-sm text-muted">
        Ten people put in $50 a week. Someone walks away with $500 today. Then it rotates,
        until everyone has had their turn.
      </p>
    </Card>
  )

  const footer = (
    <p className="text-center text-xs text-faint">
      Signing is free and moves no money. Ajo never holds your funds.
    </p>
  )

  // Nothing chosen yet, and more than one wallet answered discovery.
  if (!walletAddress && !activeWallet && wallets.length > 1) {
    return (
      <div className="flex flex-col gap-4">
        {pitch}
        {notice && <Notice>{notice}</Notice>}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-faint">Choose a wallet</p>
          {wallets.map((wallet) => (
            <button
              key={wallet.info.uuid}
              type="button"
              onClick={() => void connect(wallet)}
              disabled={busy === 'connect'}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left disabled:opacity-45"
            >
              {wallet.info.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.info.icon} alt="" className="h-7 w-7 rounded-md" />
              ) : (
                <span className="h-7 w-7 rounded-md bg-surface-2" />
              )}
              <span className="font-medium">{wallet.info.name}</span>
            </button>
          ))}
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pitch}
      {notice && <Notice>{notice}</Notice>}

      {!walletAddress ? (
        <Button onClick={() => void connect()} disabled={busy === 'connect'}>
          {busy === 'connect'
            ? 'Waiting for approval…'
            : activeWallet && activeWallet.info.rdns !== 'injected'
              ? `Connect ${activeWallet.info.name}`
              : 'Connect wallet'}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Naming the account matters: signing out cannot disconnect the wallet,
              so without this the button looks like it silently reuses whatever
              was connected before. */}
          <Button onClick={() => void authenticate()} disabled={busy === 'signin'}>
            {busy === 'signin'
              ? 'Waiting for signature…'
              : `Sign in as ${shortAddress(walletAddress)}`}
          </Button>

          <div className="flex flex-col gap-2 text-center text-sm text-muted">
            <button
              type="button"
              onClick={() => void switchAccount()}
              disabled={busy === 'connect'}
              className="underline underline-offset-4 disabled:opacity-45"
            >
              Use a different account
            </button>
            {wallets.length > 1 && (
              <button
                type="button"
                onClick={disconnect}
                className="underline underline-offset-4"
              >
                Use a different wallet
              </button>
            )}
          </div>
        </div>
      )}

      {footer}
    </div>
  )
}
