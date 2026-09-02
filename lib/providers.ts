import type { Eip1193Provider } from './wallet'

/**
 * EIP-6963 wallet discovery.
 *
 * `window.ethereum` is a single slot: with several wallets installed they fight
 * over it and the winner is arbitrary. EIP-6963 replaces that with an
 * announcement protocol — the page asks, every installed wallet answers with its
 * own provider — which is what lets someone actually choose between Rabby and
 * MetaMask instead of getting whichever won the race.
 *
 * Nimiq Pay injects a single provider, so inside the host this resolves to one
 * entry and the picker never appears.
 */

export interface WalletInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface DiscoveredWallet {
  info: WalletInfo
  provider: Eip1193Provider
}

const STORAGE_KEY = 'ajo.wallet.rdns'

let discovered: DiscoveredWallet[] = []
let active: DiscoveredWallet | null = null

/** Collect announcements. Wallets answer synchronously, so a short window is enough. */
export function discoverWallets(timeout = 350): Promise<DiscoveredWallet[]> {
  if (typeof window === 'undefined') return Promise.resolve([])

  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>()

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<DiscoveredWallet>).detail
      if (detail?.info?.rdns) found.set(detail.info.rdns, detail)
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)

      // Wallets that predate EIP-6963 (and Nimiq Pay) only use window.ethereum.
      if (found.size === 0 && window.ethereum) {
        found.set('injected', {
          info: {
            uuid: 'injected',
            name: 'Browser wallet',
            icon: '',
            rdns: 'injected',
          },
          provider: window.ethereum,
        })
      }

      discovered = [...found.values()]
      resolve(discovered)
    }, timeout)
  })
}

export function getDiscoveredWallets(): DiscoveredWallet[] {
  return discovered
}

export function setActiveWallet(wallet: DiscoveredWallet | null): void {
  active = wallet
  try {
    if (wallet) localStorage.setItem(STORAGE_KEY, wallet.info.rdns)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private browsing, or storage disabled. The choice just won't persist.
  }
}

export function getActiveWallet(): DiscoveredWallet | null {
  return active
}

/** Reattach the wallet chosen last time, so a reload doesn't ask again. */
export function restoreActiveWallet(): DiscoveredWallet | null {
  if (active) return active
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!saved) return null
  active = discovered.find((w) => w.info.rdns === saved) ?? null
  return active
}
