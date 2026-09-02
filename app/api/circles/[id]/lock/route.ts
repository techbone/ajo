import { NextResponse } from 'next/server'
import { lockCircle } from '@/lib/circles'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const address = await requireAddress()
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as {
      order?: string[]
      startsAt?: string
    }

    const { circle, rounds } = await lockCircle({
      circleId: id,
      caller: address,
      order: body.order,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    })

    return NextResponse.json({
      circle: { ...circle, contributionAmount: circle.contributionAmount.toString() },
      rounds,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
