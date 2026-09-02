/**
 * The Ajo mark: eight members in a ring, one of them lit.
 *
 * Inlined rather than loaded as an image so `currentColor` resolves — the mark
 * takes the colour of whatever text it sits beside, in either theme, with no
 * extra request.
 */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Ajo"
    >
      <g fill="currentColor">
        <circle cx="32" cy="11" r="7.5" />
        <circle cx="46.85" cy="17.15" r="3.6" opacity="0.5" />
        <circle cx="53" cy="32" r="3.6" opacity="0.5" />
        <circle cx="46.85" cy="46.85" r="3.6" opacity="0.5" />
        <circle cx="32" cy="53" r="3.6" opacity="0.5" />
        <circle cx="17.15" cy="46.85" r="3.6" opacity="0.5" />
        <circle cx="11" cy="32" r="3.6" opacity="0.5" />
        <circle cx="17.15" cy="17.15" r="3.6" opacity="0.5" />
      </g>
    </svg>
  )
}

/** Mark plus wordmark, for headers and navigation. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="h-5 w-5" />
      <span className="text-xl font-bold tracking-tight">Ajo</span>
    </span>
  )
}
