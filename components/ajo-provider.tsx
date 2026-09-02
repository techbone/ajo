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
import { fetchBalances, fetchSession, signIn } from '@/lib/auth-client'
import { POLYGON } from '@/lib/chain'
import {
  getChainId,
  getProvider,
  isUserRejection,
  requestAccounts,
  switchToPolygon,
} from '@/lib/wallet'
import { isInsideNimiqPay } from '@/lib/nimiq'

interface AjoState {
  ready: boolean
  hasProvider: boolean
  insideNimiqPay: boolean
  address: string | null
  session: string | null
  chainId: string | null
  onPolygon: boolean
  usdt: string | null
  pol: string | null
  busy: 'connect' | 'signin' | null
  notice: string | null
  connect: () => Promise<void>
  authenticate: () => Promise<void>
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
  const [address, setAddress] = useState<string | null>(null)
  const [session, setSession] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [usdt, setUsdt] = useState<string | null>(null)
  const [pol, setPol] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'signin' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Detection only — no wallet call here would raise a dialog the user didn't ask for.
  useEffect(() => {
    setHasProvider(Boolean(getProvider()))
    setInsideNimiqPay(isInsideNimiqPay())
    void fetchSession().then((addr) => {
      setSession(addr)
      if (addr) setAddress(addr)
      setReady(true)
    })
  }, [])

  const refresh = useCallback(async () => {
    const target = session ?? address
    if (!target) return
    const { usdt: u, pol: p } = await fetchBalances(target)
    setUsdt(u)
    setPol(p)
  }, [session, address])

  useEffect(() => {
    if (session) void refresh()
  }, [session, refresh])

  const connect = useCallback(async () => {
    const provider = getProvider()
    if (!provider) return
    setNotice(null)
    setBusy('connect')
    try {
      const [account] = await requestAccounts(provider)
      if (!account) {
        setNotice('No account came back from the wallet.')
        return
      }
      setAddress(account.toLowerCase())
      const switched = await switchToPolygon(provider)
      if (!switched) {
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

  const authenticate = useCallback(async () => {
    const provider = getProvider()
    if (!provider || !address) return
    setNotice(null)
    setBusy('signin')
    try {
      const { address: signed } = await signIn(provider, address)
      setSession(signed)
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
  }, [address])

  const value = useMemo<AjoState>(
    () => ({
      ready,
      hasProvider,
      insideNimiqPay,
      address,
      session,
      chainId,
      onPolygon: chainId === POLYGON.chainIdHex,
      usdt,
      pol,
      busy,
      notice,
      connect,
      authenticate,
      refresh,
      clearNotice: () => setNotice(null),
    }),
    [ready, hasProvider, insideNimiqPay, address, session, chainId, usdt, pol, busy, notice, connect, authenticate, refresh],
  )

  return <AjoContext.Provider value={value}>{children}</AjoContext.Provider>
}
