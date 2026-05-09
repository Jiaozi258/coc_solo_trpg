import { useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLayoutStore } from '../store/layoutStore'
import SettingsPage from '../pages/SettingsPage'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, username, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const onCharacterClick = useLayoutStore((s) => s.onCharacterClick)
  const [showSettings, setShowSettings] = useState(false)

  const isInGame = location.pathname.startsWith('/game/')

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleOpenSettings = useCallback(() => setShowSettings(true), [])
  const handleCloseSettings = useCallback(() => setShowSettings(false), [])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-ash-black)' }}>
      {/* ── Top Header ── */}
      <header
        className="sticky top-0 z-40 border-b px-4 py-2 flex items-center justify-between"
        style={{
          borderColor: 'rgba(197,165,102,0.15)',
          background: 'rgba(22,19,17,0.95)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-ash-gold">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <h1
            className="text-sm tracking-wider leading-none"
            style={{
              fontFamily: 'var(--font-gothic)',
              color: 'var(--color-ash-gold)',
              letterSpacing: '0.12em',
            }}
          >
            ARKHAM STRONGHOLD
          </h1>
        </Link>

        {/* Nav Menu */}
        <nav className="flex items-center gap-2">
          {/* Game nav buttons — only visible during gameplay */}
          {isInGame && onCharacterClick && (
            <button onClick={onCharacterClick} className="ash-btn text-[0.6rem] ash-btn-active">
              人物
            </button>
          )}

          {isLoggedIn ? (
            <>
              <Link to="/characters" className="ash-btn text-[0.6rem]">角色</Link>
              <Link to="/cards" className="ash-btn text-[0.6rem]">对话</Link>
              <Link to="/lorebooks" className="ash-btn text-[0.6rem]">世界书</Link>
              <button onClick={handleOpenSettings} className="ash-btn text-[0.6rem]">Settings</button>
              <span className="text-[0.6rem] text-ash-parchment-dim font-mono ml-1">{username}</span>
              <button onClick={handleLogout} className="ash-btn text-[0.6rem]">Exit</button>
            </>
          ) : (
            <Link to="/login" className="ash-btn text-[0.6rem]">Login</Link>
          )}
        </nav>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-12"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={handleCloseSettings}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 rounded"
            style={{
              background: 'var(--color-ash-black)',
              border: '1px solid rgba(197,165,102,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleCloseSettings}
              className="absolute top-3 right-3 text-ash-parchment-dim hover:text-ash-gold text-lg z-10"
              style={{ width: 32, height: 32, lineHeight: '32px', textAlign: 'center' }}
            >
              ✕
            </button>
            <SettingsPage />
          </div>
        </div>
      )}
    </div>
  )
}
