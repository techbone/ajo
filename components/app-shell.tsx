'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AccountBar } from './account-bar'

/**
 * The application chrome: a full-width bar pinned to the top, with the reading
 * column centred beneath it. The account control belongs to the window, not to
 * the content, so it sits in the bar rather than competing with the page title.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Link
            href="/app"
            className="text-xl font-bold tracking-tight text-accent"
            aria-label="Ajo home"
          >
            Ajo
          </Link>
          <AccountBar />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-7 pb-16">
        {children}
      </main>
    </div>
  )
}
