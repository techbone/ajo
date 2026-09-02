import { NextResponse } from 'next/server'
import { getNativeBalance, getUsdtBalance } from '@/lib/rpc'

export const dynamic = 'force-dynamic'

/**
 * Public balances for an address. No session required — this is chain data
 * anyone could read, and gating it would only add a failure mode.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'A valid address is required.' }, { status: 400 })
  }

  const [usdt, pol] = await Promise.allSettled([
    getUsdtBalance(address),
    getNativeBalance(address),
  ])

  return NextResponse.json({
    usdt: usdt.status === 'fulfilled' ? usdt.value : null,
    pol: pol.status === 'fulfilled' ? pol.value : null,
    errors: {
      usdt: usdt.status === 'rejected' ? String(usdt.reason?.message ?? usdt.reason) : null,
      pol: pol.status === 'rejected' ? String(pol.reason?.message ?? pol.reason) : null,
    },
  })
}
