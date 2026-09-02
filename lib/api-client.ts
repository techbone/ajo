export interface CircleDto {
  id: string
  name: string
  token: 'USDT_POLYGON' | 'NIM'
  contributionAmount: string // raw units, 6 decimals for USDT
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  size: number
  status: 'forming' | 'active' | 'completed' | 'broken'
  creatorAddress: string
  inviteCode: string
  startsAt: string | null
  lockedAt: string | null
  createdAt: string
}

export interface MemberDto {
  id: string
  circleId: string
  address: string
  payoutPosition: number | null
  status: 'active' | 'defaulted' | 'left'
  joinedAt: string
}

export interface RoundDto {
  id: string
  circleId: string
  index: number
  recipientAddress: string
  opensAt: string
  dueAt: string
  status: 'upcoming' | 'open' | 'settling' | 'complete'
}

export interface ContributionDto {
  id: string
  roundId: string
  fromAddress: string
  toAddress: string
  amount: string
  txHash: string | null
  status: 'pending' | 'confirmed' | 'failed' | 'late' | 'missed'
  confirmedAt: string | null
}

export interface CircleDetail {
  circle: CircleDto
  members: MemberDto[]
  rounds: RoundDto[]
  contributions: ContributionDto[]
  you: string
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong.')
  return body as T
}

export async function listCircles(): Promise<CircleDto[]> {
  const res = await fetch('/api/circles', { cache: 'no-store' })
  return (await unwrap<{ circles: CircleDto[] }>(res)).circles
}

export async function createCircle(input: {
  name: string
  amount: string
  frequency: CircleDto['frequency']
  size: number
}): Promise<CircleDto> {
  const res = await fetch('/api/circles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await unwrap<{ circle: CircleDto }>(res)).circle
}

export async function joinCircle(code: string): Promise<CircleDto> {
  const res = await fetch('/api/circles/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return (await unwrap<{ circle: CircleDto }>(res)).circle
}

export async function getCircle(id: string): Promise<CircleDetail> {
  const res = await fetch(`/api/circles/${id}`, { cache: 'no-store' })
  return unwrap<CircleDetail>(res)
}

export async function lockCircle(id: string, order?: string[]): Promise<void> {
  const res = await fetch(`/api/circles/${id}/lock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order }),
  })
  await unwrap(res)
}
