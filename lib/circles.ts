import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { parseUnits } from 'viem'
import { getDb, schema } from '@/db'
import { USDT } from './chain'

export type Frequency = (typeof schema.frequencyEnum.enumValues)[number]

/** Ambiguous characters removed — these codes get read aloud and typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

const INTERVAL_DAYS: Record<Frequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
}

export function addInterval(from: Date, frequency: Frequency, periods: number): Date {
  const next = new Date(from)
  if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + periods)
    return next
  }
  next.setDate(next.getDate() + INTERVAL_DAYS[frequency] * periods)
  return next
}

export class CircleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

export async function createCircle(params: {
  creator: string
  name: string
  amount: string
  frequency: Frequency
  size: number
  startsAt?: Date
}) {
  const { creator, name, amount, frequency, size } = params

  if (!name.trim()) throw new CircleError('Give the circle a name.')
  if (size < 2 || size > 20) throw new CircleError('A circle needs between 2 and 20 people.')

  let contributionAmount: bigint
  try {
    contributionAmount = parseUnits(amount, USDT.decimals)
  } catch {
    throw new CircleError('That contribution amount is not a valid number.')
  }
  if (contributionAmount <= 0n) throw new CircleError('The contribution must be more than zero.')

  const db = getDb()

  const [circle] = await db
    .insert(schema.circles)
    .values({
      name: name.trim(),
      contributionAmount,
      frequency,
      size,
      creatorAddress: creator,
      inviteCode: generateInviteCode(),
      startsAt: params.startsAt ?? null,
    })
    .returning()

  // The creator is a member like anyone else; they pay in too.
  await db.insert(schema.members).values({ circleId: circle.id, address: creator })

  return circle
}

export async function joinCircle(params: { address: string; inviteCode: string }) {
  const db = getDb()
  const code = params.inviteCode.trim().toUpperCase()

  const [circle] = await db
    .select()
    .from(schema.circles)
    .where(eq(schema.circles.inviteCode, code))
    .limit(1)

  if (!circle) throw new CircleError('No circle found with that code.', 404)
  if (circle.status !== 'forming') {
    throw new CircleError('That circle has already started, so it cannot take new members.', 409)
  }

  const existing = await db
    .select()
    .from(schema.members)
    .where(
      and(eq(schema.members.circleId, circle.id), eq(schema.members.address, params.address)),
    )
    .limit(1)

  if (existing.length > 0) return circle // already in — treat as success, not an error

  const members = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.circleId, circle.id))

  if (members.length >= circle.size) {
    throw new CircleError('That circle is already full.', 409)
  }

  await db.insert(schema.members).values({ circleId: circle.id, address: params.address })

  return circle
}

/**
 * Lock the circle and lay out every round up front.
 *
 * Payout order is whatever order the creator supplied — deliberately not
 * randomised. Members see the full schedule before any money moves, and the
 * competition rules are wary of outcomes decided by chance.
 *
 * The recipient does not contribute during their own round, so each round
 * collects (members - 1) payments and every member ends up net zero.
 */
export async function lockCircle(params: {
  circleId: string
  caller: string
  order?: string[]
  startsAt?: Date
}) {
  const db = getDb()

  const [circle] = await db
    .select()
    .from(schema.circles)
    .where(eq(schema.circles.id, params.circleId))
    .limit(1)

  if (!circle) throw new CircleError('Circle not found.', 404)
  if (circle.creatorAddress !== params.caller) {
    throw new CircleError('Only the person who created the circle can start it.', 403)
  }
  if (circle.status !== 'forming') throw new CircleError('This circle has already started.', 409)

  const members = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.circleId, circle.id))
    .orderBy(asc(schema.members.joinedAt))

  if (members.length < 2) {
    throw new CircleError('A circle needs at least 2 members before it can start.')
  }

  // Fall back to join order when the creator hasn't rearranged anything.
  const order = params.order?.length ? params.order.map((a) => a.toLowerCase()) : members.map((m) => m.address)

  const memberAddresses = new Set(members.map((m) => m.address))
  if (order.length !== members.length || !order.every((a) => memberAddresses.has(a))) {
    throw new CircleError('The payout order must list every member exactly once.')
  }
  if (new Set(order).size !== order.length) {
    throw new CircleError('The payout order lists someone twice.')
  }

  const startsAt = params.startsAt ?? circle.startsAt ?? new Date()

  await Promise.all(
    order.map((address, i) =>
      db
        .update(schema.members)
        .set({ payoutPosition: i + 1 })
        .where(
          and(eq(schema.members.circleId, circle.id), eq(schema.members.address, address)),
        ),
    ),
  )

  const roundRows = order.map((recipient, i) => ({
    circleId: circle.id,
    index: i + 1,
    recipientAddress: recipient,
    opensAt: addInterval(startsAt, circle.frequency, i),
    dueAt: addInterval(startsAt, circle.frequency, i + 1),
    status: (i === 0 ? 'open' : 'upcoming') as 'open' | 'upcoming',
  }))

  const rounds = await db.insert(schema.rounds).values(roundRows).returning()

  // Every member owes every round except the one where they receive.
  const contributionRows = rounds.flatMap((round) =>
    order
      .filter((address) => address !== round.recipientAddress)
      .map((address) => ({
        roundId: round.id,
        fromAddress: address,
        toAddress: round.recipientAddress,
        amount: circle.contributionAmount,
      })),
  )

  await db.insert(schema.contributions).values(contributionRows)

  const [updated] = await db
    .update(schema.circles)
    .set({ status: 'active', lockedAt: new Date(), startsAt, size: order.length })
    .where(eq(schema.circles.id, circle.id))
    .returning()

  return { circle: updated, rounds }
}

export async function getCircleForMember(circleId: string, address: string) {
  const db = getDb()

  const [circle] = await db
    .select()
    .from(schema.circles)
    .where(eq(schema.circles.id, circleId))
    .limit(1)
  if (!circle) throw new CircleError('Circle not found.', 404)

  const members = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.circleId, circleId))
    .orderBy(asc(schema.members.joinedAt))

  if (!members.some((m) => m.address === address)) {
    throw new CircleError('You are not a member of this circle.', 403)
  }

  const rounds = await db
    .select()
    .from(schema.rounds)
    .where(eq(schema.rounds.circleId, circleId))
    .orderBy(asc(schema.rounds.index))

  const contributions = rounds.length
    ? await db
        .select()
        .from(schema.contributions)
        .where(inArray(schema.contributions.roundId, rounds.map((r) => r.id)))
    : []

  return { circle, members, rounds, contributions }
}

/**
 * Every circle this person belongs to, ordered by what actually needs them.
 *
 * Creation order buries a circle you owe money to underneath finished ones,
 * which is the opposite of useful — this screen's job is to answer "what do I
 * do right now". `youOwe` is computed in the same query rather than fetched
 * per circle, so the list stays one round trip however many circles there are.
 */
export async function listCirclesFor(address: string) {
  const result = await getDb().execute(sql`
    select
      c.id,
      c.name,
      c.token::text                     as token,
      c.contribution_amount::text       as contribution_amount,
      c.frequency::text                 as frequency,
      c.size,
      c.status::text                    as status,
      c.creator_address,
      c.invite_code,
      c.starts_at,
      c.locked_at,
      c.created_at,
      exists(
        select 1 from rounds r
        join contributions co on co.round_id = r.id
        where r.circle_id = c.id
          and r.status = 'open'
          and co.from_address = ${address}
          and co.status <> 'confirmed'
      ) as you_owe
    from members m
    join circles c on c.id = m.circle_id
    where m.address = ${address}
    order by
      case
        when c.status = 'active' and exists(
          select 1 from rounds r
          join contributions co on co.round_id = r.id
          where r.circle_id = c.id and r.status = 'open'
            and co.from_address = ${address} and co.status <> 'confirmed'
        ) then 0
        when c.status = 'active'    then 1
        when c.status = 'forming'   then 2
        else 3
      end,
      c.created_at desc
  `)

  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    token: String(r.token) as 'USDT_POLYGON' | 'NIM',
    contributionAmount: BigInt(String(r.contribution_amount)),
    frequency: String(r.frequency) as Frequency,
    size: Number(r.size),
    status: String(r.status) as 'forming' | 'active' | 'completed' | 'broken',
    creatorAddress: String(r.creator_address),
    inviteCode: String(r.invite_code),
    startsAt: r.starts_at as Date | null,
    lockedAt: r.locked_at as Date | null,
    createdAt: r.created_at as Date,
    youOwe: Boolean(r.you_owe),
  }))
}

