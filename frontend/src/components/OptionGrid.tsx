import type { DiceRequest } from '../types'

interface DiceResult {
  expression: string
  individual: number[]
  total: number
}

interface Props {
  options: string[]
  isStreaming: boolean
  showTextInput: boolean
  showDice: boolean
  pendingDiceRequest: DiceRequest | null
  diceResult: DiceResult | null
  rolling: boolean
  textInput: string
  onOptionClick: (option: string) => void
  onDiceRoll: () => void
  onTextSubmit: (e: React.FormEvent) => void
  onTextInputChange: (value: string) => void
  onToggleTextInput: () => void
}

export default function OptionGrid({
  options, isStreaming, showTextInput, showDice, pendingDiceRequest,
  diceResult, rolling, textInput,
  onOptionClick, onDiceRoll, onTextSubmit, onTextInputChange, onToggleTextInput,
}: Props) {
  return (
    <div className="border-t border-parchment-700/30 p-4 bg-parchment-950/90">
      {/* Dice Overlay */}
      {showDice && pendingDiceRequest && (
        <div className="mb-4 parchment-card border-cthulhu-gold/50 text-center max-w-3xl mx-auto">
          <p className="text-cthulhu-gold font-display mb-2">🎲 检定!</p>
          <p className="text-sm text-parchment-300 mb-3">{pendingDiceRequest.explanation}</p>
          {pendingDiceRequest.type === 'skill_check' && (
            <p className="text-xs text-parchment-500 mb-2">
              技能: {pendingDiceRequest.skill} ({pendingDiceRequest.value}%) · 难度: {pendingDiceRequest.difficulty}
            </p>
          )}
          {rolling ? (
            <div className="text-4xl rolling inline-block">🎲</div>
          ) : (
            <button onClick={onDiceRoll} className="parchment-btn text-lg px-8 py-3">
              🎲 掷骰子!
            </button>
          )}
          {diceResult && (
            <div className="mt-3 text-lg font-display text-cthulhu-gold">
              结果: {diceResult.individual.join(' + ')} = {diceResult.total}
            </div>
          )}
        </div>
      )}

      {/* 4 Options */}
      {options.length > 0 && !isStreaming && (
        <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto mb-3">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onOptionClick(opt)}
              className="parchment-card text-left hover:border-cthulhu-gold/50 transition-all
                         cursor-pointer text-sm hover:bg-parchment-800/40"
            >
              <span className="text-cthulhu-gold font-display mr-2 text-base">
                {'①②③④'[i]}
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Text Input */}
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onToggleTextInput}
          className="parchment-btn text-xs mb-2"
        >
          {showTextInput ? '📝 关闭输入' : '📝 自由输入'}
        </button>

        {showTextInput && (
          <form onSubmit={onTextSubmit}>
            <input
              type="text"
              value={textInput}
              onChange={e => onTextInputChange(e.target.value)}
              placeholder="输入你的行动..."
              className="parchment-input"
              disabled={isStreaming}
            />
          </form>
        )}
      </div>

      {isStreaming && (
        <div className="text-center text-parchment-500 text-sm animate-pulse mt-3">
          守秘人正在叙述...
        </div>
      )}
    </div>
  )
}
