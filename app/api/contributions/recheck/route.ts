import { NextResponse } from 'next/server'
import { recheckPending } from '@/lib/payments'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Look again at any submitted-but-unconfirmed payments in a round.
 *
 * Called by the client while it waits, and on opening a circle, so a payment
 * confirms in seconds rather than waiting for the next sweep.
 */
export async function POST(request: Request) {
  try {
    await requireAddress()
    const { roundId } = (await request.json()) as { roundId?: string }
    if (!roundId) {
      return NextResponse.json({ error: 'A round is required.' }, { status: 400 })
    }
    return NextResponse.json(await recheckPending(roundId))
  } catch (error) {
    return errorResponse(error)
  }
}
