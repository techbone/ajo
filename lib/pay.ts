import { encodeFunctionData } from 'viem'
import { ERC20_TRANSFER, POLYGON, USDT } from './chain'
import { getChainId, isUserRejection, switchToPolygon, type Eip1193Provider } from './wallet'

/**
 * Sending a contribution.
 *
 * The `to` field is the USDT contract, not the person being paid — the recipient
 * is an argument encoded into `data`. Getting that backwards sends native POL to
 * a token contract, which is unrecoverable.
 */
export async function sendContribution(params: {
  provider: Eip1193Provider
  from: string
  to: string
  amount: bigint
}): Promise<string> {
  const { provider, from, to, amount } = params

  const chainId = await getChainId(provider).catch(() => null)
  if (chainId !== POLYGON.chainIdHex) {
    const switched = await switchToPolygon(provider)
    if (!switched) {
      throw new Error(`Switch to ${POLYGON.name} to send this contribution.`)
    }
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER,
    functionName: 'transfer',
    args: [to as `0x${string}`, amount],
  })

  return provider.request<string>({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: USDT.address, // the contract; the recipient lives in `data`
        data,
        value: '0x0', // moving tokens, not native POL
      },
    ],
  })
}

export function describePayError(error: unknown): string {
  if (isUserRejection(error)) return 'Payment cancelled. Nothing was sent.'
  if (error instanceof Error) {
    // The Nimiq provider's rejection, by name rather than EIP-1193 code.
    if (error.name === 'PermissionDeniedError' || /PermissionDenied/.test(error.message)) {
      return 'Payment cancelled. Nothing was sent.'
    }
    if (/insufficient funds/i.test(error.message)) {
      return `Not enough ${POLYGON.nativeSymbol} to cover the network fee.`
    }
    if (/transfer amount exceeds balance/i.test(error.message)) {
      return `Not enough ${USDT.symbol} in your wallet.`
    }
    return error.message
  }
  return 'The payment could not be sent.'
}

/**
 * Sending a NIM contribution. Nimiq Pay picks the fee itself (zero where it
 * can), and the recipient is just the recipient — no contract in the way.
 */
export async function sendNimContribution(params: {
  to: string
  amountLuna: bigint
}): Promise<string> {
  const { init } = await import('@nimiq/mini-app-sdk')
  const nimiq = await init({ timeout: 5000 })

  const result = await nimiq.sendBasicTransaction({
    recipient: params.to,
    value: Number(params.amountLuna),
  })

  // The SDK resolves an ErrorResponse rather than throwing for some failures.
  if (typeof result !== 'string') {
    const message = (result as { message?: unknown })?.message
    throw new Error(typeof message === 'string' ? message : 'The NIM payment was not sent.')
  }
  return result
}
