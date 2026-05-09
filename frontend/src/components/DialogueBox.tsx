interface DialogueBoxProps {
  narrative: string
  isStreaming: boolean
  error: string | null
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold-dim)" strokeWidth="0.8" className="mb-4 opacity-30">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
        <path d="M8 4.5A8 8 0 0 1 16 4.5" />
        <path d="M6 8.5A8 8 0 0 1 18 8.5" />
        <circle cx="9" cy="10" r="1" />
        <circle cx="15" cy="10" r="1" />
        <path d="M9 15c.8 1 2.2 1.5 3 1.5s2.2-.5 3-1.5" />
      </svg>
      <p className="font-display text-base text-ash-gold mb-1" style={{ letterSpacing: '0.08em' }}>
        Awaiting Action
      </p>
      <p className="text-xs text-ash-parchment-dim italic">
        Select an option or type your action to begin.
      </p>
    </div>
  )
}

export default function DialogueBox({ narrative, isStreaming, error }: DialogueBoxProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col">
      {!narrative && !isStreaming && <EmptyState />}

      {/* AI thinking indicator — shown when streaming but no text yet */}
      {isStreaming && !narrative && (
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-ash-gold)', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-ash-gold)', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-ash-gold)', animationDelay: '300ms' }} />
          </div>
          <span className="text-xs italic" style={{ color: 'rgba(197,165,102,0.5)' }}>守秘人正在思索...</span>
        </div>
      )}

      {narrative && (
        <div
          className="ash-border-box p-4 dialogue-area whitespace-pre-wrap"
          style={{ animation: !isStreaming ? 'fadeIn 0.4s ease-out' : undefined }}
        >
          {narrative}
          {isStreaming && (
            <span
              className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-ash-gold"
              style={{ animation: 'typewriter-cursor 1s infinite' }}
            />
          )}
        </div>
      )}

      {error && (
        <div
          className="ash-border-box p-3 mt-3"
          style={{
            borderColor: 'rgba(154,42,42,0.4)',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <p className="text-ash-red text-sm font-mono">Error: {error}</p>
        </div>
      )}
    </div>
  )
}
