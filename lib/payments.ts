import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { getDb, schema } from '@/db'
import { CircleError } from './circles'
import { verifyTransaction } from './verify'

/**
 * Turning a claimed payment into a confirmed one.
 *
 * Contribution rows are created up front when a circle locks, so this never
 * inserts — it only moves a row from pending to confirmed once the chain agrees.
 * That, plus the unique index on tx_hash, is what makes the operation safe to
 * run twice, and safe for both verification paths to race on.
 */

export async function submitContribution(params: {
  roundId: string
  from: string
  txHash: string
}) {
  const db = getDb()
  const from = params.from.toLowerCase()

  const [contribution] = await db
    .select()
    .from(schema.contributions)
    .where(
      and(
        eq(schema.contributions.roundId, params.roundId),
        eq(schema.contributions.fromAddress, from),
      ),
    )
    .limit(1)

  if (!contribution) {
    throw new CircleError('You do not owe anything for this round.', 404)
  }
  if (contribution.status === 'confirmed') {
    return { status: 'confirmed' as const, alreadyRecorded: true }
  }

  const result = await verifyTransaction(params.txHash, {
    from,
    to: contribution.toAddress,
    amount: contribution.amount,
  })

  if (!result.ok) {
    // Still being mined is not an error — hold the hash and let the sweep finish.
    if (result.retryable) {
      await db
        .update(schema.contributions)
        .set({ txHash: params.txHash })
        .where(eq(schema.contributions.id, contribution.id))
      return { status: 'pending' as const, reason: result.reason }
    }
    throw new CircleError(result.reason, 400)
  }

  await db
    .update(schema.contributions)
    .set({
      txHash: params.txHash,
      blockNumber: result.blockNumber,
      status: 'confirmed',
      confirmedAt: new Date(),
    })
    .where(eq(schema.contributions.id, contribution.id))

  await recordReputation(contribution.roundId, from)
  await advanceRoundIfComplete(contribution.roundId)

  return { status: 'confirmed' as const, alreadyRecorded: false }
}

/** Paid before the deadline, or after it. Both are worth remembering. */
async function recordReputation(roundId: string, address: string) {
  const db = getDb()
  const [round] = await db
    .select()
    .from(schema.rounds)
    .where(eq(schema.rounds.id, roundId))
    .limit(1)
  if (!round) return

  await db.insert(schema.reputationEvents).values({
    address,
    circleId: round.circleId,
    roundId,
    kind: Date.now() <= round.dueAt.getTime() ? 'paid_on_time' : 'paid_late',
  })
}

/**
 * Close a round once every contribution has confirmed, and open the next one.
 *
 * Safe to call repeatedly: it does nothing until the round is genuinely complete,
 * and the status check means a second caller cannot advance it twice.
 */
export async function advanceRoundIfComplete(roundId: string): Promise<boolean> {
  const db = getDb()

  const [round] = await db
    .select()
    .from(schema.rounds)
    .where(eq(schema.rounds.id, roundId))
    .limit(1)
  if (!round || round.status === 'complete') return false

  const outstanding = await db
    .select({ id: schema.contributions.id })
    .from(schema.contributions)
    .where(
      and(
        eq(schema.contributions.roundId, roundId),
        ne(schema.contributions.status, 'confirmed'),
      ),
    )

  if (outstanding.length > 0) return false

  await db
    .update(schema.rounds)
    .set({ status: 'complete' })
    .where(eq(schema.rounds.id, roundId))

  const [next] = await db
    .select()
    .from(schema.rounds)
    .where(and(eq(schema.rounds.circleId, round.circleId), eq(schema.rounds.status, 'upcoming')))
    .orderBy(asc(schema.rounds.index))
    .limit(1)

  if (next) {
    await db.update(schema.rounds).set({ status: 'open' }).where(eq(schema.rounds.id, next.id))
  } else {
    // Last round settled: everyone has paid the same and been paid once.
    await db
      .update(schema.circles)
      .set({ status: 'completed' })
      .where(eq(schema.circles.id, round.circleId))
  }

  return true
}

/** The round currently collecting money for a circle, if any. */
export async function getOpenRound(circleId: string) {
  const db = getDb()
  const [round] = await db
    .select()
    .from(schema.rounds)
    .where(and(eq(schema.rounds.circleId, circleId), eq(schema.rounds.status, 'open')))
    .limit(1)
  return round ?? null
}

/** Rounds still collecting, across every active circle. Used by the sweep. */
export async function getOpenRoundsWithRecipients() {
  const db = getDb()
  return db
    .select({
      roundId: schema.rounds.id,
      circleId: schema.rounds.circleId,
      recipient: schema.rounds.recipientAddress,
      openedAt: schema.rounds.opensAt,
    })
    .from(schema.rounds)
    .where(eq(schema.rounds.status, 'open'))
}

/** Contributions still waiting on money, for the rounds the sweep is scanning. */
export async function getPendingContributions(roundIds: string[]) {
  if (roundIds.length === 0) return []
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.contributions)
    .where(and(ne(schema.contributions.status, 'confirmed'), isNull(schema.contributions.confirmedAt)))
  return rows.filter((r) => roundIds.includes(r.roundId))
}
