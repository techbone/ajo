'use client'

import { useEffect, useRef } from 'react'

/**
 * The hero ground: a field of dots that leans toward the pointer.
 *
 * Canvas rather than 1,500 DOM nodes, and it stops drawing entirely when the
 * pointer is idle or the viewer has asked for reduced motion.
 */
export function DotGrid() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const SPACING = 34
    const pointer = { x: -9999, y: -9999 }
    let raf = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, width, height)

      const cols = Math.ceil(width / SPACING) + 1
      const rows = Math.ceil(height / SPACING) + 1
      const radius = 150

      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const x = i * SPACING
          const y = j * SPACING
          const dx = x - pointer.x
          const dy = y - pointer.y
          const dist = Math.hypot(dx, dy)

          let size = 1
          let alpha = 0.16
          let ox = 0
          let oy = 0

          if (!reduced && dist < radius) {
            const pull = (1 - dist / radius) ** 2
            size = 1 + pull * 2.1
            alpha = 0.16 + pull * 0.72
            // Lean toward the cursor rather than away — reads as attention.
            ox = -(dx / (dist || 1)) * pull * 7
            oy = -(dy / (dist || 1)) * pull * 7
          }

          ctx.beginPath()
          ctx.arc(x + ox, y + oy, size, 0, Math.PI * 2)
          ctx.fillStyle =
            alpha > 0.4 ? `rgba(124,107,255,${alpha})` : `rgba(190,190,205,${alpha})`
          ctx.fill()
        }
      }
      raf = 0
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      schedule()
    }

    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
      schedule()
    }

    const onResize = () => {
      resize()
      schedule()
    }

    resize()
    draw()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onLeave)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
