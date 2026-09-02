import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | undefined

/**
 * Resolved lazily so a missing DATABASE_URL fails at the first query with a
 * clear message, rather than at import time — which would break `next build`
 * on a machine that has no database configured yet.
 */
export function getDb(): Db {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create a Neon project, then put the connection string in .env.local',
    )
  }

  cached = drizzle(neon(url), { schema })
  return cached
}

export { schema }
