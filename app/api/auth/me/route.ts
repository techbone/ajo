import { NextResponse } from 'next/server'
import { getSessionAddress } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ address: await getSessionAddress() })
}
