import { useCallback, useState } from 'react'
import type { DiceRequest, DiceResult } from '../types'

export function useDice() {
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<DiceResult | null>(null)

  const roll = useCallback((request: DiceRequest): DiceResult => {
    setRolling(true)
    setResult(null)

    let expression = '1d100'
    if (request.type === 'damage' && request.expression) {
      expression = request.expression
    }

    // Parse and execute dice roll locally (frontend generates the random numbers)
    // The backend validates and resolves the outcome
    const parts = expression.matchAll(/(\d+)d(\d+)/g)
    const individual: number[] = []
    let total = 0

    for (const [, countStr, facesStr] of parts) {
      const count = parseInt(countStr)
      const faces = parseInt(facesStr)
      for (let i = 0; i < count; i++) {
        const val = Math.floor(Math.random() * faces) + 1
        individual.push(val)
        total += val
      }
    }

    // Add flat modifiers (e.g., "1d10+2", "1d6-1")
    const modifierMatch = expression.match(/([+-]\d+)(?!d)/g)
    if (modifierMatch) {
      for (const mod of modifierMatch) {
        total += parseInt(mod)
      }
    }

    const diceResult: DiceResult = { expression, individual, total }
    setResult(diceResult)

    setTimeout(() => setRolling(false), 1200)
    return diceResult
  }, [])

  return { roll, rolling, result, setResult }
}
