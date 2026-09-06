import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { errorResponse, requireAddress } from '@/lib/api'
import { CircleError } from '@/lib/circles'

export const dynamic = 'force-dynamic'

/**
 * A cheap change token for one circle.
 *
 * The circle detail endpoint runs four queries and returns the whole ledger;
 * polling that every few seconds would be wasteful on a database that scales to
 * zero. This is one round trip returning a short string, so clients can poll it
 * often and fetch the real payload only when it actually differs.
 *
 * Everything a member would notice must feed the token: the circle starting,
 * someone joining, a contribution confirming, the round advancing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const address = await requireAddress()
    const { id } = await params

    const result = await getDb().execute(sql`
      select
        exists(
          select 1 from members m
          where m.circle_id = c.id and m.address = ${address}
        )                                                        as is_member,
        c.status::text                                           as status,
        coalesce(c.locked_at::text, '')                          as locked_at,
        (select count(*) from members m where m.circle_id = c.id) as member_count,
        (
          select count(*) from contributions co
          join rounds r on r.id = co.round_id
          where r.circle_id = c.id and co.status = 'confirmed'
        )                                                        as confirmed_count,
        coalesce((
          select max(co.confirmed_at)::text from contributions co
          join rounds r on r.id = co.round_id
          where r.circle_id = c.id
        ), '')                                                   as last_confirmed,
        coalesce((
          select min(r.index) from rounds r
          where r.circle_id = c.id and r.status = 'open'
        ), 0)                                                    as open_round
      from circles c
      where c.id = ${id}
    `)

    // The neon-http driver returns { rows, fields, ... } rather than a bare array.
    const row = (result as unknown as { rows: Record<string, unknown>[] }).rows[0]
    if (!row) throw new CircleError('Circle not found.', 404)
    if (!row.is_member) throw new CircleError('You are not a member of this circle.', 403)

    const version = [
      row.status,
      row.locked_at,
      row.member_count,
      row.confirmed_count,
      row.last_confirmed,
      row.open_round,
    ].join('|')

    return NextResponse.json({ version })
  } catch (error) {
    return errorResponse(error)
  }
}
