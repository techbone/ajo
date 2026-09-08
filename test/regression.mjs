// Full regression baseline for Ajo. Run before and after any change that
// touches auth, circles, payments, or live updates — this is the guardrail
// against silently breaking something that already works.
//
// Usage: node test/regression.mjs
// Requires: dev server on :3001, DATABASE_URL + POLYGON_RPC_URL in env.

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { neon } from '@neondatabase/serverless'

const BASE = process.env.AJO_BASE_URL || 'http://localhost:3001'
const sql = neon(process.env.DATABASE_URL)

let pass = 0, fail = 0
const failures = []
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`
  console.log(line)
  if (ok) pass++
  else { fail++; failures.push(name) }
}
const jar = (r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

async function member() {
  const a = privateKeyToAccount(generatePrivateKey())
  const address = a.address.toLowerCase()
  const n = await fetch(`${BASE}/api/auth/nonce?address=${address}`)
  const nonceCookie = jar(n)
  const { message } = await n.json()
  const v = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: nonceCookie },
    body: JSON.stringify({ address, signature: await a.signMessage({ message }) }),
  })
  return { address, cookie: jar(v) }
}
const req = (m, p, cookie, body) =>
  fetch(`${BASE}${p}`, {
    method: m,
    headers: { 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  })
const json = async (res) => res.json()
const version = async (path, cookie) => {
  const r = await req('GET', path, cookie)
  return r.ok ? (await r.json()).version : `ERR${r.status}`
}
const rpc = async (method, params) => {
  const r = await fetch(process.env.POLYGON_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await r.json()).result
}

console.log('\n=== AUTH ===')
{
  const account = privateKeyToAccount(generatePrivateKey())
  const address = account.address.toLowerCase()

  const n1 = await fetch(`${BASE}/api/auth/nonce?address=${address}`)
  const c1 = jar(n1)
  const { message } = await n1.json()
  const sig = await account.signMessage({ message })

  const v1 = await req('POST', '/api/auth/verify', c1, { address, signature: sig })
  check('valid signature signs in', v1.status === 200)

  const me = await req('GET', '/api/auth/me', jar(v1))
  check('session authenticates', (await json(me)).address === address)

  const replay = await req('POST', '/api/auth/verify', c1, { address, signature: sig })
  check('replayed signature rejected', replay.status === 400)

  const impostor = privateKeyToAccount(generatePrivateKey())
  const n2 = await fetch(`${BASE}/api/auth/nonce?address=${address}`)
  const c2 = jar(n2)
  const { message: m2 } = await n2.json()
  const bad = await req('POST', '/api/auth/verify', c2, {
    address,
    signature: await impostor.signMessage({ message: m2 }),
  })
  check('forged signature rejected', bad.status === 401)

  const other = privateKeyToAccount(generatePrivateKey())
  const n3 = await fetch(`${BASE}/api/auth/nonce?address=${address}`)
  const c3 = jar(n3)
  const { message: m3 } = await n3.json()
  const crossed = await req('POST', '/api/auth/verify', c3, {
    address: other.address.toLowerCase(),
    signature: await other.signMessage({ message: m3 }),
  })
  check("another address cannot spend A's nonce", crossed.status === 400)

  const naked = await req('POST', '/api/auth/verify', '', { address, signature: sig })
  check('missing nonce rejected', naked.status === 400)
}

console.log('\n=== CIRCLE LIFECYCLE ===')
let circleId, roundIds
{
  const alice = await member(), bob = await member(), carol = await member(), dave = await member()

  const cRes = await req('POST', '/api/circles', alice.cookie, {
    name: 'Regression circle', amount: '50', frequency: 'weekly', size: 3,
  })
  const { circle } = await json(cRes)
  circleId = circle.id
  check('creator can create a circle', cRes.status === 201)
  check('amount stored in raw units', circle.contributionAmount === '50000000')

  check('member joins with code', (await req('POST', '/api/circles/join', bob.cookie, { code: circle.inviteCode })).status === 200)
  check('code is case-insensitive', (await req('POST', '/api/circles/join', carol.cookie, { code: circle.inviteCode.toLowerCase() })).status === 200)
  check('re-joining is harmless', (await req('POST', '/api/circles/join', bob.cookie, { code: circle.inviteCode })).status === 200)
  check('full circle refuses a 4th', (await req('POST', '/api/circles/join', dave.cookie, { code: circle.inviteCode })).status === 409)
  check('unknown code rejected', (await req('POST', '/api/circles/join', dave.cookie, { code: 'ZZZZZZ' })).status === 404)

  check('non-member cannot read circle', (await req('GET', `/api/circles/${circleId}`, dave.cookie)).status === 403)
  check('signed-out cannot read circle', (await req('GET', `/api/circles/${circleId}`, '')).status === 401)

  check('only creator can lock', (await req('POST', `/api/circles/${circleId}/lock`, bob.cookie, {})).status === 403)
  const lockRes = await req('POST', `/api/circles/${circleId}/lock`, alice.cookie, {})
  const locked = await json(lockRes)
  check('creator locks the circle', lockRes.status === 200)
  check('one round per member', locked.rounds.length === 3)
  check('circle is now active', locked.circle.status === 'active')
  check('round 1 open, rest upcoming', locked.rounds[0].status === 'open' && locked.rounds[1].status === 'upcoming')
  roundIds = locked.rounds.map((r) => r.id)

  check('cannot lock twice', (await req('POST', `/api/circles/${circleId}/lock`, alice.cookie, {})).status === 409)
  check('cannot join an active circle', (await req('POST', '/api/circles/join', dave.cookie, { code: circle.inviteCode })).status === 409)

  const detail = await json(await req('GET', `/api/circles/${circleId}`, alice.cookie))
  check('members carry payout positions', detail.members.every((m) => m.payoutPosition >= 1 && m.payoutPosition <= 3))
  check('contributions pre-created (3 rounds x 2 payers)', detail.contributions.length === 6)
  check('recipient never pays their own round', detail.rounds.every((r) => !detail.contributions.some((c) => c.roundId === r.id && c.fromAddress === r.recipientAddress)))
  check('each round collects members-1', detail.rounds.every((r) => detail.contributions.filter((c) => c.roundId === r.id).length === 2))
  check('everyone receives exactly once', new Set(detail.rounds.map((r) => r.recipientAddress)).size === 3)
  const gapDays = (new Date(detail.rounds[1].opensAt) - new Date(detail.rounds[0].opensAt)) / 86400000
  check('weekly rounds are 7 days apart', Math.round(gapDays) === 7)

  global.__alice = alice; global.__bob = bob; global.__carol = carol
}

console.log('\n=== LIVE VERSIONING ===')
{
  const { alice, bob, carol } = { alice: global.__alice, bob: global.__bob, carol: global.__carol }

  const v0 = await version(`/api/circles/${circleId}/version`, alice.cookie)
  check('circle version endpoint responds', !String(v0).startsWith('ERR'))
  check('circle version stable when idle', (await version(`/api/circles/${circleId}/version`, alice.cookie)) === v0)

  const lv0 = await version('/api/circles/version', bob.cookie)
  const stranger = await member()
  await req('POST', '/api/circles', stranger.cookie, { name: 'Unrelated', amount: '1', frequency: 'daily', size: 2 })
  check("another member's activity does not change your list token", (await version('/api/circles/version', bob.cookie)) === lv0)

  check('non-member blocked from circle version', (await req('GET', `/api/circles/${circleId}/version`, stranger.cookie)).status === 403)
  check('signed-out blocked from circle version', (await req('GET', `/api/circles/${circleId}/version`, '')).status === 401)
  check('signed-out blocked from list version', (await req('GET', '/api/circles/version', '')).status === 401)
}

console.log('\n=== PAYMENTS: pending / duplicate / release ===')
{
  const { alice, bob, carol } = { alice: global.__alice, bob: global.__bob, carol: global.__carol }
  const openRound = roundIds[0]

  const ghost = '0x' + '33'.repeat(32)
  const r1 = await req('POST', '/api/contributions', bob.cookie, { roundId: openRound, txHash: ghost })
  check('unmined hash accepted as pending', r1.status === 200 && (await json(r1)).status === 'pending')

  const mineRow = (await json(await req('GET', `/api/circles/${circleId}`, bob.cookie)))
    .contributions.find((c) => c.roundId === openRound && c.fromAddress === bob.address)
  check('the row now carries the hash', mineRow.txHash === ghost)
  check('and is still unconfirmed', mineRow.status !== 'confirmed')

  const hijack = await req('POST', '/api/contributions', carol.cookie, { roundId: openRound, txHash: ghost })
  check('another member cannot claim the same hash', hijack.status === 409)

  const head = BigInt(await rpc('eth_blockNumber', []))
  const block = await rpc('eth_getBlockByNumber', ['0x' + (head - 50n).toString(16), false])
  const realButUnrelated = block.transactions[0]
  await sql`update contributions set tx_hash = ${realButUnrelated} where id = ${mineRow.id}`

  const rc = await json(await req('POST', '/api/contributions/recheck', bob.cookie, { roundId: openRound }))
  check('recheck releases a definitively wrong transaction', rc.released === 1)

  const after = (await json(await req('GET', `/api/circles/${circleId}`, bob.cookie)))
    .contributions.find((c) => c.id === mineRow.id)
  check('the hash is cleared', after.txHash === null)
  check('member is still unpaid, not confirmed', after.status !== 'confirmed')
}

console.log('\n=== REPUTATION UNIQUENESS ===')
{
  const [{ count: before }] = await sql`select count(*)::int as count from reputation_events`
  const { bob } = { bob: global.__bob }
  await Promise.all([
    req('POST', '/api/contributions/recheck', bob.cookie, { roundId: roundIds[0] }),
    req('POST', '/api/contributions/recheck', bob.cookie, { roundId: roundIds[0] }),
  ])
  const [{ count: after }] = await sql`select count(*)::int as count from reputation_events`
  check('concurrent rechecks of an unconfirmed payment add nothing', after === before)

  const idx = await sql`select indexname from pg_indexes where indexname='reputation_address_round_idx'`
  check('reputation uniqueness index is live', idx.length === 1)
}

console.log('\n=== DATABASE INVARIANTS ===')
{
  const bad = await sql`
    select r.circle_id, r.index from rounds r
    where r.status = 'complete'
      and exists (select 1 from rounds e where e.circle_id = r.circle_id and e.index < r.index and e.status <> 'complete')`
  check('no round settled ahead of an earlier one', bad.length === 0)

  const multi = await sql`select circle_id, count(*)::int as n from rounds where status='open' group by circle_id having count(*) > 1`
  check('at most one open round per circle', multi.length === 0)

  const stuck = await sql`
    select c.id from circles c
    where c.status='completed' and exists (select 1 from rounds r where r.circle_id=c.id and r.status<>'complete')`
  check('completed circles have no unfinished rounds', stuck.length === 0)

  const dupTx = await sql`select tx_hash, count(*)::int as n from contributions where tx_hash is not null group by tx_hash having count(*) > 1`
  check('no transaction credited twice', dupTx.length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (failures.length) console.log('Failed:', failures.join(', '))
process.exit(fail ? 1 : 0)
