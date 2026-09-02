import { NextResponse } from 'next/server'
import { joinCircle } from '@/lib/circles'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const address = await requireAddress()
    const { code } = (await request.json()) as { code?: string }
    if (!code) return NextResponse.json({ error: 'Enter an invite code.' }, { status: 400 })

    const circle = await joinCircle({ address, inviteCode: code })
    return NextResponse.json({
      circle: { ...circle, contributionAmount: circle.contributionAmount.toString() },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
