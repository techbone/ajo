/**
 * How urgent an unpaid contribution is, relative to its round's due date.
 *
 * Pure and pushed to its own module so the round view, the schedule list, and
 * the nudge message all agree on what "overdue" means — three places computing
 * this independently is exactly how they'd quietly drift apart.
 */
export type Urgency = 'ok' | 'soon' | 'overdue'

const SOON_WINDOW_MS = 24 * 60 * 60 * 1000

export function urgencyOf(dueAt: string | Date, now: Date = new Date()): Urgency {
  const due = new Date(dueAt).getTime()
  const diff = due - now.getTime()
  if (diff < 0) return 'overdue'
  if (diff <= SOON_WINDOW_MS) return 'soon'
  return 'ok'
}
