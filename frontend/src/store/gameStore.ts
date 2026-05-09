import { create } from 'zustand'
import type { DerivedStats, DiceRequest, StatusUpdate, TokenUsage } from '../types'

interface GameState {
  narrative: string
  options: string[]
  diceRequest: DiceRequest | null
  showDice: boolean
  diceResult: any | null
  derivedStats: DerivedStats | null
  isStreaming: boolean
  error: string | null
  tokenUsage: TokenUsage
  turnCount: number

  appendNarrative: (text: string) => void
  resetNarrative: () => void
  setOptions: (opts: string[]) => void
  setDiceRequest: (req: DiceRequest | null) => void
  setShowDice: (show: boolean) => void
  setDiceResult: (result: any) => void
  applyStatusUpdate: (update: StatusUpdate) => void
  setDerivedStats: (stats: DerivedStats) => void
  setStreaming: (v: boolean) => void
  setError: (err: string | null) => void
  addTokenUsage: (usage: TokenUsage) => void
  incrementTurn: () => void
  reset: () => void
}

export const useGameStore = create<GameState>((set) => ({
  narrative: '',
  options: [],
  diceRequest: null,
  showDice: false,
  diceResult: null,
  derivedStats: null,
  isStreaming: false,
  error: null,
  tokenUsage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  turnCount: 0,

  appendNarrative: (text) => set((s) => ({ narrative: s.narrative + text })),
  resetNarrative: () => set({ narrative: '' }),
  setOptions: (opts) => set({ options: opts }),
  setDiceRequest: (req) => set({ diceRequest: req, showDice: req !== null }),
  setShowDice: (show) => set({ showDice: show }),
  setDiceResult: (result) => set({ diceResult: result, showDice: false, diceRequest: null }),
  applyStatusUpdate: (update) =>
    set((s) => {
      if (!s.derivedStats) return s
      const stats = { ...s.derivedStats }
      if (update.HP_change) stats.HP_current = Math.max(0, Math.min(stats.HP_current + update.HP_change, stats.HP_max))
      if (update.SAN_change) stats.SAN_current = Math.max(0, Math.min(stats.SAN_current + update.SAN_change, stats.SAN_max))
      if (update.MP_change) stats.MP_current = Math.max(0, Math.min(stats.MP_current + update.MP_change, stats.MP_max))
      return { derivedStats: stats }
    }),
  setDerivedStats: (stats) => set({ derivedStats: stats }),
  setStreaming: (v) => set({ isStreaming: v }),
  setError: (err) => set({ error: err }),
  addTokenUsage: (usage) => set((s) => ({
    tokenUsage: {
      input_tokens: s.tokenUsage.input_tokens + usage.input_tokens,
      output_tokens: s.tokenUsage.output_tokens + usage.output_tokens,
      total_tokens: s.tokenUsage.total_tokens + usage.total_tokens,
    },
  })),
  incrementTurn: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  reset: () =>
    set({
      narrative: '',
      options: [],
      diceRequest: null,
      showDice: false,
      diceResult: null,
      derivedStats: null,
      isStreaming: false,
      error: null,
      tokenUsage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      turnCount: 0,
    }),
}))
