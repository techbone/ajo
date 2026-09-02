'use client'

import { useState } from 'react'
import { Check, Clock, ExternalLink } from 'lucide-react'
import { useAjo } from './ajo-provider'
import { Card, Notice, Pill } from './ui'
import { recordContribution, type CircleDetail } from '@/lib/api-client'
import { MIN_GAS_POL, POLYGON, USDT } from '@/lib/chain'
import { formatUsdt, relativeDays, shortAddress } from '@/lib/format'
import { describePayError, sendContribution } from '@/lib/pay'
import { getProvider } from '@/lib/wallet'

/**
 * The round that is currently collecting money: who it pays, who has paid, and
 * — if you owe — the one button that matters.
 */
export function RoundView({ data, onPaid }: { data: CircleDetail; onPaid: () => Promise<void> }) {
  const { pol, walletAddress, session, walletMismatch, refresh } = useAjo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const round = data.rounds.find((r) => r.status === 'open')
  if (!round) return null

  const forRound = data.contributions.filter((c) => c.roundId === round.id)
  const mine = forRound.find((c) => c.fromAddress === data.you)
  const paid = forRound.filter((c) => c.status === 'confirmed')
  const pot = forRound.reduce((sum, c) => sum + BigInt(c.amount), 0n)
  const collected = paid.reduce((sum, c) => sum + BigInt(c.amount), 0n)
  const youReceive = round.recipientAddress === data.you

  const gasShort = pol !== null && Number(pol) < MIN_GAS_POL
  const canPay =
    Boolean(mine) &&
    mine?.status !== 'confirmed' &&
    Boolean(walletAddress) &&
    walletAddress === session &&
    !walletMismatch &&
    !gasShort

  const pay = async () => {
    const provider = getProvider()
    if (!provider || !mine || !walletAddress) return

    setError(null)
    setBusy(true)
    try {
      const txHash = await sendContribution({
        provider,
        from: walletAddress,
        to: mine.toAddress,
        amount: BigInt(mine.amount),
      })

      const result = await recordContribution(round.id, txHash)
      setPending(result.status === 'pending')
      await onPaid()
      void refresh()
    } catch (e) {
      setError(describePayError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-faint">
            Round {round.index} of {data.rounds.length}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatUsdt(pot)} <span className="text-base font-medium text-muted">{USDT.symbol}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {youReceive ? (
              <span className="font-medium text-good">This one is yours</span>
            ) : (
              <>to {shortAddress(round.recipientAddress)}</>
            )}{' '}
            · due {relativeDays(round.dueAt)}
          </p>
        </div>
        <Pill tone={paid.length === forRound.length ? 'good' : 'accent'}>
          {paid.length}/{forRound.length} paid
        </Pill>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pot > 0n ? Number((collected * 100n) / pot) : 0}%` }}
        />
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {forRound.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <span className={c.fromAddress === data.you ? 'font-medium' : 'text-muted'}>
              {c.fromAddress === data.you ? 'You' : shortAddress(c.fromAddress)}
            </span>
            {c.status === 'confirmed' ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-good">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                paid
                {c.txHash && (
                  <a
                    href={`${POLYGON.explorer}/tx/${c.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted"
                    aria-label="View on Polygonscan"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </span>
            ) : c.txHash ? (
              <span className="flex items-center gap-1.5 text-xs text-warn">
                <Clock className="h-3.5 w-3.5" />
                confirming
              </span>
            ) : (
              <span className="text-xs text-faint">waiting</span>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}

      {pending && !error && (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Sent. It will show as paid once the network confirms it — usually a few seconds.
        </p>
      )}

      {gasShort && mine?.status !== 'confirmed' && (
        <div className="mt-4 rounded-lg border border-border bg-warn-bg px-4 py-3 text-sm">
          <p className="font-medium text-warn">
            You need {POLYGON.nativeSymbol} for the network fee
          </p>
          <p className="mt-1 text-muted">
            You have {Number(pol).toFixed(4)}. Top up in your wallet, or the transfer will be
            rejected by the network.
          </p>
        </div>
      )}

      {mine && mine.status !== 'confirmed' && (
        <button
          type="button"
          onClick={() => void pay()}
          disabled={!canPay || busy}
          className="mt-4 w-full rounded-xl bg-accent px-5 py-4 text-base font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy
            ? 'Confirm in your wallet…'
            : `Pay ${formatUsdt(mine.amount)} ${USDT.symbol}`}
        </button>
      )}

      {mine?.status === 'confirmed' && (
        <p className="mt-4 rounded-lg border border-border bg-good-bg px-4 py-3 text-sm text-good">
          You have paid this round.
        </p>
      )}

      {!mine && youReceive && (
        <p className="mt-4 text-sm text-muted">
          You do not contribute during your own round. The pot comes straight to your wallet as
          each member pays.
        </p>
      )}
    </Card>
  )
}
