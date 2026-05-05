"use client"

import { useEffect, useRef } from "react"

interface Props {
  mass1?: number
  mass2?: number
  length1?: number
  length2?: number
  gravity?: number
  width?: number
  height?: number
}

export default function DoublePendulumSim({
  mass1 = 1,
  mass2 = 1,
  length1 = 1.2,
  length2 = 1.0,
  gravity = 9.81,
  width = 400,
  height = 450,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    const scale = height * 0.22
    const pivotX = width / 2
    const pivotY = height * 0.2

    let a1 = Math.PI / 2 + 0.1
    let a2 = Math.PI / 2
    let a1v = 0
    let a2v = 0
    const dt = 0.016
    let animId: number

    // Trail
    const trail: [number, number][] = []

    function step() {
      const m1 = mass1, m2 = mass2, l1 = length1, l2 = length2, g = gravity
      const num1 = -g * (2 * m1 + m2) * Math.sin(a1)
      const num2 = -m2 * g * Math.sin(a1 - 2 * a2)
      const num3 = -2 * Math.sin(a1 - a2) * m2 * (a2v ** 2 * l2 + a1v ** 2 * l1 * Math.cos(a1 - a2))
      const den = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2))
      const a1a = (num1 + num2 + num3) / den

      const num4 = 2 * Math.sin(a1 - a2)
      const num5 = a1v ** 2 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + a2v ** 2 * l2 * m2 * Math.cos(a1 - a2)
      const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2))
      const a2a = (num4 * num5) / den2

      a1v += a1a * dt
      a2v += a2a * dt
      a1 += a1v * dt
      a2 += a2v * dt
    }

    function draw() {
      ctx.clearRect(0, 0, width, height)

      step()

      const x1 = pivotX + scale * length1 * Math.sin(a1)
      const y1 = pivotY + scale * length1 * Math.cos(a1)
      const x2 = x1 + scale * length2 * Math.sin(a2)
      const y2 = y1 + scale * length2 * Math.cos(a2)

      trail.push([x2, y2])
      if (trail.length > 300) trail.shift()

      // Draw trail
      if (trail.length > 1) {
        ctx.beginPath()
        ctx.moveTo(trail[0][0], trail[0][1])
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i][0], trail[i][1])
        }
        ctx.strokeStyle = "rgba(99,102,241,0.4)"
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Rods
      ctx.beginPath()
      ctx.moveTo(pivotX, pivotY)
      ctx.lineTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = "#a1a1aa"
      ctx.lineWidth = 2
      ctx.stroke()

      // Pivot
      ctx.beginPath()
      ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2)
      ctx.fillStyle = "#71717a"
      ctx.fill()

      // Bobs
      for (const [x, y, r] of [[x1, y1, 14], [x2, y2, 12]] as [number, number, number][]) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = "#3f3f46"
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [mass1, mass2, length1, length2, gravity, width, height])

  return (
    <div className="my-6 flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Double pendulum — chaotic motion
      </p>
    </div>
  )
}
