import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import { useSSE } from '../hooks/useSSE'
import { useDice, resolveD100 } from '../hooks/useDice'
import { getSession, getSettings } from '../api/client'
import { useLayoutStore } from '../store/layoutStore'
import type { Character, DiceRequest } from '../types'

import ResourceBar from '../components/ResourceBar'
import MapArea from '../components/MapArea'
import CharacterPanel from '../components/CharacterPanel'
import DialogueBox from '../components/DialogueBox'
import OptionGrid from '../components/OptionGrid'
import DiceLog from '../components/DiceLog'
import SanEffect from '../components/SanEffect'

export default function GamePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)!
  const { streamAction } = useSSE()
  const { roll, rolling, result: diceResult, check: diceCheck } = useDice()
  const store = useGameStore()
  const setDerivedStats = useGameStore((s) => s.setDerivedStats)
  const setCharacterClick = useLayoutStore((s) => s.setCharacterClick)

  const [character, setCharacter] = useState<Character | null>(null)
  const [moduleId, setModuleId] = useState<string>()
  const [showPanel, setShowPanel] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [pendingDiceRequest, setPendingDiceRequest] = useState<DiceRequest | null>(null)
  const [showTokenUsage, setShowTokenUsage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sanShock, setSanShock] = useState(false)
  const [diceCanvasKey, setDiceCanvasKey] = useState(0)

  // Register 【人物】button handler in top bar
  useEffect(() => {
    setCharacterClick(() => setShowPanel(true))
    return () => setCharacterClick(null)
  }, [setCharacterClick])

  // Escape to close character panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPanel) {
        setShowPanel(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPanel])

  // Load settings for token display toggle
  useEffect(() => {
    getSettings().then(r => setShowTokenUsage(!!r.data.show_token_usage)).catch(() => {})
  }, [])

  // Load session + character
  useEffect(() => {
    if (!sessionId || !token) return
    setLoading(true)
    getSession(sessionId).then(r => {
      if (r.data.character) {
        setCharacter(r.data.character)
        setDerivedStats(r.data.character.derived_stats)
      }
      setModuleId(r.data.module_id)
    }).catch((err) => {
        console.error(err)
        useGameStore.getState().setError('Failed to load session')
      }).finally(() => setLoading(false))
  }, [sessionId, token, setDerivedStats])

  const handleAction = useCallback(async (action: string, diceRes: any = null) => {
    if (!sessionId || !token) return
    store.setStreaming(true)
    store.setError(null)
    store.resetNarrative()
    store.setOptions([])

    streamAction(sessionId, action, token, diceRes, {
      onNarrative: (text, final) => store.appendNarrative(text, final),
      onOptions: (opts) => store.setOptions(opts),
      onDiceRequest: (req) => {
        store.setDiceRequest(req)
        setPendingDiceRequest(req)
      },
      onStatusUpdate: (update) => {
        const prevSan = store.derivedStats?.SAN_current ?? 0
        store.applyStatusUpdate(update)
        const newSan = store.derivedStats?.SAN_current ?? 0
        if (prevSan - newSan >= 9) {
          setSanShock(true)
          setTimeout(() => setSanShock(false), 100)
        }
      },
      onDone: () => {
        store.setStreaming(false)
        store.incrementTurn()
      },
      onError: (err) => {
        store.setError(err)
        store.setStreaming(false)
      },
      onUsage: (usage) => store.addTokenUsage(usage),
    })
  }, [sessionId, token, streamAction, store])

  const handleDiceRoll = () => {
    if (!pendingDiceRequest) return
    const result = roll(pendingDiceRequest)
    const req = pendingDiceRequest
    const check = req.type === 'skill_check' && req.value != null
      ? resolveD100(result.total, req.value)
      : null
    setDiceCanvasKey(k => k + 1)
    setTimeout(() => {
      setPendingDiceRequest(null)
      store.setDiceResult(result)
      if (check) {
        store.addDiceLog({
          skill: req.skill,
          roll: result.total,
          target: req.value ?? 0,
          success: check.success,
          level: check.level,
        })
      }
      handleAction(`[Roll: ${result.total} | ${result.individual.join(', ')}]`, result)
    }, 2200)
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim()) return
    handleAction(textInput)
    setTextInput('')
  }

  const stats = useMemo(() => store.derivedStats || {
    HP_current: 0, HP_max: 1,
    SAN_current: 0, SAN_max: 1,
    MP_current: 0, MP_max: 1,
    MOV: 0, BUILD: 0, DODGE: 0,
  }, [store.derivedStats])

  return (
    <div className="flex flex-col flex-1 bg-felt relative">
      <SanEffect trigger={sanShock} />
      {/* ── Resource Bar ── */}
      <div style={{ borderBottom: '1px solid rgba(197,165,102,0.1)' }}>
        <ResourceBar
          hp={{ current: stats.HP_current ?? 0, max: stats.HP_max ?? 1 }}
          san={{ current: stats.SAN_current ?? 0, max: stats.SAN_max ?? 1 }}
          mp={{ current: stats.MP_current ?? 0, max: stats.MP_max ?? 1 }}
          gold={0}
        />
        {/* Token usage + Turn counter */}
        <div className="flex justify-between items-end px-4 pb-1.5">
          <span className="text-[0.6rem] font-display tracking-wider" style={{ color: 'rgba(197,165,102,0.45)' }}>
            第 {store.turnCount} 回合
          </span>
          {showTokenUsage && (
            <span className="text-[0.55rem] font-mono" style={{ color: 'rgba(197,165,102,0.5)' }}>
              入:{store.tokenUsage.input_tokens}
              <span className="mx-1" style={{ color: 'rgba(197,165,102,0.25)' }}>|</span>
              出:{store.tokenUsage.output_tokens}
              <span className="mx-1" style={{ color: 'rgba(197,165,102,0.25)' }}>|</span>
              总:{store.tokenUsage.total_tokens}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div
            className="w-8 h-8 border-2 rounded-full"
            style={{
              borderColor: 'rgba(197,165,102,0.2)',
              borderTopColor: 'var(--color-ash-gold)',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p className="text-sm" style={{ color: 'rgba(197,165,102,0.4)' }}>正在加载冒险...<br/><span className="text-xs">让守秘人翻开模组的扉页...</span></p>
        </div>
      ) : (
      <>
      {/* ── Main content: Left (2/3) + Right (1/3) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column */}
        <div className="flex flex-col overflow-y-auto" style={{ flex: '2' }}>
          {/* Map */}
          <MapArea moduleId={moduleId} />

          {/* Dialogue */}
          <DialogueBox
            narrative={store.narrative}
            isStreaming={store.isStreaming}
            error={store.error}
          />

          {/* Options */}
          <OptionGrid
            options={store.options}
            isStreaming={store.isStreaming}
            showTextInput={showTextInput}
            showDice={store.showDice}
            pendingDiceRequest={pendingDiceRequest}
            diceResult={diceResult}
            diceCheck={diceCheck}
            rolling={rolling}
            textInput={textInput}
            onOptionClick={handleAction}
            onDiceRoll={handleDiceRoll}
            onTextSubmit={handleTextSubmit}
            onTextInputChange={setTextInput}
            onToggleTextInput={() => setShowTextInput(!showTextInput)}
            onDiceResultComplete={() => {}}
            diceCanvasKey={diceCanvasKey}
          />
        </div>

        {/* Right Sidebar — Collapsible */}
        <div
          className="flex-shrink-0 overflow-y-auto p-3 pl-0"
          style={{ flex: '1', borderLeft: '1px solid rgba(139,109,69,0.1)' }}
        >
          <div className="parchment-card paper-tilt-r p-3 mx-2">
            <details className="group" open>
              <summary className="text-[0.65rem] font-display tracking-wider cursor-pointer select-none"
                       style={{ color: 'var(--color-ash-dark-brown)' }}>
                角色状态
              </summary>
              <div className="mt-2 space-y-1.5 text-[0.6rem] font-mono" style={{ color: 'var(--color-ash-dark-brown)' }}>
                {character ? (
                  <>
                    <div className="flex justify-between">
                      <span>{character.name}</span>
                      <span style={{ color: 'rgba(60,40,20,0.4)' }}>{character.occupation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HP</span>
                      <span>{stats.HP_current ?? 0} / {stats.HP_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SAN</span>
                      <span>{stats.SAN_current ?? 0} / {stats.SAN_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MP</span>
                      <span>{stats.MP_current ?? 0} / {stats.MP_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MOV / DODGE</span>
                      <span>{stats.MOV ?? 0} / {stats.DODGE ?? 0}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs italic" style={{ color: 'rgba(197,165,102,0.35)' }}>Loading...</p>
                )}
              </div>
            </details>
          </div>

          <div className="parchment-card paper-tilt-r p-3 mx-2 mt-2">
            <details open>
              <summary className="text-[0.65rem] font-display tracking-wider cursor-pointer select-none"
                       style={{ color: 'var(--color-ash-dark-brown)' }}>
                骰子日志
              </summary>
              <div className="mt-2">
                <DiceLog entries={store.diceLog} />
              </div>
            </details>
          </div>

          {/* Timeline + Exit */}
          <div className="flex gap-2 mt-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="text-[0.6rem] font-display tracking-wider px-4 py-1.5 rounded"
              style={{
                background: 'rgba(139,69,19,0.15)',
                border: '1px solid rgba(139,69,19,0.2)',
                color: 'var(--color-ash-dark-brown)',
              }}
            >
              Leave Table
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── Character Panel (slide-out) ── */}
      <CharacterPanel
        show={showPanel}
        onClose={() => setShowPanel(false)}
        character={character}
        derivedStats={store.derivedStats}
      />
    </div>
  )
}
