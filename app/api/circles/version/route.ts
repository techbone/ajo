import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { errorResponse, requireAddress } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * A change token covering every circle this person belongs to.
 *
 * Same idea as the per-circle version, one level up: the circles list needs to
 * notice a circle being started, someone joining, or a contribution confirming,
 * without refetching the whole list on a timer. Hashed server-side so the
 * response stays a fixed 32 characters no matter how many circles there are.
 */
export async function GET() {
  try {
    const address = await requireAddress()

    const result = await getDb().execute(sql`
      select coalesce(md5(string_agg(
        c.id::text || ':' || c.status::text || ':' ||
        (select count(*) from members m2 where m2.circle_id = c.id)::text || ':' ||
        (
          select count(*) from contributions co
          join rounds r on r.id = co.round_id
          where r.circle_id = c.id and co.status = 'confirmed'
        )::text,
        '|' order by c.id
      )), 'empty') as version
      from circles c
      join members m on m.circle_id = c.id and m.address = ${address}
    `)

    const row = (result as unknown as { rows: Record<string, unknown>[] }).rows[0]
    return NextResponse.json({ version: String(row?.version ?? 'empty') })
  } catch (error) {
    return errorResponse(error)
  }
}
