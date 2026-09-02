import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Ajo's schema.
 *
 * Two conventions worth knowing before reading further:
 *
 *  - EVM addresses are stored lowercased. Checksummed casing varies by source,
 *    and a case-sensitive comparison against an on-chain log would silently
 *    miss real payments. Normalise on the way in, always.
 *
 *  - Money is stored as the raw on-chain integer, never a decimal. USDT uses 6
 *    decimals, so 50 USDT is 50_000_000n. Formatting happens at the edge.
 */

export const tokenEnum = pgEnum('token', ['USDT_POLYGON', 'NIM'])
export const frequencyEnum = pgEnum('frequency', ['daily', 'weekly', 'biweekly', 'monthly'])
export const circleStatusEnum = pgEnum('circle_status', [
  'forming',
  'active',
  'completed',
  'broken',
])
export const memberStatusEnum = pgEnum('member_status', ['active', 'defaulted', 'left'])
export const roundStatusEnum = pgEnum('round_status', [
  'upcoming',
  'open',
  'settling',
  'complete',
])
export const contributionStatusEnum = pgEnum('contribution_status', [
  'pending',
  'confirmed',
  'failed',
  'late',
  'missed',
])
export const reputationKindEnum = pgEnum('reputation_kind', [
  'paid_on_time',
  'paid_late',
  'missed',
])

export const users = pgTable('users', {
  // The EVM address is the identity. No passwords, no email.
  address: text('address').primaryKey(),
  nimAddress: text('nim_address'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const circles = pgTable(
  'circles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    token: tokenEnum('token').notNull().default('USDT_POLYGON'),
    // Raw on-chain units. 50 USDT = 50000000.
    contributionAmount: bigint('contribution_amount', { mode: 'bigint' }).notNull(),
    frequency: frequencyEnum('frequency').notNull(),
    // How many members the circle is built for; also the number of rounds.
    size: integer('size').notNull(),
    status: circleStatusEnum('status').notNull().default('forming'),
    creatorAddress: text('creator_address')
      .notNull()
      .references(() => users.address),
    inviteCode: text('invite_code').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('circles_invite_code_idx').on(t.inviteCode)],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    address: text('address')
      .notNull()
      .references(() => users.address),
    // Fixed when the circle locks, visible to everyone before they commit.
    payoutPosition: integer('payout_position'),
    status: memberStatusEnum('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_circle_address_idx').on(t.circleId, t.address),
    index('members_address_idx').on(t.address),
  ],
)

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    circleId: uuid('circle_id')
      .notNull()
      .references(() => circles.id, { onDelete: 'cascade' }),
    // 1-based, matching what members see.
    index: integer('index').notNull(),
    recipientAddress: text('recipient_address').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    status: roundStatusEnum('status').notNull().default('upcoming'),
  },
  (t) => [uniqueIndex('rounds_circle_index_idx').on(t.circleId, t.index)],
)

export const contributions = pgTable(
  'contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    // Null until the member actually sends. Unique when present so the same
    // transfer can never be credited twice — the fast path and the log sweep
    // both write here and must converge, not duplicate.
    txHash: text('tx_hash'),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    status: contributionStatusEnum('status').notNull().default('pending'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contributions_round_from_idx').on(t.roundId, t.fromAddress),
    uniqueIndex('contributions_tx_hash_idx').on(t.txHash),
  ],
)

export const reputationEvents = pgTable(
  'reputation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull(),
    circleId: uuid('circle_id').references(() => circles.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'cascade' }),
    kind: reputationKindEnum('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reputation_address_idx').on(t.address)],
)

/**
 * Issued sign-in nonces.
 *
 * The nonce also travels in a signed cookie, but that alone cannot enforce
 * single use: deleting a cookie only clears the client's copy, so a captured
 * signature plus cookie could be replayed for a fresh session. This table is
 * the authority — consuming a nonce is an atomic DELETE ... RETURNING, so two
 * concurrent replays cannot both win.
 */
export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  address: text('address').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
