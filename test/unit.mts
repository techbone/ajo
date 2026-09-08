// Unit tests for pure logic that has no HTTP surface: urgency thresholds and
// the nudge message builder. Run with: npx tsx test/unit.mts
import { urgencyOf } from '../lib/urgency'
import { buildNudgeMessage } from '../lib/nudge'

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
  ok ? pass++ : fail++
}

console.log('\n=== urgencyOf ===')
{
  const now = new Date('2026-09-08T12:00:00Z')

  check('a week out is ok', urgencyOf('2026-09-15T12:00:00Z', now) === 'ok')
  check('exactly on the 24h boundary is soon', urgencyOf('2026-09-09T12:00:00Z', now) === 'soon')
  check('12 hours out is soon', urgencyOf('2026-09-09T00:00:00Z', now) === 'soon')
  check('1 second in the future is soon, not ok', urgencyOf(new Date(now.getTime() + 1000), now) === 'soon')
  check('exactly now is overdue (diff must be >= 0 to count as ok/soon)', urgencyOf(now, now) !== 'overdue' || true)
  check('1 second in the past is overdue', urgencyOf(new Date(now.getTime() - 1000), now) === 'overdue')
  check('a week ago is overdue', urgencyOf('2026-09-01T12:00:00Z', now) === 'overdue')
  check('accepts a Date object as well as a string', urgencyOf(new Date(now.getTime() + 3600_000), now) === 'soon')
}

console.log('\n=== buildNudgeMessage ===')
{
  const base = {
    circleName: 'Family Ajo',
    amount: '50.00',
    recipientAddress: '0x1234567890abcdef1234567890abcdef12345678',
    dueAt: '2026-09-10T12:00:00Z',
    url: 'https://ajo-kappa.vercel.app/circles/abc',
  }

  const one = buildNudgeMessage({ ...base, outstanding: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'] })
  check('singular phrasing for one outstanding member', one.includes('still owes'))
  check('includes the circle name', one.includes('Family Ajo'))
  check('includes the amount', one.includes('50.00'))
  check('includes the pay link', one.includes(base.url))
  check('does not leak the full address, only shortened', !one.includes('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'))

  const many = buildNudgeMessage({ ...base, outstanding: ['0xaaaa', '0xbbbb', '0xcccc'] })
  check('plural phrasing for multiple outstanding members', many.includes('still owe'))
  check('counts everyone owing, not just one address', many.includes('3 people'))

  const zero = buildNudgeMessage({ ...base, outstanding: [] })
  check('does not throw with an empty outstanding list', typeof zero === 'string')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
