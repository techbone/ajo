import { formatUnits } from 'viem'
import { USDT } from './chain'

/** Raw on-chain units to something a person reads. 50000000 -> "50.00". */
export function formatUsdt(raw: string | bigint): string {
  const value = Number(formatUnits(BigInt(raw), USDT.decimals))
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'every day',
  weekly: 'every week',
  biweekly: 'every 2 weeks',
  monthly: 'every month',
}

export function frequencyLabel(frequency: string): string {
  return FREQUENCY_LABEL[frequency] ?? frequency
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "in 3 days" / "2 days ago" — the round view leans on this heavily. */
export function relativeDays(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`
}
