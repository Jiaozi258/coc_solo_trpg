import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSettings, saveSettings, uploadBgImage, uploadBgMusic, deleteBgImage, deleteBgMusic, listSaves, deleteSave, listPersonas, createPersona, deletePersona, testLLMConnection, testImageGen } from '../api/client'
import { toast } from '../components/Toast'

interface Settings {
  ai_mode: string
  cloud_provider: string
  cloud_api_key: string
  cloud_base_url: string
  cloud_model: string
  ollama_url: string
  ollama_model: string
  text_speed: number
  show_token_usage?: boolean
  dialogue_length?: string
  image_gen_provider?: string
  image_gen_model?: string
  image_gen_api_key?: string
  has_background_image?: boolean
  has_background_music?: boolean
}

interface SaveItem {
  id: string
  type: 'chat' | 'game'
  name: string
  data: any
  created_at?: string
  updated_at?: string
}

const DEFAULT_SETTINGS: Settings = {
  ai_mode: 'cloud',
  cloud_provider: 'anthropic',
  cloud_api_key: '',
  cloud_base_url: '',
  cloud_model: '',
  ollama_url: 'http://localhost:11434',
  ollama_model: '',
  text_speed: 3,
  show_token_usage: false,
  dialogue_length: 'medium',
  image_gen_provider: '',
  image_gen_model: 'dall-e-3',
  image_gen_api_key: '',
  has_background_image: false,
  has_background_music: false,
}

interface PersonaItem {
  id: string
  name: string
  appearance: string
  background: string
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState('')
  const [imgFile, setImgFile] = useState<string>('')
  const [musicFile, setMusicFile] = useState<string>('')
  const [saves, setSaves] = useState<SaveItem[]>([])
  const [savesLoaded, setSavesLoaded] = useState(false)
  const [personas, setPersonas] = useState<PersonaItem[]>([])
  const [llmStatus, setLlmStatus] = useState<{ status: string; latency_ms?: number; error?: string; model?: string } | null>(null)
  const [llmTesting, setLlmTesting] = useState(false)
  const [imgGenStatus, setImgGenStatus] = useState<{ status: string; message?: string; error?: string; available?: string[] } | null>(null)
  const [imgGenTesting, setImgGenTesting] = useState(false)
  const [newPersona, setNewPersona] = useState({ name: '', appearance: '', background: '' })
  const [showPersonaForm, setShowPersonaForm] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const musicRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettings()
      .then(r => {
        const data = r.data
        setSettings({
          ai_mode: data.ai_mode || DEFAULT_SETTINGS.ai_mode,
          cloud_provider: data.cloud_provider || DEFAULT_SETTINGS.cloud_provider,
          cloud_api_key: data.cloud_api_key ?? '',
          cloud_base_url: data.cloud_base_url ?? '',
          cloud_model: data.cloud_model || '',
          ollama_url: data.ollama_url || DEFAULT_SETTINGS.ollama_url,
          ollama_model: data.ollama_model || '',
          text_speed: data.text_speed ?? DEFAULT_SETTINGS.text_speed,
          show_token_usage: !!data.show_token_usage,
          dialogue_length: data.dialogue_length || DEFAULT_SETTINGS.dialogue_length,
          image_gen_provider: data.image_gen_provider || '',
          image_gen_model: data.image_gen_model || 'dall-e-3',
          image_gen_api_key: data.image_gen_api_key ?? '',
          has_background_image: !!data.has_background_image,
          has_background_music: !!data.has_background_music,
        })
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const loadSaves = () => {
    listSaves()
      .then(r => setSaves(r.data))
      .catch(() => {})
      .finally(() => setSavesLoaded(true))
  }

  useEffect(() => { loadSaves(); loadPersonas() }, [])

  const loadPersonas = () => {
    listPersonas()
      .then(r => setPersonas(r.data || []))
      .catch(() => {})
  }

  const handleCreatePersona = async () => {
    if (!newPersona.name.trim()) return
    try {
      await createPersona(newPersona)
      toast('用户设定已创建', 'success')
      setNewPersona({ name: '', appearance: '', background: '' })
      setShowPersonaForm(false)
      loadPersonas()
    } catch { toast('创建失败', 'error') }
  }

  const handleDeletePersona = async (id: string, name: string) => {
    if (!confirm(`删除用户设定 "${name}"？`)) return
    try {
      await deletePersona(id)
      setPersonas(prev => prev.filter(p => p.id !== id))
      toast('已删除', 'success')
    } catch { toast('删除失败', 'error') }
  }

  const handleTestLLM = async () => {
    setLlmTesting(true)
    setLlmStatus(null)
    try {
      // Auto-save settings before testing so the backend uses the latest config
      await saveSettings(settings)
      const r = await testLLMConnection()
      setLlmStatus(r.data)
    } catch (e: any) {
      setLlmStatus({ status: 'error', error: e?.response?.data?.error || e.message })
    } finally {
      setLlmTesting(false)
    }
  }

  const handleTestImageGen = async () => {
    setImgGenTesting(true)
    setImgGenStatus(null)
    try {
      const r = await testImageGen()
      setImgGenStatus(r.data)
    } catch (e: any) {
      setImgGenStatus({ status: 'error', error: e?.response?.data?.error || e.message })
    } finally {
      setImgGenTesting(false)
    }
  }

  const handleSave = async () => {
    try {
      await saveSettings(settings)
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('Save failed')
    }
  }

  const handleUpload = async (type: 'image' | 'music', file: File | null) => {
    if (!file) return
    try {
      if (type === 'image') {
        await uploadBgImage(file)
        setSettings(s => s ? { ...s, has_background_image: true } : s)
        setImgFile(file.name)
      } else {
        await uploadBgMusic(file)
        setSettings(s => s ? { ...s, has_background_music: true } : s)
        setMusicFile(file.name)
      }
      setMsg(`${type === 'image' ? 'Image' : 'Music'} uploaded`)
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('Upload failed')
    }
  }

  const handleDelete = async (type: 'image' | 'music') => {
    try {
      if (type === 'image') {
        await deleteBgImage()
        setSettings(s => s ? { ...s, has_background_image: false } : s)
        setImgFile('')
      } else {
        await deleteBgMusic()
        setSettings(s => s ? { ...s, has_background_music: false } : s)
        setMusicFile('')
      }
      setMsg(`${type === 'image' ? 'Image' : 'Music'} removed`)
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('Delete failed')
    }
  }

  const isCloud = settings.ai_mode === 'cloud'

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h1
          className="text-lg text-ash-gold tracking-wider mb-6"
          style={{ fontFamily: 'var(--font-gothic)', letterSpacing: '0.12em' }}
        >
          Settings
        </h1>

        {/* ── AI Mode ── */}
        <div className="ash-card-gold p-4">
          <span className="ash-section-title block mb-3">AI Provider</span>
          <div className="flex gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ai_mode"
                value="cloud"
                checked={isCloud}
                onChange={() => setSettings({ ...settings, ai_mode: 'cloud' })}
                className="accent-ash-gold"
              />
              <span className="text-sm text-ash-parchment">Cloud API</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ai_mode"
                value="ollama"
                checked={!isCloud}
                onChange={() => setSettings({ ...settings, ai_mode: 'ollama' })}
                className="accent-ash-gold"
              />
              <span className="text-sm text-ash-parchment">Ollama (Local)</span>
            </label>
          </div>

          {isCloud ? (
            <div className="space-y-3">
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">Cloud Provider</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cloud_provider"
                      value="anthropic"
                      checked={settings.cloud_provider === 'anthropic'}
                      onChange={() => setSettings({ ...settings, cloud_provider: 'anthropic' })}
                      className="accent-ash-gold"
                    />
                    <span className="text-sm text-ash-parchment">Anthropic</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cloud_provider"
                      value="openai"
                      checked={settings.cloud_provider === 'openai'}
                      onChange={() => setSettings({ ...settings, cloud_provider: 'openai' })}
                      className="accent-ash-gold"
                    />
                    <span className="text-sm text-ash-parchment">OpenAI</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.cloud_api_key}
                  onChange={e => setSettings({ ...settings, cloud_api_key: e.target.value })}
                  className="ash-input w-full"
                  placeholder={settings.cloud_provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                />
              </div>
              {settings.cloud_provider === 'openai' && (
                <div>
                  <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">API Base URL (可选)</label>
                  <input
                    type="text"
                    value={settings.cloud_base_url}
                    onChange={e => setSettings({ ...settings, cloud_base_url: e.target.value })}
                    className="ash-input w-full"
                    placeholder="自定义 API 地址，留空使用官方地址"
                  />
                  <p className="text-[0.55rem] text-ash-parchment-dim mt-1">用于 OpenAI 兼容代理（如 One API、LobeChat 网关等）</p>
                </div>
              )}
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">Model Name</label>
                <input
                  type="text"
                  value={settings.cloud_model}
                  onChange={e => setSettings({ ...settings, cloud_model: e.target.value })}
                  className="ash-input w-full"
                  placeholder={settings.cloud_provider === 'openai' ? '如 gpt-4o, gpt-4-turbo' : '如 claude-sonnet-4-6'}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">Ollama URL</label>
                <input
                  type="text"
                  value={settings.ollama_url}
                  onChange={e => setSettings({ ...settings, ollama_url: e.target.value })}
                  className="ash-input w-full"
                  placeholder="http://localhost:11434"
                />
              </div>
              <div>
                <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">Model Name</label>
                <input
                  type="text"
                  value={settings.ollama_model}
                  onChange={e => setSettings({ ...settings, ollama_model: e.target.value })}
                  className="ash-input w-full"
                  placeholder="输入模型名称，例如 qwen2.5:7b"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Text Speed ── */}
        <div className="ash-card-gold p-4">
          <span className="ash-section-title block mb-3">Text Speed</span>
          <div className="flex items-center gap-4">
            <span className="text-[0.6rem] font-mono text-ash-parchment-dim">Slow</span>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.text_speed}
              onChange={e => setSettings({ ...settings, text_speed: Number(e.target.value) })}
              className="flex-1 accent-ash-gold"
            />
            <span className="text-[0.6rem] font-mono text-ash-parchment-dim">Fast</span>
            <span className="text-xs font-mono text-ash-gold ml-2 w-4">{settings.text_speed}</span>
          </div>
        </div>

        {/* ── Dialogue Length ── */}
        <div className="ash-card-gold p-4">
          <span className="ash-section-title block mb-3">AI 对话长度</span>
          <p className="text-[0.6rem] text-ash-parchment-dim mb-3">
            控制角色卡对话中 AI 回复的长度。长度越长，神态、动作、外貌描写越丰富。
          </p>
          <div className="flex gap-2">
            {[
              { value: 'short', label: '短', desc: '199-299字' },
              { value: 'medium', label: '中', desc: '399-599字' },
              { value: 'long', label: '较长', desc: '699-899字' },
              { value: 'extra', label: '长', desc: '999字+' },
            ].map(o => {
              const isActive = (settings.dialogue_length || 'medium') === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSettings({ ...settings, dialogue_length: o.value })}
                  className="flex-1"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    color: isActive ? 'var(--color-ash-gold)' : 'var(--color-ash-parchment-dim)',
                    background: isActive ? 'rgba(197,165,102,0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(197,165,102,0.5)' : '1px solid rgba(197,165,102,0.2)',
                    padding: '8px 16px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>{o.label}</div>
                  <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>{o.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Token Display Toggle (cloud only) ── */}
        {isCloud && (
          <div className="ash-card-gold p-4">
            <span className="ash-section-title block mb-3">Token 消费显示</span>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.show_token_usage}
                onChange={e => setSettings({ ...settings, show_token_usage: e.target.checked })}
                className="accent-ash-gold"
              />
              <span className="text-sm text-ash-parchment">
                在对话和跑团界面显示 Token 消耗估算
              </span>
            </label>
            <p className="text-[0.55rem] text-ash-parchment-dim mt-2">
              开启后，每次 AI 回复会在左侧显示输入/输出/总计 Token 数。仅适用于云端 API 模式。
            </p>
          </div>
        )}

        {/* ── LLM Connection Test ── */}
        <div className="ash-card-gold p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="ash-section-title">LLM 连接检测</span>
            <button onClick={handleTestLLM} disabled={llmTesting} className="ash-btn text-[0.6rem]">
              {llmTesting ? '检测中...' : '开始检测'}
            </button>
          </div>
          {llmStatus && (
            <div className={`p-3 rounded text-sm ${llmStatus.status === 'ok' ? '' : ''}`}
              style={{
                background: llmStatus.status === 'ok' ? 'rgba(50,200,100,0.08)' : 'rgba(220,60,60,0.08)',
                border: `1px solid ${llmStatus.status === 'ok' ? 'rgba(50,200,100,0.3)' : 'rgba(220,60,60,0.3)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${llmStatus.status === 'ok' ? '' : ''}`}
                  style={{ background: llmStatus.status === 'ok' ? 'rgb(50,200,100)' : 'rgb(220,60,60)' }} />
                <span className="text-ash-parchment font-mono text-xs">
                  {llmStatus.status === 'ok' ? '连接成功' : '连接失败'}
                </span>
              </div>
              {llmStatus.model && (
                <div className="text-[0.6rem] text-ash-parchment-dim font-mono">模型: {llmStatus.model}</div>
              )}
              {llmStatus.latency_ms != null && (
                <div className="text-[0.6rem] text-ash-parchment-dim font-mono">延迟: {llmStatus.latency_ms}ms</div>
              )}
              {llmStatus.error && (
                <div className="text-[0.6rem] text-ash-red font-mono mt-1 break-all">{llmStatus.error}</div>
              )}
            </div>
          )}
          {!llmStatus && (
            <p className="text-xs text-ash-parchment-dim italic">点击按钮测试当前 LLM 连接是否正常</p>
          )}
        </div>

        {/* ── Image Generation ── */}
        <div className="ash-card-gold p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="ash-section-title">图片生成</span>
            <button onClick={handleTestImageGen} disabled={imgGenTesting} className="ash-btn text-[0.6rem]">
              {imgGenTesting ? '检测中...' : '检测支持'}
            </button>
          </div>
          <p className="text-[0.55rem] text-ash-parchment-dim mb-3">
            需要独立的 OpenAI API Key（不同于对话用的 Key）。DeepSeek 等第三方 Key 不支持生图。
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-[0.6rem] font-mono text-ash-parchment-dim uppercase tracking-wider block mb-1">OpenAI API Key（生图专用）</label>
              <input
                type="password"
                value={settings.image_gen_api_key || ''}
                onChange={e => setSettings({ ...settings, image_gen_api_key: e.target.value })}
                className="ash-input w-full"
                placeholder="sk-... 填写你的 OpenAI API Key"
              />
            </div>
            <div className="flex gap-2">
              {[
                { value: '', label: '关闭' },
                { value: 'openai_dalle', label: 'DALL-E' },
                { value: 'openai_gpt', label: 'GPT-4o 生图' },
              ].map(o => {
                const isActive = (settings.image_gen_provider || '') === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setSettings({ ...settings, image_gen_provider: o.value })}
                    className="flex-1"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      color: isActive ? 'var(--color-ash-gold)' : 'var(--color-ash-parchment-dim)',
                      background: isActive ? 'rgba(197,165,102,0.1)' : 'transparent',
                      border: isActive ? '1px solid rgba(197,165,102,0.5)' : '1px solid rgba(197,165,102,0.2)',
                      padding: '6px 12px',
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
            {imgGenStatus && (
              <div className={`p-3 rounded text-sm ${imgGenStatus.status === 'ok' ? '' : ''}`}
                style={{
                  background: imgGenStatus.status === 'ok' ? 'rgba(50,200,100,0.08)' : 'rgba(220,60,60,0.08)',
                  border: `1px solid ${imgGenStatus.status === 'ok' ? 'rgba(50,200,100,0.3)' : 'rgba(220,60,60,0.3)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full"
                    style={{ background: imgGenStatus.status === 'ok' ? 'rgb(50,200,100)' : imgGenStatus.status === 'disabled' ? 'rgb(150,150,150)' : 'rgb(220,60,60)' }} />
                  <span className="text-ash-parchment font-mono text-xs">
                    {imgGenStatus.status === 'ok' ? '可用' : imgGenStatus.status === 'disabled' ? '未启用' : imgGenStatus.status === 'partial' ? '部分可用' : '不可用'}
                  </span>
                </div>
                {imgGenStatus.message && (
                  <div className="text-[0.6rem] text-ash-parchment-dim font-mono">{imgGenStatus.message}</div>
                )}
                {imgGenStatus.available && imgGenStatus.available.length > 0 && (
                  <div className="text-[0.55rem] text-ash-parchment-dim font-mono mt-1">
                    可用模型: {imgGenStatus.available.join(', ')}
                  </div>
                )}
                {imgGenStatus.error && (
                  <div className="text-[0.6rem] text-ash-red font-mono mt-1 break-all">{imgGenStatus.error}</div>
                )}
              </div>
            )}
            {!imgGenStatus && (
              <p className="text-xs text-ash-parchment-dim italic">选择图片生成服务商后，点击"检测支持"确认是否可用</p>
            )}
          </div>
        </div>

        {/* ── User Persona Management ── */}
        <div className="ash-card-gold p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="ash-section-title">用户设定（对话用）</span>
            <button onClick={() => setShowPersonaForm(true)} className="ash-btn text-[0.6rem] ash-btn-active">新建</button>
          </div>
          <p className="text-[0.55rem] text-ash-parchment-dim mb-3">
            定义你的自设角色外貌和背景，AI 会在对话中感知到你的形象。
          </p>

          {/* Create form */}
          {showPersonaForm && (
            <div className="p-3 rounded mb-3 space-y-2" style={{ background: 'rgba(22,19,17,0.5)', border: '1px solid rgba(197,165,102,0.1)' }}>
              <input
                value={newPersona.name}
                onChange={e => setNewPersona({ ...newPersona, name: e.target.value })}
                className="ash-input w-full"
                placeholder="名称（如：你的角色名）"
              />
              <textarea
                value={newPersona.appearance}
                onChange={e => setNewPersona({ ...newPersona, appearance: e.target.value })}
                className="ash-input w-full h-14 resize-none text-sm"
                placeholder="外貌描述（如：身高180cm，黑发，穿着风衣...）"
              />
              <textarea
                value={newPersona.background}
                onChange={e => setNewPersona({ ...newPersona, background: e.target.value })}
                className="ash-input w-full h-14 resize-none text-sm"
                placeholder="背景/性格（如：是一名私家侦探，性格沉稳...）"
              />
              <div className="flex gap-2">
                <button onClick={handleCreatePersona} disabled={!newPersona.name.trim()} className="ash-btn text-[0.6rem] ash-btn-active">保存</button>
                <button onClick={() => { setShowPersonaForm(false); setNewPersona({ name: '', appearance: '', background: '' }) }} className="ash-btn text-[0.6rem]">取消</button>
              </div>
            </div>
          )}

          {/* Persona list */}
          {personas.length === 0 ? (
            <p className="text-xs text-ash-parchment-dim italic">暂无用户设定，点击"新建"创建一个</p>
          ) : (
            <div className="space-y-1.5">
              {personas.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded"
                  style={{ background: 'rgba(22,19,17,0.5)', border: '1px solid rgba(197,165,102,0.06)' }}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-ash-parchment">{p.name}</span>
                    {p.appearance && (
                      <span className="text-xs text-ash-parchment-dim ml-2 truncate">
                        — {p.appearance.slice(0, 40)}{p.appearance.length > 40 ? '...' : ''}
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleDeletePersona(p.id, p.name)} className="text-[0.55rem] text-ash-red hover:underline">删除</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Background Image ── */}
        <div className="ash-card-gold p-4">
          <span className="ash-section-title block mb-3">Background Image</span>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={imgRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => {
                handleUpload('image', e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <button onClick={() => imgRef.current?.click()} className="ash-btn text-[0.6rem]">
              Choose File
            </button>
            {settings.has_background_image && (
              <>
                <span className="text-xs text-ash-parchment-dim">
                  {imgFile || 'Custom image set'}
                </span>
                <button onClick={() => handleDelete('image')} className="text-[0.6rem] text-ash-red hover:underline">Remove</button>
              </>
            )}
            {!settings.has_background_image && (
              <span className="text-xs text-ash-parchment-dim italic">None uploaded</span>
            )}
          </div>
        </div>

        {/* ── Background Music ── */}
        <div className="ash-card-gold p-4">
          <span className="ash-section-title block mb-3">Background Music</span>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={musicRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/flac"
              className="hidden"
              onChange={e => {
                handleUpload('music', e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <button onClick={() => musicRef.current?.click()} className="ash-btn text-[0.6rem]">
              Choose File
            </button>
            {settings.has_background_music && (
              <>
                <span className="text-xs text-ash-parchment-dim">
                  {musicFile || 'Custom music set'}
                </span>
                <button onClick={() => handleDelete('music')} className="text-[0.6rem] text-ash-red hover:underline">Remove</button>
              </>
            )}
            {!settings.has_background_music && (
              <span className="text-xs text-ash-parchment-dim italic">None uploaded</span>
            )}
          </div>
        </div>

        {/* ── Save Management ── */}
        <div className="ash-card-gold p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="ash-section-title">存读档管理</span>
            <button onClick={loadSaves} className="ash-btn text-[0.6rem]">刷新</button>
          </div>
          {!savesLoaded ? (
            <p className="text-xs text-ash-parchment-dim italic">Loading...</p>
          ) : saves.length === 0 ? (
            <p className="text-xs text-ash-parchment-dim italic">暂无存档</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {saves.map(save => (
                <div
                  key={save.id}
                  className="flex items-center justify-between gap-2 p-2 rounded"
                  style={{ background: 'rgba(22,19,17,0.5)', border: '1px solid rgba(197,165,102,0.08)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[0.55rem] font-mono uppercase px-1 rounded ${save.type === 'chat' ? 'text-green-300' : 'text-amber-300'}`}
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        {save.type === 'chat' ? '对话' : '跑团'}
                      </span>
                      <span className="text-sm text-ash-parchment truncate">{save.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[0.55rem] text-ash-parchment-dim font-mono">
                        {save.updated_at ? new Date(save.updated_at).toLocaleString('zh-CN') : ''}
                      </span>
                      {save.type === 'chat' && save.data?.card_name && (
                        <span className="text-[0.55rem] text-ash-parchment-dim">{save.data.card_name}</span>
                      )}
                      {save.data?.messages && (
                        <span className="text-[0.55rem] text-ash-parchment-dim">{save.data.messages.length}条消息</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {save.type === 'chat' && save.data?.card_id && (
                      <button
                        onClick={() => navigate(`/chat/${save.data.card_id}?saveId=${save.id}`)}
                        className="ash-btn text-[0.55rem] px-1.5 py-0.5"
                        title="打开存档"
                      >
                        开
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`删除存档 "${save.name}"？`)) return
                        try {
                          await deleteSave(save.id)
                          setSaves(prev => prev.filter(s => s.id !== save.id))
                          toast('存档已删除', 'success')
                        } catch {
                          toast('删除失败', 'error')
                        }
                      }}
                      className="text-[0.55rem] text-ash-red hover:underline px-1"
                    >
                      删
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Save (sticky at bottom) ── */}
        <div
          className="sticky bottom-0 flex items-center gap-3 py-4 px-2 -mx-2"
          style={{
            background: 'linear-gradient(0deg, var(--color-ash-black) 60%, transparent)',
            borderTop: '1px solid rgba(197,165,102,0.2)',
          }}
        >
          <button onClick={handleSave} className="ash-btn text-sm px-8 py-2">
            Save Settings
          </button>
          {msg && (
            <span className={`text-xs font-mono ${msg.includes('fail') ? 'text-ash-red' : 'text-ash-gold'}`}>
              {msg}
            </span>
          )}
          {!msg && (
            <span className="text-[0.6rem] text-ash-parchment-dim">修改后请点击保存</span>
          )}
        </div>
      </div>
    </div>
  )
}
