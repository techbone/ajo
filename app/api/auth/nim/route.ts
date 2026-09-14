import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/db'
import { errorResponse, requireAddress } from '@/lib/api'
import { isNimAddress, normaliseNimAddress } from '@/lib/nim-rpc'

export const dynamic = 'force-dynamic'

/**
 * Link the member's Nimiq address to their account.
 *
 * The address comes from listAccounts() inside Nimiq Pay, which the host
 * mediates, and the client sends it up. We do not verify a Nimiq signature
 * server-side — that needs the WASM core library. The property that matters
 * still holds: nobody is credited for a payment they did not make, because
 * verification checks the actual on-chain sender. Someone registering an
 * address they do not control would only misdirect their own payouts.
 */
export async function POST(request: Request) {
  try {
    const address = await requireAddress()
    const { nimAddress } = (await request.json()) as { nimAddress?: string }

    if (!nimAddress || !isNimAddress(nimAddress)) {
      return NextResponse.json({ error: 'That is not a Nimiq address.' }, { status: 400 })
    }

    const normalised = normaliseNimAddress(nimAddress)
    await getDb()
      .update(schema.users)
      .set({ nimAddress: normalised })
      .where(eq(schema.users.address, address))

    return NextResponse.json({ nimAddress: normalised })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET() {
  try {
    const address = await requireAddress()
    const [user] = await getDb()
      .select({ nimAddress: schema.users.nimAddress })
      .from(schema.users)
      .where(eq(schema.users.address, address))
      .limit(1)
    return NextResponse.json({ nimAddress: user?.nimAddress ?? null })
  } catch (error) {
    return errorResponse(error)
  }
}
