// NIM circles: amount handling, address linking, token-aware create/join, and
// verification against the live Nimiq network.
//   npx tsx --tsconfig tsconfig.json test/nim.mts
import { eq } from 'drizzle-orm'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { getDb, schema } from '../db'
import { createCircle, joinCircle, lockCircle, CircleError } from '../lib/circles'
import { submitContribution } from '../lib/payments'
import { formatNim, parseNim, isNimAddress, normaliseNimAddress, nimRpc, getNimTransaction } from '../lib/nim-rpc'
import { verifyNimTransaction } from '../lib/verify'

let pass = 0, fail = 0
const check = (n: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++ }
const addr = () => privateKeyToAccount(generatePrivateKey()).address.toLowerCase()
const db = getDb()
async function ensureUser(address: string, nimAddress?: string) {
  await db.insert(schema.users).values({ address, nimAddress: nimAddress ?? null })
    .onConflictDoUpdate({ target: schema.users.address, set: { nimAddress: nimAddress ?? null } })
}
async function expectError(fn: () => Promise<unknown>, status: number) {
  try { await fn(); return { threw: false, status: 0 } }
  catch (e) { return { threw: true, status: e instanceof CircleError ? e.status : -1, message: (e as Error).message } }
}

console.log('\n=== amounts ===')
{
  check('parseNim("1") is 100,000 Luna', parseNim('1') === 100_000n)
  check('parseNim("0.00001") is 1 Luna', parseNim('0.00001') === 1n)
  check('parseNim("12.5") is 1,250,000 Luna', parseNim('12.5') === 1_250_000n)
  check('formatNim round-trips', formatNim(parseNim('1234.56789')) === '1234.56789')
  check('formatNim pads fractional part', formatNim(100_000n) === '1.00000')
  let threw = false; try { parseNim('1.000001') } catch { threw = true }
  check('parseNim rejects more than 5 decimals', threw)
  threw = false; try { parseNim('abc') } catch { threw = true }
  check('parseNim rejects garbage', threw)
}

console.log('\n=== addresses ===')
{
  const spaced = 'NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK'
  check('accepts a spaced user-friendly address', isNimAddress(spaced))
  check('accepts the same address without spaces', isNimAddress(spaced.replace(/ /g, '')))
  check('accepts lowercase', isNimAddress(spaced.toLowerCase()))
  check('normalise strips spaces and uppercases', normaliseNimAddress(spaced.toLowerCase()) === 'NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK')
  check('rejects an EVM address', !isNimAddress('0x1234567890abcdef1234567890abcdef12345678'))
  check('rejects a truncated address', !isNimAddress('NQ87 BLXR'))
}

console.log('\n=== token-aware circles ===')
{
  const creator = addr(); await ensureUser(creator)
  const noNim = await expectError(
    () => createCircle({ creator, name: 'nim', amount: '1', frequency: 'daily', size: 2, token: 'NIM' }), 412)
  check('creating a NIM circle without a linked address is refused (412)', noNim.threw && noNim.status === 412, noNim.message)

  await ensureUser(creator, 'NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK')
  const circle = await createCircle({ creator, name: 'nim', amount: '1.5', frequency: 'daily', size: 2, token: 'NIM' })
  check('creating a NIM circle with a linked address works', circle.token === 'NIM')
  check('NIM amount is stored in Luna', circle.contributionAmount === 150_000n, String(circle.contributionAmount))

  const usdtCircle = await createCircle({ creator, name: 'usdt', amount: '1.5', frequency: 'daily', size: 2 })
  check('token defaults to USDT', usdtCircle.token === 'USDT_POLYGON')
  check('USDT amount still stored in 6-decimal units', usdtCircle.contributionAmount === 1_500_000n)

  const joiner = addr(); await ensureUser(joiner)
  const blocked = await expectError(() => joinCircle({ address: joiner, inviteCode: circle.inviteCode }), 412)
  check('joining a NIM circle without a linked address is refused (412)', blocked.threw && blocked.status === 412)
  const usdtJoin = await joinCircle({ address: joiner, inviteCode: usdtCircle.inviteCode })
  check('the same person can still join a USDT circle', usdtJoin.id === usdtCircle.id)

  await ensureUser(joiner, 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG')
  const joined = await joinCircle({ address: joiner, inviteCode: circle.inviteCode })
  check('joining after linking works', joined.id === circle.id)

  const { rounds } = await lockCircle({ circleId: circle.id, caller: creator })
  check('NIM circle locks and generates rounds like any other', rounds.length === 2)
  ;(globalThis as any).__nim = { circle, rounds, creator, joiner }
}

// The open RPC rate-limits; find one settled transaction and reuse it.
async function findSettledTx(): Promise<{ hash: string; from: string; to: string; value: number } | null> {
  const head = await nimRpc<number>('getBlockNumber', [])
  for (let i = 40; i < 400; i += 12) {
    const b = await nimRpc<{ transactions: any[] }>('getBlockByNumber', [head - i, true])
    if (b.transactions?.length) return b.transactions[0]
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}
const settled = await findSettledTx()

console.log('\n=== verification against the live Nimiq network ===')
{
  const real = settled
  check('found a recent real NIM transaction to test against', Boolean(real), real?.hash.slice(0, 12))
  if (real) {
    const r1 = await verifyNimTransaction(real.hash, { fromNim: real.from, toNim: real.to, amountLuna: BigInt(real.value) })
    check('a genuine matching transaction verifies', r1.ok, r1.ok ? '' : r1.reason)

    const r2 = await verifyNimTransaction(real.hash, { fromNim: real.from, toNim: real.to, amountLuna: BigInt(real.value) + 1n })
    check('underpayment is refused, not retryable', !r2.ok && !r2.retryable && /less than/.test(r2.reason))

    const r3 = await verifyNimTransaction(real.hash, { fromNim: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', toNim: real.to, amountLuna: 1n })
    check('wrong sender is refused, not retryable', !r3.ok && !r3.retryable && /not sent from/.test(r3.reason))

    const r4 = await verifyNimTransaction(real.hash, { fromNim: real.from, toNim: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', amountLuna: 1n })
    check('wrong recipient is refused, not retryable', !r4.ok && !r4.retryable && /recipient/.test(r4.reason))

    const r5 = await verifyNimTransaction(real.hash.replace(/ /g, '').toUpperCase(), { fromNim: real.from.toLowerCase(), toNim: real.to.replace(/ /g, ''), amountLuna: 1n })
    check('address casing and spacing do not matter', r5.ok, r5.ok ? '' : r5.reason)
  }

  const missing = await verifyNimTransaction('0'.repeat(64), { fromNim: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', toNim: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', amountLuna: 1n })
  check('an unknown hash is "not yet", retryable', !missing.ok && missing.retryable)

  const bad = await verifyNimTransaction('0xdeadbeef', { fromNim: 'x', toNim: 'y', amountLuna: 1n })
  check('a malformed hash is refused, not retryable', !bad.ok && !bad.retryable)

  check('getNimTransaction returns null for a miss rather than throwing', (await getNimTransaction('1'.repeat(64))) === null)
}

console.log('\n=== the payment path routes NIM circles to NIM verification ===')
{
  const { rounds, joiner } = (globalThis as any).__nim
  const open = rounds.find((r: any) => r.status === 'open')
  // The joiner owes round 1 (creator is recipient #1). A real but unrelated NIM tx:
  const hash = settled?.hash ?? '0'.repeat(64)
  const res = await expectError(() => submitContribution({ roundId: open.id, from: joiner, txHash: hash }), 400)
  check('submitting an unrelated NIM tx is refused with a NIM-specific reason',
    res.threw && res.status === 400 && /Nimiq address|recipient/.test(res.message ?? ''), res.message)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
