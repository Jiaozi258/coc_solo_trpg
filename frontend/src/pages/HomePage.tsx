import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { listModules, listCharacters, listSessions, createSession, uploadModule } from '../api/client'
import type { Module, Character, GameSession } from '../types'

export default function HomePage() {
  const { isLoggedIn } = useAuthStore()
  const [modules, setModules] = useState<Module[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    Promise.all([
      listModules().then(r => setModules(r.data)),
      listCharacters().then(r => setCharacters(r.data)),
      listSessions().then(r => setSessions(r.data)),
    ]).catch(console.error)
  }, [isLoggedIn])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadModule(file)
      const r = await listModules()
      setModules(r.data)
    } catch (err: any) {
      alert('上传失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
    }
  }

  const handleNewSession = async (moduleId: string, characterId: string) => {
    try {
      const r = await createSession(moduleId, characterId, 0)
      window.location.href = `/game/${r.data.id}`
    } catch (err: any) {
      alert('创建会话失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h2 className="text-4xl font-display text-cthulhu-gold horror-text mb-6">
          面对未知的恐怖
        </h2>
        <p className="text-parchment-300 mb-8 text-lg leading-relaxed">
          上传你的 COC 模组 PDF，创建调查员角色，由 AI 守秘人带你进入
          克苏鲁神话的黑暗世界。独自体验最纯正的第七版跑团乐趣。
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/login" className="parchment-btn text-lg px-8 py-3">
            开始冒险
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-3 gap-6 text-left">
          <div className="parchment-card">
            <h3 className="font-display text-cthulhu-gold mb-2">📜 PDF 模组解析</h3>
            <p className="text-sm text-parchment-400">上传任意 COC 模组 PDF，AI 自动理解剧情线和关键线索。</p>
          </div>
          <div className="parchment-card">
            <h3 className="font-display text-cthulhu-gold mb-2">🎲 完整七版规则</h3>
            <p className="text-sm text-parchment-400">d100 技能检定、大成功/大失败、伤害骰、SAN 检定，全部内置。</p>
          </div>
          <div className="parchment-card">
            <h3 className="font-display text-cthulhu-gold mb-2">⏱️ 时空回档</h3>
            <p className="text-sm text-parchment-400">每一步自动存档，随时可以回溯到任意时间节点尝试不同选择。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Module Upload */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-display text-cthulhu-gold horror-text">📜 模组管理</h2>
          <label className="parchment-btn cursor-pointer">
            {uploading ? '上传中...' : '上传 PDF 模组'}
            <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
        {modules.length === 0 ? (
          <div className="parchment-card text-center py-8 text-parchment-500">
            暂无模组。上传一个 PDF 模组文件开始冒险。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {modules.map(m => (
              <div key={m.id} className="parchment-card flex justify-between items-center">
                <div>
                  <h3 className="font-display text-parchment-200">{m.title}</h3>
                  <p className="text-xs text-parchment-500">
                    {m.filename} · {m.chunks_count} 个文本块
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Start New Game */}
      {/* Game start — show if prerequisites met, or show hints */}
      <section className="mb-8">
        {modules.length > 0 && characters.length > 0 ? (
          <div className="parchment-card">
            <h2 className="text-xl font-display text-cthulhu-gold mb-4">🎮 开始新游戏</h2>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm text-parchment-400">选择模组</label>
                <select id="module-select" className="parchment-input mt-1">
                  {modules.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm text-parchment-400">选择调查员</label>
                <select id="char-select" className="parchment-input mt-1">
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.occupation})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  const mid = (document.getElementById('module-select') as HTMLSelectElement).value
                  const cid = (document.getElementById('char-select') as HTMLSelectElement).value
                  handleNewSession(mid, cid)
                }}
                className="parchment-btn"
              >
                开始跑团
              </button>
            </div>
          </div>
        ) : modules.length === 0 && characters.length === 0 ? (
          <div className="parchment-card text-center py-6 text-parchment-500">
            <p>上传一个 PDF 模组并创建一个调查员即可开始冒险</p>
          </div>
        ) : modules.length === 0 ? (
          <div className="parchment-card text-center py-6 text-parchment-500">
            <p>👆 请先上传 PDF 模组文件</p>
          </div>
        ) : (
          <div className="parchment-card text-center py-6">
            <p className="text-parchment-500 mb-2">已有模组，但还没有调查员</p>
            <Link to="/characters" className="parchment-btn text-sm">去创建调查员</Link>
          </div>
        )}
      </section>

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <section>
          <h2 className="text-xl font-display text-cthulhu-gold mb-4">📖 进行中的冒险</h2>
          <div className="grid grid-cols-2 gap-4">
            {sessions.filter(s => s.status === 'active').map(s => (
              <Link key={s.id} to={`/game/${s.id}`} className="parchment-card hover:border-cthulhu-gold/50 transition-colors">
                <h3 className="font-display text-parchment-200">会话 {s.id.slice(0, 8)}</h3>
                <p className="text-xs text-parchment-500">{new Date(s.created_at!).toLocaleString()}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
