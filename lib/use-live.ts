'use client'

import { useEffect, useRef } from 'react'

/**
 * Watch a circle for changes without making the person refresh.
 *
 * Polling rather than websockets: Vercel's functions cannot hold a persistent
 * connection, so live updates would mean a third-party realtime service — a lot
 * of moving parts for events that happen a handful of times per round. At this
 * frequency a few seconds reads as instant.
 *
 * What keeps it cheap:
 *  - it polls a one-query version endpoint, not the full circle payload
 *  - it stops completely while the app is backgrounded, which matters on a
 *    phone, and refetches the moment it comes back
 *  - the interval backs off while nothing is happening, and snaps back to fast
 *    as soon as something changes
 */
const FAST_MS = 3_000
const MAX_MS = 20_000

/**
 * @param url a version endpoint returning `{ version: string }`
 */
export function useLiveVersion({
  url,
  enabled,
  onChange,
}: {
  url: string
  enabled: boolean
  onChange: () => void | Promise<void>
}) {
  // Kept in refs so changing them never restarts the polling loop.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const versionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = FAST_MS

    const poll = async () => {
      if (cancelled || document.visibilityState !== 'visible') return

      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))

        const { version } = (await res.json()) as { version: string }

        if (versionRef.current === null) {
          // First read just establishes the baseline.
          versionRef.current = version
        } else if (version !== versionRef.current) {
          versionRef.current = version
          delay = FAST_MS // something moved; stay responsive
          await onChangeRef.current()
        } else {
          delay = Math.min(delay * 1.6, MAX_MS)
        }
      } catch {
        // Offline or a hiccup. Back off and keep trying quietly — this is a
        // background refresh, not something to interrupt anyone about.
        delay = Math.min(delay * 2, MAX_MS)
      }

      schedule()
    }

    const schedule = () => {
      if (cancelled) return
      clearTimeout(timer)
      timer = setTimeout(() => void poll(), delay)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Coming back to the app is exactly when stale data is most obvious.
        delay = FAST_MS
        void poll()
      } else {
        clearTimeout(timer)
      }
    }

    void poll()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [url, enabled])
}

/** Watch a single circle. */
export function useLiveCircle(params: {
  id: string
  enabled: boolean
  onChange: () => void | Promise<void>
}) {
  useLiveVersion({
    url: `/api/circles/${params.id}/version`,
    enabled: params.enabled,
    onChange: params.onChange,
  })
}

/** Watch every circle the signed-in member belongs to. */
export function useLiveCircleList(params: {
  enabled: boolean
  onChange: () => void | Promise<void>
}) {
  useLiveVersion({
    url: '/api/circles/version',
    enabled: params.enabled,
    onChange: params.onChange,
  })
}
