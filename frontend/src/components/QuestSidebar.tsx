import { useMemo } from 'react'

interface Quest {
  id: string
  name: string
  difficulty: 'High' | 'Medium' | 'Low'
  reward: string
  completed: boolean
  location?: string
}

interface QuestSidebarProps {
  quests?: Quest[]
  onBeginQuest?: (questId: string) => void
}

export default function QuestSidebar({ quests = [], onBeginQuest }: QuestSidebarProps) {
  const hasQuests = quests.length > 0

  const difficultyBadge = (d: Quest['difficulty']) => {
    switch (d) {
      case 'High': return <span className="badge-high">High</span>
      case 'Medium': return <span className="badge-medium">Medium</span>
      case 'Low': return <span className="badge-low">Low</span>
    }
  }

  return (
    <div className="ash-border-box p-3 flex flex-col h-full">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: '1px solid rgba(197,165,102,0.12)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ash-gold">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8M8 11h6" />
        </svg>
        <span className="ash-section-title">Active Investigations</span>
      </div>

      {/* Quest list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {!hasQuests && (
          <p className="text-xs text-ash-parchment-dim italic py-6 text-center">
            No active investigations.<br />
            Explore the map to discover quests.
          </p>
        )}

        {quests.map((q, i) => (
          <div
            key={q.id}
            className={`ash-card p-3 flex flex-col gap-2 stagger-item stagger-delay-${(i % 6) + 1}`}
          >
            {/* Name + difficulty */}
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-display text-[0.7rem] tracking-wider uppercase text-ash-parchment truncate"
                style={{ letterSpacing: '0.08em' }}
              >
                {q.name}
              </span>
              {difficultyBadge(q.difficulty)}
            </div>

            {/* Location */}
            {q.location && (
              <div className="text-[0.6rem] text-ash-parchment-dim font-mono">
                {q.location}
              </div>
            )}

            {/* Reward + action */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-ash-gold-dim">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9z" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9z" />
                  <path d="M4 22h16" />
                  <path d="M10 22V8c0-1.1.9-2 2-2s2 .9 2 2v14" />
                </svg>
                <span className="font-mono">{q.reward}</span>
              </div>

              {q.completed ? (
                <span
                  className="text-[0.6rem] font-mono tracking-wider uppercase"
                  style={{ color: 'rgba(189,186,179,0.4)' }}
                >
                  Completed
                </span>
              ) : (
                <button
                  onClick={() => onBeginQuest?.(q.id)}
                  className="flex items-center gap-1 text-[0.6rem] font-mono tracking-wider uppercase text-ash-gold hover:text-ash-parchment transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Begin
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
