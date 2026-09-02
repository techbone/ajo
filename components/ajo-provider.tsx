'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchBalances, fetchSession, signIn, signOut } from '@/lib/auth-client'
import { POLYGON } from '@/lib/chain'
import {
  getChainId,
  getConnectedAccounts,
  getProvider,
  isUserRejection,
  requestAccountChange,
  requestAccounts,
  switchToPolygon,
} from '@/lib/wallet'
import { isInsideNimiqPay } from '@/lib/nimiq'
import {
  discoverWallets,
  getActiveWallet,
  restoreActiveWallet,
  setActiveWallet,
  type DiscoveredWallet,
} from '@/lib/providers'

/**
 * Two states, deliberately kept apart:
 *
 *   session       — server cookie proving address ownership. Identity. Survives
 *                   the wallet disconnecting, and is enough to read your circles.
 *   walletAddress — the live wallet connection. Capability. Required only to
 *                   sign or send, and can disappear at any moment.
 *
 * Conflating them means a disconnected wallet still looks signed in, and — worse
 * — reconnecting on a different account would leave you acting as the old one.
 */
interface AjoState {
  ready: boolean
  hasProvider: boolean
  insideNimiqPay: boolean

  session: string | null
  walletAddress: string | null
  chainId: string | null

  /** Wallets that answered EIP-6963 discovery. */
  wallets: DiscoveredWallet[]
  activeWallet: DiscoveredWallet | null

  onPolygon: boolean
  walletConnected: boolean
  /** Wallet is on a different account than the one you signed in as. */
  walletMismatch: boolean
  /** Everything needed to actually send a contribution is in place. */
  canTransact: boolean

  usdt: string | null
  pol: string | null
  busy: 'connect' | 'signin' | null
  notice: string | null

  connect: (wallet?: DiscoveredWallet) => Promise<void>
  disconnect: () => void
  /** Connect and sign in as one flow — what picking a wallet should do. */
  start: (wallet?: DiscoveredWallet) => Promise<void>
  authenticate: () => Promise<void>
  ensureWallet: () => Promise<boolean>
  switchAccount: () => Promise<void>
  leave: () => Promise<void>
  refresh: () => Promise<void>
  clearNotice: () => void
}

const AjoContext = createContext<AjoState | null>(null)

export function useAjo(): AjoState {
  const ctx = useContext(AjoContext)
  if (!ctx) throw new Error('useAjo must be used inside <AjoProvider>')
  return ctx
}

export function AjoProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hasProvider, setHasProvider] = useState(false)
  const [insideNimiqPay, setInsideNimiqPay] = useState(false)
  const [session, setSession] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [usdt, setUsdt] = useState<string | null>(null)
  const [pol, setPol] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'signin' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([])
  const [activeWallet, setActive] = useState<DiscoveredWallet | null>(null)

  useEffect(() => {
    setInsideNimiqPay(isInsideNimiqPay())

    void (async () => {
      const found = await discoverWallets()
      setWallets(found)
      setHasProvider(found.length > 0)

      // Only reattach a wallet the person actually chose. A wallet still being
      // authorised at the extension level is not consent to use it again —
      // disconnecting clears the stored choice, and reload must respect that
      // rather than silently reconnecting the only wallet it can find.
      const restored = restoreActiveWallet()
      if (restored) {
        setActive(restored)

        // eth_accounts, not eth_requestAccounts — reports the existing
        // connection without raising a dialog nobody asked for.
        const [account] = await getConnectedAccounts(restored.provider)
        if (account) {
          setWalletAddress(account.toLowerCase())
          setChainId(await getChainId(restored.provider).catch(() => null))
        }
      }

      setSession(await fetchSession())
      setReady(true)
    })()
  }, [])

  // The wallet can change or vanish at any time; the UI has to follow it.
  useEffect(() => {
    const provider = getProvider()
    if (!provider?.on) return

    const onAccountsChanged = (...args: never[]) => {
      const accounts = args[0] as unknown as string[] | undefined
      const next = accounts?.[0]?.toLowerCase() ?? null
      setWalletAddress(next)
      if (!next) setNotice('Wallet disconnected. Reconnect to send a contribution.')
    }

    const onChainChanged = (...args: never[]) => {
      setChainId((args[0] as unknown as string) ?? null)
    }

    provider.on('accountsChanged', onAccountsChanged)
    provider.on('chainChanged', onChainChanged)

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged)
      provider.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])

  const refresh = useCallback(async () => {
    const target = session ?? walletAddress
    if (!target) return
    const { usdt: u, pol: p } = await fetchBalances(target)
    setUsdt(u)
    setPol(p)
  }, [session, walletAddress])

  useEffect(() => {
    if (session) void refresh()
  }, [session, refresh])

  const connect = useCallback(async (wallet?: DiscoveredWallet) => {
    const chosen = wallet ?? getActiveWallet() ?? undefined
    if (chosen) {
      setActiveWallet(chosen)
      setActive(chosen)
    }
    const provider = chosen?.provider ?? getProvider()
    if (!provider) return
    setNotice(null)
    setBusy('connect')
    try {
      const [account] = await requestAccounts(provider)
      if (!account) {
        setNotice('No account came back from the wallet.')
        return
      }
      setWalletAddress(account.toLowerCase())
      if (!(await switchToPolygon(provider))) {
        setNotice(`Switch to ${POLYGON.name} to send contributions.`)
      }
      setChainId(await getChainId(provider))
    } catch (error) {
      setNotice(
        isUserRejection(error)
          ? 'Connection cancelled.'
          : error instanceof Error
            ? error.message
            : 'Could not reach the wallet.',
      )
    } finally {
      setBusy(null)
    }
  }, [])

  /** Called right before an action that needs signing. Reconnects on demand. */
  const ensureWallet = useCallback(async (): Promise<boolean> => {
    const provider = getProvider()
    if (!provider) return false
    if (walletAddress && walletAddress === session) return true
    await connect()
    const [account] = await getConnectedAccounts(provider)
    return Boolean(account) && account.toLowerCase() === session
  }, [walletAddress, session, connect])

  const authenticate = useCallback(async () => {
    const provider = getProvider()
    if (!provider || !walletAddress) return
    setNotice(null)
    setBusy('signin')
    try {
      const { address } = await signIn(provider, walletAddress)
      setSession(address)
    } catch (error) {
      setNotice(
        isUserRejection(error)
          ? 'Sign-in cancelled.'
          : error instanceof Error
            ? error.message
            : 'Could not sign you in.',
      )
    } finally {
      setBusy(null)
    }
  }, [walletAddress])

  const start = useCallback(
    async (wallet?: DiscoveredWallet) => {
      const chosen = wallet ?? getActiveWallet() ?? undefined
      if (chosen) {
        setActiveWallet(chosen)
        setActive(chosen)
      }
      const provider = chosen?.provider ?? getProvider()
      if (!provider) return

      setNotice(null)
      setBusy('connect')
      try {
        const [account] = await requestAccounts(provider)
        if (!account) {
          setNotice('No account came back from the wallet.')
          return
        }
        const address = account.toLowerCase()
        setWalletAddress(address)

        if (!(await switchToPolygon(provider))) {
          setNotice(`Switch to ${POLYGON.name} to send contributions.`)
        }
        setChainId(await getChainId(provider).catch(() => null))

        // Straight into the signature — a second button here is pure friction.
        setBusy('signin')
        const { address: signed } = await signIn(provider, address)
        setSession(signed)
      } catch (error) {
        setNotice(
          isUserRejection(error)
            ? 'Cancelled. Nothing was signed and no money moved.'
            : error instanceof Error
              ? error.message
              : 'Could not reach the wallet.',
        )
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  /** Let the person pick a different account without leaving Ajo. */
  const switchAccount = useCallback(async () => {
    const provider = getProvider()
    if (!provider) return
    setNotice(null)
    setBusy('connect')
    try {
      const accounts = await requestAccountChange(provider)
      if (accounts === null) {
        setNotice(
          'This wallet will not switch accounts from inside an app. Change the account in the wallet itself, then come back.',
        )
        return
      }

      const next = accounts[0]?.toLowerCase() ?? null
      if (!next) {
        setNotice('No account came back from the wallet.')
        return
      }
      if (next === walletAddress) {
        setNotice('That is the same account. Pick a different one in your wallet.')
        return
      }

      setWalletAddress(next)
      setSession(null)
    } finally {
      setBusy(null)
    }
  }, [walletAddress])

  /**
   * Forget the wallet on Ajo's side. It does not lock the wallet — no dapp can
   * do that — but it clears our selection so Connect offers the picker again
   * instead of silently reattaching the same one.
   */
  const disconnect = useCallback(() => {
    setActiveWallet(null)
    setActive(null)
    setWalletAddress(null)
    setChainId(null)
    setNotice(null)
  }, [])

  const leave = useCallback(async () => {
    await signOut()
    setSession(null)
    setUsdt(null)
    setPol(null)
    disconnect()
  }, [disconnect])

  const walletConnected = walletAddress !== null
  const walletMismatch =
    session !== null && walletConnected && walletAddress !== session
  const onPolygon = chainId === POLYGON.chainIdHex

  const value = useMemo<AjoState>(
    () => ({
      ready,
      hasProvider,
      insideNimiqPay,
      session,
      walletAddress,
      chainId,
      wallets,
      activeWallet,
      onPolygon,
      walletConnected,
      walletMismatch,
      canTransact: Boolean(session) && walletConnected && !walletMismatch && onPolygon,
      usdt,
      pol,
      busy,
      notice,
      connect,
      disconnect,
      start,
      authenticate,
      ensureWallet,
      switchAccount,
      leave,
      refresh,
      clearNotice: () => setNotice(null),
    }),
    [ready, hasProvider, insideNimiqPay, session, walletAddress, chainId, wallets, activeWallet, onPolygon,
     walletConnected, walletMismatch, usdt, pol, busy, notice,
     connect, disconnect, start, authenticate, ensureWallet, switchAccount, leave, refresh],
  )

  return <AjoContext.Provider value={value}>{children}</AjoContext.Provider>
}
