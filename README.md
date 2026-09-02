# Ajo

**A rotating savings circle on USDT. Nobody holds the money.**

Ten people put in $50 a week. One person takes the whole pot. Then it rotates,
until everyone has had their turn.

This is ajo — also called esusu, susu, tanda, or chit — a practice several
hundred million people already use. It works, and it breaks in exactly one
place: whoever holds the money. Ajo removes that role instead of replacing it.

Built as a [Nimiq Pay Mini App](https://nimiq.dev/mini-apps) for the Mini Apps
Competition, Cycle II.

## How it works

Contributions move **wallet to wallet** in USDT on Polygon. Ajo never takes
custody: there is no escrow account, no smart contract holding balances, and no
treasury. The app's only job is to say who owes what, and to prove who has paid.

If this server disappeared tomorrow, nobody would lose a cent. The worst case is
that you no longer know whose turn it is — and the chain still records who paid.

1. **Form the circle.** Set the amount and the rhythm, then share a six-character
   invite code. Everyone sees the full payout order before any money moves.
2. **Everyone pays the same.** Each round, every member sends the fixed amount
   directly to that round's recipient.
3. **One member takes the pot.** Then the turn passes. After the last round,
   everyone has paid the same amount and been paid once.

The recipient does not contribute during their own round, so each round collects
`members - 1` payments and every member ends up net zero.

## Verifying payments

Payment confirmation runs on two independent paths that converge on the same
state, so a contribution is credited exactly once:

- **Fast path** — the app submits the transaction hash, and the server pulls the
  receipt and decodes the transfer to check the recipient and amount.
- **Backstop** — a sweep of USDT `Transfer` logs catches payments made outside
  the app, or ones where the app closed before the write landed.

A unique index on the transaction hash makes double-crediting impossible
regardless of which path arrives first.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript, Tailwind |
| Chain | `viem` over the injected `window.ethereum` provider |
| Nimiq | `@nimiq/mini-app-sdk` |
| Database | Postgres (Neon) with Drizzle |
| Hosting | Vercel |

Chain reads run server-side rather than through the injected provider. Reading a
public balance needs no keys and no approval, and the sweep has to run when
nobody's phone is open.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:push              # apply the schema
npm run dev
```

To test inside Nimiq Pay, serve on your LAN and open the address from the app's
Mini Apps → Custom URL field:

```bash
npm run dev:lan
```

Your machine's LAN address must be listed in `allowedDevOrigins` in
`next.config.ts`, or Next will refuse to serve JavaScript chunks to it and the
page will load without ever hydrating.

Note that EVM mini apps always run against mainnet — Nimiq Pay's testnet switch
affects NIM only — so USDT testing uses real funds. Use small amounts.

## Licence

MIT. See [LICENSE](LICENSE).
