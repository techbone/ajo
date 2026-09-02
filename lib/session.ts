import { cookies } from 'next/headers'
import { jwtVerify, SignJWT } from 'jose'
import { and, eq, lt } from 'drizzle-orm'
import { getDb, schema } from '@/db'

const SESSION_COOKIE = 'ajo_session'
const NONCE_COOKIE = 'ajo_nonce'
const SESSION_DAYS = 30

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET
  if (!value) {
    throw new Error('AUTH_SECRET is not set. Generate one with: openssl rand -base64 32')
  }
  return new TextEncoder().encode(value)
}

/**
 * Local development is served over plain http inside the WebView, so a Secure
 * cookie would be silently dropped and nobody would ever stay signed in.
 */
const isProd = process.env.NODE_ENV === 'production'

async function sign(payload: Record<string, string>, expires: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret())
}

const NONCE_TTL_MS = 5 * 60 * 1000

/**
 * Issue a sign-in nonce.
 *
 * Recorded in the database *and* mirrored into a signed cookie. The cookie
 * binds the nonce to this browser; the row is what makes it single-use.
 */
export async function issueNonce(
  nonce: string,
  address: string,
  issuedAt: string,
): Promise<void> {
  const db = getDb()
  const now = new Date()

  // Opportunistic cleanup, so expired rows never accumulate and no cron is needed.
  await db.delete(schema.authNonces).where(lt(schema.authNonces.expiresAt, now))

  await db.insert(schema.authNonces).values({
    nonce,
    address,
    issuedAt: new Date(issuedAt),
    expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
  })

  const jar = await cookies()
  jar.set(NONCE_COOKIE, await sign({ nonce, issuedAt }, '5m'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 300,
  })
}

/**
 * Spend the nonce. Returns null if it was already used, expired, or was issued
 * for a different address.
 *
 * The DELETE ... RETURNING is what enforces single use: only one caller can
 * ever remove a given row, so a replayed request finds nothing and is refused.
 */
export async function consumeNonce(
  address: string,
): Promise<{ nonce: string; issuedAt: string } | null> {
  const jar = await cookies()
  const token = jar.get(NONCE_COOKIE)?.value
  if (!token) return null

  jar.delete(NONCE_COOKIE)

  let nonce: string
  try {
    const { payload } = await jwtVerify(token, secret())
    if (typeof payload.nonce !== 'string') return null
    nonce = payload.nonce
  } catch {
    return null
  }

  const [row] = await getDb()
    .delete(schema.authNonces)
    .where(
      and(eq(schema.authNonces.nonce, nonce), eq(schema.authNonces.address, address)),
    )
    .returning()

  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) return null

  return { nonce: row.nonce, issuedAt: row.issuedAt.toISOString() }
}

export async function createSession(address: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, await sign({ address }, `${SESSION_DAYS}d`), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

/** The signed-in address, or null. Always lowercase. */
export async function getSessionAddress(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.address === 'string' ? payload.address : null
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
