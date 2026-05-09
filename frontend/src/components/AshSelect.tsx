import { useState, useRef, useEffect, useCallback } from 'react'

interface AshSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

export default function AshSelect({ value, onChange, options, className }: AshSelectProps) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedLabel = options.find(o => o.value === value)?.label || value

  const close = useCallback(() => { setOpen(false); setFocusIdx(-1) }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [close])

  useEffect(() => {
    if (!open || focusIdx < 0) return
    const el = listRef.current?.children[focusIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, focusIdx])

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setFocusIdx(0)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocusIdx(i => (i + 1) % options.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusIdx(i => (i - 1 + options.length) % options.length)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusIdx >= 0 && focusIdx < options.length) {
          onChange(options[focusIdx].value)
          close()
        }
        break
    }
  }

  return (
    <div ref={wrapperRef} className={`ash-select-wrapper ${className || ''}`}>
      <div
        className={`ash-select-trigger ${open ? 'open' : ''}`}
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) setFocusIdx(0) }}
        onKeyDown={handleKey}
      >
        <span>{selectedLabel}</span>
        <span className={`ash-select-caret ${open ? 'open' : ''}`}>▼</span>
      </div>
      {open && (
        <div ref={listRef} className="ash-select-dropdown" role="listbox">
          {options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`ash-select-option ${o.value === value ? 'selected' : ''} ${i === focusIdx ? 'focused' : ''}`}
              onClick={() => { onChange(o.value); close() }}
              onMouseEnter={() => setFocusIdx(i)}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
