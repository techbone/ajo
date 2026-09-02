import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { buildAuthMessage } from '@/lib/auth-message'
import { issueNonce } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Hands the client the exact message to sign. The nonce is stored server-side
 * (in a signed, single-use cookie) so a signature cannot be replayed.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'A valid address is required.' }, { status: 400 })
  }

  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date().toISOString()
  await issueNonce(nonce, address, issuedAt)

  return NextResponse.json({ message: buildAuthMessage({ address, nonce, issuedAt }) })
}
