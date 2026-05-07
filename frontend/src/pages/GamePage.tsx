import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import { useSSE } from '../hooks/useSSE'
import { useDice } from '../hooks/useDice'
import { getSession } from '../api/client'
import { useLayoutStore } from '../store/layoutStore'
import type { Character } from '../types'

import MapArea from '../components/MapArea'
import CharacterPanel from '../components/CharacterPanel'
import DialogueBox from '../components/DialogueBox'
import OptionGrid from '../components/OptionGrid'
import TimelineModal from '../components/TimelineModal'

export default function GamePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)!
  const { streamAction } = useSSE()
  const { roll, rolling, result: diceResult, setResult } = useDice()
  const store = useGameStore()
  const setCharacterClick = useLayoutStore((s) => s.setCharacterClick)

  const [character, setCharacter] = useState<Character | null>(null)
  const [moduleId, setModuleId] = useState<string>()
  const [showPanel, setShowPanel] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [pendingDiceRequest, setPendingDiceRequest] = useState<any>(null)

  // Register 【人物】button in top bar
  useEffect(() => {
    setCharacterClick(() => setShowPanel(true))
    return () => setCharacterClick(null)
  }, [setCharacterClick])

  // Load session + character
  useEffect(() => {
    if (!sessionId || !token) return
    getSession(sessionId).then(r => {
      if (r.data.character) {
        setCharacter(r.data.character)
        store.setDerivedStats(r.data.character.derived_stats)
      }
      setModuleId(r.data.module_id)
    }).catch(console.error)
  }, [sessionId, token, store])

  const handleAction = useCallback(async (action: string, diceRes: any = null) => {
    if (!sessionId || !token) return
    store.setStreaming(true)
    store.setError(null)
    store.resetNarrative()
    store.setOptions([])

    streamAction(sessionId, action, token, diceRes, {
      onNarrative: (text) => store.appendNarrative(text),
      onOptions: (opts) => store.setOptions(opts),
      onDiceRequest: (req) => {
        store.setDiceRequest(req)
        setPendingDiceRequest(req)
      },
      onStatusUpdate: (update) => store.applyStatusUpdate(update),
      onDone: () => store.setStreaming(false),
      onError: (err) => {
        store.setError(err)
        store.setStreaming(false)
      },
    })
  }, [sessionId, token, streamAction, store])

  const handleDiceRoll = () => {
    if (!pendingDiceRequest) return
    const result = roll(pendingDiceRequest)
    const req = pendingDiceRequest
    setPendingDiceRequest(null)
    setTimeout(() => {
      store.setDiceResult(result)
      handleAction(`[掷骰结果: ${result.total}，骰值: ${result.individual.join(', ')}]`, result)
    }, 1500)
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim()) return
    handleAction(textInput)
    setTextInput('')
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Map Area — top full-width */}
      <MapArea moduleId={moduleId} />

      {/* Dialogue — middle flex area */}
      <DialogueBox
        narrative={store.narrative}
        isStreaming={store.isStreaming}
        error={store.error}
      />

      {/* Options — bottom */}
      <OptionGrid
        options={store.options}
        isStreaming={store.isStreaming}
        showTextInput={showTextInput}
        showDice={store.showDice}
        pendingDiceRequest={pendingDiceRequest}
        diceResult={diceResult}
        rolling={rolling}
        textInput={textInput}
        onOptionClick={handleAction}
        onDiceRoll={handleDiceRoll}
        onTextSubmit={handleTextSubmit}
        onTextInputChange={setTextInput}
        onToggleTextInput={() => setShowTextInput(!showTextInput)}
      />

      {/* Bottom utility bar */}
      <div className="flex gap-2 justify-center pb-3 bg-parchment-950/90">
        <button onClick={() => setShowTimeline(true)} className="parchment-btn text-xs">⏱️ 历史回档</button>
        <button onClick={() => navigate('/')} className="parchment-btn text-xs">退出</button>
      </div>

      {/* Character Panel — slide-out */}
      <CharacterPanel
        show={showPanel}
        onClose={() => setShowPanel(false)}
        character={character}
        derivedStats={store.derivedStats}
      />

      {/* Timeline Modal */}
      <TimelineModal
        show={showTimeline}
        onClose={() => setShowTimeline(false)}
        sessionId={sessionId!}
      />
    </div>
  )
}
