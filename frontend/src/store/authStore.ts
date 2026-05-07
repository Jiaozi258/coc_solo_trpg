import { create } from 'zustand'

interface AuthState {
  token: string | null
  username: string | null
  isLoggedIn: boolean
  login: (token: string, username: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  isLoggedIn: !!localStorage.getItem('token'),
  login: (token, username) => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
    set({ token, username, isLoggedIn: true })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    set({ token: null, username: null, isLoggedIn: false })
  },
}))
