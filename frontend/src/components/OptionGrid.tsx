import type { DiceRequest, DiceCheckResult } from '../types'
import DiceCanvas from './DiceCanvas'
import { playDiceSound } from '../utils/diceSound'

interface DiceResult {
  expression: string
  individual: number[]
  total: number
}


interface OptionGridProps {
  options: string[]
  isStreaming: boolean
  showTextInput: boolean
  showDice: boolean
  pendingDiceRequest: DiceRequest | null
  diceResult: DiceResult | null
  diceCheck: DiceCheckResult | null
  rolling: boolean
  textInput: string
  onOptionClick: (option: string) => void
  onDiceRoll: () => void
  onTextSubmit: (e: React.FormEvent) => void
  onTextInputChange: (value: string) => void
  onToggleTextInput: () => void
  onDiceResultComplete?: () => void
  diceCanvasKey?: number
}

const OPTION_LABELS = ['I', 'II', 'III', 'IV']

function DiceSVG() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold)" strokeWidth="1" className="animate-bounce">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1.2" fill="var(--color-ash-gold)" />
      <circle cx="16" cy="16" r="1.2" fill="var(--color-ash-gold)" />
      <circle cx="8" cy="16" r="1.2" fill="var(--color-ash-gold)" />
      <circle cx="16" cy="8" r="1.2" fill="var(--color-ash-gold)" />
    </svg>
  )
}

export default function OptionGrid({
  options, isStreaming, showTextInput, showDice, pendingDiceRequest,
  diceResult, diceCheck, rolling, textInput,
  onOptionClick, onDiceRoll, onTextSubmit, onTextInputChange, onToggleTextInput,
  onDiceResultComplete,
}: OptionGridProps) {
  return (
    <div className="parchment-card px-4 py-3 mx-3 mb-2 paper-tilt-none">
      {/* Dice Overlay */}
      {showDice && pendingDiceRequest && (
        <div className="mb-3 ash-card-gold p-4 text-center" style={{ animation: 'slideUpIn 0.3s ease-out' }}>
          <p className="font-display text-sm text-ash-gold mb-2" style={{ letterSpacing: '0.1em' }}>
            SKILL CHECK
          </p>
          <p className="text-xs text-ash-parchment-dim mb-2">{pendingDiceRequest.explanation}</p>
          {pendingDiceRequest.type === 'skill_check' && (
            <p className="text-[0.6rem] text-ash-parchment-dim font-mono mb-3">
              {pendingDiceRequest.skill} ({pendingDiceRequest.value}%) · {pendingDiceRequest.difficulty}
            </p>
          )}
          {rolling ? (
            <div className="flex justify-center"><DiceSVG /></div>
          ) : (
            <button
              onClick={() => {
              playDiceSound()
              onDiceRoll()
            }}
              className="ash-btn text-sm px-8 py-2"
              style={{ borderColor: 'rgba(197,165,102,0.5)' }}
            >
              Roll Dice
            </button>
          )}
          {rolling && diceResult && (
            <div className="flex justify-center py-2">
              <DiceCanvas
                rolling={rolling}
                result={diceResult.total}
                onDone={() => onDiceResultComplete?.()}
              />
            </div>
          )}

          {diceResult && !rolling && diceCheck && (
            <div className={`text-center py-2 px-3 rounded ${diceCheck.success ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'}`}>
              <span className={`font-display text-sm ${diceCheck.success ? 'text-green-400' : 'text-red-400'}`}>
                {diceCheck.success ? 'SUCCESS' : 'FAILURE'}
              </span>
              <span className="text-xs text-ash-parchment-dim ml-2">{diceCheck.label}</span>
              <div className="text-[0.6rem] text-ash-parchment-dim font-mono mt-0.5">
                {diceResult.individual.join(' + ')} = {diceResult.total}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4 Options in 2x2 Grid with stagger animation */}
      {options.length > 0 && !isStreaming && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onOptionClick(opt)}
              className={`option-btn flex items-start gap-2 stagger-item stagger-delay-${i + 1}`}
            >
              <span className="font-mono text-[0.6rem] text-ash-gold-dim mt-0.5 flex-shrink-0">
                {OPTION_LABELS[i] || i + 1}
              </span>
              <span className="text-sm">{opt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Text input toggle */}
      <div className="flex items-center gap-2">
        <button onClick={onToggleTextInput} className="ash-btn text-[0.6rem]">
          {showTextInput ? 'Close Input' : 'Free Input'}
        </button>

        <div
          style={{
            flex: 1,
            maxHeight: showTextInput ? '40px' : '0',
            opacity: showTextInput ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.25s ease, opacity 0.2s ease',
          }}
        >
          <form onSubmit={onTextSubmit}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => onTextInputChange(e.target.value)}
              placeholder="Describe your action..."
              className="ash-input w-full text-sm"
              disabled={isStreaming}
            />
          </form>
        </div>

        {isStreaming && (
          <span className="text-xs text-ash-parchment-dim animate-pulse ml-auto font-mono">
            Keeper is narrating...
          </span>
        )}
      </div>
    </div>
  )
}
