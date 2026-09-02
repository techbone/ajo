/**
 * The exact text the member signs. Shared by the client (which asks the wallet
 * to sign it) and the server (which reconstructs it to verify) — if these ever
 * drift, every login fails, so they must come from one place.
 */
export function buildAuthMessage(params: {
  address: string
  nonce: string
  issuedAt: string
}): string {
  return [
    'Ajo — verify your wallet',
    '',
    'Signing this proves you own this address. It is free and sends no funds.',
    '',
    `Address: ${params.address}`,
    `Nonce: ${params.nonce}`,
    `Issued: ${params.issuedAt}`,
  ].join('\n')
}
