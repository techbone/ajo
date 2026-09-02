'use client'

import type { ReactNode } from 'react'
import { useAjo } from './ajo-provider'
import { Card, Notice } from './ui'
import { shortAddress } from '@/lib/format'

/**
 * One decision, one click: pick a wallet and you are in.
 *
 * Connecting and signing are two wallet prompts but not two decisions, so this
 * never asks you to press a second button between them. Once you have chosen,
 * the picker gets out of the way rather than sitting behind the wallet dialog.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const { ready, hasProvider, wallets, walletAddress, session, busy, notice, start, disconnect } =
    useAjo()

  if (!ready) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-2" />
  }

  if (session) return <>{children}</>

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

  // Once the wallet is open, the choice is made. Showing the picker underneath
  // it just invites a second click on something already in progress.
  if (busy) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent"
            aria-hidden="true"
          />
          <p className="font-medium">
            {busy === 'signin' ? 'Confirm the signature' : 'Opening your wallet'}
          </p>
        </div>
        <p className="mt-3 text-sm text-muted">
          {busy === 'signin'
            ? 'Approve the message in your wallet to finish signing in. It is free and moves no money.'
            : 'Approve the connection in your wallet.'}
        </p>
      </Card>
    )
  }

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

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-widest text-faint">
          {walletAddress ? 'Continue' : wallets.length > 1 ? 'Choose a wallet' : 'Connect a wallet'}
        </p>

        {walletAddress ? (
          <button
            type="button"
            onClick={() => void start()}
            className="w-full rounded-xl bg-accent px-5 py-4 text-base font-semibold text-accent-ink"
          >
            Continue as {shortAddress(walletAddress)}
          </button>
        ) : (
          wallets.map((wallet) => (
            <button
              key={wallet.info.uuid}
              type="button"
              onClick={() => void start(wallet)}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left"
            >
              {wallet.info.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.info.icon} alt="" className="h-7 w-7 rounded-md" />
              ) : (
                <span className="h-7 w-7 rounded-md bg-surface-2" />
              )}
              <span className="font-medium">{wallet.info.name}</span>
            </button>
          ))
        )}
      </div>

      {walletAddress && (
        <button
          type="button"
          onClick={disconnect}
          className="text-center text-sm text-muted underline underline-offset-4"
        >
          Use a different wallet
        </button>
      )}

      <p className="text-center text-xs text-faint">
        Signing is free and moves no money. Ajo never holds your funds.
      </p>
    </div>
  )
}
