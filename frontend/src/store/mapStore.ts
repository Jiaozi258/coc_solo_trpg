import { create } from 'zustand'
import type { LocationNode } from '../types'

interface MapState {
  locations: LocationNode[]
  navStack: LocationNode[][]
  currentLocations: LocationNode[]
  mapMode: 'world' | 'local'
  isCollapsed: boolean

  setLocations: (tree: LocationNode[]) => void
  navigateTo: (location: LocationNode) => void
  navigateBack: () => void
  toggleMapMode: () => void
  toggleCollapsed: () => void
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  navStack: [],
  currentLocations: [],
  mapMode: 'world',
  isCollapsed: false,

  setLocations: (tree) => {
    set({ locations: tree, currentLocations: tree, navStack: [] })
  },

  navigateTo: (location) => {
    set((s) => ({
      navStack: [...s.navStack, s.currentLocations],
      currentLocations: location.children,
      mapMode: 'local',
    }))
  },

  navigateBack: () => {
    const { navStack } = get()
    if (navStack.length === 0) return
    const prevStack = [...navStack]
    const parent = prevStack.pop() || get().locations
    set({
      navStack: prevStack,
      currentLocations: parent,
      mapMode: prevStack.length === 0 ? 'world' : 'local',
    })
  },

  toggleMapMode: () => {
    set((s) => ({ mapMode: s.mapMode === 'world' ? 'local' : 'world' }))
  },

  toggleCollapsed: () => {
    set((s) => ({ isCollapsed: !s.isCollapsed }))
  },
}))
