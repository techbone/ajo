'use client'

import type { ReactNode } from 'react'

export function Card({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'warn' }) {
  const tones = {
    plain: 'border-border bg-surface',
    good: 'border-border bg-good-bg',
    warn: 'border-border bg-warn-bg',
  }
  return <section className={`rounded-xl border p-5 ${tones[tone]}`}>{children}</section>
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-ink font-semibold'
      : 'border border-border text-muted font-medium'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-5 py-3.5 text-base transition disabled:cursor-not-allowed disabled:opacity-45 ${styles}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-widest text-faint">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-base text-ink outline-none focus:border-accent'

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'risk' }) {
  return (
    <p
      className={`rounded-lg border border-border px-4 py-3 text-sm ${
        tone === 'risk' ? 'bg-risk-bg text-risk' : 'bg-warn-bg text-warn'
      }`}
    >
      {children}
    </p>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'warn' | 'accent' }) {
  const tones = {
    muted: 'bg-surface-2 text-muted',
    good: 'bg-good-bg text-good',
    warn: 'bg-warn-bg text-warn',
    accent: 'bg-accent text-accent-ink',
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
