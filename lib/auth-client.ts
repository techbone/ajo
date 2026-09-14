import { errorMessage, readJson, unwrap } from './http'
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
  const { message } = await unwrap<{ message: string }>(
    nonceRes,
    'Could not start sign-in.',
  )

  const signature = await personalSign(provider, message, address)

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  })
  return unwrap<{ address: string }>(verifyRes, 'Could not verify your signature.')
}

export async function fetchSession(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!res.ok) return null
    return (await readJson<{ address: string | null }>(res))?.address ?? null
  } catch {
    return null
  }
}

export interface Balances {
  usdt: string | null
  pol: string | null
  nim: string | null
  errors: { usdt: string | null; pol: string | null; nim: string | null }
}

/**
 * Balances come from our own server, not the injected provider — chain reads
 * need no keys, and this keeps us clear of host RPC quirks.
 */
export async function fetchBalances(address: string, nimAddress?: string | null): Promise<Balances> {
  const query = new URLSearchParams({ address })
  if (nimAddress) query.set('nim', nimAddress)
  const res = await fetch(`/api/balances?${query}`, { cache: 'no-store' })
  if (!res.ok) {
    const message = await errorMessage(res, 'Could not read balances.')
    return { usdt: null, pol: null, nim: null, errors: { usdt: message, pol: message, nim: message } }
  }
  return (
    (await readJson<Balances>(res)) ?? {
      usdt: null,
      pol: null,
      nim: null,
      errors: { usdt: 'Empty response.', pol: 'Empty response.', nim: 'Empty response.' },
    }
  )
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/signout', { method: 'POST' })
}

/** The Nimiq address linked to this account, if any. */
export async function fetchNimAddress(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/nim', { cache: 'no-store' })
    if (!res.ok) return null
    return ((await readJson<{ nimAddress: string | null }>(res)) ?? { nimAddress: null }).nimAddress
  } catch {
    return null
  }
}

export async function linkNimAddress(nimAddress: string): Promise<string> {
  const res = await fetch('/api/auth/nim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nimAddress }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not link your Nimiq address.'))
  return ((await readJson<{ nimAddress: string }>(res)) ?? { nimAddress }).nimAddress
}
