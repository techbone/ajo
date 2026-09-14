import { NextResponse } from 'next/server'
import { createCircle, listCirclesFor, type CircleToken, type Frequency } from '@/lib/circles'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const address = await requireAddress()
    const circles = await listCirclesFor(address)
    return NextResponse.json({
      circles: circles.map((c) => ({ ...c, contributionAmount: c.contributionAmount.toString() })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const address = await requireAddress()
    const body = (await request.json()) as {
      name?: string
      amount?: string
      frequency?: Frequency
      size?: number
      token?: CircleToken
    }

    const circle = await createCircle({
      creator: address,
      name: body.name ?? '',
      amount: body.amount ?? '0',
      frequency: body.frequency ?? 'weekly',
      size: Number(body.size ?? 0),
      token: body.token === 'NIM' ? 'NIM' : 'USDT_POLYGON',
    })

    return NextResponse.json(
      { circle: { ...circle, contributionAmount: circle.contributionAmount.toString() } },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
