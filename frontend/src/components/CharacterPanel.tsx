import { useState, useEffect } from 'react'
import type { Character, DerivedStats } from '../types'

const ATTR_NAMES = ['STR', 'CON', 'SIZ', 'DEX', 'INT', 'APP', 'POW', 'EDU', 'LUCK'] as const

interface CharacterPanelProps {
  show: boolean
  onClose: () => void
  character: Character | null
  derivedStats: DerivedStats | null
}

function StatBar({ label, current, max, color }: {
  label: string; current: number; max: number; color: string
}) {
  const pct = max > 0 ? (current / max) * 100 : 0
  const isLow = max > 0 && current > 0 && (current / max) < 0.2
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[0.6rem] font-mono mb-1 tracking-wider">
        <span className="text-ash-parchment-dim">{label}</span>
        <span
          style={{ color: isLow ? 'var(--color-ash-red-bright)' : color }}
          className={`font-bold ${isLow ? 'animate-pulse' : ''}`}
        >
          {current} / {max}
        </span>
      </div>
      <div className="ash-progress-bg">
        <div
          className="ash-progress-fill"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: isLow ? 'var(--color-ash-red-bright)' : color,
          }}
        />
      </div>
    </div>
  )
}

export default function CharacterPanel({ show, onClose, character, derivedStats }: CharacterPanelProps) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (show && character) {
      setVisible(true)
      setClosing(false)
    } else if (!show && visible) {
      setClosing(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setClosing(false)
      }, 280)
      return () => clearTimeout(timer)
    }
  }, [show, character, visible])

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      setClosing(false)
      onClose()
    }, 280)
  }

  if (!visible || !character) return null

  const stats = derivedStats ?? character.derived_stats
  const activeSkills = character.skills
    ? Object.entries(character.skills).filter(([, v]) => v > 0)
    : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: closing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.6)',
          transition: 'background 0.28s ease',
        }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="parchment-card fixed right-0 top-0 bottom-0 w-80 z-50 overflow-y-auto"
        style={{
          borderLeft: '1px solid rgba(197,165,102,0.2)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
          transform: closing ? 'translateX(100%)' : 'translateX(0)',
          transition: 'transform 0.28s ease',
        }}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-start mb-4 pb-3" style={{ borderBottom: '1px solid rgba(197,165,102,0.12)' }}>
            <div>
              <h2
                className="font-display text-lg text-ash-gold tracking-wider"
                style={{ letterSpacing: '0.1em' }}
              >
                {character.name}
              </h2>
              <p className="text-xs text-ash-parchment-dim italic mt-0.5">
                {character.occupation || 'Investigator'}
              </p>
              {character.status && (
                <p
                  className="text-[0.55rem] font-mono mt-0.5 uppercase tracking-wider"
                  style={{
                    color: character.status === 'alive' ? 'var(--color-ash-dark-brown)' : 'var(--color-ash-red)',
                  }}
                >
                  {character.status}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="ash-btn text-[0.6rem] px-2 py-1"
            >
              ✕
            </button>
          </div>

          {/* HP / SAN / MP */}
          <div className="ash-card-gold p-3 mb-3">
            <span className="ash-section-title block mb-2">Vitals</span>
            <StatBar label="HP" current={stats?.HP_current ?? 0} max={stats?.HP_max ?? 1} color="var(--color-ash-red)" />
            <StatBar label="SAN" current={stats?.SAN_current ?? 0} max={stats?.SAN_max ?? 1} color="var(--color-ash-gold)" />
            <StatBar label="MP" current={stats?.MP_current ?? 0} max={stats?.MP_max ?? 1} color="var(--color-ash-gold-pale)" />
          </div>

          {/* Attributes */}
          <div className="ash-card-gold p-3 mb-3">
            <span className="ash-section-title block mb-2">Attributes</span>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1">
              {ATTR_NAMES.map(a => (
                <div key={a} className="flex justify-between text-xs">
                  <span className="text-ash-parchment-dim font-mono">{a}</span>
                  <span className="text-ash-parchment font-mono font-bold">
                    {character.attributes?.[a as keyof typeof character.attributes] ?? '—'}
                  </span>
                </div>
              ))}
            </div>
            {stats && (
              <div
                className="mt-2 pt-2 grid grid-cols-3 gap-1 text-[0.6rem] font-mono"
                style={{ borderTop: '1px solid rgba(139,109,69,0.15)' }}
              >
                <span className="text-ash-parchment-dim">MOV {stats.MOV ?? '—'}</span>
                <span className="text-ash-parchment-dim">BUILD {stats.BUILD ?? '—'}</span>
                <span className="text-ash-parchment-dim">DODGE {stats.DODGE ?? '—'}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          {activeSkills.length > 0 && (
            <div className="ash-card-gold p-3 mb-3">
              <span className="ash-section-title block mb-2">Skills</span>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activeSkills.map(([name, val]) => (
                  <div key={name} className="flex justify-between text-xs">
                    <span className="text-ash-parchment-dim">{name}</span>
                    <span className="text-ash-parchment font-mono">{val}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Background */}
          {character.background && Object.values(character.background).some(v => v) && (
            <div className="ash-card-gold p-3">
              <span className="ash-section-title block mb-2">Background</span>
              <div className="space-y-1 text-[0.7rem] text-ash-parchment-dim italic leading-relaxed max-h-48 overflow-y-auto">
                {Object.entries(character.background)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <p key={k}>{v as string}</p>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
