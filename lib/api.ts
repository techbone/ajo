import { NextResponse } from 'next/server'
import { CircleError } from './circles'
import { getSessionAddress } from './session'

/** Every circle route needs a verified address; none of them work anonymously. */
export async function requireAddress(): Promise<string> {
  const address = await getSessionAddress()
  if (!address) throw new CircleError('Sign in first.', 401)
  return address
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof CircleError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('[ajo] unhandled route error:', error)
  return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 })
}

/** BigInt has no JSON representation; send raw units as a string. */
export function serialiseAmount(value: bigint): string {
  return value.toString()
}
