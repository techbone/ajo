// Covers the circles-list priority ordering and the per-person youOwe flag.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
const BASE = process.env.AJO_BASE_URL || 'http://localhost:3010'
let pass=0,fail=0
const check=(n,ok,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`);ok?pass++:fail++}
const jar=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
async function member(){
  const a=privateKeyToAccount(generatePrivateKey()); const address=a.address.toLowerCase()
  const n=await fetch(`${BASE}/api/auth/nonce?address=${address}`); const c=jar(n)
  const {message}=await n.json()
  const v=await fetch(`${BASE}/api/auth/verify`,{method:'POST',
    headers:{'content-type':'application/json',cookie:c},
    body:JSON.stringify({address,signature:await a.signMessage({message})})})
  return {address,cookie:jar(v)}
}
const req=(m,p,cookie,body)=>fetch(`${BASE}${p}`,{method:m,
  headers:{'content-type':'application/json',cookie},body:body?JSON.stringify(body):undefined})

const A=await member(), B=await member()

const forming=(await (await req('POST','/api/circles',A.cookie,
  {name:'ZZZ forming',amount:'0.10',frequency:'daily',size:3})).json()).circle

const active=(await (await req('POST','/api/circles',A.cookie,
  {name:'AAA active',amount:'0.10',frequency:'daily',size:2})).json()).circle
await req('POST','/api/circles/join',B.cookie,{code:active.inviteCode})
await req('POST',`/api/circles/${active.id}/lock`,A.cookie,{})

const list=(await (await req('GET','/api/circles',A.cookie)).json()).circles
check('list endpoint returns youOwe', list.every(c=>'youOwe' in c))

const activeRow=list.find(c=>c.id===active.id)
const formingRow=list.find(c=>c.id===forming.id)

const detail=await (await req('GET',`/api/circles/${active.id}`,A.cookie)).json()
const openRound=detail.rounds.find(r=>r.status==='open')
const aOwes=detail.contributions.some(c=>c.roundId===openRound.id && c.fromAddress===A.address && c.status!=='confirmed')
check('youOwe matches the real open-round obligation', activeRow.youOwe===aOwes, `flag=${activeRow.youOwe} actual=${aOwes}`)

const idxActive=list.findIndex(c=>c.id===active.id)
const idxForming=list.findIndex(c=>c.id===forming.id)
check('active sorts above forming despite being created later', idxActive < idxForming, `active@${idxActive} forming@${idxForming}`)
check('forming circle never flagged as owing', formingRow.youOwe===false)

const listB=(await (await req('GET','/api/circles',B.cookie)).json()).circles
const bRow=listB.find(c=>c.id===active.id)
const bOwes=detail.contributions.some(c=>c.roundId===openRound.id && c.fromAddress===B.address && c.status!=='confirmed')
check('youOwe is per-person, not shared', bRow.youOwe===bOwes, `B flag=${bRow.youOwe} actual=${bOwes}`)
check('exactly one of two members owes in a 2-person round', (activeRow.youOwe?1:0)+(bRow.youOwe?1:0)===1)

check('amounts still serialise as raw-unit strings', typeof activeRow.contributionAmount==='string' && activeRow.contributionAmount==='100000', activeRow.contributionAmount)
check('all DTO fields survived the rewrite',
  ['id','name','token','frequency','size','status','creatorAddress','inviteCode','createdAt'].every(k=>k in activeRow))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
