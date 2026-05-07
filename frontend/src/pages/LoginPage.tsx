import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { login, register, guestLogin } from '../api/client'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const authLogin = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = isRegister ? register : login
      const r = await fn(username, password)
      authLogin(r.data.access_token, username)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleGuestLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const r = await guestLogin()
      authLogin(r.data.access_token, r.data.username)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || '游客登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="parchment-card">
        <h2 className="text-2xl font-display text-cthulhu-gold horror-text text-center mb-6">
          {isRegister ? '创建账号' : '登录'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-parchment-400">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="parchment-input mt-1"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="text-sm text-parchment-400">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="parchment-input mt-1"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-cthulhu-blood text-sm bg-cthulhu-blood/10 border border-cthulhu-blood/30 rounded p-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="parchment-btn w-full text-center">
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <div className="mt-3 pt-3 border-t border-parchment-700/30">
          <button
            onClick={handleGuestLogin}
            disabled={loading}
            className="parchment-btn w-full text-center text-parchment-400 hover:text-parchment-200"
          >
            以游客身份游玩
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm text-parchment-400 hover:text-cthulhu-gold transition-colors"
          >
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
      </div>
    </div>
  )
}
