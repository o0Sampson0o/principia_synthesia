"use client"

import { useEffect, useRef } from "react"

interface Props {
  length?: number
  gravity?: number
  initialAngle?: number
  damping?: number
  width?: number
  height?: number
}

export default function PendulumSim({
  length = 1.5,
  gravity = 9.81,
  initialAngle = 30,
  damping = 0.01,
  width = 400,
  height = 400,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    let angle = (initialAngle * Math.PI) / 180
    let angleVelocity = 0
    const dt = 0.016
    const scale = height * 0.35
    const pivotX = width / 2
    const pivotY = height * 0.15
    let animId: number

    function draw() {
      ctx.clearRect(0, 0, width, height)
      const angAcc = -(gravity / length) * Math.sin(angle) - damping * angleVelocity
      angleVelocity += angAcc * dt
      angle += angleVelocity * dt

      const bobX = pivotX + scale * Math.sin(angle)
      const bobY = pivotY + scale * Math.cos(angle)

      ctx.beginPath()
      ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2)
      ctx.fillStyle = "#71717a"
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(pivotX, pivotY)
      ctx.lineTo(bobX, bobY)
      ctx.strokeStyle = "#a1a1aa"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(bobX, bobY, 18, 0, Math.PI * 2)
      ctx.fillStyle = "#3f3f46"
      ctx.fill()

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [length, gravity, initialAngle, damping, width, height])

  return (
    <div className="my-6 flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Pendulum · L = {length}m · g = {gravity} m/s² · θ₀ = {initialAngle}°
      </p>
    </div>
  )
}
