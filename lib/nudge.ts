import { shortAddress } from './format'

/**
 * The message a member shares to chase down whoever hasn't paid.
 *
 * Ajo has no push channel to reach for — Nimiq Pay does not expose one to mini
 * apps — so the realistic path is the one these circles already run on: a
 * WhatsApp or SMS group. This builds the text; the native share sheet is what
 * actually sends it.
 */
export function buildNudgeMessage(params: {
  circleName: string
  amount: string
  recipientAddress: string
  dueAt: string
  outstanding: string[]
  url: string
}): string {
  const { circleName, amount, recipientAddress, dueAt, outstanding, url } = params

  const due = new Date(dueAt)
  const dueLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const who =
    outstanding.length === 1
      ? shortAddress(outstanding[0])
      : `${outstanding.length} people`

  return [
    `${circleName}: ${who} still ${outstanding.length === 1 ? 'owes' : 'owe'} ${amount}`,
    `to ${shortAddress(recipientAddress)}, due ${dueLabel}.`,
    '',
    `Pay here: ${url}`,
  ].join('\n')
}

export interface ShareResult {
  ok: boolean
  method: 'share' | 'clipboard' | 'none'
}

/**
 * Send the nudge however this device can. The Web Share API opens the native
 * sheet on a phone; a desktop browser inside Nimiq Pay's dev tools has neither,
 * so this falls back to the clipboard rather than doing nothing.
 */
export async function shareNudge(text: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return { ok: true, method: 'share' }
    } catch (error) {
      // AbortError means the person closed the sheet — not a failure to report.
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, method: 'share' }
      }
      // Fall through to the clipboard if sharing itself is broken.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return { ok: true, method: 'clipboard' }
    } catch {
      // fall through
    }
  }

  return { ok: false, method: 'none' }
}
