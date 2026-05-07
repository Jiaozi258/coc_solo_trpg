interface Props {
  narrative: string
  isStreaming: boolean
  error: string | null
}

export default function DialogueBox({ narrative, isStreaming, error }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {!narrative && !isStreaming && (
        <div className="text-center text-parchment-500 mt-16">
          <p className="text-5xl mb-4">🐙</p>
          <p className="font-display text-lg text-cthulhu-gold">等待行动...</p>
          <p className="text-sm mt-2">选择一个选项或输入指令开始冒险</p>
        </div>
      )}

      {narrative && (
        <div className="parchment-card max-w-3xl mx-auto">
          <div className="text-parchment-200 leading-relaxed whitespace-pre-wrap font-body text-base">
            {narrative}
            {isStreaming && (
              <span className="animate-pulse text-cthulhu-gold font-bold">▌</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="parchment-card max-w-3xl mx-auto mt-4 border-cthulhu-blood/50">
          <p className="text-cthulhu-blood text-sm">错误: {error}</p>
        </div>
      )}
    </div>
  )
}
