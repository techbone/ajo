import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm'
import { getDb, schema } from '@/db'
import { CircleError } from './circles'
import { verifyNimTransaction, verifyTransaction, type VerifyResult } from './verify'

/**
 * Postgres unique-violation, raised when a tx hash is already credited.
 *
 * Drivers disagree about where they put the code — sometimes on the error,
 * sometimes on its cause — so check both and fall back to the message.
 */
function isDuplicateTxHash(error: unknown): boolean {
  const err = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown }
  return (
    err?.code === '23505' ||
    err?.cause?.code === '23505' ||
    /duplicate key|unique constraint/i.test(String(err?.message ?? ''))
  )
}

/**
 * Turning a claimed payment into a confirmed one.
 *
 * Contribution rows are created up front when a circle locks, so this never
 * inserts — it only moves a row from pending to confirmed once the chain agrees.
 * That, plus the unique index on tx_hash, is what makes the operation safe to
 * run twice, and safe for both verification paths to race on.
 */

/**
 * Verify a contribution against whichever chain its circle runs on.
 *
 * Identity is always the EVM address — that is what a contribution row holds
 * for from and to. A NIM circle needs the Nimiq address behind each of those,
 * which the member linked to their account; if either side has none, the
 * payment cannot be verified and says so rather than guessing.
 */
async function verifyContribution(
  contribution: { roundId: string; fromAddress: string; toAddress: string; amount: bigint },
  txHash: string,
): Promise<VerifyResult> {
  const db = getDb()

  const [row] = await db
    .select({ token: schema.circles.token })
    .from(schema.rounds)
    .innerJoin(schema.circles, eq(schema.circles.id, schema.rounds.circleId))
    .where(eq(schema.rounds.id, contribution.roundId))
    .limit(1)

  if (!row) return { ok: false, reason: 'Round not found.', retryable: false }

  if (row.token === 'USDT_POLYGON') {
    return verifyTransaction(txHash, {
      from: contribution.fromAddress,
      to: contribution.toAddress,
      amount: contribution.amount,
    })
  }

  const people = await db
    .select({ address: schema.users.address, nimAddress: schema.users.nimAddress })
    .from(schema.users)
    .where(inArray(schema.users.address, [contribution.fromAddress, contribution.toAddress]))

  const fromNim = people.find((p) => p.address === contribution.fromAddress)?.nimAddress
  const toNim = people.find((p) => p.address === contribution.toAddress)?.nimAddress

  if (!fromNim) {
    return { ok: false, reason: 'Link your Nimiq address before paying a NIM circle.', retryable: false }
  }
  if (!toNim) {
    return { ok: false, reason: 'The recipient has not linked a Nimiq address yet.', retryable: false }
  }

  return verifyNimTransaction(txHash, { fromNim, toNim, amountLuna: contribution.amount })
}

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

  const result = await verifyContribution(contribution, params.txHash)

  if (!result.ok) {
    // Still being mined is not an error — hold the hash and let the sweep finish.
    if (result.retryable) {
      // Hold the hash so the re-check can finish the job. It has not been proven
      // yet, so nothing is marked paid — but it must still be unique, or two
      // people could park the same transaction on two contributions.
      try {
        await db
          .update(schema.contributions)
          .set({ txHash: params.txHash })
          .where(eq(schema.contributions.id, contribution.id))
      } catch (error) {
        if (isDuplicateTxHash(error)) {
          throw new CircleError(
            'That transaction has already been recorded for another contribution.',
            409,
          )
        }
        throw error
      }
      return { status: 'pending' as const, reason: result.reason }
    }
    throw new CircleError(result.reason, 400)
  }

  try {
    await db
      .update(schema.contributions)
      .set({
        txHash: params.txHash,
        blockNumber: result.blockNumber,
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(eq(schema.contributions.id, contribution.id))
  } catch (error) {
    if (isDuplicateTxHash(error)) {
      throw new CircleError(
        'That transaction has already been recorded for another contribution.',
        409,
      )
    }
    throw error
  }

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

  // Both verification paths can reach the same payment. The unique index on
  // (address, round_id) is what keeps streaks honest; this just declines to
  // fight it.
  await db
    .insert(schema.reputationEvents)
    .values({
      address,
      circleId: round.circleId,
      roundId,
      kind: Date.now() <= round.dueAt.getTime() ? 'paid_on_time' : 'paid_late',
    })
    .onConflictDoNothing()
}

/**
 * Close a round once every contribution has confirmed, and open the next one.
 *
 * Only an open round can be closed — contributions can legitimately arrive for
 * a round that has not started yet, and settling it early would pay someone out
 * before their turn.
 *
 * The close is a conditional update: two callers racing on the same round means
 * exactly one sees a returned row and continues. And because a round may already
 * be fully funded by the time it opens, this walks forward until it reaches one
 * that is genuinely still collecting.
 */
export async function advanceRoundIfComplete(roundId: string): Promise<boolean> {
  const db = getDb()
  let advanced = false
  let currentId: string | null = roundId

  // Bounded: a circle cannot have more rounds than it has members.
  for (let guard = 0; currentId && guard < 64; guard += 1) {
    const [round] = await db
      .select()
      .from(schema.rounds)
      .where(eq(schema.rounds.id, currentId))
      .limit(1)

    if (!round || round.status !== 'open') break

    const outstanding = await db
      .select({ id: schema.contributions.id })
      .from(schema.contributions)
      .where(
        and(
          eq(schema.contributions.roundId, round.id),
          ne(schema.contributions.status, 'confirmed'),
        ),
      )

    if (outstanding.length > 0) break

    const closed = await db
      .update(schema.rounds)
      .set({ status: 'complete' })
      .where(and(eq(schema.rounds.id, round.id), eq(schema.rounds.status, 'open')))
      .returning({ id: schema.rounds.id })

    // Lost the race — another caller closed it and owns what happens next.
    if (closed.length === 0) break

    advanced = true

    const [next] = await db
      .select()
      .from(schema.rounds)
      .where(
        and(eq(schema.rounds.circleId, round.circleId), eq(schema.rounds.status, 'upcoming')),
      )
      .orderBy(asc(schema.rounds.index))
      .limit(1)

    if (!next) {
      // Last round settled: everyone has paid the same and been paid once.
      await db
        .update(schema.circles)
        .set({ status: 'completed' })
        .where(eq(schema.circles.id, round.circleId))
      break
    }

    // The rotation keeps its rhythm. Everyone paying round 1 in an hour closes
    // round 1, but round 2 still waits for its date — the time between rounds
    // is what makes this a savings circle rather than a pointless shuffle of
    // the same money. openDueRounds() opens it when the day arrives.
    if (next.opensAt.getTime() > Date.now()) break

    await db.update(schema.rounds).set({ status: 'open' }).where(eq(schema.rounds.id, next.id))
    currentId = next.id
  }

  return advanced
}

/**
 * Open any round whose date has arrived.
 *
 * Called from the sweep on a schedule and from the circle page on load, so a
 * round opens on time whether or not anyone is looking. A round already paid
 * in full while it was upcoming settles the moment it opens.
 */
export async function openDueRounds(circleId?: string): Promise<number> {
  const db = getDb()
  const now = new Date()

  const candidates = await db
    .select({
      id: schema.rounds.id,
      circleId: schema.rounds.circleId,
      index: schema.rounds.index,
    })
    .from(schema.rounds)
    .innerJoin(schema.circles, eq(schema.circles.id, schema.rounds.circleId))
    .where(
      and(
        eq(schema.rounds.status, 'upcoming'),
        eq(schema.circles.status, 'active'),
        lte(schema.rounds.opensAt, now),
        circleId ? eq(schema.rounds.circleId, circleId) : undefined,
      ),
    )
    .orderBy(asc(schema.rounds.circleId), asc(schema.rounds.index))

  let opened = 0
  const seen = new Set<string>()

  for (const round of candidates) {
    // Only the earliest due round per circle; later ones open as it cascades.
    if (seen.has(round.circleId)) continue
    seen.add(round.circleId)

    // Never open a second round while one is still collecting.
    const [stillOpen] = await db
      .select({ id: schema.rounds.id })
      .from(schema.rounds)
      .where(and(eq(schema.rounds.circleId, round.circleId), eq(schema.rounds.status, 'open')))
      .limit(1)
    if (stillOpen) continue

    // Conditional so two callers racing on the same round open it once.
    const [flipped] = await db
      .update(schema.rounds)
      .set({ status: 'open' })
      .where(and(eq(schema.rounds.id, round.id), eq(schema.rounds.status, 'upcoming')))
      .returning({ id: schema.rounds.id })
    if (!flipped) continue

    opened += 1
    await advanceRoundIfComplete(round.id)
  }

  return opened
}

/** Record that a member paid, whichever path proved it. Safe to call twice. */
export async function noteContributionPaid(roundId: string, address: string): Promise<void> {
  await recordReputation(roundId, address)
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

/**
 * Re-check contributions that were submitted but not yet confirmed.
 *
 * A transaction is almost never mined by the time the browser posts its hash,
 * so the first verification legitimately returns "pending". Without something
 * to look again, that pending state is where the payment stays until the daily
 * sweep runs — which is not what "the blockchain is fast" should feel like.
 *
 * Cheap to call: one receipt lookup per outstanding hash, and it stops as soon
 * as a contribution is confirmed.
 */
export async function recheckPending(
  roundId: string,
): Promise<{ confirmed: number; released: number }> {
  const db = getDb()

  const rows = await db
    .select()
    .from(schema.contributions)
    .where(
      and(
        eq(schema.contributions.roundId, roundId),
        ne(schema.contributions.status, 'confirmed'),
      ),
    )

  const withHash = rows.filter((r) => Boolean(r.txHash))
  if (withHash.length === 0) return { confirmed: 0, released: 0 }

  let confirmed = 0
  let released = 0

  for (const row of withHash) {
    const result = await verifyContribution(row, row.txHash as string)

    if (!result.ok) {
      // Retryable means "not settled yet" — keep the hash and look again.
      if (result.retryable) continue

      // Anything else is final: the transaction reverted, or never contained
      // this payment. Let the hash go, or the member is stuck looking at a
      // dead transaction with no way to pay.
      const cleared = await db
        .update(schema.contributions)
        .set({ txHash: null })
        .where(
          and(
            eq(schema.contributions.id, row.id),
            ne(schema.contributions.status, 'confirmed'),
          ),
        )
        .returning({ id: schema.contributions.id })

      if (cleared.length > 0) released += 1
      continue
    }

    // returning() is what tells us whether this call did the work or whether
    // the sweep got there first. Without it every racing caller would record a
    // reputation event and report a confirmation for the same payment.
    const updated = await db
      .update(schema.contributions)
      .set({
        blockNumber: result.blockNumber,
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(
        and(
          eq(schema.contributions.id, row.id),
          ne(schema.contributions.status, 'confirmed'),
        ),
      )
      .returning({ id: schema.contributions.id })

    if (updated.length === 0) continue

    await recordReputation(row.roundId, row.fromAddress)
    confirmed += 1
  }

  if (confirmed > 0) await advanceRoundIfComplete(roundId)

  return { confirmed, released }
}
