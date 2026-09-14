import { NextResponse } from 'next/server'
import { getNativeBalance, getUsdtBalance } from '@/lib/rpc'
import { getNimBalance, isNimAddress } from '@/lib/nim-rpc'

export const dynamic = 'force-dynamic'

/**
 * Public balances for an address. No session required — this is chain data
 * anyone could read, and gating it would only add a failure mode.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const address = params.get('address')?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'A valid address is required.' }, { status: 400 })
  }

  // Optional: the member's linked Nimiq address, for circles that run on NIM.
  const nim = params.get('nim')
  const nimAddress = nim && isNimAddress(nim) ? nim : null

  const [usdt, pol, nimBal] = await Promise.allSettled([
    getUsdtBalance(address),
    getNativeBalance(address),
    nimAddress ? getNimBalance(nimAddress) : Promise.resolve(null),
  ])

  const reason = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : null

  return NextResponse.json({
    usdt: usdt.status === 'fulfilled' ? usdt.value : null,
    pol: pol.status === 'fulfilled' ? pol.value : null,
    nim: nimBal.status === 'fulfilled' ? nimBal.value : null,
    errors: { usdt: reason(usdt), pol: reason(pol), nim: reason(nimBal) },
  })
}
