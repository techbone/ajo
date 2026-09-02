import { NextResponse } from 'next/server'
import { sweep } from '@/lib/sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Runs the log sweep.
 *
 * Public routes that read the chain and write the database need a guard, or
 * anyone can hammer the RPC quota. Vercel Cron sends its own bearer token; a
 * GitHub Actions schedule sends the same secret.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  try {
    return NextResponse.json({ ok: true, ...(await sweep()) })
  } catch (error) {
    console.error('[ajo] sweep failed:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Sweep failed.' },
      { status: 500 },
    )
  }
}
