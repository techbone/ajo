'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { WalletBanner } from '@/components/account-bar'
import { AppShell } from '@/components/app-shell'
import { useAjo } from '@/components/ajo-provider'
import { Button, Card, Field, Notice, Pill, TokenChip, inputClass } from '@/components/ui'
import { WalletGate } from '@/components/wallet-gate'
import { createCircle, joinCircle, listCircles, type CircleDto } from '@/lib/api-client'
import { Link2 } from 'lucide-react'
import { useLiveCircleList } from '@/lib/use-live'
import { MIN_GAS_POL, POLYGON } from '@/lib/chain'
import { formatContribution, formatUsdt, frequencyLabel, tokenSymbol } from '@/lib/format'

export default function Home() {
  return (
    <AppShell>
      <WalletGate>
        <Dashboard />
      </WalletGate>
    </AppShell>
  )
}

function Dashboard() {
  const { usdt, pol, nim, nimAddress, linkNim, busy, refresh } = useAjo()
  const [circles, setCircles] = useState<CircleDto[] | null>(null)
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setCircles(await listCircles())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your circles.')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // A circle you joined can start while you are sitting on this screen.
  useLiveCircleList({ enabled: circles !== null, onChange: reload })

  const gasShort = pol !== null && Number(pol) < MIN_GAS_POL

  return (
    <div className="flex flex-col gap-5">
      <WalletBanner />

      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-faint">Your USDT</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {usdt === null ? '—' : formatUsdt(BigInt(Math.round(Number(usdt) * 1e6)))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-muted underline underline-offset-2"
          >
            Refresh
          </button>
        </div>

        {nimAddress ? (
          <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-faint">Your NIM</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {nim === null ? '—' : Number(nim).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            </div>
            <p className="font-mono text-[11px] text-faint">{nimAddress.slice(0, 9)}…</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void linkNim()}
            disabled={busy === 'nim'}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            {busy === 'nim' ? 'Linking…' : 'Link Nimiq address for NIM circles'}
          </button>
        )}
      </Card>

      {gasShort && (
        <Card tone="warn">
          <h2 className="font-semibold text-warn">Top up {POLYGON.nativeSymbol} for gas</h2>
          <p className="mt-2 text-sm text-muted">
            Sending USDT costs a small {POLYGON.nativeSymbol} fee, and you have{' '}
            {Number(pol).toFixed(4)}. Add a little in Nimiq Pay before your next contribution,
            or the transfer will be rejected by the network.
          </p>
        </Card>
      )}

      {error && <Notice>{error}</Notice>}

      {circles === null ? (
        <div className="h-20 animate-pulse rounded-xl border border-border bg-surface-2" />
      ) : circles.length === 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs uppercase tracking-widest text-faint">Your circles</h2>
          <Card>
            <p className="text-sm text-muted">
              You are not in a circle yet. Start one and invite people you trust, or join with a
              code someone gave you.
            </p>
          </Card>
        </section>
      ) : (
        <CircleSections circles={circles} />
      )}

      {mode === 'none' && (
        <div className="flex flex-col gap-3">
          <Button onClick={() => setMode('create')}>Create a circle</Button>
          <Button variant="secondary" onClick={() => setMode('join')}>
            Join with a code
          </Button>
        </div>
      )}

      {mode === 'create' && <CreateForm onDone={reload} onCancel={() => setMode('none')} />}
      {mode === 'join' && <JoinForm onDone={reload} onCancel={() => setMode('none')} />}
    </div>
  )
}

/**
 * The list's job is to answer "what do I do right now", so circles needing
 * payment come first and finished ones fold away. Nothing is deleted — a
 * completed circle holds the record of who paid, which is the whole point of
 * Ajo, so it is put out of the way rather than destroyed.
 */
function CircleSections({ circles }: { circles: CircleDto[] }) {
  const [showDone, setShowDone] = useState(false)

  const needsYou = circles.filter((c) => c.status === 'active' && c.youOwe)
  const running = circles.filter((c) => c.status === 'active' && !c.youOwe)
  const forming = circles.filter((c) => c.status === 'forming')
  const done = circles.filter((c) => c.status !== 'active' && c.status !== 'forming')

  return (
    <div className="flex flex-col gap-6">
      {needsYou.length > 0 && (
        <Group label={needsYou.length === 1 ? 'Needs you' : `Needs you (${needsYou.length})`} tone="accent">
          {needsYou.map((c) => (
            <CircleRow key={c.id} circle={c} />
          ))}
        </Group>
      )}

      {running.length > 0 && (
        <Group label="Running">
          {running.map((c) => (
            <CircleRow key={c.id} circle={c} />
          ))}
        </Group>
      )}

      {forming.length > 0 && (
        <Group label="Forming">
          {forming.map((c) => (
            <CircleRow key={c.id} circle={c} />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center justify-between text-xs uppercase tracking-widest text-faint"
            aria-expanded={showDone}
          >
            <span>Completed ({done.length})</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showDone ? 'rotate-180' : ''}`}
            />
          </button>
          {showDone && done.map((c) => <CircleRow key={c.id} circle={c} />)}
        </section>
      )}
    </div>
  )
}

function Group({
  label,
  tone = 'muted',
  children,
}: {
  label: string
  tone?: 'muted' | 'accent'
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className={`text-xs uppercase tracking-widest ${
          tone === 'accent' ? 'text-accent' : 'text-faint'
        }`}
      >
        {label}
      </h2>
      {children}
    </section>
  )
}

function CircleRow({ circle }: { circle: CircleDto }) {
  return (
    <Link href={`/circles/${circle.id}`} className="block">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              <span className="truncate">{circle.name}</span>
              <TokenChip token={circle.token} />
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {formatContribution(circle.contributionAmount, circle.token)} {tokenSymbol(circle.token)}{' '}
              {frequencyLabel(circle.frequency)}
            </p>
          </div>
          <Pill
            tone={
              circle.youOwe ? 'accent' : circle.status === 'active' ? 'good' : 'muted'
            }
          >
            {circle.youOwe
              ? 'You owe'
              : circle.status === 'forming'
                ? 'Forming'
                : circle.status}
          </Pill>
        </div>
      </Card>
    </Link>
  )
}

function CreateForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('50')
  const [frequency, setFrequency] = useState<CircleDto['frequency']>('weekly')
  const [token, setToken] = useState<CircleDto['token']>('USDT_POLYGON')
  const { nimAddress, linkNim, busy: ajoBusy } = useAjo()
  const [size, setSize] = useState('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await createCircle({ name, amount, frequency, size: Number(size), token })
      await onDone()
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the circle.')
    } finally {
      setBusy(false)
    }
  }

  const total = Number(amount) * (Number(size) - 1)

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">New circle</h2>
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Office ajo"
          />
        </Field>

        <Field label="Paid in">
          <div className="grid grid-cols-2 gap-2">
            {(['USDT_POLYGON', 'NIM'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setToken(t)}
                className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                  token === t ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface-2 text-muted'
                }`}
              >
                {tokenSymbol(t)}
                <span className="block text-[11px] font-normal opacity-75">
                  {t === 'NIM' ? 'Nimiq network' : 'on Polygon'}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {token === 'NIM' && !nimAddress && (
          <div className="rounded-lg border border-border bg-warn-bg px-4 py-3 text-sm">
            <p className="text-warn">A NIM circle pays out to Nimiq addresses.</p>
            <button
              type="button"
              onClick={() => void linkNim()}
              disabled={ajoBusy === 'nim'}
              className="mt-2 text-sm font-medium text-ink underline underline-offset-2 disabled:opacity-50"
            >
              {ajoBusy === 'nim' ? 'Linking…' : 'Link your Nimiq address first'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Each pays (${tokenSymbol(token)})`}>
            <input
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="People">
            <input
              className={inputClass}
              inputMode="numeric"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </Field>
        </div>

        <Field label="How often">
          <select
            className={inputClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as CircleDto['frequency'])}
          >
            <option value="daily">Every day (for testing)</option>
            <option value="weekly">Every week</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Every month</option>
          </select>
        </Field>

        {Number.isFinite(total) && total > 0 && (
          <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
            Each round, one member receives{' '}
            <strong className="text-ink">{total.toLocaleString('en-US')} {tokenSymbol(token)}</strong>. After{' '}
            {size} rounds everyone has had one payout.
          </p>
        )}

        {error && <Notice>{error}</Notice>}

        <div className="flex flex-col gap-2">
          <Button onClick={() => void submit()} disabled={busy || (token === 'NIM' && !nimAddress)}>
            {busy ? 'Creating…' : 'Create circle'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  )
}

function JoinForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsNim, setNeedsNim] = useState(false)
  const { linkNim, busy: ajoBusy } = useAjo()

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await joinCircle(code)
      await onDone()
      onCancel()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not join that circle.'
      setError(message)
      setNeedsNim(/Nimiq address/.test(message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Join a circle</h2>
      <div className="flex flex-col gap-4">
        <Field label="Invite code">
          <input
            className={`${inputClass} font-mono uppercase tracking-widest`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
        {error && <Notice>{error}</Notice>}
        {needsNim && (
          <button
            type="button"
            onClick={() => void linkNim().then((ok) => ok && setNeedsNim(false))}
            disabled={ajoBusy === 'nim'}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-ink disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            {ajoBusy === 'nim' ? 'Linking…' : 'Link Nimiq address, then join'}
          </button>
        )}
        <div className="flex flex-col gap-2">
          <Button onClick={() => void submit()} disabled={busy || code.length < 6}>
            {busy ? 'Joining…' : 'Join circle'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  )
}
