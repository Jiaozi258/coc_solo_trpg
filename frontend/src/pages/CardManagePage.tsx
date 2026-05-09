import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCards, deleteCard, createCard, importCardPng } from '../api/client'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { CharacterCard } from '../types'

export default function CardManagePage() {
  const [cards, setCards] = useState<CharacterCard[]>([])
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; cardId: string; cardName: string }>({ open: false, cardId: '', cardName: '' })
  const navigate = useNavigate()
  const portraitRef = useRef<HTMLInputElement>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    personality: '',
    background: '',
    relationships: '',
    dialogue_examples: '',
  })
  const [portraitFile, setPortraitFile] = useState<File | null>(null)
  const [portraitPreview, setPortraitPreview] = useState('')

  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    listCards().then(r => setCards(r.data)).catch(() => { toast('加载角色卡失败', 'error'); setLoadError(true) })
  }, [])

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    }
  }, [])

  const handleCreate = async () => {
    if (!form.name.trim()) { toast('请输入角色名称', 'error'); return }
    setCreating(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('personality', form.personality)
      fd.append('background', form.background)
      fd.append('relationships', form.relationships)
      fd.append('dialogue_examples', form.dialogue_examples)
      if (portraitFile) fd.append('portrait', portraitFile)

      await createCard(fd)
      toast('角色卡已创建')
      setShowForm(false)
      setForm({ name: '', personality: '', background: '', relationships: '', dialogue_examples: '' })
      setPortraitFile(null)
      setPortraitPreview('')
      const r = await listCards()
      setCards(r.data)
    } catch (err: any) {
      toast(err.response?.data?.detail || '创建失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const r = await importCardPng(file)
      toast(`已导入角色卡: ${r.data.name}`)
      const cardsResp = await listCards()
      setCards(cardsResp.data)
    } catch (err: any) {
      toast(err.response?.data?.detail || '导入失败，请确认PNG包含角色卡数据', 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteCard(id)
      setCards(prev => prev.filter(c => c.id !== id))
      toast('已删除')
    } catch (err: any) {
      toast('删除失败', 'error')
    }
  }

  const handlePortraitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPortraitFile(file)
      const url = URL.createObjectURL(file)
      setPortraitPreview(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg text-ash-gold tracking-wider" style={{ fontFamily: 'var(--font-gothic)', letterSpacing: '0.12em' }}>
            Character Cards
          </h1>
          <div className="flex gap-2">
            <label className="ash-btn text-[0.6rem] cursor-pointer">
              {importing ? '导入中...' : '导入 PNG'}
              <input type="file" accept=".png" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
            <button
              onClick={() => setShowForm(!showForm)}
              className="ash-btn text-[0.6rem]"
            >
              {showForm ? '取消' : '自定义角色'}
            </button>
          </div>
        </div>

        {/* Create Form */}
        <div className={`expand-enter ${showForm ? 'open' : ''}`}>
          <div className="ash-card-gold p-4 mb-6">
            <h3 className="ash-section-title block mb-3">自定义角色卡</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">角色名称 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="ash-input w-full"
                  placeholder="例如：夏洛克·福尔摩斯"
                />
              </div>
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">立绘</label>
                <input
                  ref={portraitRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handlePortraitChange}
                />
                <button onClick={() => portraitRef.current?.click()} className="ash-btn text-[0.6rem]">
                  {portraitFile ? portraitFile.name : '选择图片'}
                </button>
                {portraitPreview && (
                  <img src={portraitPreview} alt="preview" className="mt-2 h-20 rounded border border-ash-border" />
                )}
              </div>
              <div className="col-span-2">
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">人物性格</label>
                <textarea
                  value={form.personality}
                  onChange={e => setForm({ ...form, personality: e.target.value })}
                  className="ash-input w-full h-20 resize-none"
                  placeholder="描述角色性格特征、说话风格、习惯用语等..."
                />
              </div>
              <div className="col-span-2">
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">背景故事</label>
                <textarea
                  value={form.background}
                  onChange={e => setForm({ ...form, background: e.target.value })}
                  className="ash-input w-full h-20 resize-none"
                  placeholder="角色的生平经历、世界观背景..."
                />
              </div>
              <div className="col-span-2">
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">人物关系</label>
                <textarea
                  value={form.relationships}
                  onChange={e => setForm({ ...form, relationships: e.target.value })}
                  className="ash-input w-full h-16 resize-none"
                  placeholder="与其他角色的关系、社会地位、所属组织..."
                />
              </div>
              <div className="col-span-2">
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">
                  对话示例（越详细越好，AI 会参考学习）
                </label>
                <textarea
                  value={form.dialogue_examples}
                  onChange={e => setForm({ ...form, dialogue_examples: e.target.value })}
                  className="ash-input w-full h-32 resize-none"
                  placeholder={`角色：\"你终于来了。\"\n玩家：\"抱歉，路上耽搁了。\"\n角色：\"没关系，重要的是你到了。来看看这个...\"`}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleCreate} disabled={creating} className="ash-btn text-sm px-8 py-2">
                {creating ? '创建中...' : '保存角色卡'}
              </button>
            </div>
          </div>
        </div>

        {/* Card List */}
        {loadError ? (
          <div className="ash-card-gold p-8 text-center">
            <p className="text-ash-red text-sm mb-2">加载角色卡失败</p>
            <button onClick={() => { setLoadError(false); listCards().then(r => setCards(r.data)).catch(() => toast('加载角色卡失败', 'error')); }} className="ash-btn text-xs">重试</button>
          </div>
        ) : cards.length === 0 ? (
          <div className="ash-card-gold p-8 text-center">
            <p className="text-ash-parchment-dim text-sm">暂无角色卡。创建一个或导入 PNG 格式的角色卡。</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {cards.map((card, i) => (
              <div
                key={card.id}
                className={`ash-card-gold p-4 flex gap-4 stagger-item stagger-delay-${(i % 6) + 1}`}
              >
                {card.portrait_path ? (
                  <img
                    src={card.portrait_path}
                    alt={card.name}
                    className="w-20 h-20 rounded object-cover border border-ash-border flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded border border-ash-border flex-shrink-0 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold-dim)" strokeWidth="1">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="font-display text-sm text-ash-gold truncate">{card.name}</h3>
                    <span className="text-[0.55rem] font-mono text-ash-parchment-dim ml-2 flex-shrink-0">
                      {card.source === 'png_import' ? 'PNG导入' : '自定义'}
                    </span>
                  </div>
                  {card.personality && (
                    <p className="text-xs text-ash-parchment-dim mt-1 line-clamp-2">{card.personality}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => navigate(`/chat/${card.id}`)}
                      className="ash-btn text-[0.6rem]"
                    >
                      对话
                    </button>
                    <button
                      onClick={() => setConfirmState({ open: true, cardId: card.id, cardName: card.name })}
                      className="text-[0.6rem] text-ash-red hover:underline"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmState.open}
        title="删除角色卡"
        message={`确定要删除「${confirmState.cardName}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          handleDelete(confirmState.cardId)
          setConfirmState({ open: false, cardId: '', cardName: '' })
        }}
        onCancel={() => setConfirmState({ open: false, cardId: '', cardName: '' })}
      />
    </div>
  )
}
