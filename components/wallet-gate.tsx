'use client'

import type { ReactNode } from 'react'
import { useAjo } from './ajo-provider'
import { Button, Card, Notice } from './ui'

/**
 * Everything in Ajo needs a verified address, so the connect and sign-in steps
 * live here once rather than being repeated on every screen.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const { ready, hasProvider, address, session, busy, notice, connect, authenticate } = useAjo()

  if (!ready) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-2" />
  }

  if (!hasProvider) {
    return (
      <Card tone="warn">
        <h2 className="font-semibold text-warn">Open Ajo inside Nimiq Pay</h2>
        <p className="mt-2 text-sm text-muted">
          Ajo needs your wallet to join circles. In Nimiq Pay, go to Mini Apps and open this
          address there.
        </p>
      </Card>
    )
  }

  if (!session) {
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

        {!address ? (
          <Button onClick={() => void connect()} disabled={busy === 'connect'}>
            {busy === 'connect' ? 'Waiting for approval…' : 'Connect wallet'}
          </Button>
        ) : (
          <Button onClick={() => void authenticate()} disabled={busy === 'signin'}>
            {busy === 'signin' ? 'Waiting for signature…' : 'Sign in to Ajo'}
          </Button>
        )}

        <p className="text-center text-xs text-faint">
          Signing is free and moves no money. Ajo never holds your funds.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
