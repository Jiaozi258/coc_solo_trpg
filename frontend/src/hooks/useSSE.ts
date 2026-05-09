import { useCallback, useRef } from 'react'

interface SSECallbacks {
  onNarrative: (text: string, final: boolean) => void
  onOptions: (options: string[]) => void
  onDiceRequest: (req: any) => void
  onStatusUpdate: (update: any) => void
  onDone: () => void
  onError: (err: string) => void
  onUsage?: (usage: { input_tokens: number; output_tokens: number; total_tokens: number }) => void
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const streamAction = useCallback(async (
    sessionId: string,
    action: string,
    token: string,
    diceResult: any | null,
    callbacks: SSECallbacks,
  ) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    let doneReceived = false
    let errorDispatched = false

    try {
      const resp = await fetch(`/api/sessions/${sessionId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, dice_result: diceResult }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
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

        const dispatchEvent = (event: string, data: string) => {
          if (!data) return
          try {
            const parsed = JSON.parse(data)
            switch (event) {
              case '':
              case 'narrative':
                callbacks.onNarrative(parsed.text, parsed.final ?? false)
                break
              case 'options':
                callbacks.onOptions(parsed.options)
                break
              case 'dice_request':
                callbacks.onDiceRequest(parsed)
                break
              case 'status_update':
                callbacks.onStatusUpdate(parsed)
                break
              case 'done':
                doneReceived = true
                callbacks.onDone()
                break
              case 'usage':
                if (callbacks.onUsage) callbacks.onUsage(parsed)
                break
              case 'error':
                callbacks.onError(parsed.detail || 'Unknown error')
                break
            }
          } catch {
            // skip malformed SSE data
          }
        }

        for (const line of lines) {
          if (line === '') {
            // Blank line: dispatch accumulated event
            dispatchEvent(currentEvent, dataBuffer)
            currentEvent = ''
            dataBuffer = ''
          } else if (line.startsWith('event: ')) {
            // Dispatch previous event before switching
            if (dataBuffer) {
              dispatchEvent(currentEvent, dataBuffer)
              dataBuffer = ''
            }
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data:')) {
            const payload = line.slice(5)
            const val = payload.startsWith(' ') ? payload.slice(1) : payload
            dataBuffer = dataBuffer ? dataBuffer + '\n' + val : val
          }
        }
        // At end of buffer, dispatch if we have accumulated data
        if (dataBuffer) {
          dispatchEvent(currentEvent, dataBuffer)
          currentEvent = ''
          dataBuffer = ''
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        errorDispatched = true
        callbacks.onError(err.message)
      }
    } finally {
      if (!doneReceived && !errorDispatched && abortRef.current && !abortRef.current.signal.aborted) {
        callbacks.onDone()
      }
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { streamAction, abort }
}
