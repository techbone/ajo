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
