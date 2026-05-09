import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = '确认', cancelLabel = '取消',
  danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs mx-4 p-5 rounded space-y-4"
        style={{
          background: 'var(--color-ash-black)',
          border: '1px solid rgba(197,165,102,0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2
          className="font-display text-base text-ash-gold tracking-wider text-center"
          style={{ letterSpacing: '0.1em' }}
        >
          {title}
        </h2>
        <p className="text-sm text-ash-parchment-dim text-center leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-center pt-1">
          <button onClick={onCancel} className="ash-btn text-xs">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="ash-btn text-xs"
            style={danger ? { color: 'var(--color-ash-red)', borderColor: 'rgba(154,42,42,0.5)' } : {}}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
