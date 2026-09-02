/**
 * Nimiq provider access.
 *
 * The SDK is imported dynamically because it touches browser globals and must
 * never run during SSR. Outside Nimiq Pay there is no provider at all, so every
 * call here resolves to null rather than throwing — the app still has to work
 * in a desktop browser while you develop.
 */

export interface NimiqContext {
  address: string | null
  blockNumber: number | null
  consensus: boolean
}

export function getHostLanguageSafe(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.nimiqPay?.language
}

export function isInsideNimiqPay(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.nimiqPay)
}

export async function connectNimiq(timeout = 3000): Promise<NimiqContext | null> {
  if (typeof window === 'undefined') return null

  try {
    const { init } = await import('@nimiq/mini-app-sdk')
    const nimiq = await init({ timeout })

    const [accounts, consensus, blockNumber] = await Promise.all([
      nimiq.listAccounts(),
      nimiq.isConsensusEstablished(),
      nimiq.getBlockNumber(),
    ])

    // listAccounts resolves to either the addresses or an ErrorResponse.
    const address = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null

    return {
      address,
      blockNumber: typeof blockNumber === 'number' ? blockNumber : null,
      consensus: Boolean(consensus),
    }
  } catch {
    // Not inside Nimiq Pay, or the user declined. Neither is an error here.
    return null
  }
}
