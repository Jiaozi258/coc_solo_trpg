import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listLorebooks, createLorebook, deleteLorebook, importLorebook } from '../api/client'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { Lorebook } from '../types'

export default function LorebookPage() {
  const navigate = useNavigate()
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [delConfirm, setDelConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    listLorebooks()
      .then(r => setLorebooks(r.data))
      .catch(() => toast('加载失败', 'error'))
      .finally(() => setLoaded(true))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const r = await createLorebook(newName.trim(), newDesc.trim())
      toast('世界书已创建', 'success')
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      navigate(`/lorebooks/${r.data.id}`)
    } catch {
      toast('创建失败', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteLorebook(id)
      setLorebooks(prev => prev.filter(lb => lb.id !== id))
      toast('已删除', 'success')
    } catch {
      toast('删除失败', 'error')
    }
  }

  const handleImport = async (file: File | null) => {
    if (!file) return
    try {
      const r = await importLorebook(file)
      toast(`导入成功：${r.data.entries_count} 个条目`, 'success')
      load()
    } catch {
      toast('导入失败，请检查JSON格式', 'error')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-lg text-ash-gold tracking-wider"
            style={{ fontFamily: 'var(--font-gothic)', letterSpacing: '0.12em' }}
          >
            世界书管理
          </h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => { handleImport(e.target.files?.[0] ?? null); e.target.value = '' }}
            />
            <button onClick={() => fileRef.current?.click()} className="ash-btn text-[0.6rem]">
              导入
            </button>
            <button onClick={() => setShowCreate(true)} className="ash-btn text-[0.6rem] ash-btn-active">
              新建
            </button>
          </div>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowCreate(false)}
          >
            <div
              className="w-full max-w-md mx-4 p-6 rounded space-y-4"
              style={{
                background: 'var(--color-ash-black)',
                border: '1px solid rgba(197,165,102,0.3)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-base text-ash-gold font-display tracking-wider">新建世界书</h2>
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">名称</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="ash-input w-full"
                  placeholder="世界书名称"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase block mb-1">描述（可选）</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="ash-input w-full h-20 resize-none text-sm"
                  placeholder="简要描述这个世界书的用途"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="ash-btn text-[0.6rem]">取消</button>
                <button onClick={handleCreate} disabled={!newName.trim()} className="ash-btn text-[0.6rem] ash-btn-active">创建</button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {!loaded ? (
          <p className="text-sm text-ash-parchment-dim font-mono">Loading...</p>
        ) : lorebooks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-ash-parchment-dim italic mb-4">暂无世界书，点击"新建"创建一个</p>
            <p className="text-xs text-ash-parchment-dim">
              也可以导入 JSON 格式的世界书（支持 SillyTavern 格式）
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {lorebooks.map(lb => (
              <div
                key={lb.id}
                className="flex items-center justify-between p-4 rounded cursor-pointer hover:border-ash-gold transition-colors"
                style={{
                  background: 'rgba(22,19,17,0.5)',
                  border: '1px solid rgba(197,165,102,0.08)',
                }}
                onClick={() => navigate(`/lorebooks/${lb.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm text-ash-parchment truncate">{lb.name}</h3>
                  {lb.description && (
                    <p className="text-xs text-ash-parchment-dim mt-0.5 truncate">{lb.description}</p>
                  )}
                  <span className="text-[0.55rem] text-ash-parchment-dim font-mono mt-1 block">
                    {lb.entries_count ?? 0} 个条目 · {lb.updated_at ? new Date(lb.updated_at).toLocaleDateString('zh-CN') : ''}
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDelConfirm({ open: true, id: lb.id, name: lb.name }) }}
                  className="text-[0.6rem] text-ash-red hover:underline px-2"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={delConfirm.open}
        title="删除世界书"
        message={`确定要删除「${delConfirm.name}」吗？所有条目将被永久删除。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          handleDelete(delConfirm.id)
          setDelConfirm({ open: false, id: '', name: '' })
        }}
        onCancel={() => setDelConfirm({ open: false, id: '', name: '' })}
      />
    </div>
  )
}
