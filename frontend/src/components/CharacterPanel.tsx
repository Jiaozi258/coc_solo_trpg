import type { Character, DerivedStats } from '../types'

const ATTR_NAMES = ['STR', 'CON', 'SIZ', 'DEX', 'INT', 'APP', 'POW', 'EDU', 'LUCK'] as const

interface Props {
  show: boolean
  onClose: () => void
  character: Character | null
  derivedStats: DerivedStats | null
}

export default function CharacterPanel({ show, onClose, character, derivedStats }: Props) {
  if (!show || !character) return null

  const stats = derivedStats ?? character.derived_stats

  const StatBar = ({ label, current, max, color }: {
    label: string; current: number; max: number; color: string
  }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-parchment-300">{label}</span>
        <span className={color}>{current} / {max}</span>
      </div>
      <div className="h-2 bg-parchment-950 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            color === 'text-cthulhu-blood' ? 'bg-cthulhu-blood' :
            color === 'text-blue-400' ? 'bg-blue-500' :
            'bg-purple-500'
          }`}
          style={{ width: `${Math.min(100, (current / Math.max(max, 1)) * 100)}%` }}
        />
      </div>
    </div>
  )

  const activeSkills = character.skills
    ? Object.entries(character.skills).filter(([, v]) => v > 0)
    : []

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div
        className="fixed right-0 top-0 bottom-0 w-80 bg-parchment-950 border-l border-parchment-700/30 z-50 overflow-y-auto"
        style={{
          boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
          animation: 'slideIn 300ms ease',
        }}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-display text-xl text-cthulhu-gold">{character.name}</h2>
              <p className="text-sm text-parchment-400">{character.occupation || '无职业'}</p>
            </div>
            <button onClick={onClose} className="parchment-btn text-xs">✕</button>
          </div>

          {/* HP/SAN/MP */}
          <div className="parchment-card mb-4">
            <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">状态</h3>
            <StatBar label="HP" current={stats?.HP_current ?? 0} max={stats?.HP_max ?? 1} color="text-cthulhu-blood" />
            <StatBar label="SAN" current={stats?.SAN_current ?? 0} max={stats?.SAN_max ?? 1} color="text-blue-400" />
            <StatBar label="MP" current={stats?.MP_current ?? 0} max={stats?.MP_max ?? 1} color="text-purple-400" />
          </div>

          {/* Attributes */}
          <div className="parchment-card mb-4">
            <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">属性</h3>
            <div className="grid grid-cols-3 gap-1 text-sm">
              {ATTR_NAMES.map(a => (
                <div key={a} className="flex justify-between px-1 py-0.5">
                  <span className="text-parchment-400">{a}</span>
                  <span className="text-parchment-200">{character.attributes[a] ?? '?'}</span>
                </div>
              ))}
            </div>
            {stats && (
              <div className="mt-2 pt-2 border-t border-parchment-700/20 grid grid-cols-3 gap-1 text-xs">
                <span className="text-parchment-500">MOV {stats.MOV}</span>
                <span className="text-parchment-500">BUILD {stats.BUILD}</span>
                <span className="text-parchment-500">DODGE {stats.DODGE}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          {activeSkills.length > 0 && (
            <div className="parchment-card mb-4">
              <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">技能</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activeSkills.map(([name, val]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-parchment-400">{name}</span>
                    <span className="text-parchment-200">{val}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Background */}
          {character.background && Object.values(character.background).some(v => v) && (
            <div className="parchment-card">
              <h3 className="text-xs text-parchment-500 mb-2 uppercase tracking-wider">背景</h3>
              <div className="space-y-1 text-xs text-parchment-400">
                {Object.entries(character.background).filter(([, v]) => v).map(([k, v]) => (
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
