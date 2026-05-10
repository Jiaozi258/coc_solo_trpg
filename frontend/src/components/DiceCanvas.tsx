import { useEffect, useRef, useCallback } from 'react'

interface DiceCanvasProps {
  rolling: boolean
  result: number | null
  onDone: () => void
}

// D100 rendering: two d10 faces forming a percentage
const DIE_SIZE = 64
const GRAVITY = 0.6
const BOUNCE = 0.5
const FRICTION = 0.98
const DURATION = 2200 // ms

interface Particle {
  x: number; y: number; vx: number; vy: number
  rotation: number; rotSpeed: number
  value: number
  settled: boolean
}

export default function DiceCanvas({ rolling, result, onDone }: DiceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const startTimeRef = useRef(0)

  const tick = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height
    const elapsed = timestamp - startTimeRef.current

    ctx.clearRect(0, 0, w, h)

    const particles = particlesRef.current
    let allSettled = true

    particles.forEach(p => {
      if (elapsed < DURATION) {
        p.vy += GRAVITY
        p.x += p.vx
        p.y += p.vy
        p.vx *= FRICTION
        p.rotation += p.rotSpeed
        p.rotSpeed *= FRICTION

        if (p.y > h - DIE_SIZE / 2 - 10) {
          p.y = h - DIE_SIZE / 2 - 10
          p.vy *= -BOUNCE
          p.vx *= BOUNCE
          if (Math.abs(p.vy) < 1) {
            p.vy = 0
            p.vx = 0
            p.rotSpeed = 0
            p.settled = true
          }
        }
      } else {
        p.settled = true
      }
      if (!p.settled) allSettled = false

      // Draw die face
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = '#3a2010'
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 3
      roundRect(ctx, -DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE, 8)
      ctx.fill()

      // Face highlight
      ctx.fillStyle = '#5c3820'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      roundRect(ctx, -DIE_SIZE / 2 + 3, -DIE_SIZE / 2 + 3, DIE_SIZE - 6, DIE_SIZE - 6, 6)
      ctx.fill()

      // Value text
      ctx.fillStyle = '#f4e4c1'
      ctx.font = `bold ${DIE_SIZE * 0.42}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.value), 0, 1)
      ctx.restore()
    })

    if (!allSettled || elapsed < DURATION) {
      animRef.current = requestAnimationFrame(tick)
    } else {
      onDone()
    }
  }, [onDone])

  useEffect(() => {
    if (rolling && result !== null) {
      const canvas = canvasRef.current
      if (!canvas) return
      const w = canvas.width
      const h = canvas.height

      // Tens die and ones die
      const tens = Math.floor(result / 10)
      const ones = result % 10
      startTimeRef.current = performance.now()
      particlesRef.current = [
        { x: w * 0.3, y: -DIE_SIZE, vx: 2 + Math.random() * 2, vy: 2, rotation: 0, rotSpeed: 8 + Math.random() * 6, value: tens, settled: false },
        { x: w * 0.7, y: -DIE_SIZE - 30, vx: -2 - Math.random() * 2, vy: 5, rotation: 0, rotSpeed: -10 - Math.random() * 4, value: ones, settled: false },
      ]
      animRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [rolling, result, tick])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={140}
      className="mx-auto block"
      style={{ imageRendering: 'auto' }}
    />
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
