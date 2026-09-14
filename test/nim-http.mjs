// NIM over HTTP: linking an address, balances, and token-aware create/join.
//   AJO_BASE_URL=http://localhost:3010 node test/nim-http.mjs
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
const BASE = process.env.AJO_BASE_URL || 'http://localhost:3010'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++ }
const jar = (r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
async function member() {
  const a = privateKeyToAccount(generatePrivateKey()); const address = a.address.toLowerCase()
  const n = await fetch(`${BASE}/api/auth/nonce?address=${address}`); const c = jar(n)
  const { message } = await n.json()
  const v = await fetch(`${BASE}/api/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify({ address, signature: await a.signMessage({ message }) }) })
  return { address, cookie: jar(v) }
}
const req = (m, p, cookie, body) => fetch(`${BASE}${p}`, { method: m, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined })

const A = await member()
const NQ = 'NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK'

check('GET /api/auth/nim starts null', (await (await req('GET', '/api/auth/nim', A.cookie)).json()).nimAddress === null)
check('POST rejects a non-Nimiq address', (await req('POST', '/api/auth/nim', A.cookie, { nimAddress: '0xabc' })).status === 400)
check('POST refuses signed-out', (await req('POST', '/api/auth/nim', '', { nimAddress: NQ })).status === 401)
const linked = await (await req('POST', '/api/auth/nim', A.cookie, { nimAddress: NQ.toLowerCase() })).json()
check('POST links and normalises', linked.nimAddress === 'NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK', linked.nimAddress)
check('GET now returns it', (await (await req('GET', '/api/auth/nim', A.cookie)).json()).nimAddress === linked.nimAddress)

const bal = await (await fetch(`${BASE}/api/balances?address=${A.address}&nim=${encodeURIComponent(NQ)}`)).json()
check('balances include nim when a Nimiq address is given', 'nim' in bal && bal.nim !== undefined, `nim=${bal.nim} err=${bal.errors?.nim}`)
const noNim = await (await fetch(`${BASE}/api/balances?address=${A.address}`)).json()
check('balances omit nim when none given', noNim.nim === null)

const c1 = await req('POST', '/api/circles', A.cookie, { name: 'nim http', amount: '2', frequency: 'daily', size: 2, token: 'NIM' })
const { circle } = await c1.json()
check('create a NIM circle over HTTP', c1.status === 201 && circle.token === 'NIM', `${c1.status} ${circle?.token}`)
check('amount stored in Luna', circle.contributionAmount === '200000', circle.contributionAmount)

const B = await member()
const j = await req('POST', '/api/circles/join', B.cookie, { code: circle.inviteCode })
const jb = await j.json()
check('joining without a Nimiq address is refused with a clear reason', j.status === 412 && /Nimiq address/.test(jb.error), `${j.status} ${jb.error}`)
await req('POST', '/api/auth/nim', B.cookie, { nimAddress: 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG' })
check('joining after linking works', (await req('POST', '/api/circles/join', B.cookie, { code: circle.inviteCode })).status === 200)

await req('POST', `/api/circles/${circle.id}/lock`, A.cookie, {})
const detail = await (await req('GET', `/api/circles/${circle.id}`, B.cookie)).json()
check('members carry nimAddress in the detail payload', detail.members.every((m) => typeof m.nimAddress === 'string'))
check('token survives to the client', detail.circle.token === 'NIM')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
