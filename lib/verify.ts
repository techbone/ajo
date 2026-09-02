import { decodeEventLog } from 'viem'
import { CONFIRMATIONS, ERC20_TRANSFER_EVENT, TRANSFER_TOPIC, USDT } from './chain'
import { getBlockNumber, getTransactionReceipt, type RawLog, type TxReceipt } from './rpc'

/**
 * Proving a contribution really happened.
 *
 * A transaction hash from the client is a claim, not evidence — anyone can post
 * any hash. What makes it evidence is reading the receipt from the chain and
 * checking that it contains a USDT Transfer of the right amount, from the right
 * member, to the right recipient.
 *
 * Every check below exists because skipping it lets someone mark themselves paid
 * with a transaction that isn't theirs.
 */

export type VerifyResult =
  | { ok: true; blockNumber: bigint; amount: bigint }
  | { ok: false; reason: string; retryable: boolean }

export interface ExpectedTransfer {
  from: string
  to: string
  amount: bigint
}

function normalise(address: string): string {
  return address.toLowerCase()
}

/** Pull the USDT Transfer out of a receipt's logs, if there is one. */
function findTransfer(
  logs: Array<{ address: string; topics: string[]; data: string }>,
  expected: ExpectedTransfer,
): { value: bigint } | null {
  for (const log of logs) {
    if (normalise(log.address) !== normalise(USDT.address)) continue
    if (normalise(log.topics[0] ?? '') !== TRANSFER_TOPIC) continue

    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_EVENT,
        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        data: log.data as `0x${string}`,
      })
      const { from, to, value } = decoded.args as unknown as {
        from: string
        to: string
        value: bigint
      }
      if (normalise(from) !== normalise(expected.from)) continue
      if (normalise(to) !== normalise(expected.to)) continue
      return { value }
    } catch {
      // Not a Transfer we can read; keep looking.
    }
  }
  return null
}

export async function verifyTransaction(
  txHash: string,
  expected: ExpectedTransfer,
): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: 'That is not a transaction hash.', retryable: false }
  }

  let receipt: TxReceipt | null
  try {
    receipt = await getTransactionReceipt(txHash)
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not reach the chain.',
      retryable: true,
    }
  }

  // Not mined yet — a normal state, not a failure.
  if (!receipt) {
    return { ok: false, reason: 'Not confirmed yet.', retryable: true }
  }

  if (receipt.status !== '0x1') {
    return { ok: false, reason: 'That transaction failed on-chain.', retryable: false }
  }

  const transfer = findTransfer(receipt.logs, expected)
  if (!transfer) {
    return {
      ok: false,
      reason: 'That transaction does not contain a USDT payment to this round.',
      retryable: false,
    }
  }

  // Underpaying is a real failure; overpaying is the sender's business, not ours.
  if (transfer.value < expected.amount) {
    return { ok: false, reason: 'That payment was less than the contribution.', retryable: false }
  }

  const blockNumber = BigInt(receipt.blockNumber)

  try {
    const head = await getBlockNumber()
    if (head - blockNumber + 1n < BigInt(CONFIRMATIONS)) {
      return { ok: false, reason: 'Waiting for confirmations.', retryable: true }
    }
  } catch {
    // If we cannot read the head, accept the receipt rather than stalling.
  }

  return { ok: true, blockNumber, amount: transfer.value }
}

/** Decode a raw log from the sweep into the same shape the fast path produces. */
export function decodeTransferLog(
  log: RawLog,
): { from: string; to: string; value: bigint; blockNumber: bigint; txHash: string } | null {
  if (normalise(log.address) !== normalise(USDT.address)) return null
  if (normalise(log.topics[0] ?? '') !== TRANSFER_TOPIC) return null

  try {
    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_EVENT,
      topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      data: log.data as `0x${string}`,
    })
    const { from, to, value } = decoded.args as unknown as {
      from: string
      to: string
      value: bigint
    }
    return {
      from: normalise(from),
      to: normalise(to),
      value,
      blockNumber: BigInt(log.blockNumber),
      txHash: log.transactionHash,
    }
  } catch {
    return null
  }
}
