'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, Wallet } from 'lucide-react'
import { useAjo } from './ajo-provider'
import { shortAddress } from '@/lib/format'

/**
 * Shows who you are signed in as and whether the wallet backing it is actually
 * reachable right now. Those are different things, and the dot is the only
 * place the difference is visible at a glance.
 */
export function AccountBar() {
  const { session, walletConnected, walletMismatch, onPolygon, activeWallet, leave } =
    useAjo()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // A menu that only closes by pressing the same button reads as stuck open.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!session) return null

  const state = !walletConnected
    ? { dot: 'bg-warn', label: 'Wallet disconnected' }
    : walletMismatch
      ? { dot: 'bg-risk', label: 'Different account' }
      : !onPolygon
        ? { dot: 'bg-warn', label: 'Wrong network' }
        : { dot: 'bg-good', label: 'Connected' }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5"
        aria-expanded={open}
        aria-label={`Account ${shortAddress(session)} — ${state.label}`}
      >
        <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden="true" />
        <span className="font-mono text-xs">{shortAddress(session)}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-surface p-3 shadow-lg">
          <p className="text-xs text-faint">Signed in as</p>
          <p className="mt-1 font-mono text-xs break-all">{session}</p>

          <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted">
            <Wallet className="h-3.5 w-3.5" />
            {activeWallet && activeWallet.info.rdns !== 'injected'
              ? `${activeWallet.info.name} · ${state.label}`
              : state.label}
          </p>

          <button
            type="button"
            onClick={() => void leave()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Signing out ends your Ajo session. Your wallet stays connected — only your
            wallet can change that.
          </p>
        </div>
      )}
    </div>
  )
}

/** Surfaces the two states that silently break sending, before you try to send. */
export function WalletBanner() {
  const { session, walletConnected, walletMismatch, walletAddress, connect, busy } = useAjo()
  if (!session) return null

  if (walletMismatch) {
    return (
      <div className="rounded-lg border border-border bg-risk-bg px-4 py-3 text-sm">
        <p className="font-medium text-risk">Your wallet is on a different account</p>
        <p className="mt-1 text-muted">
          Signed in as {shortAddress(session)}, but your wallet is on{' '}
          {walletAddress ? shortAddress(walletAddress) : 'another account'}. Switch back in
          your wallet, or sign out and sign in again as this account.
        </p>
      </div>
    )
  }

  if (!walletConnected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-warn-bg px-4 py-3">
        <p className="text-sm text-muted">
          Wallet disconnected. You can still look around.
        </p>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy === 'connect'}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-warn disabled:opacity-45"
        >
          {busy === 'connect' ? 'Connecting…' : 'Reconnect'}
        </button>
      </div>
    )
  }

  return null
}
