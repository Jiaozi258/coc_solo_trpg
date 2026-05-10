import { useCallback, useState } from 'react'
import type { DiceRequest, DiceResult, DiceCheckResult } from '../types'

export function resolveD100(total: number, skillValue: number): DiceCheckResult | null {
  if (skillValue <= 0) return null
  if (total === 1) return { success: true, level: 'critical', label: '大成功' }
  if (total <= Math.floor(skillValue / 5)) return { success: true, level: 'extreme', label: '极难成功' }
  if (total <= Math.floor(skillValue / 2)) return { success: true, level: 'hard', label: '困难成功' }
  if (total <= skillValue) return { success: true, level: 'regular', label: '成功' }
  if (skillValue >= 50 && total === 100) return { success: false, level: 'fumble', label: '大失败' }
  if (skillValue < 50 && total >= 96) return { success: false, level: 'fumble', label: '大失败' }
  return { success: false, level: 'failure', label: '失败' }
}

export function useDice() {
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<DiceResult | null>(null)
  const [check, setCheck] = useState<DiceCheckResult | null>(null)

  const roll = useCallback((request: DiceRequest): DiceResult => {
    setRolling(true)
    setResult(null)
    setCheck(null)

    let expression = '1d100'
    if (request.type === 'damage' && request.expression) {
      expression = request.expression
    }

    // Normalize: uppercase D, handle missing leading digit (d6 → 1d6)
    expression = expression.replace(/(\d+)?[dD](\d+)/g, (_, count, faces) => {
      return `${count || 1}d${faces}`
    })

    // Parse and execute dice roll locally
    const parts = expression.matchAll(/(\d+)d(\d+)/gi)
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

    // Add flat modifiers (e.g., "1d10+2", "1d6-1", "1d6+3d4+2")
    // Use compatible approach: find all +N/-N, exclude those adjacent to d/D
    const allMatches = expression.match(/[+-]\d+/g) || []
    const modifierMatch = allMatches.filter(m => {
      const idx = expression.indexOf(m)
      return idx === 0 || !/[dD]/.test(expression[idx - 1])
    })
    if (modifierMatch.length > 0) {
      for (const mod of modifierMatch) {
        total += parseInt(mod)
      }
    }

    const diceResult: DiceResult = { expression, individual, total }
    setResult(diceResult)

    // Resolve skill check result for d100 rolls
    if (request.type === 'skill_check' && request.value != null) {
      setCheck(resolveD100(total, request.value))
    }

    setTimeout(() => setRolling(false), 1200)
    return diceResult
  }, [])

  return { roll, rolling, result, check, setResult }
}
