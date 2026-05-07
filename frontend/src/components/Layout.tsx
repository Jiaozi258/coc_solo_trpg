import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLayoutStore } from '../store/layoutStore'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, username, logout } = useAuthStore()
  const navigate = useNavigate()
  const onCharacterClick = useLayoutStore((s) => s.onCharacterClick)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-parchment-700/30 bg-parchment-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="text-3xl">🐙</span>
            <div>
              <h1 className="text-lg font-display text-cthulhu-gold horror-text">
                克苏鲁的召唤
              </h1>
              <p className="text-xs text-parchment-500 -mt-1">单人跑团模拟器</p>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            <Link to="/" className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors">
              首页
            </Link>
            {isLoggedIn ? (
              <>
                <Link to="/characters" className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors">
                  调查员
                </Link>
                {onCharacterClick && (
                  <button
                    onClick={onCharacterClick}
                    className="text-sm text-parchment-300 hover:text-cthulhu-gold transition-colors font-display"
                  >
                    👤 人物
                  </button>
                )}
                <span className="text-sm text-parchment-400">{username}</span>
                <button onClick={handleLogout} className="parchment-btn text-xs">
                  登出
                </button>
              </>
            ) : (
              <Link to="/login" className="parchment-btn text-xs">
                登录
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-parchment-700/20 py-3 text-center text-xs text-parchment-600">
        Call of Cthulhu is a registered trademark of Chaosium Inc. This is a fan-made simulator.
      </footer>
    </div>
  )
}
