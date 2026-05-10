import { useEffect, useState } from 'react'

interface SanEffectProps {
  trigger: boolean
}

export default function SanEffect({ trigger }: SanEffectProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (trigger) {
      setActive(true)
      const timer = setTimeout(() => setActive(false), 1500)
      return () => {
        clearTimeout(timer)
        setActive(false)
      }
    }
  }, [trigger])

  if (!active) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Red glow at edges */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'sanGlow 1.5s ease-out forwards',
          boxShadow: 'inset 0 0 120px rgba(180,0,0,0.6)',
        }}
      />
      {/* Shake wrapper */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'sanShake 0.6s ease-out',
        }}
      />
      <style>{`
        @keyframes sanGlow {
          0% { box-shadow: inset 0 0 0px rgba(180,0,0,0); }
          20% { box-shadow: inset 0 0 140px rgba(180,0,0,0.7); }
          100% { box-shadow: inset 0 0 0px rgba(180,0,0,0); }
        }
        @keyframes sanShake {
          0% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 1px); }
          20% { transform: translate(3px, -2px); }
          30% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -1px); }
          50% { transform: translate(-1px, 1px); }
          60% { transform: translate(1px, 0); }
          70% { transform: translate(0, -1px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </div>
  )
}
