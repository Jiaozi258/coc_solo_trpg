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
