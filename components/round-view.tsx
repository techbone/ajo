'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, Clock, ExternalLink, Share2 } from 'lucide-react'
import { useAjo } from './ajo-provider'
import { Card, Notice, Pill } from './ui'
import { recordContribution, recheckRound, type CircleDetail } from '@/lib/api-client'
import { MIN_GAS_POL, POLYGON, USDT } from '@/lib/chain'
import { formatUsdt, relativeDays, shortAddress } from '@/lib/format'
import { buildNudgeMessage, shareNudge } from '@/lib/nudge'
import { urgencyOf } from '@/lib/urgency'
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
  const [nudging, setNudging] = useState(false)
  const [nudgeNotice, setNudgeNotice] = useState<string | null>(null)
  const polling = useRef(false)

  const round = data.rounds.find((r) => r.status === 'open')

  const roundId = round?.id ?? null
  const hasUnconfirmed = data.contributions.some(
    (c) => c.roundId === roundId && c.status !== 'confirmed' && Boolean(c.txHash),
  )

  /**
   * A transaction is rarely mined by the time its hash reaches us, so keep
   * asking until the chain agrees. Polygon blocks are ~2s; this gives up after
   * a minute and leaves the sweep to finish the job.
   */
  const watch = useCallback(async () => {
    if (!roundId || polling.current) return
    polling.current = true
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const { confirmed, released } = await recheckRound(roundId).catch(() => ({
          confirmed: 0,
          released: 0,
        }))

        if (confirmed > 0) {
          setPending(false)
          await onPaid()
          return
        }

        // The transaction is dead — reverted, or it never carried this payment.
        // The row has let go of the hash, so bring the button back and say why
        // rather than leaving someone watching a spinner that will never end.
        if (released > 0) {
          setPending(false)
          setError('That transaction did not go through. You can try paying again.')
          await onPaid()
          return
        }
      }
    } finally {
      polling.current = false
    }
  }, [roundId, onPaid])

  // Covers reloading the page mid-confirmation, or a browser closed too early.
  useEffect(() => {
    if (hasUnconfirmed) void watch()
  }, [hasUnconfirmed, watch])

  // Between rounds: the last one closed early and the next waits for its date.
  // A blank space here would read as broken, so say what is happening.
  if (!round) {
    if (data.circle.status !== 'active') return null
    const next = [...data.rounds]
      .filter((r) => r.status === 'upcoming')
      .sort((a, b) => a.index - b.index)[0]
    if (!next) return null

    const youReceiveNext = next.recipientAddress === data.you
    return (
      <Card>
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-faint">
          <CalendarClock className="h-3.5 w-3.5" />
          Next up
        </p>
        <p className="mt-2 text-lg font-semibold">
          Round {next.index} opens {relativeDays(next.opensAt)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {youReceiveNext
            ? 'That one pays out to you.'
            : `It pays out to ${shortAddress(next.recipientAddress)}.`}{' '}
          Rounds open on their schedule, even when everyone has already paid the last one —
          the rhythm is what makes this a savings circle.
        </p>
      </Card>
    )
  }

  const forRound = data.contributions.filter((c) => c.roundId === round.id)
  const mine = forRound.find((c) => c.fromAddress === data.you)
  const unpaidMembers = forRound.filter((c) => c.status !== 'confirmed').map((c) => c.fromAddress)
  const paid = forRound.filter((c) => c.status === 'confirmed')
  const pot = forRound.reduce((sum, c) => sum + BigInt(c.amount), 0n)
  const collected = paid.reduce((sum, c) => sum + BigInt(c.amount), 0n)
  const youReceive = round.recipientAddress === data.you

  const urgency = urgencyOf(round.dueAt)
  const gasShort = pol !== null && Number(pol) < MIN_GAS_POL

  /**
   * A hash on an unconfirmed contribution means money is already on its way.
   * Offering the button again invites a second real transfer that can never be
   * credited — the round is already matched to the first one. Derived from the
   * row rather than local state so a reload cannot resurrect the button.
   */
  const awaitingConfirmation = Boolean(mine?.txHash) && mine?.status !== 'confirmed'

  const canPay =
    Boolean(mine) &&
    mine?.status !== 'confirmed' &&
    !awaitingConfirmation &&
    Boolean(walletAddress) &&
    walletAddress === session &&
    !walletMismatch &&
    !gasShort

  const nudge = async () => {
    setNudgeNotice(null)
    setNudging(true)
    try {
      const message = buildNudgeMessage({
        circleName: data.circle.name,
        amount: formatUsdt(data.circle.contributionAmount),
        recipientAddress: round.recipientAddress,
        dueAt: round.dueAt,
        outstanding: unpaidMembers,
        url: typeof window !== 'undefined' ? window.location.href : '',
      })
      const result = await shareNudge(message)
      if (result.method === 'clipboard' && result.ok) {
        setNudgeNotice('Copied — paste it into your group chat.')
      } else if (!result.ok && result.method !== 'share') {
        setNudgeNotice('Could not share automatically. Copy the invite link instead.')
      }
    } finally {
      setNudging(false)
    }
  }

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
      if (result.status === 'pending') void watch()
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
            ·{' '}
            <span
              className={
                paid.length === forRound.length
                  ? undefined
                  : urgency === 'overdue'
                    ? 'font-medium text-risk'
                    : urgency === 'soon'
                      ? 'font-medium text-warn'
                      : undefined
              }
            >
              due {relativeDays(round.dueAt)}
            </span>
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

      {urgency === 'overdue' && unpaidMembers.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-risk-bg px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-risk">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {unpaidMembers.length === 1 ? 'Someone hasn\u2019t' : `${unpaidMembers.length} people haven\u2019t`}{' '}
            paid — this round is overdue.
          </p>
          <button
            type="button"
            onClick={() => void nudge()}
            disabled={nudging}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            {nudging ? 'Sharing…' : 'Nudge'}
          </button>
        </div>
      )}

      {nudgeNotice && (
        <p className="mt-2 text-xs text-muted">{nudgeNotice}</p>
      )}

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

      {(pending || awaitingConfirmation) && !error && (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Sent, waiting for the network to confirm. This usually takes a few seconds — you can
          leave this screen, it will still go through.
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

      {mine && mine.status !== 'confirmed' && !awaitingConfirmation && (
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
