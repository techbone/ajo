import { encodeFunctionData, formatUnits } from 'viem'
import { ERC20_BALANCE_OF, USDT } from './chain'

/**
 * Server-side Polygon reads.
 *
 * Deliberately not routed through the injected wallet provider. Reading a
 * public balance needs no keys and no user approval, and going through the host
 * makes us hostage to its RPC quirks — Nimiq Pay's provider currently fails
 * some reads with a native "Failed to parse String to BigInt". Chain reads are
 * also needed with nobody's phone open at all, for Phase 2's log sweep.
 *
 * The wallet is used only for what genuinely requires it: accounts, signing,
 * and sending.
 */

const DEFAULT_RPC = 'https://polygon-bor-rpc.publicnode.com'

export function rpcUrl(): string {
  return process.env.POLYGON_RPC_URL || DEFAULT_RPC
}

export async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`RPC ${method} failed with HTTP ${res.status}`)

  const body = (await res.json()) as { result?: T; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? `RPC ${method} failed`)
  if (body.result === undefined) throw new Error(`RPC ${method} returned nothing`)

  return body.result
}

/** '0x' means the call returned no data; BigInt() would throw on it. */
function toBigInt(raw: string): bigint {
  if (!raw || raw === '0x') return 0n
  return BigInt(raw)
}

export async function getUsdtBalance(address: string): Promise<string> {
  const data = encodeFunctionData({
    abi: ERC20_BALANCE_OF,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  const raw = await rpcCall<string>('eth_call', [{ to: USDT.address, data }, 'latest'])
  return formatUnits(toBigInt(raw), USDT.decimals)
}

export async function getNativeBalance(address: string): Promise<string> {
  const raw = await rpcCall<string>('eth_getBalance', [address, 'latest'])
  return formatUnits(toBigInt(raw), 18)
}
