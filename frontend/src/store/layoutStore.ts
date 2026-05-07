import { create } from 'zustand'

interface LayoutState {
  onCharacterClick: (() => void) | null
  setCharacterClick: (fn: (() => void) | null) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  onCharacterClick: null,
  setCharacterClick: (fn) => set({ onCharacterClick: fn }),
}))
