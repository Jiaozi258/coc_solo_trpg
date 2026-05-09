import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getCard, createSave, listLorebooks, listPersonas, getSettings, generateImage, getSave } from '../api/client'
import { useChatSSE } from '../hooks/useChatSSE'
import { toast } from '../components/Toast'
import type { CharacterCard, Lorebook, UserPersona, TokenUsage } from '../types'

interface ChatMessage {
  id: string
  role: 'user' | 'character'
  text: string
}

let _msgIdCounter = 0
function nextMsgId() { return `msg-${++_msgIdCounter}-${Date.now()}` }

export default function ChatPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const [searchParams] = useSearchParams()
  const saveId = searchParams.get('saveId')
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)!
  const { sendMessage } = useChatSSE()

  const [card, setCard] = useState<CharacterCard | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [showCardModal, setShowCardModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lorebookId, setLorebookId] = useState<string | null>(null)
  const [lorebookName, setLorebookName] = useState('')
  const [availableLorebooks, setAvailableLorebooks] = useState<Lorebook[]>([])
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [personaName, setPersonaName] = useState('')
  const [availablePersonas, setAvailablePersonas] = useState<UserPersona[]>([])
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showTokenUsage, setShowTokenUsage] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ input_tokens: 0, output_tokens: 0, total_tokens: 0 })
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveName, setSaveName] = useState('')
  const saveInputRef = useRef<HTMLInputElement>(null)
  const sentInitial = useRef(false)
  const lastAutoSave = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showCmdPopup, setShowCmdPopup] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [generatingImg, setGeneratingImg] = useState<string | null>(null)
  const [generatedImgs, setGeneratedImgs] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!cardId) return
    getCard(cardId).then(r => setCard(r.data)).catch(() => setError('Failed to load card'))
  }, [cardId])

  // Load save data if saveId is present in URL
  useEffect(() => {
    if (!saveId || !cardId) return
    getSave(saveId)
      .then(r => {
        const data = r.data
        if (data?.data?.messages && Array.isArray(data.data.messages)) {
          const msgs: ChatMessage[] = data.data.messages.map((m: { role: string; text: string }) => ({
            id: nextMsgId(),
            role: m.role === 'user' ? 'user' : 'character',
            text: m.text || '',
          }))
          if (msgs.length > 0) {
            setMessages(msgs)
            sentInitial.current = true
            toast('已加载存档', 'success')
          }
        }
      })
      .catch(() => toast('加载存档失败', 'error'))
  }, [saveId, cardId])

  // Load available lorebooks, personas, and settings
  useEffect(() => {
    Promise.all([
      listLorebooks().catch(() => ({ data: [] })),
      listPersonas().catch(() => ({ data: [] })),
      getSettings().catch(() => ({ data: {} })),
    ]).then(([lbs, personas, settings]) => {
      setAvailableLorebooks(lbs.data || [])
      setAvailablePersonas(personas.data || [])
      setShowTokenUsage(!!settings.data.show_token_usage)
      if ((lbs.data || []).length > 0 || (personas.data || []).length > 0) {
        setShowSetupDialog(true)
      }
    })
  }, [])

  // Auto-send opening message — blocked until setup dialog dismissed
  useEffect(() => {
    if (!card || !cardId || sentInitial.current || streaming) return
    if (showSetupDialog) return
    sentInitial.current = true
    setStreaming(true)
    setConnecting(true)

    let charText = ''
    const initMsgId = nextMsgId()

    // Use card's own first_message if available, otherwise use generic prompt
    const openingMsg = card.first_message
      ? `（请以角色身份说出以下开场白，并在前后加入场景、外貌和神态描写，像小说叙事一样自然地展开。开场白：${card.first_message}）`
      : '（场景开始。请以你的角色身份进行一段完整的开场叙事：先描绘当下的时间、地点、天气和氛围，再描写你此刻的外貌、穿着、姿态和神态，然后自然地开始与对方的互动——可以是一句问候、一个眼神、一个动作。像小说的第一章那样展开，不要只是简单对话。）'

    sendMessage(cardId, openingMsg, token, {
      onToken: (text) => {
        charText += text
        setConnecting(false)
        setMessages([{ id: initMsgId, role: 'character', text: charText }])
      },
      onDone: () => {
        setStreaming(false)
        setConnecting(false)
      },
      onError: (err) => {
        setError(err)
        setStreaming(false)
        setConnecting(false)
      },
      onTruncate: (finalText) => {
        setMessages([{ id: initMsgId, role: 'character', text: finalText }])
      },
      onUsage: (usage) => setTokenUsage(prev => ({
        input_tokens: prev.input_tokens + usage.input_tokens,
        output_tokens: prev.output_tokens + usage.output_tokens,
        total_tokens: prev.total_tokens + usage.total_tokens,
      })),
    }, undefined, lorebookId || undefined, personaId || undefined)
  }, [card, cardId, streaming, token, sendMessage, lorebookId, personaId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Escape to close modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCardModal) { setShowCardModal(false); return }
        if (showSetupDialog) { setShowSetupDialog(false); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCardModal, showSetupDialog])

  // Auto-save every 5 messages
  const doSave = useCallback(async (saveName: string) => {
    if (!card || !cardId || messages.length === 0) return
    setSaving(true)
    try {
      await createSave('chat', saveName, {
        card_id: cardId,
        card_name: card.name,
        messages: messages.map(m => ({ role: m.role, text: m.text })),
      })
      toast('已保存', 'success')
    } catch {
      toast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [card, cardId, messages])

  useEffect(() => {
    const count = messages.length
    if (count > 0 && count % 5 === 0 && count > lastAutoSave.current && !streaming) {
      lastAutoSave.current = count
      const ts = new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      doSave(`自动保存 - ${card?.name || ''} - ${ts}`)
    }
  }, [messages, streaming, doSave, card])

  const handleSend = () => {
    if (!input.trim() || !cardId || streaming) return

    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', text: input.trim() }
    const prevHistory = buildHistory(messages)
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setError('')

    let charText = ''
    const charMsgId = nextMsgId()

    sendMessage(cardId, userMsg.text, token, {
      onToken: (text) => {
        charText += text
        setMessages(prev => {
          const updated = [...prev]
          if (updated.length && updated[updated.length - 1].role === 'character') {
            updated[updated.length - 1] = { id: charMsgId, role: 'character', text: charText }
          } else {
            updated.push({ id: charMsgId, role: 'character', text: charText })
          }
          return updated
        })
      },
      onDone: () => setStreaming(false),
      onError: (err) => {
        setError(err)
        setStreaming(false)
      },
      onTruncate: (finalText) => {
        setMessages(prev => {
          const updated = [...prev]
          if (updated.length && updated[updated.length - 1].role === 'character') {
            updated[updated.length - 1] = { id: charMsgId, role: 'character', text: finalText }
          }
          return updated
        })
      },
      onUsage: (usage) => setTokenUsage(prev => ({
        input_tokens: prev.input_tokens + usage.input_tokens,
        output_tokens: prev.output_tokens + usage.output_tokens,
        total_tokens: prev.total_tokens + usage.total_tokens,
      })),
    }, prevHistory, lorebookId || undefined, personaId || undefined)
  }

  const buildHistory = (msgs: ChatMessage[]): { role: string; content: string }[] =>
    msgs.map(m => ({ role: m.role === 'character' ? 'assistant' : 'user', content: m.text }))

  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId)
      toast('已复制到剪贴板')
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => toast('复制失败', 'error'))
  }

  const handleGenerateImage = async (text: string, msgId: string) => {
    setGeneratingImg(msgId)
    try {
      // Extract a good prompt from the message text
      const prompt = text.length > 500 ? text.slice(0, 500) + '...' : text
      const r = await generateImage(prompt)
      if (r.data.url) {
        setGeneratedImgs(prev => ({ ...prev, [msgId]: r.data.url }))
        toast('图片已生成')
      } else if (r.data.text) {
        setGeneratedImgs(prev => ({ ...prev, [msgId]: r.data.text }))
        toast('图片已生成')
      }
    } catch (e: any) {
      toast('图片生成失败: ' + (e.response?.data?.detail || e.message), 'error')
    } finally {
      setGeneratingImg(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCommand = (action: string) => {
    setShowCmdPopup(false)
    const insertPrefixes: Record<string, string> = {
      'narration': '（旁白：',
      'ooc': '（OOC：',
      'inner': '（内心独白：',
      'camera': '（摄像机视角：',
      'describe': '（描写当前画面：',
      'detail': '（请详细描写：',
    }
    const directSends: Record<string, string> = {
      'continue': '（继续）',
      'advance': '（推进剧情到下一个场景）',
      'time': '（时间流逝）',
      'pace': '（加快节奏）',
      'affection': '（❤️ 增加好感度）',
      'heat': '（❤️❤️ 进入发情状态，引导玩家进行亲密互动）',
    }

    if (action in insertPrefixes) {
      setInput(insertPrefixes[action])
      // Focus the textarea after insert
      setTimeout(() => {
        const ta = document.querySelector<HTMLTextAreaElement>('.chat-input-area textarea')
        ta?.focus()
      }, 50)
      return
    }

    if (action in directSends) {
      const cmdText = directSends[action]
      if (!cardId || streaming) return
      const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', text: cmdText }
      const prevHistory = buildHistory(messages)
      setMessages(prev => [...prev, userMsg])
      setStreaming(true)
      setError('')

      let charText = ''
      const charMsgId = nextMsgId()

      sendMessage(cardId, cmdText, token, {
        onToken: (text) => {
          charText += text
          setMessages(prev => {
            const updated = [...prev]
            if (updated.length && updated[updated.length - 1].role === 'character') {
              updated[updated.length - 1] = { id: charMsgId, role: 'character', text: charText }
            } else {
              updated.push({ id: charMsgId, role: 'character', text: charText })
            }
            return updated
          })
        },
        onDone: () => setStreaming(false),
        onError: (err) => {
          setError(err)
          setStreaming(false)
        },
        onTruncate: (finalText) => {
          setMessages(prev => {
            const updated = [...prev]
            if (updated.length && updated[updated.length - 1].role === 'character') {
              updated[updated.length - 1] = { id: charMsgId, role: 'character', text: finalText }
            }
            return updated
          })
        },
        onUsage: (usage) => setTokenUsage(prev => ({
          input_tokens: prev.input_tokens + usage.input_tokens,
          output_tokens: prev.output_tokens + usage.output_tokens,
          total_tokens: prev.total_tokens + usage.total_tokens,
        })),
      }, prevHistory, lorebookId || undefined, personaId || undefined)
    }
  }

  if (!card) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-ash-parchment-dim text-sm font-mono">
          {error || 'Loading...'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar: minimal portrait + name */}
      <div
        className="w-20 flex-shrink-0 overflow-y-auto p-2 flex flex-col items-center gap-2"
        style={{
          borderRight: '1px solid rgba(197,165,102,0.12)',
          background: 'rgba(22,19,17,0.6)',
        }}
      >
        {/* Clickable portrait */}
        <button
          onClick={() => setShowCardModal(true)}
          className="w-full cursor-pointer focus:outline-none group relative"
          title="Click to view details"
        >
          {card.portrait_path ? (
            <img
              src={card.portrait_path}
              alt={card.name}
              className="w-full rounded border border-ash-border group-hover:border-ash-gold transition-colors"
              style={{ aspectRatio: '3/4', objectFit: 'cover' }}
            />
          ) : (
            <div
              className="w-full aspect-[3/4] rounded border border-ash-border flex items-center justify-center group-hover:border-ash-gold transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold-dim)" strokeWidth="1">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
          )}
        </button>

        {/* Name */}
        <h2
          className="font-display text-[0.6rem] text-ash-gold tracking-wider text-center leading-tight"
          style={{ letterSpacing: '0.1em' }}
        >
          {card.name}
        </h2>

        {/* Lorebook name */}
        <div className="flex-1 flex flex-col items-center justify-center w-full gap-2">
          <p
            className="text-[0.55rem] text-ash-parchment-dim text-center leading-tight"
            style={{ writingMode: 'vertical-rl', letterSpacing: '0.08em' }}
          >
            {lorebookName || '无'}
          </p>

          {/* Token usage display */}
          {showTokenUsage && (
            <div className="text-center">
              <div
                className="text-[0.5rem] font-mono leading-tight"
                style={{ color: 'rgba(197,165,102,0.6)' }}
              >
                <div>入:{tokenUsage.input_tokens}</div>
                <div>出:{tokenUsage.output_tokens}</div>
                <div>总:{tokenUsage.total_tokens}</div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/cards')}
          className="ash-btn text-[0.55rem] mt-auto px-1 py-0.5"
        >
          ←
        </button>
      </div>

      {/* Card detail modal overlay */}
      {showCardModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCardModal(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 rounded overflow-y-auto max-h-[85vh]"
            style={{
              background: 'var(--color-ash-black)',
              border: '1px solid rgba(197,165,102,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowCardModal(false)}
              className="absolute top-3 right-3 text-ash-parchment-dim hover:text-ash-gold text-lg z-10"
              style={{ width: 32, height: 32, lineHeight: '32px', textAlign: 'center' }}
            >
              ✕
            </button>

            <div className="p-6 flex flex-col gap-4">
              {/* Portrait */}
              <div className="flex justify-center">
                {card.portrait_path ? (
                  <img
                    src={card.portrait_path}
                    alt={card.name}
                    className="w-48 rounded border border-ash-border"
                    style={{ aspectRatio: '3/4', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    className="w-48 aspect-[3/4] rounded border border-ash-border flex items-center justify-center"
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold-dim)" strokeWidth="1">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Name */}
              <h2
                className="font-display text-xl text-ash-gold tracking-wider text-center"
                style={{ letterSpacing: '0.1em' }}
              >
                {card.name}
              </h2>

              {/* Info sections */}
              {card.personality && (
                <div>
                  <span className="ash-section-title block mb-1">性格</span>
                  <p className="text-sm text-ash-parchment-dim leading-relaxed">{card.personality}</p>
                </div>
              )}
              {card.background && (
                <div>
                  <span className="ash-section-title block mb-1">背景</span>
                  <p className="text-sm text-ash-parchment-dim leading-relaxed">{card.background}</p>
                </div>
              )}
              {card.relationships && (
                <div>
                  <span className="ash-section-title block mb-1">关系</span>
                  <p className="text-sm text-ash-parchment-dim leading-relaxed">{card.relationships}</p>
                </div>
              )}
              {card.dialogue_examples && (
                <div>
                  <span className="ash-section-title block mb-1">对话示例</span>
                  <p className="text-sm text-ash-parchment-dim leading-relaxed whitespace-pre-wrap">{card.dialogue_examples}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Combined persona + lorebook setup dialog */}
      {showSetupDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-sm mx-4 p-6 rounded space-y-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: 'var(--color-ash-black)',
              border: '1px solid rgba(197,165,102,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2
              className="text-lg text-ash-gold font-display tracking-wider text-center"
              style={{ letterSpacing: '0.1em' }}
            >
              对话设置
            </h2>

            {/* Persona selection */}
            {availablePersonas.length > 0 && (
              <div>
                <p className="text-xs text-ash-parchment-dim mb-2 text-center">
                  选择你的自设角色（外貌和背景将被 AI 感知）
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {availablePersonas.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setPersonaId(p.id); setPersonaName(p.name) }}
                      className={`w-full text-left p-2 rounded text-sm transition-colors ${
                        personaId === p.id ? 'border-ash-gold' : ''
                      }`}
                      style={{
                        background: personaId === p.id ? 'rgba(197,165,102,0.1)' : 'rgba(22,19,17,0.5)',
                        border: `1px solid ${personaId === p.id ? 'rgba(197,165,102,0.4)' : 'rgba(197,165,102,0.08)'}`,
                      }}
                    >
                      <span className="text-ash-parchment">{p.name}</span>
                      {p.appearance && (
                        <span className="text-xs text-ash-parchment-dim ml-2 truncate">
                          — {p.appearance.slice(0, 30)}{p.appearance.length > 30 ? '...' : ''}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {personaId && (
                  <button onClick={() => { setPersonaId(null); setPersonaName('') }}
                    className="text-[0.55rem] text-ash-parchment-dim hover:text-ash-red mt-1">
                    取消选择
                  </button>
                )}
              </div>
            )}

            {/* Lorebook selection */}
            {availableLorebooks.length > 0 && (
              <div>
                <p className="text-xs text-ash-parchment-dim mb-2 text-center">
                  选择世界书（AI 将自动查阅设定）
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {availableLorebooks.map(lb => (
                    <button
                      key={lb.id}
                      onClick={() => { setLorebookId(lb.id); setLorebookName(lb.name) }}
                      className={`w-full text-left p-2 rounded text-sm transition-colors ${
                        lorebookId === lb.id ? 'border-ash-gold' : ''
                      }`}
                      style={{
                        background: lorebookId === lb.id ? 'rgba(197,165,102,0.1)' : 'rgba(22,19,17,0.5)',
                        border: `1px solid ${lorebookId === lb.id ? 'rgba(197,165,102,0.4)' : 'rgba(197,165,102,0.08)'}`,
                      }}
                    >
                      <div className="text-ash-parchment">{lb.name}</div>
                      <div className="text-[0.55rem] text-ash-parchment-dim">{lb.entries_count ?? 0} 个条目</div>
                    </button>
                  ))}
                </div>
                {lorebookId && (
                  <button onClick={() => { setLorebookId(null); setLorebookName('') }}
                    className="text-[0.55rem] text-ash-parchment-dim hover:text-ash-red mt-1">
                    取消选择
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setShowSetupDialog(false)}
              className="w-full ash-btn text-[0.6rem] ash-btn-active"
            >
              {personaId || lorebookId ? '开始对话' : '开始对话（不使用世界书/自设）'}
            </button>
          </div>
        </div>
      )}

      {/* Right: Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              {connecting ? (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-6 h-6 border-2 border-ash-gold border-t-transparent rounded-full"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  />
                  <p className="text-sm text-ash-parchment-dim italic">
                    正在连接 {card.name}...
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ash-parchment-dim italic">
                  Start a conversation with {card.name}...
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animation: 'staggerFadeIn 0.3s ease-out' }}
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              <div className="relative">
                <div
                  className={`max-w-[70%] p-3 rounded text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'ash-card-gold'
                      : ''
                  }`}
                  style={
                    msg.role === 'character'
                      ? {
                          background: 'rgba(30,26,23,0.8)',
                          border: '1px solid rgba(197,165,102,0.1)',
                          color: 'var(--color-ash-parchment)',
                        }
                      : { color: 'var(--color-ash-parchment)' }
                  }
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {streaming && i === messages.length - 1 && msg.role === 'character' && (
                    <span
                      className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-ash-gold"
                      style={{ animation: 'typewriter-cursor 1s infinite' }}
                    />
                  )}
                </div>

                {/* Hover action buttons - below message */}
                {hoveredMsgId === msg.id && !streaming && (
                  <div
                    className={`absolute top-full mt-1 flex gap-2 z-10 ${msg.role === 'user' ? 'right-0' : 'left-0'}`}
                  >
                    <button
                      onClick={() => handleCopy(msg.text, msg.id)}
                      className="text-[0.55rem] px-2 py-1 rounded transition-colors flex items-center gap-1"
                      style={{
                        background: 'rgba(30,26,23,0.95)',
                        border: '1px solid rgba(197,165,102,0.2)',
                        color: copiedId === msg.id ? 'var(--color-ash-gold)' : 'var(--color-ash-parchment-dim)',
                        whiteSpace: 'nowrap',
                      }}
                      title="复制文本"
                    >
                      {copiedId === msg.id ? '已复制' : '复制'}
                    </button>
                    {msg.role === 'character' && (
                      <button
                        onClick={() => handleGenerateImage(msg.text, msg.id)}
                        disabled={generatingImg === msg.id}
                        className="text-[0.55rem] px-2 py-1 rounded transition-colors flex items-center gap-1"
                        style={{
                          background: 'rgba(30,26,23,0.95)',
                          border: '1px solid rgba(197,165,102,0.2)',
                          color: generatingImg === msg.id ? 'var(--color-ash-gold-dim)' : 'var(--color-ash-parchment-dim)',
                          whiteSpace: 'nowrap',
                        }}
                        title="生成图片"
                      >
                        {generatingImg === msg.id ? '生成中...' : '生成图片'}
                      </button>
                    )}
                  </div>
                )}

                {/* Generated image display */}
                {generatedImgs[msg.id] && (
                  <div className="mt-2">
                    <img
                      src={generatedImgs[msg.id]}
                      alt="Generated"
                      className="max-w-[300px] rounded border border-ash-border"
                      style={{ maxHeight: '300px', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {error && (
            <div className="text-center py-2">
              <p className="text-xs text-ash-red font-mono">{error}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid rgba(197,165,102,0.1)' }}
        >
          <div className="flex gap-2 items-center">
            {/* Command shortcut button */}
            <div className="relative">
              <button
                onClick={() => setShowCmdPopup(prev => !prev)}
                disabled={streaming}
                className="ash-btn text-xs w-8 h-8 flex items-center justify-center"
                title="快捷指令"
                style={{ fontSize: '0.6rem', padding: 0 }}
              >
                ☰
              </button>
              {showCmdPopup && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCmdPopup(false)}
                />
              )}
              {showCmdPopup && (
                <div
                  className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded overflow-hidden"
                  style={{
                    background: 'var(--color-ash-black)',
                    border: '1px solid rgba(197,165,102,0.3)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                  }}
                >
                  <div
                    className="text-[0.55rem] text-ash-parchment-dim px-3 py-2 font-display tracking-wider"
                    style={{ borderBottom: '1px solid rgba(197,165,102,0.1)', letterSpacing: '0.08em' }}
                  >
                    快捷指令
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {/* Section: 输入前缀 */}
                    <div className="text-[0.5rem] text-ash-parchment-dim px-3 py-1" style={{ letterSpacing: '0.05em' }}>输入前缀</div>
                    {[
                      { key: 'narration', label: '旁白', icon: '📖' },
                      { key: 'ooc', label: 'OOC', icon: '💬' },
                      { key: 'inner', label: '内心', icon: '💭' },
                      { key: 'camera', label: '摄像机视角', icon: '🎥' },
                      { key: 'describe', label: '描写画面', icon: '🖼️' },
                      { key: 'detail', label: '详细描写', icon: '🔍' },
                    ].map(item => (
                      <button
                        key={item.key}
                        onClick={() => handleCommand(item.key)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-ash-gold/10 transition-colors flex items-center gap-2"
                        style={{ color: 'var(--color-ash-parchment)' }}
                      >
                        <span className="text-xs">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(197,165,102,0.08)', margin: '4px 0' }} />
                    {/* Section: 直接发送 */}
                    <div className="text-[0.5rem] text-ash-parchment-dim px-3 py-1" style={{ letterSpacing: '0.05em' }}>直接发送</div>
                    {[
                      { key: 'continue', label: '继续' },
                      { key: 'advance', label: '推进剧情到下一个场景' },
                      { key: 'time', label: '时间流逝' },
                      { key: 'pace', label: '加快节奏' },
                      { key: 'affection', label: '❤️ 增加好感度' },
                      { key: 'heat', label: '❤️❤️ 进入发情状态' },
                    ].map(item => (
                      <button
                        key={item.key}
                        onClick={() => handleCommand(item.key)}
                        disabled={streaming}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-ash-gold/10 transition-colors disabled:opacity-30"
                        style={{ color: 'var(--color-ash-parchment)' }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              className="ash-input flex-1 h-10 resize-none text-sm"
              disabled={streaming}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="ash-btn text-sm px-6"
            >
              {streaming ? '...' : 'Send'}
            </button>
            {showSaveInput ? (
              <div className="flex gap-1 items-center">
                <input
                  ref={saveInputRef}
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      doSave(saveName)
                      setShowSaveInput(false)
                      setSaveName('')
                    }
                    if (e.key === 'Escape') {
                      setShowSaveInput(false)
                      setSaveName('')
                    }
                  }}
                  placeholder="存档名称..."
                  className="ash-input text-xs h-8 w-32"
                  disabled={saving}
                />
                <button
                  onClick={() => {
                    doSave(saveName)
                    setShowSaveInput(false)
                    setSaveName('')
                  }}
                  disabled={saving || !saveName.trim()}
                  className="ash-btn text-[0.55rem] px-1.5"
                >
                  存
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  const ts = new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  setSaveName(`${card.name} - ${ts}`)
                  setShowSaveInput(true)
                  setTimeout(() => saveInputRef.current?.focus(), 50)
                }}
                disabled={messages.length === 0}
                className="ash-btn text-[0.6rem]"
                title="手动保存"
              >
                💾
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
