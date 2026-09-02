import { personalSign, type Eip1193Provider } from './wallet'

/**
 * Proves the member owns the address, then exchanges that proof for a session.
 *
 * The message comes from the server so the nonce inside it is server-issued and
 * single-use — a captured signature cannot be replayed.
 */
export async function signIn(
  provider: Eip1193Provider,
  address: string,
): Promise<{ address: string }> {
  const nonceRes = await fetch(`/api/auth/nonce?address=${address}`, {
    cache: 'no-store',
  })
  if (!nonceRes.ok) {
    throw new Error((await nonceRes.json()).error ?? 'Could not start sign-in.')
  }
  const { message } = (await nonceRes.json()) as { message: string }

  const signature = await personalSign(provider, message, address)

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  })
  if (!verifyRes.ok) {
    throw new Error((await verifyRes.json()).error ?? 'Could not verify your signature.')
  }

  return verifyRes.json()
}

export async function fetchSession(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!res.ok) return null
    return ((await res.json()) as { address: string | null }).address
  } catch {
    return null
  }
}

export interface Balances {
  usdt: string | null
  pol: string | null
  errors: { usdt: string | null; pol: string | null }
}

/**
 * Balances come from our own server, not the injected provider — chain reads
 * need no keys, and this keeps us clear of host RPC quirks.
 */
export async function fetchBalances(address: string): Promise<Balances> {
  const res = await fetch(`/api/balances?address=${address}`, { cache: 'no-store' })
  if (!res.ok) {
    const message = (await res.json()).error ?? 'Could not read balances.'
    return { usdt: null, pol: null, errors: { usdt: message, pol: message } }
  }
  return res.json()
}
