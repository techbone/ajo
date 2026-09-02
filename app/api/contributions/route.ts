import { NextResponse } from 'next/server'
import { submitContribution } from '@/lib/payments'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Record a contribution the member has just sent.
 *
 * The address comes from the session, never the request body — otherwise anyone
 * could mark anyone else as paid.
 */
export async function POST(request: Request) {
  try {
    const address = await requireAddress()
    const { roundId, txHash } = (await request.json()) as {
      roundId?: string
      txHash?: string
    }

    if (!roundId || !txHash) {
      return NextResponse.json(
        { error: 'A round and a transaction hash are required.' },
        { status: 400 },
      )
    }

    const result = await submitContribution({ roundId, from: address, txHash })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
