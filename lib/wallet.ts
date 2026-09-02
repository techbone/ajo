import { encodeFunctionData, formatUnits } from 'viem'
import { ERC20_BALANCE_OF, POLYGON, USDT } from './chain'

/**
 * The EIP-1193 provider Nimiq Pay injects into the WebView. Deliberately
 * minimal — we only declare what we actually call.
 */
export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>
  on?(event: string, handler: (...args: never[]) => void): void
  removeListener?(event: string, handler: (...args: never[]) => void): void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

/** EIP-1193 error codes we treat as expected outcomes rather than bugs. */
export const USER_REJECTED = 4001
export const CHAIN_NOT_CONFIGURED = 4902

export function providerErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown }
    if (typeof code === 'number') return code
  }
  return undefined
}

export function isUserRejection(error: unknown): boolean {
  return providerErrorCode(error) === USER_REJECTED
}

export function getProvider(): Eip1193Provider | undefined {
  if (typeof window === 'undefined') return undefined
  return window.ethereum
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  return provider.request<string[]>({ method: 'eth_requestAccounts' })
}

/**
 * Accounts the wallet has *already* authorised, without raising a dialog.
 *
 * eth_accounts is the passive counterpart to eth_requestAccounts: it returns an
 * empty array rather than prompting, which is what we want on page load.
 */
export async function getConnectedAccounts(
  provider: Eip1193Provider,
): Promise<string[]> {
  try {
    return await provider.request<string[]>({ method: 'eth_accounts' })
  } catch {
    return []
  }
}

export async function getChainId(provider: Eip1193Provider): Promise<string> {
  return provider.request<string>({ method: 'eth_chainId' })
}

/**
 * Move the wallet to Polygon. Returns false when the user declines, which is a
 * normal outcome and must not be surfaced as an error.
 */
export async function switchToPolygon(provider: Eip1193Provider): Promise<boolean> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON.chainIdHex }],
    })
    return true
  } catch (error) {
    if (isUserRejection(error)) return false
    if (providerErrorCode(error) === CHAIN_NOT_CONFIGURED) {
      throw new Error(`${POLYGON.name} is not configured in this wallet.`)
    }
    throw error
  }
}

/**
 * A balance read either produced a number or it didn't. Callers render the
 * failure rather than throwing, so one bad call can't blank the whole screen.
 */
export type BalanceResult =
  | { ok: true; value: string; raw: string }
  | { ok: false; error: string; raw?: string }

/**
 * Providers are inconsistent about empty results: '0x', '', null and undefined
 * all show up in the wild and none of them survive BigInt().
 */
function parseHexAmount(raw: unknown, decimals: number): BalanceResult {
  if (typeof raw !== 'string' || raw === '' || raw === '0x' || raw === '0x0') {
    if (raw === '0x' || raw === '0x0') return { ok: true, value: '0', raw: String(raw) }
    return { ok: false, error: `unexpected response: ${JSON.stringify(raw)}` }
  }
  try {
    return { ok: true, value: formatUnits(BigInt(raw), decimals), raw }
  } catch {
    return { ok: false, error: `could not parse ${raw}`, raw }
  }
}

function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; code?: unknown }
    const code = typeof e.code === 'number' ? ` (code ${e.code})` : ''
    if (typeof e.message === 'string') return e.message + code
  }
  return String(error)
}

/** Native POL balance. This is the gas budget. */
export async function readNativeBalance(
  provider: Eip1193Provider,
  address: string,
): Promise<BalanceResult> {
  try {
    const raw = await provider.request<string>({
      method: 'eth_getBalance',
      params: [address, 'latest'],
    })
    return parseHexAmount(raw, 18)
  } catch (error) {
    return { ok: false, error: describeError(error) }
  }
}

/** USDT balance via balanceOf. Read-only: no confirmation dialog. */
export async function readUsdtBalance(
  provider: Eip1193Provider,
  address: string,
): Promise<BalanceResult> {
  const data = encodeFunctionData({
    abi: ERC20_BALANCE_OF,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })

  // Some hosts reject an eth_call with no `from`, so send it explicitly.
  const call = { from: address, to: USDT.address, data }

  try {
    const raw = await provider.request<string>({
      method: 'eth_call',
      params: [call, 'latest'],
    })
    return parseHexAmount(raw, USDT.decimals)
  } catch (error) {
    return { ok: false, error: describeError(error) }
  }
}

export function shortenAddress(address: string): string {
  if (address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Trim a decimal string for display without rounding money misleadingly. */
export function formatAmount(value: string, maxDecimals = 2): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  })
}

/** Ask the wallet to sign a plain-text message. Raises a native dialog. */
export async function personalSign(
  provider: Eip1193Provider,
  message: string,
  address: string,
): Promise<string> {
  return provider.request<string>({
    method: 'personal_sign',
    params: [message, address],
  })
}
