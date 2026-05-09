import { useCallback, useRef } from 'react'

interface ChatCallbacks {
  onToken: (text: string) => void
  onDone: () => void
  onError: (err: string) => void
  onUsage?: (usage: { input_tokens: number; output_tokens: number; total_tokens: number }) => void
  onTruncate?: (finalText: string) => void
}

export function useChatSSE() {
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const sendMessage = useCallback(async (
    cardId: string,
    message: string,
    token: string,
    callbacks: ChatCallbacks,
    history?: { role: string; content: string }[],
    lorebookId?: string,
    personaId?: string,
  ) => {
    abortRef.current?.abort()
    clearTimer()
    abortRef.current = new AbortController()
    let doneReceived = false
    let firstTokenReceived = false
    let errorDispatched = false

    // First-token timeout: 60s for local models to start responding
    timerRef.current = setTimeout(() => {
      if (!firstTokenReceived) {
        abortRef.current?.abort()
        callbacks.onError('AI 响应超时（60秒内未收到回复）。请检查 Ollama 是否正在运行、模型是否已加载。')
      }
    }, 60000)

    try {
      const resp = await fetch(`/api/cards/${cardId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message, history, lorebook_id: lorebookId || undefined, persona_id: personaId || undefined }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
        clearTimer()
        const errText = await resp.text()
        callbacks.onError(`HTTP ${resp.status}: ${errText}`)
        return
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        let dataBuffer = ''

        const dispatchChat = (event: string, data: string) => {
          if (!data) return
          try {
            const parsed = JSON.parse(data)
            switch (event) {
              case '':
                if (parsed.text) {
                  if (!firstTokenReceived) {
                    firstTokenReceived = true
                    clearTimer()
                  }
                  callbacks.onToken(parsed.text)
                }
                break
              case 'done':
                doneReceived = true
                clearTimer()
                callbacks.onDone()
                break
              case 'truncate':
                if (callbacks.onTruncate && parsed.text) callbacks.onTruncate(parsed.text)
                break
              case 'usage':
                if (callbacks.onUsage) callbacks.onUsage(parsed)
                break
              case 'error':
                clearTimer()
                callbacks.onError(parsed.detail || 'Unknown error')
                break
            }
          } catch {
            // skip malformed data
          }
        }

        for (const line of lines) {
          if (line === '') {
            dispatchChat(currentEvent, dataBuffer)
            currentEvent = ''
            dataBuffer = ''
          } else if (line.startsWith('event: ')) {
            if (dataBuffer) {
              dispatchChat(currentEvent, dataBuffer)
              dataBuffer = ''
            }
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data:')) {
            const payload = line.slice(5)
            const val = payload.startsWith(' ') ? payload.slice(1) : payload
            dataBuffer = dataBuffer ? dataBuffer + '\n' + val : val
          }
        }
        if (dataBuffer) {
          dispatchChat(currentEvent, dataBuffer)
          currentEvent = ''
          dataBuffer = ''
        }
      }
    } catch (err: any) {
      clearTimer()
      if (err.name !== 'AbortError') {
        errorDispatched = true
        callbacks.onError(err.message)
      }
    } finally {
      clearTimer()
      if (!doneReceived && !errorDispatched && abortRef.current && !abortRef.current.signal.aborted) {
        callbacks.onDone()
      }
    }
  }, [])

  return { sendMessage }
}
