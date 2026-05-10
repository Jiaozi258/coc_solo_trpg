import type { DiceLogEntry } from '../types'

interface DiceLogProps {
  entries: DiceLogEntry[]
}

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-green-300',
  extreme: 'text-emerald-400',
  hard: 'text-teal-400',
  regular: 'text-amber-300',
  failure: 'text-red-400',
  fumble: 'text-red-600',
}

export default function DiceLog({ entries }: DiceLogProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs italic" style={{ color: 'rgba(197,165,102,0.35)' }}>
          No rolls yet
        </p>
      </div>
    )
  }

  const latest = [...entries].reverse()

  return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto">
      {latest.map((entry, i) => (
        <div
          key={entry.timestamp + i}
          className="flex items-center gap-2 text-[0.6rem] p-1.5 rounded"
          style={{ background: 'rgba(22,19,17,0.4)', border: '1px solid rgba(197,165,102,0.06)' }}
        >
          <span className="font-mono w-7 text-right" style={{ color: 'rgba(197,165,102,0.5)' }}>
            {entry.roll}
          </span>
          <span className="text-ash-parchment-dim">/ {entry.target}</span>
          <span className={`ml-auto font-display tracking-wider ${LEVEL_COLORS[entry.level] || ''}`}>
            {entry.success ? 'SUCCESS' : 'FAIL'}
          </span>
          {entry.skill && (
            <span className="text-ash-parchment-dim truncate max-w-16" title={entry.skill}>
              {entry.skill}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
