'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import { DotGrid } from '@/components/dot-grid'
import { Mark } from '@/components/logo'

export default function Landing() {
  const router = useRouter()

  // Inside Nimiq Pay there is no marketing to do — send people straight in.
  // `?landing` opts out, which is how you view or screenshot this page in the host.
  useEffect(() => {
    const stay = new URLSearchParams(window.location.search).has('landing')
    if (window.nimiqPay && !stay) router.replace('/app')
  }, [router])

  return (
    <div className="min-h-full overflow-x-hidden bg-[#08080A] text-[#F2F2F0] [font-family:var(--font-body)]">
      <Hero />
      <Ledger />
      <Mechanism />
      <Panels />
      <Trust />
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden border-b border-white/8">
      <DotGrid />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(124,107,255,0.14),transparent_60%)]" />

      <div className="relative mx-auto grid min-h-[100svh] w-full max-w-[1400px] grid-cols-12 px-6 pt-10 pb-16 sm:px-10">
        <nav className="col-span-12 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <Mark className="h-5 w-5 text-[#7C6BFF]" />
            <span className="text-[13px] font-medium tracking-[0.22em] uppercase [font-family:var(--font-display)]">
              Ajo
            </span>
          </span>
          <span className="text-[11px] tracking-[0.18em] text-white/40 uppercase">
            Nimiq Pay Mini App
          </span>
        </nav>

        <div className="col-span-12 mt-auto min-w-0 lg:col-span-10">
          <p className="mb-8 flex items-center gap-3 text-[11px] tracking-[0.2em] text-white/45 uppercase">
            <span className="h-px w-10 bg-[#7C6BFF]" />
            Rotating savings, on-chain
          </p>

          <h1 className="text-[clamp(2.9rem,12vw,10.5rem)] leading-[0.84] font-bold tracking-[-0.045em] break-words [font-family:var(--font-display)]">
            Nobody
            <br />
            holds the
            <br />
            <span className="text-[#7C6BFF]">money.</span>
          </h1>
        </div>

        <div className="col-span-12 mt-14 grid grid-cols-12 items-end gap-y-10 lg:gap-x-8">
          <p className="col-span-12 min-w-0 max-w-[42ch] text-[15px] leading-relaxed text-white/55 sm:text-base lg:col-span-5">
            Ajo is the savings circle your family already runs — ajo, esusu, susu, tanda, chit
            — rebuilt so the collector is gone. Contributions move wallet to wallet. The app
            keeps the schedule and proves every payment on-chain.
          </p>

          <div className="col-span-12 min-w-0 lg:col-span-4 lg:col-start-9">
            <TactileCta />
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The primary action reads as a physical switch: a hard offset shadow that
 * collapses under the press, no border radius, no gradient.
 */
function TactileCta() {
  return (
    <Link
      href="/app"
      className="group relative inline-flex w-full items-center justify-between gap-6 bg-[#7C6BFF] px-7 py-6 text-[#08080A] shadow-[6px_6px_0_0_#F2F2F0] transition-all duration-150 hover:shadow-[3px_3px_0_0_#F2F2F0] max-w-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7C6BFF] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none"
    >
      <span className="text-[19px] font-bold tracking-[-0.02em] [font-family:var(--font-display)]">
        Start a circle
      </span>
      <ArrowUpRight
        className="h-6 w-6 transition-transform duration-150 group-hover:translate-x-1 group-hover:-translate-y-1"
        strokeWidth={2.5}
      />
    </Link>
  )
}

/** The arithmetic is the argument, so it gets its own full-bleed band. */
function Ledger() {
  const rows = [
    { k: '10', label: 'people in a circle' },
    { k: '$50', label: 'each, every week' },
    { k: '$450', label: 'to one member, weekly' },
    { k: '0', label: 'held by Ajo, ever' },
  ]

  return (
    <section className="border-b border-white/8">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-2 lg:grid-cols-4">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`border-white/8 px-6 py-16 sm:px-10 sm:py-24 ${
              i % 2 === 0 ? 'border-r' : ''
            } ${i < 2 ? 'border-b lg:border-b-0' : ''} ${i === 1 ? 'lg:border-r' : ''} ${
              i === 2 ? 'lg:border-r' : ''
            }`}
          >
            <p
              className={`text-[clamp(2.4rem,6vw,4.6rem)] leading-none font-bold tracking-[-0.04em] [font-family:var(--font-display)] ${
                i === 3 ? 'text-[#7C6BFF]' : ''
              }`}
            >
              {row.k}
            </p>
            <p className="mt-4 text-[11px] tracking-[0.16em] text-white/40 uppercase">
              {row.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Mechanism() {
  const steps = [
    {
      n: '01',
      title: 'Form the circle',
      body: 'Set the amount and the rhythm. Share a six-character code with people you already trust. Everyone sees the full payout order before a single naira moves.',
    },
    {
      n: '02',
      title: 'Everyone pays the same',
      body: 'Each round, every member sends the fixed amount straight to that round\u2019s recipient. Ajo never touches it — the transfer is wallet to wallet on Polygon.',
    },
    {
      n: '03',
      title: 'One member takes the pot',
      body: 'The recipient collects the whole round. Then the turn passes. After the last round, everyone has paid the same and everyone has been paid once.',
    },
  ]

  return (
    <section className="border-b border-white/8 px-6 py-28 sm:px-10 sm:py-44">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="grid grid-cols-12 gap-y-6 lg:gap-x-8">
          <p className="col-span-12 min-w-0 text-[11px] tracking-[0.2em] text-white/40 uppercase lg:col-span-3">
            How it runs
          </p>
          <h2 className="col-span-12 min-w-0 max-w-[18ch] text-[clamp(1.9rem,6vw,5rem)] leading-[0.95] font-bold tracking-[-0.04em] text-balance [font-family:var(--font-display)] lg:col-span-9">
            A rotation, not a pot that sits somewhere.
          </h2>
        </div>

        <div className="mt-24 grid grid-cols-12 gap-y-16 sm:mt-36">
          {steps.map((step, i) => (
            <article
              key={step.n}
              className={`col-span-12 lg:col-span-4 ${
                i === 1 ? 'lg:mt-24' : i === 2 ? 'lg:mt-48' : ''
              }`}
            >
              <p className="text-[11px] tracking-[0.22em] text-[#7C6BFF]">{step.n}</p>
              <h3 className="mt-6 text-[26px] leading-tight font-bold tracking-[-0.02em] [font-family:var(--font-display)] sm:text-[32px]">
                {step.title}
              </h3>
              <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-white/50">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Real screens from the app, floating over the grid rather than framed in cards. */
function Panels() {
  return (
    <section className="relative overflow-hidden border-b border-white/8 px-6 py-28 sm:px-10 sm:py-44">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:34px_34px]" />

      <div className="relative mx-auto w-full max-w-[1400px]">
        <h2 className="max-w-[16ch] text-[clamp(1.9rem,6vw,5rem)] leading-[0.95] font-bold tracking-[-0.04em] text-balance [font-family:var(--font-display)]">
          Every round, in the open.
        </h2>

        <div className="mt-20 grid grid-cols-12 gap-y-6 sm:gap-x-6">
          <Panel className="col-span-12 sm:col-span-7 lg:col-span-5">
            <PanelLabel>Round 3 of 10</PanelLabel>
            <p className="mt-5 text-[clamp(2.6rem,6vw,3.6rem)] leading-none font-bold tracking-[-0.03em] [font-family:var(--font-display)]">
              450.00 <span className="text-lg font-medium text-white/40">USDT</span>
            </p>
            <p className="mt-3 text-sm text-white/45">to Amina · due in 2 days</p>
            <div className="mt-8 flex flex-col gap-3">
              {[
                ['Musa', true],
                ['Chidi', true],
                ['Ngozi', false],
              ].map(([name, paid]) => (
                <div
                  key={name as string}
                  className="flex items-center justify-between border-t border-white/8 pt-3"
                >
                  <span className="text-sm text-white/70">{name as string}</span>
                  {paid ? (
                    <span className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-[#7C6BFF] uppercase">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} /> paid
                    </span>
                  ) : (
                    <span className="max-w-full text-[11px] leading-relaxed tracking-[0.14em] text-balance text-white/30 uppercase">
                      pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="col-span-12 sm:col-span-5 lg:col-span-4 lg:mt-20">
            <PanelLabel>Payout order</PanelLabel>
            <div className="mt-6 flex flex-col gap-4">
              {['Tunde', 'Blessing', 'Amina', 'Musa'].map((name, i) => (
                <div key={name} className="flex items-center gap-4">
                  <span className="w-6 text-[11px] text-white/25 [font-family:var(--font-mono)]">
                    #{i + 1}
                  </span>
                  <span
                    className={`text-sm ${i === 2 ? 'text-[#7C6BFF]' : 'text-white/60'}`}
                  >
                    {name}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs leading-relaxed text-white/35">
              Fixed when the circle starts. Visible to everyone, changeable by no one.
            </p>
          </Panel>

          <Panel className="col-span-12 lg:col-span-3 lg:mt-44">
            <PanelLabel>Verified on-chain</PanelLabel>
            <p className="mt-5 text-sm leading-relaxed text-white/55">
              Every contribution is matched to a real Polygon transaction. The ledger is the
              chain — not our database.
            </p>
            <p className="mt-6 border-t border-white/8 pt-4 text-[11px] break-all text-white/30 [font-family:var(--font-mono)]">
              0x9f2c…a41d
            </p>
          </Panel>
        </div>
      </div>
    </section>
  )
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-white/10 bg-white/[0.025] p-7 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  )
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] tracking-[0.2em] text-white/35 uppercase">{children}</p>
  )
}

function Trust() {
  return (
    <section className="px-6 py-28 sm:px-10 sm:py-44">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-12 gap-y-8 lg:gap-x-10">
        <p className="col-span-12 min-w-0 text-[11px] tracking-[0.2em] text-white/40 uppercase lg:col-span-3">
          Custody
        </p>

        <div className="col-span-12 min-w-0 lg:col-span-9">
          <h2 className="max-w-[20ch] text-[clamp(1.8rem,5vw,4rem)] leading-[1] font-bold tracking-[-0.035em] text-balance [font-family:var(--font-display)]">
            Ajo cannot run away with your savings, because it never has them.
          </h2>

          <p className="mt-8 max-w-[46ch] text-[15px] leading-relaxed text-white/50">
            Traditional ajo breaks in one place: the person holding the pot. Ajo removes that
            role rather than replacing it. There is no escrow account, no smart contract holding
            balances, no treasury. Money moves directly between members, and the app&rsquo;s only
            job is to say who owes what, and to prove who has paid.
          </p>

          <div className="mt-14">
            <TactileCta />
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/8 px-6 py-12 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2.5">
          <Mark className="h-5 w-5 text-white/50" />
          <span className="text-[13px] font-medium tracking-[0.22em] uppercase [font-family:var(--font-display)]">
            Ajo
          </span>
        </span>
        <p className="max-w-full text-[11px] leading-relaxed tracking-[0.14em] text-balance text-white/30 uppercase">
          Built for the Nimiq Pay Mini Apps Competition · USDT on Polygon
        </p>
      </div>
    </footer>
  )
}
