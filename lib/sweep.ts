import { and, eq, inArray, ne } from 'drizzle-orm'
import { getDb, schema } from '@/db'
import { CONFIRMATIONS } from './chain'
import { advanceRoundIfComplete, noteContributionPaid } from './payments'
import { getBlockNumber, getTransfersTo } from './rpc'
import { decodeTransferLog } from './verify'

/**
 * The backstop.
 *
 * The fast path only fires when someone pays inside the app and stays long
 * enough for the write to land. This sweep reads the chain directly, so a
 * payment made straight from a wallet — or one where the browser closed early —
 * still gets credited. The chain is the ledger; the database is a cache of it.
 *
 * Both paths write the same row, and the unique index on tx_hash means whichever
 * arrives second changes nothing.
 */

const CHAIN = 'polygon'

/** Polygon produces a block roughly every 2s; this is about a day of them. */
const MAX_LOOKBACK = 43_200n

/** eth_getLogs providers reject very wide ranges, so walk in chunks. */
const CHUNK = 2_000n

/**
 * Chunks per invocation.
 *
 * A cold cursor means a day of blocks to get through, and doing that in one run
 * both times out the function and gets the RPC to throttle us. Catching up over
 * several runs keeps every invocation short; the cursor makes the progress
 * durable.
 */
const MAX_CHUNKS_PER_RUN = 8n

export interface SweepReport {
  scannedFrom: string
  scannedTo: string
  /** False when a backlog remains and the next run should continue. */
  caughtUp: boolean
  logsSeen: number
  confirmed: number
  roundsAdvanced: number
}

async function readCursor(head: bigint): Promise<bigint> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(schema.sweepState)
    .where(eq(schema.sweepState.chain, CHAIN))
    .limit(1)

  const floor = head - MAX_LOOKBACK
  if (!row) return floor > 0n ? floor : 0n
  // Never scan further back than the lookback, however stale the cursor is.
  return row.lastBlock > floor ? row.lastBlock : floor
}

async function writeCursor(block: bigint): Promise<void> {
  const db = getDb()
  await db
    .insert(schema.sweepState)
    .values({ chain: CHAIN, lastBlock: block, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.sweepState.chain,
      set: { lastBlock: block, updatedAt: new Date() },
    })
}

export async function sweep(): Promise<SweepReport> {
  const db = getDb()
  const head = await getBlockNumber()

  // Stay behind the head so a reorg cannot un-confirm what we just credited.
  const safeHead = head - BigInt(CONFIRMATIONS)

  // Every round still owed money, not just the open one. The cursor only moves
  // forward, so a payment made before its round opens would otherwise fall
  // behind the scan window and never be credited — which is precisely the case
  // this sweep exists to catch.
  const liveRounds = await db
    .select()
    .from(schema.rounds)
    .where(ne(schema.rounds.status, 'complete'))

  const from = await readCursor(safeHead)

  if (liveRounds.length === 0 || safeHead <= from) {
    await writeCursor(safeHead > 0n ? safeHead : 0n)
    return {
      scannedFrom: from.toString(),
      scannedTo: safeHead.toString(),
      caughtUp: true,
      logsSeen: 0,
      confirmed: 0,
      roundsAdvanced: 0,
    }
  }

  const recipients = [...new Set(liveRounds.map((r) => r.recipientAddress))]
  const roundIds = liveRounds.map((r) => r.id)
  const openRoundIds = new Set(liveRounds.filter((r) => r.status === 'open').map((r) => r.id))

  const pending = await db
    .select()
    .from(schema.contributions)
    .where(
      and(
        ne(schema.contributions.status, 'confirmed'),
        inArray(schema.contributions.roundId, roundIds),
      ),
    )

  let logsSeen = 0
  let confirmed = 0
  const touchedRounds = new Set<string>()

  const ceiling =
    from + CHUNK * MAX_CHUNKS_PER_RUN < safeHead ? from + CHUNK * MAX_CHUNKS_PER_RUN : safeHead

  for (let start = from + 1n; start <= ceiling; start += CHUNK) {
    const end = start + CHUNK - 1n > ceiling ? ceiling : start + CHUNK - 1n
    const logs = await getTransfersTo(recipients, start, end)
    logsSeen += logs.length

    for (const raw of logs) {
      const transfer = decodeTransferLog(raw)
      if (!transfer) continue

      // A transfer counts only if someone actually owes exactly this, to exactly
      // this recipient, and has not already been credited.
      const match = pending.find(
        (c) =>
          c.status !== 'confirmed' &&
          c.fromAddress === transfer.from &&
          c.toAddress === transfer.to &&
          transfer.value >= c.amount,
      )
      if (!match) continue

      try {
        const updated = await db
          .update(schema.contributions)
          .set({
            txHash: transfer.txHash,
            blockNumber: transfer.blockNumber,
            status: 'confirmed',
            confirmedAt: new Date(),
          })
          .where(
            and(
              eq(schema.contributions.id, match.id),
              ne(schema.contributions.status, 'confirmed'),
            ),
          )
          .returning({ id: schema.contributions.id })

        match.status = 'confirmed' // don't match the same row twice in this pass

        // Nothing updated means the fast path confirmed it first; it already
        // recorded the reputation event and counted the payment.
        if (updated.length === 0) continue

        await noteContributionPaid(match.roundId, match.fromAddress)
        confirmed += 1
        touchedRounds.add(match.roundId)
      } catch {
        // Unique index on tx_hash: this transfer was already credited elsewhere.
      }
    }
  }

  let roundsAdvanced = 0
  for (const roundId of touchedRounds) {
    if (!openRoundIds.has(roundId)) continue // an upcoming round settles when it opens
    if (await advanceRoundIfComplete(roundId)) roundsAdvanced += 1
  }

  await writeCursor(ceiling)

  return {
    scannedFrom: from.toString(),
    scannedTo: ceiling.toString(),
    caughtUp: ceiling >= safeHead,
    logsSeen,
    confirmed,
    roundsAdvanced,
  }
}
