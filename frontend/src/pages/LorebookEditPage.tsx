import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getLorebook, updateLorebook, createLorebookEntry,
  updateLorebookEntry, deleteLorebookEntry, exportLorebook,
} from '../api/client'
import { toast } from '../components/Toast'
import type { Lorebook, LorebookEntry } from '../types'

const TRIGGER_MODES = [
  { value: 'keyword', label: '关键词触发' },
  { value: 'always', label: '始终激活' },
  { value: 'manual', label: '手动激活' },
] as const

const SEARCH_RANGES = [
  { value: 'all', label: '全部对话' },
  { value: 'last_n', label: '最近N条' },
  { value: 'user_input', label: '用户输入' },
] as const

const INSERT_POSITIONS = [
  { value: 'before_char', label: '角色卡之前' },
  { value: 'after_char', label: '角色卡之后' },
  { value: 'before_chat', label: '对话之前' },
] as const

const EMPTY_ENTRY: Omit<LorebookEntry, 'id' | 'lorebook_id' | 'created_at' | 'updated_at'> = {
  keywords: [],
  content: '',
  trigger_mode: 'keyword',
  search_range: 'all',
  search_n: 5,
  priority: 50,
  insert_position: 'before_char',
  enabled: 1,
  sort_order: 0,
}

export default function LorebookEditPage() {
  const { lorebookId } = useParams<{ lorebookId: string }>()
  const navigate = useNavigate()

  const [lorebook, setLorebook] = useState<Lorebook | null>(null)
  const [entries, setEntries] = useState<LorebookEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  // Editing lorebook name/desc
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  // Entry editor state
  const [editingEntry, setEditingEntry] = useState<Partial<LorebookEntry> | null>(null)
  const [entryKeywords, setEntryKeywords] = useState('')
  const [showEntryForm, setShowEntryForm] = useState(false)

  const load = () => {
    if (!lorebookId) return
    getLorebook(lorebookId)
      .then(r => {
        setLorebook(r.data)
        setEntries(r.data.entries || [])
        setEditName(r.data.name || '')
        setEditDesc(r.data.description || '')
      })
      .catch(() => toast('加载失败', 'error'))
      .finally(() => setLoaded(true))
  }

  useEffect(() => { load() }, [lorebookId])

  const handleSaveMeta = async () => {
    if (!lorebookId || !editName.trim()) return
    try {
      await updateLorebook(lorebookId, { name: editName.trim(), description: editDesc.trim() })
      toast('已保存', 'success')
    } catch {
      toast('保存失败', 'error')
    }
  }

  const handleSaveEntry = async () => {
    if (!lorebookId || !editingEntry) return
    const keywords = entryKeywords.split(/[,，]/).map(k => k.trim()).filter(Boolean)
    const data = { ...editingEntry, keywords }

    try {
      if (editingEntry.id) {
        await updateLorebookEntry(lorebookId, editingEntry.id, data)
      } else {
        await createLorebookEntry(lorebookId, data)
      }
      toast('条目已保存', 'success')
      setShowEntryForm(false)
      setEditingEntry(null)
      setEntryKeywords('')
      load()
    } catch {
      toast('保存失败', 'error')
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!lorebookId || !confirm('删除此条目？')) return
    try {
      await deleteLorebookEntry(lorebookId, entryId)
      setEntries(prev => prev.filter(e => e.id !== entryId))
      toast('已删除', 'success')
    } catch {
      toast('删除失败', 'error')
    }
  }

  const openNewEntry = () => {
    setEditingEntry({ ...EMPTY_ENTRY, sort_order: entries.length })
    setEntryKeywords('')
    setShowEntryForm(true)
  }

  const openEditEntry = (entry: LorebookEntry) => {
    setEditingEntry({ ...entry })
    setEntryKeywords(entry.keywords.join(', '))
    setShowEntryForm(true)
  }

  const handleExport = async () => {
    if (!lorebookId) return
    try {
      const r = await exportLorebook(lorebookId)
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${lorebook?.name || 'lorebook'}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 500)
      toast('导出成功', 'success')
    } catch {
      toast('导出失败', 'error')
    }
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-ash-parchment-dim font-mono">Loading...</span>
      </div>
    )
  }

  if (!lorebook) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-ash-red font-mono">世界书未找到</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/lorebooks')} className="ash-btn text-[0.6rem]">← 返回</button>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="ash-btn text-[0.6rem]">导出</button>
            <button onClick={openNewEntry} className="ash-btn text-[0.6rem] ash-btn-active">添加条目</button>
          </div>
        </div>

        {/* Lorebook meta editor */}
        <div className="ash-card-gold p-4 space-y-3">
          <div>
            <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">名称</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="ash-input w-full"
              placeholder="世界书名称"
            />
          </div>
          <div>
            <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">描述</label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className="ash-input w-full h-16 resize-none text-sm"
              placeholder="世界书描述"
            />
          </div>
          <button onClick={handleSaveMeta} className="ash-btn text-[0.6rem]">保存信息</button>
        </div>

        {/* Entries list */}
        <div className="space-y-2">
          <h3 className="text-sm text-ash-gold font-display tracking-wider">
            条目列表 ({entries.length})
          </h3>

          {entries.length === 0 ? (
            <p className="text-sm text-ash-parchment-dim italic py-4">暂无条目，点击"添加条目"开始创建</p>
          ) : (
            entries.map(entry => (
              <div
                key={entry.id}
                className="p-3 rounded cursor-pointer hover:border-ash-gold transition-colors"
                style={{
                  background: 'rgba(22,19,17,0.5)',
                  border: `1px solid ${entry.enabled ? 'rgba(197,165,102,0.08)' : 'rgba(197,165,102,0.03)'}`,
                  opacity: entry.enabled ? 1 : 0.5,
                }}
                onClick={() => openEditEntry(entry)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-ash-parchment truncate">
                        {entry.keywords?.length > 0 ? entry.keywords.slice(0, 3).join(', ') : '(无关键词)'}
                      </span>
                      <span className="text-[0.55rem] px-1 rounded" style={{ background: 'rgba(197,165,102,0.1)', color: 'var(--color-ash-gold)' }}>
                        {TRIGGER_MODES.find(m => m.value === entry.trigger_mode)?.label}
                      </span>
                      <span className="text-[0.55rem] text-ash-parchment-dim">优先 {entry.priority}</span>
                      {!entry.enabled && <span className="text-[0.55rem] text-ash-red">已禁用</span>}
                    </div>
                    {entry.content && (
                      <p className="text-xs text-ash-parchment-dim mt-1 truncate">
                        {entry.content.slice(0, 80)}{entry.content.length > 80 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteEntry(entry.id) }}
                    className="text-[0.55rem] text-ash-red hover:underline flex-shrink-0"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Entry editor modal */}
        {showEntryForm && editingEntry && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-8"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setShowEntryForm(false); setEditingEntry(null) }}
          >
            <div
              className="w-full max-w-lg mx-4 p-6 rounded space-y-4 max-h-[85vh] overflow-y-auto"
              style={{
                background: 'var(--color-ash-black)',
                border: '1px solid rgba(197,165,102,0.3)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base text-ash-gold font-display tracking-wider">
                {editingEntry.id ? '编辑条目' : '新建条目'}
              </h3>

              {/* Keywords */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  关键词（逗号分隔）
                </label>
                <input
                  value={entryKeywords}
                  onChange={e => setEntryKeywords(e.target.value)}
                  className="ash-input w-full"
                  placeholder="张三, 张三丰, 老张, Zhang San"
                />
              </div>

              {/* Content */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  内容
                </label>
                <textarea
                  value={editingEntry.content || ''}
                  onChange={e => setEditingEntry({ ...editingEntry, content: e.target.value })}
                  className="ash-input w-full h-32 resize-none text-sm"
                  placeholder="条目的详细内容..."
                />
              </div>

              {/* Trigger mode */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  触发模式
                </label>
                <div className="flex gap-3">
                  {TRIGGER_MODES.map(m => (
                    <label key={m.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="trigger_mode"
                        value={m.value}
                        checked={editingEntry.trigger_mode === m.value}
                        onChange={() => setEditingEntry({ ...editingEntry, trigger_mode: m.value as any })}
                        className="accent-ash-gold"
                      />
                      <span className="text-xs text-ash-parchment">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Search range */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  搜索范围
                </label>
                <div className="flex gap-3 flex-wrap">
                  {SEARCH_RANGES.map(m => (
                    <label key={m.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="search_range"
                        value={m.value}
                        checked={editingEntry.search_range === m.value}
                        onChange={() => setEditingEntry({ ...editingEntry, search_range: m.value as any })}
                        className="accent-ash-gold"
                      />
                      <span className="text-xs text-ash-parchment">{m.label}</span>
                    </label>
                  ))}
                </div>
                {editingEntry.search_range === 'last_n' && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-ash-parchment-dim">最近</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={editingEntry.search_n || 5}
                      onChange={e => setEditingEntry({ ...editingEntry, search_n: parseInt(e.target.value) || 5 })}
                      className="ash-input w-16 text-center text-sm"
                    />
                    <span className="text-xs text-ash-parchment-dim">条</span>
                  </div>
                )}
              </div>

              {/* Insert position */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  插入位置
                </label>
                <div className="flex gap-3 flex-wrap">
                  {INSERT_POSITIONS.map(m => (
                    <label key={m.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="insert_position"
                        value={m.value}
                        checked={editingEntry.insert_position === m.value}
                        onChange={() => setEditingEntry({ ...editingEntry, insert_position: m.value as any })}
                        className="accent-ash-gold"
                      />
                      <span className="text-xs text-ash-parchment">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">
                  优先级：{editingEntry.priority || 50}
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={editingEntry.priority || 50}
                  onChange={e => setEditingEntry({ ...editingEntry, priority: parseInt(e.target.value) })}
                  className="w-full accent-ash-gold"
                />
                <div className="flex justify-between text-[0.55rem] text-ash-parchment-dim">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEntry.enabled === 1}
                    onChange={e => setEditingEntry({ ...editingEntry, enabled: e.target.checked ? 1 : 0 })}
                    className="accent-ash-gold"
                  />
                  <span className="text-xs text-ash-parchment">启用此条目</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => { setShowEntryForm(false); setEditingEntry(null) }} className="ash-btn text-[0.6rem]">
                  取消
                </button>
                <button onClick={handleSaveEntry} className="ash-btn text-[0.6rem] ash-btn-active">
                  保存条目
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
