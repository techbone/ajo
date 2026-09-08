'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { WalletBanner } from '@/components/account-bar'
import { AppShell } from '@/components/app-shell'
import { RoundView } from '@/components/round-view'
import { Button, Card, Notice, Pill } from '@/components/ui'
import { WalletGate } from '@/components/wallet-gate'
import { getCircle, lockCircle, type CircleDetail } from '@/lib/api-client'
import { urgencyOf } from '@/lib/urgency'
import { POLYGON } from '@/lib/chain'
import { useLiveCircle } from '@/lib/use-live'
import { formatDate, formatUsdt, frequencyLabel, relativeDays, shortAddress } from '@/lib/format'

export default function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <AppShell>
      <Link href="/app" className="text-sm text-muted">
        ← Your circles
      </Link>
      <WalletGate>
        <CircleView id={id} />
      </WalletGate>
    </AppShell>
  )
}

function CircleView({ id }: { id: string }) {
  const [data, setData] = useState<CircleDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await getCircle(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this circle.')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Members waiting on someone else — the creator starting the circle, the last
  // person paying — should see it happen without reaching for refresh. Stops
  // once the circle is finished and there is nothing left to wait for.
  useLiveCircle({
    id,
    enabled: data !== null && data.circle.status !== 'completed',
    onChange: load,
  })

  if (error) return <Notice tone="risk">{error}</Notice>
  if (!data) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface-2" />

  const { circle, members, rounds, contributions, you } = data
  const isCreator = circle.creatorAddress === you
  const pot = Number(formatUsdt(circle.contributionAmount).replace(/,/g, '')) * (members.length - 1)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      await lockCircle(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the circle.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <WalletBanner />

      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{circle.name}</h1>
          <Pill tone={circle.status === 'active' ? 'good' : 'muted'}>
            {circle.status === 'forming' ? 'Forming' : circle.status}
          </Pill>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatUsdt(circle.contributionAmount)} USDT {frequencyLabel(circle.frequency)} ·{' '}
          {members.length} of {circle.size} joined
        </p>
      </div>

      {circle.status === 'active' && <RoundView data={data} onPaid={load} />}

      {circle.status === 'forming' && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-faint">Invite code</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em] text-accent">
            {circle.inviteCode}
          </p>
          <p className="mt-2 text-sm text-muted">
            Share this with the people you want in the circle. They enter it under “Join with a
            code”.
          </p>
        </Card>
      )}

      {circle.status === 'forming' && (
      <Card>
        <p className="text-xs uppercase tracking-widest text-faint">Each round pays out</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {pot.toLocaleString('en-US')} <span className="text-base font-medium text-muted">USDT</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Everyone except that round&rsquo;s recipient contributes, so each member pays{' '}
          {members.length - 1} times and receives once.
        </p>
      </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-widest text-faint">
          {circle.status === 'forming' ? 'Members' : 'Payout order'}
        </h2>
        {[...members]
          .sort((a, b) => (a.payoutPosition ?? 99) - (b.payoutPosition ?? 99))
          .map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {m.payoutPosition && (
                  <span className="font-mono text-xs text-faint">#{m.payoutPosition}</span>
                )}
                <span className="font-mono text-sm">{shortAddress(m.address)}</span>
              </div>
              <div className="flex items-center gap-2">
                {m.address === you && <Pill tone="accent">You</Pill>}
                {m.address === circle.creatorAddress && <Pill>Creator</Pill>}
              </div>
            </div>
          ))}
      </section>

      {circle.status === 'forming' && isCreator && (
        <div className="flex flex-col gap-2">
          <Button onClick={() => void start()} disabled={busy || members.length < 2}>
            {busy ? 'Starting…' : 'Start the circle'}
          </Button>
          <p className="text-center text-xs text-faint">
            {members.length < 2
              ? 'At least 2 members are needed to start.'
              : 'Payout order is locked in when you start. Nobody can join after that.'}
          </p>
        </div>
      )}

      {circle.status === 'forming' && !isCreator && (
        <p className="text-center text-xs text-faint">
          Waiting for the creator to start the circle.
        </p>
      )}

      {rounds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-widest text-faint">Schedule</h2>
          {rounds.map((round) => {
            const forRound = contributions.filter((c) => c.roundId === round.id)
            const paid = forRound.filter((c) => c.status === 'confirmed').length
            // The active RoundView only ever shows the currently open round, so
            // once a round completes — instantly, in a 2-person circle where a
            // single payment closes it — this is the only place left to reach
            // the transaction that proves it happened.
            const yourRow = forRound.find((c) => c.fromAddress === you && c.txHash)
            // Only an open round can meaningfully be overdue — a round that
            // hasn't started yet or has already settled has nothing pending.
            const overdue = round.status === 'open' && paid < forRound.length && urgencyOf(round.dueAt) === 'overdue'
            return (
              <div
                key={round.id}
                className={`rounded-lg border px-4 py-3 ${
                  round.status === 'open' ? 'border-accent bg-surface' : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Round {round.index}
                    {round.recipientAddress === you && (
                      <span className="ml-2 text-good">your payout</span>
                    )}
                  </span>
                  <Pill tone={round.status === 'open' ? 'accent' : 'muted'}>{round.status}</Pill>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    to {shortAddress(round.recipientAddress)} · {formatDate(round.opensAt)}
                  </span>
                  <span className={overdue ? 'font-medium text-risk' : undefined}>
                    {paid}/{forRound.length} paid · due {relativeDays(round.dueAt)}
                  </span>
                </div>
                {yourRow && (
                  <a
                    href={`${POLYGON.explorer}/tx/${yourRow.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted underline underline-offset-2"
                  >
                    View your payment on Polygonscan
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
