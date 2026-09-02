import { NextResponse } from 'next/server'
import { getCircleForMember } from '@/lib/circles'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const address = await requireAddress()
    const { id } = await params
    const { circle, members, rounds, contributions } = await getCircleForMember(id, address)

    return NextResponse.json({
      circle: { ...circle, contributionAmount: circle.contributionAmount.toString() },
      members,
      rounds,
      contributions: contributions.map((c) => ({
        ...c,
        amount: c.amount.toString(),
        blockNumber: c.blockNumber?.toString() ?? null,
      })),
      you: address,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
