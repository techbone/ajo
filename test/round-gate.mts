// The round-opening gate: a round opens on its scheduled date or when its
// predecessor closes, whichever is later. Exercises the service layer directly
// against the real database. Run with:
//   npx tsx --tsconfig tsconfig.json test/round-gate.mts
import { eq, and } from 'drizzle-orm'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { getDb, schema } from '../db'
import { createCircle, joinCircle, lockCircle } from '../lib/circles'
import { advanceRoundIfComplete, openDueRounds } from '../lib/payments'

let pass = 0, fail = 0
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`)
  ok ? pass++ : fail++
}
const addr = () => privateKeyToAccount(generatePrivateKey()).address.toLowerCase()
const db = getDb()
const DAY = 86_400_000

async function ensureUser(address: string) {
  await db.insert(schema.users).values({ address }).onConflictDoNothing()
}
async function roundStatuses(circleId: string) {
  const rows = await db.select().from(schema.rounds).where(eq(schema.rounds.circleId, circleId)).orderBy(schema.rounds.index)
  return rows.map((r) => r.status)
}
// One distinct hash per row — tx_hash is unique, and the index will (rightly)
// refuse a single UPDATE that tries to stamp the same hash on every payer.
async function confirmAll(roundId: string) {
  const rows = await db.select({ id: schema.contributions.id }).from(schema.contributions)
    .where(eq(schema.contributions.roundId, roundId))
  for (const row of rows) {
    const txHash = '0x' + crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')
    await db.update(schema.contributions)
      .set({ status: 'confirmed', confirmedAt: new Date(), txHash })
      .where(eq(schema.contributions.id, row.id))
  }
}

async function makeCircle(size: number) {
  const creator = addr(); await ensureUser(creator)
  const circle = await createCircle({ creator, name: 'gate test', amount: '0.10', frequency: 'daily', size })
  for (let i = 1; i < size; i += 1) {
    const a = addr(); await ensureUser(a)
    await joinCircle({ address: a, inviteCode: circle.inviteCode })
  }
  const { rounds } = await lockCircle({ circleId: circle.id, caller: creator })
  return { circle, rounds }
}

console.log('\n=== gate: everyone pays round 1 early ===')
{
  const { circle, rounds } = await makeCircle(3)
  check('round 1 open, 2 and 3 upcoming at lock', JSON.stringify(await roundStatuses(circle.id)) === '["open","upcoming","upcoming"]')

  await confirmAll(rounds[0].id)
  const advanced = await advanceRoundIfComplete(rounds[0].id)
  check('round 1 closes once everyone has paid', advanced)

  const s = await roundStatuses(circle.id)
  check('round 2 does NOT open early — it waits for its date', s[1] === 'upcoming', JSON.stringify(s))
  check('exactly zero rounds open between rounds', s.filter((x) => x === 'open').length === 0)
  check('round 1 is complete', s[0] === 'complete')

  // openDueRounds must not open it either, since its date is still tomorrow.
  const opened = await openDueRounds(circle.id)
  check('openDueRounds leaves a future round alone', opened === 0 && (await roundStatuses(circle.id))[1] === 'upcoming')

  // The day arrives.
  await db.update(schema.rounds).set({ opensAt: new Date(Date.now() - 1000) }).where(eq(schema.rounds.id, rounds[1].id))
  const opened2 = await openDueRounds(circle.id)
  check('openDueRounds opens the round once its date has passed', opened2 === 1)
  check('round 2 is now open', (await roundStatuses(circle.id))[1] === 'open')
}

console.log('\n=== gate: round already fully paid when its date arrives ===')
{
  const { circle, rounds } = await makeCircle(3)
  await confirmAll(rounds[0].id)
  await advanceRoundIfComplete(rounds[0].id)
  // Someone paid round 2 ahead of time (the sweep credited it).
  await confirmAll(rounds[1].id)
  check('round 2 still upcoming despite being fully paid', (await roundStatuses(circle.id))[1] === 'upcoming')

  await db.update(schema.rounds).set({ opensAt: new Date(Date.now() - 1000) }).where(eq(schema.rounds.id, rounds[1].id))
  await openDueRounds(circle.id)
  const s = await roundStatuses(circle.id)
  check('opening a pre-paid round settles it immediately', s[1] === 'complete', JSON.stringify(s))
  check('but round 3 still waits for ITS date (cascade respects the gate)', s[2] === 'upcoming')
}

console.log('\n=== gate: late round does not delay the next one ===')
{
  const { circle, rounds } = await makeCircle(2)
  // Round 2's date has already passed while round 1 was still collecting.
  await db.update(schema.rounds).set({ opensAt: new Date(Date.now() - DAY) }).where(eq(schema.rounds.id, rounds[1].id))
  await confirmAll(rounds[0].id)
  await advanceRoundIfComplete(rounds[0].id)
  const s = await roundStatuses(circle.id)
  check('when the previous round closes late, the next opens at once', s[1] === 'open', JSON.stringify(s))
}

console.log('\n=== gate: never two open rounds ===')
{
  const { circle, rounds } = await makeCircle(3)
  // Force round 2's date into the past while round 1 is still open.
  await db.update(schema.rounds).set({ opensAt: new Date(Date.now() - 1000) }).where(eq(schema.rounds.id, rounds[1].id))
  const opened = await openDueRounds(circle.id)
  check('openDueRounds refuses while another round is still collecting', opened === 0)
  check('still exactly one open round', (await roundStatuses(circle.id)).filter((x) => x === 'open').length === 1)
}

console.log('\n=== gate: concurrent openers open once ===')
{
  const { circle, rounds } = await makeCircle(2)
  await confirmAll(rounds[0].id)
  await advanceRoundIfComplete(rounds[0].id)
  await db.update(schema.rounds).set({ opensAt: new Date(Date.now() - 1000) }).where(eq(schema.rounds.id, rounds[1].id))
  const results = await Promise.all([openDueRounds(circle.id), openDueRounds(circle.id), openDueRounds(circle.id)])
  check('three racing callers open the round exactly once', results.reduce((a, b) => a + b, 0) === 1, JSON.stringify(results))
}

console.log('\n=== lock: future start date ===')
{
  const creator = addr(); await ensureUser(creator)
  const other = addr(); await ensureUser(other)
  const circle = await createCircle({ creator, name: 'future', amount: '0.10', frequency: 'daily', size: 2 })
  await joinCircle({ address: other, inviteCode: circle.inviteCode })
  const { rounds } = await lockCircle({ circleId: circle.id, caller: creator, startsAt: new Date(Date.now() + DAY) })
  check('a circle starting tomorrow has no open round yet', rounds.every((r) => r.status === 'upcoming'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
