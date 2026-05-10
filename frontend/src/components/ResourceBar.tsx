interface ResourceBarProps {
  hp: { current: number; max: number }
  san: { current: number; max: number }
  mp: { current: number; max: number }
  gold?: number
}

export default function ResourceBar({ hp, san, mp, gold = 0 }: ResourceBarProps) {
  const stats = [
    {
      label: 'Health',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ash-red">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
      current: hp.current,
      max: hp.max,
      pct: hp.max > 0 ? (hp.current / hp.max) * 100 : 0,
      color: 'var(--color-ash-red)',
    },
    {
      label: 'Sanity',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ash-gold-dim">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
      current: san.current,
      max: san.max,
      pct: san.max > 0 ? (san.current / san.max) * 100 : 0,
      color: 'var(--color-ash-gold)',
    },
    {
      label: 'Magic',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ash-gold-pale">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
      current: mp.current,
      max: mp.max,
      pct: mp.max > 0 ? (mp.current / mp.max) * 100 : 0,
      color: 'var(--color-ash-gold-pale)',
    },
    {
      label: 'Gold',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ash-gold">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M8 10h8M8 14h8" />
        </svg>
      ),
      current: gold.toLocaleString(),
      max: null,
      pct: null,
      color: 'var(--color-ash-gold)',
    },
  ]

  return (
    <div className="parchment-card pin-top px-3 py-2 mx-3 mt-2 paper-tilt-l">
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="ash-stat-card">
            <div className="flex-shrink-0">{s.icon}</div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[0.6rem] font-mono tracking-wider uppercase mb-0.5"
                style={{ color: 'var(--color-ash-dark-brown)' }}
              >
                {s.label}
              </div>
              <div
                className="text-sm font-bold font-mono"
                style={{ color: 'var(--color-ash-dark-brown)' }}
              >
                <span>{s.current}</span>
                {s.max !== null && (
                  <span style={{ color: 'rgba(60,40,20,0.4)' }}> / {s.max}</span>
                )}
              </div>
              {s.pct !== null && (
                <div
                  className="ash-progress-bg mt-1.5 w-full"
                  style={{ background: 'rgba(139,109,69,0.12)' }}
                >
                  <div
                    className="ash-progress-fill"
                    style={{
                      width: `${Math.min(100, s.pct)}%`,
                      background: s.pct < 20 ? 'var(--color-ash-red)' : s.color,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
