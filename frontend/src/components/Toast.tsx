import { useEffect, useState } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
  removing: boolean
}

let toastId = 0
let _setItems: ((updater: (prev: ToastItem[]) => ToastItem[]) => void) | null = null

export function toast(message: string, type: 'success' | 'error' = 'success') {
  if (!_setItems) return
  const id = ++toastId
  _setItems(prev => [...prev, { id, message, type, removing: false }])
  setTimeout(() => {
    _setItems?.(prev => prev.map(i => i.id === id ? { ...i, removing: true } : i))
    setTimeout(() => {
      _setItems?.(prev => prev.filter(i => i.id !== id))
    }, 250)
  }, 2500)
}

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    _setItems = setItems
    return () => {
      _setItems = null
    }
  }, [])

  return (
    <div className="toast-container">
      {items.map(item => (
        <div
          key={item.id}
          className={`toast-item toast-${item.type} ${item.removing ? 'removing' : ''}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
