import { NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { getDb, schema } from '@/db'
import { buildAuthMessage } from '@/lib/auth-message'
import { consumeNonce, createSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { address?: string; signature?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const address = body.address?.toLowerCase()
  const signature = body.signature

  if (!address || !/^0x[0-9a-f]{40}$/.test(address) || !signature) {
    return NextResponse.json({ error: 'Address and signature are required.' }, { status: 400 })
  }

  const issued = await consumeNonce(address)
  if (!issued) {
    return NextResponse.json(
      { error: 'That sign-in request expired. Try again.' },
      { status: 400 },
    )
  }

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: buildAuthMessage({ address, nonce: issued.nonce, issuedAt: issued.issuedAt }),
    signature: signature as `0x${string}`,
  })

  if (!valid) {
    return NextResponse.json({ error: 'That signature does not match.' }, { status: 401 })
  }

  await getDb()
    .insert(schema.users)
    .values({ address })
    .onConflictDoNothing({ target: schema.users.address })

  await createSession(address)

  return NextResponse.json({ address })
}
