import { useCallback, useRef } from 'react'

interface SSECallbacks {
  onNarrative: (text: string, final: boolean) => void
  onOptions: (options: string[]) => void
  onDiceRequest: (req: any) => void
  onStatusUpdate: (update: any) => void
  onDone: () => void
  onError: (err: string) => void
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

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              switch (currentEvent) {
                case 'narrative':
                  callbacks.onNarrative(data.text, data.final ?? false)
                  break
                case 'options':
                  callbacks.onOptions(data.options)
                  break
                case 'dice_request':
                  callbacks.onDiceRequest(data)
                  break
                case 'status_update':
                  callbacks.onStatusUpdate(data)
                  break
                case 'done':
                  callbacks.onDone()
                  break
              }
            } catch {
              // skip malformed SSE data
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message)
      }
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { streamAction, abort }
}
