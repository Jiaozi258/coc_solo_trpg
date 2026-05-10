# GamePage Desktop TRPG Immersion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform GamePage into an immersive tabletop-RPG desktop experience with paper textures, dice animations, and SAN effects.

**Architecture:** Add a felt-texture background layer and parchment-styled panels to GamePage. Extract dice rolling into a standalone Canvas component (DiceCanvas) with a dice log. Add a SanEffect overlay for HP/SAN/MOD shock. Enhance the game store with dice history and SAN tracking. All changes scoped to frontend/src/pages/GamePage.tsx, new/components in frontend/src/components/, and frontend/src/store/gameStore.ts.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS v4 + Canvas API + Web Audio API

---

### Task 1: Add diceLog and previousSan to gameStore

**Files:**
- Modify: `frontend/src/store/gameStore.ts`

- [ ] **Step 1: Add new state fields and actions**

Add `diceLog` array and `previousSan` to the store, plus actions to append to the log and track SAN changes.

In the `GameState` interface (after `turnCount` on line 14), add:
```ts
diceLog: { skill?: string; roll: number; target: number; success: boolean; level: string; timestamp: number }[]
previousSan: number
```

After the action declarations (line 27, before `reset`), add:
```ts
addDiceLog: (entry: { skill?: string; roll: number; target: number; success: boolean; level: string }) => void
setPreviousSan: (san: number) => void
```

In the initial state (lines 31-41), add:
```ts
diceLog: [],
previousSan: 0,
```

In the action implementations (after `incrementTurn` around line 68), add:
```ts
addDiceLog: (entry) => set((s) => ({
  diceLog: [...s.diceLog.slice(-9), { ...entry, timestamp: Date.now() }],
})),

setPreviousSan: (san) => set({ previousSan: san }),
```

- [ ] **Step 2: Add the new fields to the reset action**

In the `reset` implementation (line 69-81), add the reset fields after `tokenUsage`:
```ts
diceLog: [],
previousSan: 0,
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/gameStore.ts
git commit -m "feat: add diceLog and previousSan to gameStore"
```

---

### Task 2: Create dice sound module

**Files:**
- Create: `frontend/src/utils/diceSound.ts`

- [ ] **Step 1: Create Web Audio API dice sound**

```ts
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function playDiceSound() {
  try {
    const ctx = getCtx()
    // Short burst of filtered noise simulating dice rattle
    const duration = 0.15
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 3000
    filter.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start()
    // Second rattle
    setTimeout(() => {
      const src2 = ctx.createBufferSource()
      src2.buffer = buffer
      const filter2 = ctx.createBiquadFilter()
      filter2.type = 'bandpass'
      filter2.frequency.value = 2500
      filter2.Q.value = 0.4
      const gain2 = ctx.createGain()
      gain2.gain.setValueAtTime(0.25, ctx.currentTime)
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration * 0.7)
      src2.connect(filter2)
      filter2.connect(gain2)
      gain2.connect(ctx.destination)
      src2.start()
    }, 80)
  } catch {
    // Audio not available — silently skip
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/diceSound.ts
git commit -m "feat: add Web Audio API dice rattle sound"
```

---

### Task 3: Create DiceCanvas component

**Files:**
- Create: `frontend/src/components/DiceCanvas.tsx`

- [ ] **Step 1: Create the Canvas dice animation component**

```tsx
import { useEffect, useRef, useCallback } from 'react'

interface DiceCanvasProps {
  rolling: boolean
  result: number | null
  onDone: () => void
}

// D100 rendering: two d10 faces forming a percentage
const DIE_SIZE = 64
const GRAVITY = 0.6
const BOUNCE = 0.5
const FRICTION = 0.98
const DURATION = 2200 // ms

interface Particle {
  x: number; y: number; vx: number; vy: number
  rotation: number; rotSpeed: number
  value: number
  settled: boolean
}

export default function DiceCanvas({ rolling, result, onDone }: DiceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const startTimeRef = useRef(0)

  const tick = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height
    const elapsed = timestamp - startTimeRef.current

    ctx.clearRect(0, 0, w, h)

    const particles = particlesRef.current
    let allSettled = true

    particles.forEach(p => {
      if (elapsed < DURATION) {
        p.vy += GRAVITY
        p.x += p.vx
        p.y += p.vy
        p.vx *= FRICTION
        p.rotation += p.rotSpeed
        p.rotSpeed *= FRICTION

        if (p.y > h - DIE_SIZE / 2 - 10) {
          p.y = h - DIE_SIZE / 2 - 10
          p.vy *= -BOUNCE
          p.vx *= BOUNCE
          if (Math.abs(p.vy) < 1) {
            p.vy = 0
            p.vx = 0
            p.rotSpeed = 0
            p.settled = true
          }
        }
      } else {
        p.settled = true
      }
      if (!p.settled) allSettled = false

      // Draw die face
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = '#3a2010'
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 3
      roundRect(ctx, -DIE_SIZE / 2, -DIE_SIZE / 2, DIE_SIZE, DIE_SIZE, 8)
      ctx.fill()

      // Face highlight
      ctx.fillStyle = '#5c3820'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      roundRect(ctx, -DIE_SIZE / 2 + 3, -DIE_SIZE / 2 + 3, DIE_SIZE - 6, DIE_SIZE - 6, 6)
      ctx.fill()

      // Value text
      ctx.fillStyle = '#f4e4c1'
      ctx.font = `bold ${DIE_SIZE * 0.42}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.value), 0, 1)
      ctx.restore()
    })

    if (!allSettled || elapsed < DURATION) {
      animRef.current = requestAnimationFrame(tick)
    } else {
      onDone()
    }
  }, [onDone])

  useEffect(() => {
    if (rolling && result !== null) {
      const canvas = canvasRef.current
      if (!canvas) return
      const w = canvas.width
      const h = canvas.height

      // Tens die and ones die
      const tens = Math.floor(result / 10)
      const ones = result % 10
      startTimeRef.current = performance.now()
      particlesRef.current = [
        { x: w * 0.3, y: -DIE_SIZE, vx: 2 + Math.random() * 2, vy: 2, rotation: 0, rotSpeed: 8 + Math.random() * 6, value: tens, settled: false },
        { x: w * 0.7, y: -DIE_SIZE - 30, vx: -2 - Math.random() * 2, vy: 5, rotation: 0, rotSpeed: -10 - Math.random() * 4, value: ones, settled: false },
      ]
      animRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [rolling, result, tick])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={140}
      className="mx-auto block"
      style={{ imageRendering: 'auto' }}
    />
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DiceCanvas.tsx
git commit -m "feat: add Canvas-based dice rolling animation component"
```

---

### Task 4: Create DiceLog component

**Files:**
- Create: `frontend/src/components/DiceLog.tsx`

- [ ] **Step 1: Create the dice log display**

```tsx
interface DiceLogEntry {
  skill?: string
  roll: number
  target: number
  success: boolean
  level: string
  timestamp: number
}

interface DiceLogProps {
  entries: DiceLogEntry[]
}

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-green-300',
  extreme: 'text-emerald-400',
  hard: 'text-teal-400',
  regular: 'text-amber-300',
  failure: 'text-red-400',
  fumble: 'text-red-600',
}

export default function DiceLog({ entries }: DiceLogProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs italic" style={{ color: 'rgba(197,165,102,0.35)' }}>
          No rolls yet
        </p>
      </div>
    )
  }

  const latest = [...entries].reverse()

  return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto">
      {latest.map((entry, i) => (
        <div
          key={entry.timestamp + i}
          className="flex items-center gap-2 text-[0.6rem] p-1.5 rounded"
          style={{ background: 'rgba(22,19,17,0.4)', border: '1px solid rgba(197,165,102,0.06)' }}
        >
          <span className="font-mono w-7 text-right" style={{ color: 'rgba(197,165,102,0.5)' }}>
            {entry.roll}
          </span>
          <span className="text-ash-parchment-dim">/ {entry.target}</span>
          <span className={`ml-auto font-display tracking-wider ${LEVEL_COLORS[entry.level] || ''}`}>
            {entry.success ? 'SUCCESS' : 'FAIL'}
          </span>
          {entry.skill && (
            <span className="text-ash-parchment-dim truncate max-w-16" title={entry.skill}>
              {entry.skill}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DiceLog.tsx
git commit -m "feat: add DiceLog component for dice history"
```

---

### Task 5: Create SanEffect overlay component

**Files:**
- Create: `frontend/src/components/SanEffect.tsx`

- [ ] **Step 1: Create the SAN drop screen effect**

```tsx
import { useEffect, useState } from 'react'

interface SanEffectProps {
  trigger: boolean
}

export default function SanEffect({ trigger }: SanEffectProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (trigger) {
      setActive(true)
      const timer = setTimeout(() => setActive(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [trigger])

  if (!active) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Red glow at edges */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'sanGlow 1.5s ease-out forwards',
          boxShadow: 'inset 0 0 120px rgba(180,0,0,0.6)',
        }}
      />
      {/* Shake wrapper */}
      <div
        className="absolute inset-0"
        style={{
          animation: 'sanShake 0.6s ease-out',
        }}
      />
      <style>{`
        @keyframes sanGlow {
          0% { box-shadow: inset 0 0 0px rgba(180,0,0,0); }
          20% { box-shadow: inset 0 0 140px rgba(180,0,0,0.7); }
          100% { box-shadow: inset 0 0 0px rgba(180,0,0,0); }
        }
        @keyframes sanShake {
          0% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 1px); }
          20% { transform: translate(3px, -2px); }
          30% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -1px); }
          50% { transform: translate(-1px, 1px); }
          60% { transform: translate(1px, 0); }
          70% { transform: translate(0, -1px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SanEffect.tsx
git commit -m "feat: add SAN drop screen shake and red glow effect"
```

---

### Task 6: Add parchment paper CSS utilities

**Files:**
- Modify: `frontend/src/index.css` (or create `frontend/src/styles/parchment.css`)

- [ ] **Step 1: Add parchment texture and animation CSS**

Add to the Tailwind CSS entry point (typically `index.css` or `App.css`):

```css
/* Parchment paper style */
.parchment-card {
  background: linear-gradient(135deg, #f4e4c1 0%, #e8d5a3 50%, #f0dbb5 100%);
  border: 1px solid rgba(139, 109, 69, 0.25);
  border-radius: 2px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.25),
    0 1px 2px rgba(0, 0, 0, 0.15),
    inset 0 0 30px rgba(200, 180, 140, 0.15);
  position: relative;
}

/* Noise texture overlay */
.parchment-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
}

/* Desktop felt/mat background */
.bg-felt {
  background:
    radial-gradient(ellipse at 50% 30%, #2a2318 0%, #1a1510 60%, #0f0c08 100%);
}

.bg-felt::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.06;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

/* Paper rotation variants */
.paper-tilt-l { transform: rotate(-0.4deg); }
.paper-tilt-r { transform: rotate(0.3deg); }
.paper-tilt-none { transform: rotate(0deg); }

/* Pushpin decoration */
.pin-top::before {
  content: '📌';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  z-index: 1;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));
}

/* Fade-in for narrative text */
@keyframes parchmentReveal {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.parchment-reveal {
  animation: parchmentReveal 0.3s ease-out;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: add parchment paper and felt desktop CSS utilities"
```

---

### Task 7: Update ResourceBar with paper styling

**Files:**
- Modify: `frontend/src/components/ResourceBar.tsx`

- [ ] **Step 1: Apply parchment styling to ResourceBar**

Wrap the existing grid in a parchment-card div. Change the outer element:

Replace the return statement (lines 58-83) with:
```tsx
  return (
    <div className="parchment-card pin-top px-3 py-2 mx-3 mt-2 paper-tilt-l">
      <div className="grid grid-cols-4 gap-3">
        {resources.map((res) => (
          <div key={res.label} className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={res.color} strokeWidth="2">
                {res.iconPath}
              </svg>
              <span className="text-[0.6rem] font-display tracking-wider" style={{ color: 'var(--color-ash-dark-brown)' }}>
                {res.label}
              </span>
            </div>
            <div className="font-mono text-[0.75rem] font-bold" style={{ color: 'var(--color-ash-dark-brown)' }}>
              {res.current}
              <span className="text-[0.55rem] font-normal" style={{ color: 'rgba(60,40,20,0.4)' }}>
                {' '}/{' '}{res.max}
              </span>
            </div>
            {res.pct !== null && (
              <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,109,69,0.12)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, res.pct)}%`,
                    background: res.pct < 20 ? 'var(--color-ash-red)' : res.color,
                    boxShadow: res.pct < 20 ? `0 0 6px var(--color-ash-red)` : 'none',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ResourceBar.tsx
git commit -m "style: apply parchment paper styling to ResourceBar"
```

---

### Task 8: Update DialogueBox with paper styling

**Files:**
- Modify: `frontend/src/components/DialogueBox.tsx`

- [ ] **Step 1: Apply parchment styling and paper tilt**

Wrap the narrative display area in a parchment-card. Replace the narrative display div (lines 46-58):

```tsx
        <div className="parchment-card paper-tilt-r px-4 py-3 mx-3 parchment-reveal">
          <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif"
               style={{ color: 'var(--color-ash-dark-brown)' }}>
            {narrative}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom animate-pulse"
                    style={{ background: 'var(--color-ash-dark-brown)', opacity: 0.6 }} />
            )}
          </div>
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DialogueBox.tsx
git commit -m "style: apply parchment paper styling to DialogueBox"
```

---

### Task 9: Update OptionGrid — dice animation + paper styling

**Files:**
- Modify: `frontend/src/components/OptionGrid.tsx`

- [ ] **Step 1: Import new dependencies and add DiceCanvas props**

Add imports at top:
```tsx
import DiceCanvas from './DiceCanvas'
import { playDiceSound } from '../utils/diceSound'
```

Add these to the `OptionGridProps` interface:
```tsx
  onDiceResultComplete?: () => void
  diceCanvasKey?: number
```

- [ ] **Step 2: Replace dice roll display with DiceCanvas**

Replace the dice result display section (the `{diceResult && (` block after the roll button, around lines 85-100) with:

```tsx
            {rolling && diceResult && (
              <div className="flex justify-center py-2">
                <DiceCanvas
                  rolling={rolling}
                  result={diceResult.total}
                  onDone={() => onDiceResultComplete?.()}
                />
              </div>
            )}

            {diceResult && !rolling && diceCheck && (
              <div className={`text-center py-2 px-3 rounded ${diceCheck.success ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'}`}>
                <span className={`font-display text-sm ${diceCheck.success ? 'text-green-400' : 'text-red-400'}`}>
                  {diceCheck.success ? 'SUCCESS' : 'FAILURE'}
                </span>
                <span className="text-xs text-ash-parchment-dim ml-2">{diceCheck.label}</span>
                <div className="text-[0.6rem] text-ash-parchment-dim font-mono mt-0.5">
                  {diceResult.individual.join(' + ')} = {diceResult.total}
                </div>
              </div>
            )}
```

- [ ] **Step 3: Call playDiceSound inside onDiceRoll**

Modify the roll button onClick (around line 82):
```tsx
            onClick={() => {
              playDiceSound()
              onDiceRoll()
            }}
```

- [ ] **Step 4: Wrap the entire component output in parchment-card**

Replace the outer `ash-border-box` div with:
```tsx
    <div className="parchment-card px-4 py-3 mx-3 mb-2 paper-tilt-none">
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OptionGrid.tsx
git commit -m "feat: integrate DiceCanvas and dice sound into OptionGrid"
```

---

### Task 10: Update CharacterPanel — paper styling + collapse toggle

**Files:**
- Modify: `frontend/src/components/CharacterPanel.tsx`

- [ ] **Step 1: Apply parchment styling to the panel**

Replace the outer container's background style. Find the main container div (around line 55-60) and add `parchment-card` class:
```tsx
      <div
        className={`parchment-card fixed right-0 top-0 h-full w-80 shadow-2xl transition-transform duration-300 z-40 overflow-y-auto ${visible && !closing ? 'translate-x-0' : 'translate-x-full'}`}
```

- [ ] **Step 2: Update inner text colors for parchment readability**

Replace any usage of `var(--color-ash-parchment)` with `var(--color-ash-dark-brown)` and `var(--color-ash-gold)` with `var(--color-ash-dark-brown)` throughout the component's inline styles. Change the `StatBar` progress bar backgrounds from `rgba(197,165,102,0.1)` to `rgba(139,109,69,0.15)`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CharacterPanel.tsx
git commit -m "style: apply parchment paper styling to CharacterPanel"
```

---

### Task 11: Update MapArea with paper styling

**Files:**
- Modify: `frontend/src/components/MapArea.tsx`

- [ ] **Step 1: Wrap the MapArea output in parchment-card**

Find the component's return statement and wrap the content in a parchment-card div:
```tsx
    <div className="parchment-card paper-tilt-l mx-3 mt-2 mb-1 overflow-hidden">
      {/* existing map content */}
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MapArea.tsx
git commit -m "style: apply parchment paper styling to MapArea"
```

---

### Task 12: Update GamePage — layout, SanEffect, DiceLog, right panel

**Files:**
- Modify: `frontend/src/pages/GamePage.tsx`

- [ ] **Step 1: Add new imports**

```tsx
import DiceLog from '../components/DiceLog'
import SanEffect from '../components/SanEffect'
```

- [ ] **Step 2: Add state for SAN effect trigger and dice canvas key**

After existing state declarations (around line 32):
```tsx
  const [sanShock, setSanShock] = useState(false)
  const [diceCanvasKey, setDiceCanvasKey] = useState(0)
```

- [ ] **Step 3: Track SAN changes in handleAction**

In the `onStatusUpdate` callback (around line 89), add SAN drop detection:
```tsx
      onStatusUpdate: (update) => {
        const prevSan = store.derivedStats?.SAN_current ?? 0
        store.applyStatusUpdate(update)
        const newSan = store.derivedStats?.SAN_current ?? 0
        if (prevSan - newSan >= 9) {
          setSanShock(true)
          setTimeout(() => setSanShock(false), 100)
        }
      },
```

- [ ] **Step 4: Add SanEffect to the tree**

After the outermost div, add:
```tsx
      <SanEffect trigger={sanShock} />
```

- [ ] **Step 5: Wire up dice log and result completion in handleAction + handleDiceRoll**

Modify `handleDiceRoll` to log the result:
```tsx
  const handleDiceRoll = () => {
    if (!pendingDiceRequest) return
    const result = roll(pendingDiceRequest)
    const check = diceCheck
    const req = pendingDiceRequest
    setPendingDiceRequest(null)
    setDiceCanvasKey(k => k + 1)
    setTimeout(() => {
      store.setDiceResult(result)
      if (check) {
        store.addDiceLog({
          skill: req.skill,
          roll: result.total,
          target: req.value ?? 0,
          success: check.success,
          level: check.level,
        })
      }
      handleAction(`[Roll: ${result.total} | ${result.individual.join(', ')}]`, result)
    }, 2200) // Match dice animation duration
  }
```

- [ ] **Step 6: Pass new props to OptionGrid**

In the OptionGrid usage (around line 183):
```tsx
          <OptionGrid
            ...
            onDiceResultComplete={() => {}}
            diceCanvasKey={diceCanvasKey}
          />
```

- [ ] **Step 7: Replace right sidebar content with DiceLog + character summary**

Replace the right sidebar content (lines 202-220) with a collapsible panel:
```tsx
        {/* Right Sidebar — Collapsible */}
        <div
          className="flex-shrink-0 overflow-y-auto p-3 pl-0"
          style={{ flex: '1', borderLeft: '1px solid rgba(139,109,69,0.1)' }}
        >
          <div className="parchment-card paper-tilt-r p-3 mx-2">
            <details className="group" open>
              <summary className="text-[0.65rem] font-display tracking-wider cursor-pointer select-none"
                       style={{ color: 'var(--color-ash-dark-brown)' }}>
                角色状态
              </summary>
              <div className="mt-2 space-y-1.5 text-[0.6rem] font-mono" style={{ color: 'var(--color-ash-dark-brown)' }}>
                {character ? (
                  <>
                    <div className="flex justify-between">
                      <span>{character.name}</span>
                      <span style={{ color: 'rgba(60,40,20,0.4)' }}>{character.occupation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>HP</span>
                      <span>{stats.HP_current ?? 0} / {stats.HP_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SAN</span>
                      <span>{stats.SAN_current ?? 0} / {stats.SAN_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MP</span>
                      <span>{stats.MP_current ?? 0} / {stats.MP_max ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MOV / DODGE</span>
                      <span>{stats.MOV ?? 0} / {stats.DODGE ?? 0}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs italic" style={{ color: 'rgba(197,165,102,0.35)' }}>Loading...</p>
                )}
              </div>
            </details>
          </div>

          <div className="parchment-card paper-tilt-r p-3 mx-2 mt-2">
            <details open>
              <summary className="text-[0.65rem] font-display tracking-wider cursor-pointer select-none"
                       style={{ color: 'var(--color-ash-dark-brown)' }}>
                骰子日志
              </summary>
              <div className="mt-2">
                <DiceLog entries={store.diceLog} />
              </div>
            </details>
          </div>

          {/* Timeline + Exit */}
          <div className="flex gap-2 mt-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="text-[0.6rem] font-display tracking-wider px-4 py-1.5 rounded"
              style={{
                background: 'rgba(139,69,19,0.15)',
                border: '1px solid rgba(139,69,19,0.2)',
                color: 'var(--color-ash-dark-brown)',
              }}
            >
              Leave Table
            </button>
          </div>
        </div>
```

- [ ] **Step 8: Add bg-felt class to the root div**

Change the root div:
```tsx
    <div className="flex flex-col flex-1 bg-felt relative">
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/GamePage.tsx
git commit -m "feat: integrate SanEffect, DiceLog, paper styling, and collapsible right panel into GamePage"
```

---

### Task 13: Verify TypeScript compilation

**Files:**
- All modified frontend files

- [ ] **Step 1: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Fix any type errors**

If type errors appear, fix them and re-run until clean.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: type errors from GamePage redesign integration"
```

---

### Task 14: Final smoke test

- [ ] **Step 1: Run backend and frontend**

```bash
# Terminal 1 — backend
cd backend && uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Manual check**

Open `http://localhost:5173`, start a game session, verify:
- Felt desktop background visible
- ResourceBar has parchment paper look
- DialogueBox has paper texture
- Options appear on parchment cards
- Click "Roll Dice" → dice animation plays with sound
- Dice result logged in right panel
- SAN drops 9+ → red glow + shake
- Right panel collapsible via `<details>` toggle
- Character info visible in right panel
