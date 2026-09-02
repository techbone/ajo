'use client'

import type { ReactNode } from 'react'
import { useAjo } from './ajo-provider'
import { Card, Notice } from './ui'
import { shortAddress } from '@/lib/format'

/**
 * One decision, one click: pick a wallet and you are in.
 *
 * Connecting and signing are two wallet prompts, but they are not two decisions,
 * so the UI does not make you press two buttons for them.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const {
    ready,
    hasProvider,
    wallets,
    walletAddress,
    session,
    busy,
    notice,
    start,
    disconnect,
    switchAccount,
  } = useAjo()

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

  const working = busy !== null
  const label =
    busy === 'signin' ? 'Confirm the signature…' : busy === 'connect' ? 'Opening wallet…' : null

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
          {walletAddress
            ? 'Continue'
            : wallets.length > 1
              ? 'Choose a wallet'
              : 'Connect a wallet'}
        </p>

        {walletAddress ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={working}
            className="w-full rounded-xl bg-accent px-5 py-4 text-base font-semibold text-accent-ink disabled:opacity-45"
          >
            {label ?? `Continue as ${shortAddress(walletAddress)}`}
          </button>
        ) : (
          wallets.map((wallet) => (
            <button
              key={wallet.info.uuid}
              type="button"
              onClick={() => void start(wallet)}
              disabled={working}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left disabled:opacity-45"
            >
              {wallet.info.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.info.icon} alt="" className="h-7 w-7 rounded-md" />
              ) : (
                <span className="h-7 w-7 rounded-md bg-surface-2" />
              )}
              <span className="font-medium">{label ?? wallet.info.name}</span>
            </button>
          ))
        )}
      </div>

      {walletAddress && (
        <div className="flex flex-col gap-2 text-center text-sm text-muted">
          <button
            type="button"
            onClick={() => void switchAccount()}
            disabled={working}
            className="underline underline-offset-4 disabled:opacity-45"
          >
            Use a different account
          </button>
          <button type="button" onClick={disconnect} className="underline underline-offset-4">
            Use a different wallet
          </button>
        </div>
      )}

      <p className="text-center text-xs text-faint">
        Signing is free and moves no money. Ajo never holds your funds.
      </p>
    </div>
  )
}
