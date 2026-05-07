import { create } from 'zustand'
import type { DerivedStats, DiceRequest, StatusUpdate } from '../types'

interface GameState {
  narrative: string
  options: string[]
  diceRequest: DiceRequest | null
  showDice: boolean
  diceResult: any | null
  derivedStats: DerivedStats | null
  isStreaming: boolean
  error: string | null

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
  reset: () =>
    set({
      narrative: '',
      options: [],
      diceRequest: null,
      showDice: false,
      diceResult: null,
      isStreaming: false,
      error: null,
    }),
}))
