import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { listModules, listCharacters, listSessions, createSession, uploadModule, deleteModule, generateModule } from '../api/client'
import AshSelect from '../components/AshSelect'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { Module, Character, GameSession } from '../types'

const NPC_OPTIONS = [
  { value: 'few', label: '少 (2-4个)' },
  { value: 'medium', label: '中等 (5-10个)' },
  { value: 'many', label: '多 (11-20个)' },
]

const ENEMY_OPTIONS = [
  { value: 'few', label: '少 (1-3个)' },
  { value: 'medium', label: '中等 (4-8个)' },
  { value: 'many', label: '多 (9-15个)' },
]

const TONE_OPTIONS = [
  { value: 'dark', label: '沉闷黑暗' },
  { value: 'realistic', label: '现实残酷' },
  { value: 'humorous', label: '幽默欢快' },
  { value: 'mysterious', label: '神秘诡谲' },
  { value: 'heroic', label: '英雄史诗' },
]

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
  { value: 'deadly', label: '致命' },
]

export default function HomePage() {
  const { isLoggedIn } = useAuthStore()
  const [modules, setModules] = useState<Module[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [uploading, setUploading] = useState(false)
  const [delConfirm, setDelConfirm] = useState<{ open: boolean; id: string; title: string }>({ open: false, id: '', title: '' })
  const [genError, setGenError] = useState('')

  // Custom module form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const navigate = useNavigate()
  const moduleSelectRef = useRef<HTMLSelectElement>(null)
  const charSelectRef = useRef<HTMLSelectElement>(null)
  const [genForm, setGenForm] = useState({
    name: '',
    background: '',
    location: '',
    player_count: 1,
    npc_count: 'medium',
    enemy_count: 'few',
    tone: 'dark',
    difficulty: 'medium',
  })

  const refreshData = () => {
    if (!isLoggedIn) return
    Promise.all([
      listModules().then(r => setModules(r.data)),
      listCharacters().then(r => setCharacters(r.data)),
      listSessions().then(r => setSessions(r.data)),
    ]).catch(console.error)
  }

  useEffect(() => {
    refreshData()
  }, [isLoggedIn])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadModule(file)
      refreshData()
    } catch (err: any) {
      toast('上传失败: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteModule = async (id: string) => {
    try {
      await deleteModule(id)
      setModules(prev => prev.filter(m => m.id !== id))
      toast('已删除')
    } catch (err: any) {
      toast('删除失败: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleGenerate = async () => {
    if (!genForm.name.trim() || !genForm.background.trim()) {
      setGenError('请至少填写模组名称和背景故事')
      return
    }
    setGenError('')
    setGenerating(true)
    try {
      const r = await generateModule(genForm)
      setShowCreateForm(false)
      setGenForm({ name: '', background: '', location: '', player_count: 1, npc_count: 'medium', enemy_count: 'few', tone: 'dark', difficulty: 'medium' })
      await refreshData()
      toast(`模组 "${r.data.title}" 已生成！（${r.data.chunks_count} 个文本块）`, 'success')
    } catch (err: any) {
      toast('生成失败: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleNewSession = async (moduleId: string, characterId: string) => {
    try {
      const r = await createSession(moduleId, characterId, 0)
      navigate(`/game/${r.data.id}`)
    } catch (err: any) {
      toast('创建会话失败: ' + (err.response?.data?.detail || err.message), 'error')
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
      {/* Module Upload + Create */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-display text-cthulhu-gold horror-text">📜 模组管理</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="parchment-btn cursor-pointer"
            >
              {showCreateForm ? '取消' : '自建模组'}
            </button>
            <label className="parchment-btn cursor-pointer">
              {uploading ? '上传中...' : '上传 PDF 模组'}
              <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Custom Module Creation Form */}
        <div className={`expand-enter ${showCreateForm ? 'open' : ''}`}>
          <div className="parchment-card mb-4">
            <h3 className="font-display text-cthulhu-gold text-lg mb-4">自建 COC 模组</h3>
            <p className="text-sm text-parchment-400 mb-4">
              填写核心信息，AI 守秘人将自动生成完整的跑团模组故事。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-parchment-300 block mb-1">模组名称 *</label>
                <input
                  type="text"
                  value={genForm.name}
                  onChange={e => setGenForm({ ...genForm, name: e.target.value })}
                  className="parchment-input w-full"
                  placeholder="例如：暗夜低语"
                />
              </div>
              <div>
                <label className="text-sm text-parchment-300 block mb-1">发生地点</label>
                <input
                  type="text"
                  value={genForm.location}
                  onChange={e => setGenForm({ ...genForm, location: e.target.value })}
                  className="parchment-input w-full"
                  placeholder="例如：阿卡姆镇"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-parchment-300 block mb-1">背景故事 *</label>
                <textarea
                  value={genForm.background}
                  onChange={e => setGenForm({ ...genForm, background: e.target.value })}
                  className="parchment-input w-full h-24 resize-none"
                  placeholder="简述故事的起始背景，例如：一名大学教授在整理古籍时发现了一本禁忌之书，随后镇上开始发生离奇的失踪事件..."
                />
              </div>
              <div>
                <label className="text-sm text-parchment-300 block mb-1">游玩人数（含自己）</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={genForm.player_count}
                  onChange={e => setGenForm({ ...genForm, player_count: Number(e.target.value) })}
                  className="parchment-input w-full"
                />
              </div>
              <div>
                <label className="text-sm text-parchment-300 block mb-1">NPC 数量</label>
                <AshSelect
                  value={genForm.npc_count}
                  onChange={v => setGenForm({ ...genForm, npc_count: v })}
                  options={NPC_OPTIONS}
                />
              </div>
              <div>
                <label className="text-sm text-parchment-300 block mb-1">敌人数量</label>
                <AshSelect
                  value={genForm.enemy_count}
                  onChange={v => setGenForm({ ...genForm, enemy_count: v })}
                  options={ENEMY_OPTIONS}
                />
              </div>
              <div>
                <label className="text-sm text-parchment-300 block mb-1">整体基调</label>
                <AshSelect
                  value={genForm.tone}
                  onChange={v => setGenForm({ ...genForm, tone: v })}
                  options={TONE_OPTIONS}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-parchment-300 block mb-1">整体难度</label>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map(o => {
                    const isActive = genForm.difficulty === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setGenForm({ ...genForm, difficulty: o.value })}
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: isActive ? 'var(--color-ash-gold)' : 'var(--color-ash-parchment-dim)',
                          background: isActive ? 'rgba(197,165,102,0.1)' : 'transparent',
                          border: isActive ? '1px solid rgba(197,165,102,0.5)' : '1px solid rgba(197,165,102,0.2)',
                          padding: '6px 16px',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="parchment-btn text-sm px-8 py-2"
              >
                {generating ? 'AI 正在生成模组...' : '生成模组'}
              </button>
              {genError && (
                <p className="text-xs text-ash-red mt-1 text-center">{genError}</p>
              )}
            </div>
          </div>
        </div>

        {modules.length === 0 ? (
          <div className="parchment-card text-center py-8 text-parchment-500">
            暂无模组。上传一个 PDF 模组文件或自建一个模组开始冒险。
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
                <button
                  onClick={() => setDelConfirm({ open: true, id: m.id, title: m.title })}
                  className="text-xs text-ash-red hover:text-ash-red-bright transition-colors px-2 py-1"
                  title="删除模组"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Start New Game */}
      <section className="mb-8">
        {modules.length > 0 && characters.length > 0 ? (
          <div className="parchment-card">
            <h2 className="text-xl font-display text-cthulhu-gold mb-4">🎮 开始新游戏</h2>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm text-parchment-400">选择模组</label>
                <select ref={moduleSelectRef} className="parchment-input mt-1">
                  {modules.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm text-parchment-400">选择调查员</label>
                <select ref={charSelectRef} className="parchment-input mt-1">
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.occupation})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  const mid = moduleSelectRef.current?.value || ''
                  const cid = charSelectRef.current?.value || ''
                  if (mid && cid) handleNewSession(mid, cid)
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
                <p className="text-xs text-parchment-500">{s.created_at ? new Date(s.created_at).toLocaleString() : ''}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
      <ConfirmDialog
        open={delConfirm.open}
        title="删除模组"
        message={`确定要删除「${delConfirm.title}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          handleDeleteModule(delConfirm.id)
          setDelConfirm({ open: false, id: '', title: '' })
        }}
        onCancel={() => setDelConfirm({ open: false, id: '', title: '' })}
      />
    </div>
  )
}
