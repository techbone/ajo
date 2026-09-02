/**
 * Chain constants for Ajo.
 *
 * Verified against the Nimiq Mini Apps docs (nimiq.dev/mini-apps). USDT on
 * Polygon uses 6 decimals, not 18 — getting this wrong shows 1 USDT as
 * 0.000000000001.
 */

export const POLYGON = {
  chainIdHex: '0x89',
  chainIdNumber: 137,
  name: 'Polygon',
  nativeSymbol: 'POL',
  explorer: 'https://polygonscan.com',
} as const

export const USDT = {
  address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  symbol: 'USDT',
  decimals: 6,
} as const

/**
 * Below this much POL we refuse to offer a Pay button.
 *
 * Nimiq Pay's *native* USDT send is gas-abstracted, but mini apps get no such
 * treatment — standard EVM gas rules apply, so a member with USDT and no POL
 * simply cannot pay. We gate on this rather than letting the transfer fail.
 * An ERC-20 transfer on Polygon costs a small fraction of this.
 */
export const MIN_GAS_POL = 0.02

export const ERC20_BALANCE_OF = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const ERC20_TRANSFER = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * The ERC-20 Transfer event. `from` and `to` are indexed, so they arrive as
 * topics; the amount is in the data field.
 *
 * This is what both verification paths decode: the fast path reads it out of a
 * transaction receipt, the sweep reads it straight from eth_getLogs.
 */
export const ERC20_TRANSFER_EVENT = [
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** Confirmations before we treat a transfer as settled. Polygon reorgs are shallow. */
export const CONFIRMATIONS = 3
