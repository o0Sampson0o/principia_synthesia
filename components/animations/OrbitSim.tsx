"use client"

import { useEffect, useRef } from "react"

interface Props {
  bodies?: { mass: number; x: number; y: number; vx: number; vy: number; color?: string }[]
  width?: number
  height?: number
  G?: number
  trail?: boolean
}

const DEFAULTS = [
  { mass: 2e14, x: 0,   y: -80, vx:  60,  vy: 0,   color: "#6366f1" },
  { mass: 2e14, x: 0,   y:  80, vx: -60,  vy: 0,   color: "#f59e0b" },
  { mass: 1e14, x: 120, y:   0, vx:   0,  vy: 80,  color: "#10b981" },
]

export default function OrbitSim({
  bodies = DEFAULTS,
  width = 400,
  height = 400,
  G = 6.674e-11,
  trail = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    const state = bodies.map((b) => ({ ...b, trail: [] as [number, number][] }))
    const cx = width / 2, cy = height / 2
    const scale = 1.5
    const dt = 500
    let animId: number

    function draw() {
      ctx.clearRect(0, 0, width, height)

      // Update physics
      for (let i = 0; i < state.length; i++) {
        let ax = 0, ay = 0
        for (let j = 0; j < state.length; j++) {
          if (i === j) continue
          const dx = state[j].x - state[i].x
          const dy = state[j].y - state[i].y
          const r = Math.sqrt(dx * dx + dy * dy)
          if (r < 1) continue
          const f = (G * state[i].mass * state[j].mass) / (r * r)
          ax += (f / state[i].mass) * (dx / r)
          ay += (f / state[i].mass) * (dy / r)
        }
        state[i].vx += ax * dt
        state[i].vy += ay * dt
      }
      for (const b of state) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        if (trail) {
          b.trail.push([cx + b.x * scale, cy + b.y * scale])
          if (b.trail.length > 200) b.trail.shift()
        }
      }

      // Draw trails
      if (trail) {
        for (const b of state) {
          if (b.trail.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(b.trail[0][0], b.trail[0][1])
          for (const [x, y] of b.trail) ctx.lineTo(x, y)
          ctx.strokeStyle = (b.color || "#a1a1aa") + "55"
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // Draw bodies
      for (const b of state) {
        const r = Math.max(6, Math.log10(b.mass) - 7)
        ctx.beginPath()
        ctx.arc(cx + b.x * scale, cy + b.y * scale, r, 0, Math.PI * 2)
        ctx.fillStyle = b.color || "#3f3f46"
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [bodies, width, height, G, trail])

  return (
    <div className="my-6 flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        N-body gravitational simulation
      </p>
    </div>
  )
}
