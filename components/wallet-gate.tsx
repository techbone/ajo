'use client'

import type { ReactNode } from 'react'
import { useAjo } from './ajo-provider'
import { Button, Card, Notice } from './ui'
import { shortAddress } from '@/lib/format'

/**
 * Connect, then prove ownership. Two steps, because they are two different
 * things: connecting exposes an address, signing proves you control it.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const {
    ready,
    hasProvider,
    walletAddress,
    session,
    busy,
    notice,
    connect,
    authenticate,
    switchAccount,
  } = useAjo()

  if (!ready) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-2" />
  }

  if (!hasProvider) {
    return (
      <Card tone="warn">
        <h2 className="font-semibold text-warn">Open Ajo inside Nimiq Pay</h2>
        <p className="mt-2 text-sm text-muted">
          Ajo needs a wallet to join circles. In Nimiq Pay, go to Mini Apps and open this
          address there — or open this page in a browser with a wallet extension.
        </p>
      </Card>
    )
  }

  if (session) return <>{children}</>

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-lg font-semibold">Join a savings circle</h2>
        <p className="mt-2 text-sm text-muted">
          Ten people put in $50 a week. Someone walks away with $500 today. Then it rotates,
          until everyone has had their turn.
        </p>
      </Card>

      {notice && <Notice>{notice}</Notice>}

      {!walletAddress ? (
        <Button onClick={() => void connect()} disabled={busy === 'connect'}>
          {busy === 'connect' ? 'Waiting for approval…' : 'Connect wallet'}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Naming the account matters: signing out cannot disconnect the wallet,
              so without this the button looks like it silently reuses whatever
              was there before. */}
          <Button onClick={() => void authenticate()} disabled={busy === 'signin'}>
            {busy === 'signin'
              ? 'Waiting for signature…'
              : `Sign in as ${shortAddress(walletAddress)}`}
          </Button>

          <button
            type="button"
            onClick={() => void switchAccount()}
            disabled={busy === 'connect'}
            className="text-center text-sm text-muted underline underline-offset-4 disabled:opacity-45"
          >
            {busy === 'connect' ? 'Opening wallet…' : 'Use a different account'}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-faint">
        Signing is free and moves no money. Ajo never holds your funds.
      </p>
    </div>
  )
}
