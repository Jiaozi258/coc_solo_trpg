import { useEffect, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { getLocations } from '../api/client'
import type { LocationNode } from '../types'

const ICON_MAP: Record<string, string> = {
  university: '🏛️', church: '⛪', library: '📚', hospital: '🏥',
  hotel: '🏨', mansion: '🏰', shop: '🏪', police: '👮',
  office: '🏢', forest: '🌲', cave: '🕳️', ruins: '🏚️',
  generic: '📍',
}

interface MapAreaProps {
  moduleId?: string
}

export default function MapArea({ moduleId }: MapAreaProps) {
  const {
    locations, currentLocations, navStack, mapMode, isCollapsed,
    setLocations, navigateTo, navigateBack, toggleMapMode, toggleCollapsed,
  } = useMapStore()

  const [loaded, setLoaded] = useState(false)
  const [hoveredLoc, setHoveredLoc] = useState<LocationNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!moduleId || loaded) return
    getLocations(moduleId).then(r => {
      setLocations(r.data.locations || [])
      setLoaded(true)
    }).catch(() => {})
  }, [moduleId, loaded, setLocations])

  const handleLocationClick = (loc: LocationNode) => {
    if (loc.children && loc.children.length > 0) {
      navigateTo(loc)
    }
  }

  const handleMouseEnter = (loc: LocationNode, e: React.MouseEvent) => {
    setHoveredLoc(loc)
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseLeave = () => setHoveredLoc(null)

  const displayLocs = currentLocations.length > 0 ? currentLocations : locations

  return (
    <div className="parchment-card paper-tilt-l mx-3 mt-2 mb-1 overflow-hidden">
    <div
      className="ash-border-box flex flex-col transition-all duration-300"
      style={{ minHeight: isCollapsed ? 0 : 220 }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(197,165,102,0.1)' }}
      >
        <div className="flex items-center gap-2">
          <span className="ash-section-title">
            {navStack.length > 0 ? 'Local Map' : 'World Map'}
          </span>
          {navStack.length > 0 && (
            <button
              onClick={navigateBack}
              className="text-[0.6rem] font-mono text-ash-gold-dim hover:text-ash-gold transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMapMode} className="ash-btn text-[0.6rem]">
            {mapMode === 'world' ? 'Grid' : 'Icons'}
          </button>
          <button onClick={toggleCollapsed} className="ash-btn text-[0.6rem]">
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      <div
        style={{
          maxHeight: isCollapsed ? '0' : '400px',
          opacity: isCollapsed ? 0 : 1,
          overflow: 'hidden',
          transition: 'max-height 0.35s ease, opacity 0.25s ease',
        }}
      >
        <div className="flex-1 p-3 relative" style={{ minHeight: 180 }}>
          {displayLocs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-ash-parchment-dim italic">
                Upload a scenario module to populate the map.
              </p>
            </div>
          ) : mapMode === 'world' ? (
            /* ── World Map: scattered location icons ── */
            <div className="relative w-full h-full" style={{ minHeight: 180 }}>
              {/* Compass rose */}
              <div className="absolute bottom-1 right-2 opacity-15 pointer-events-none select-none">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-ash-gold)" strokeWidth="1">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  <path d="M12 2l2 6-2 2-2-2 2-6z" fill="var(--color-ash-gold)" opacity="0.4" />
                </svg>
              </div>

              {displayLocs.map((loc, i) => {
                const cols = Math.max(1, Math.ceil(Math.sqrt(displayLocs.length)))
                const row = Math.floor(i / cols)
                const col = i % cols
                const totalRows = Math.ceil(displayLocs.length / cols)
                const left = 5 + (col / cols) * 88 + '%'
                const top = 5 + (row / Math.max(1, totalRows)) * 80 + '%'

                return (
                  <div
                    key={loc.id}
                    className="absolute cursor-pointer transition-all hover:scale-110"
                    style={{ left, top, transform: 'translate(-50%, -50%)' }}
                    onClick={() => handleLocationClick(loc)}
                    onMouseEnter={(e) => handleMouseEnter(loc, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-2xl filter drop-shadow-lg select-none">
                        {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                      </span>
                      <span className="text-[0.55rem] font-mono text-ash-gold-dim truncate max-w-[64px] text-center">
                        {loc.name}
                      </span>
                      {loc.has_quest && (
                        <span className="quest-marker text-[0.6rem]">!</span>
                      )}
                      {loc.children && loc.children.length > 0 && (
                        <span className="text-[0.5rem] text-ash-parchment-dim">
                          +{loc.children.length}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Local Map: 5×5 Grid ── */
            <div>
              <div
                className="grid gap-px mx-auto"
                style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxWidth: 250 }}
              >
                {Array.from({ length: 25 }).map((_, i) => {
                  const loc = i < displayLocs.length ? displayLocs[i] : null
                  return (
                    <div
                      key={i}
                      className="map-grid-cell"
                      style={{ width: 46, height: 46 }}
                      onClick={() => loc && handleLocationClick(loc)}
                      onMouseEnter={(e) => loc && handleMouseEnter(loc, e)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {loc ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base">
                            {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                          </span>
                          {loc.has_quest && (
                            <span className="quest-marker text-[0.55rem]">!</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[0.6rem] text-ash-parchment-dim opacity-15">·</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[0.55rem] text-ash-parchment-dim text-center mt-2 font-mono">
                5 × 5 Grid — {displayLocs.length} location{displayLocs.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Tooltip */}
          {hoveredLoc && (
            <div
              className="fixed z-50 pointer-events-none"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10 }}
            >
              <div className="ash-card p-2 max-w-[200px]">
                <div className="text-xs font-display text-ash-gold mb-0.5">{hoveredLoc.name}</div>
                {hoveredLoc.description && (
                  <div className="text-[0.6rem] text-ash-parchment-dim">{hoveredLoc.description}</div>
                )}
                {hoveredLoc.has_quest && (
                  <div className="text-[0.55rem] text-ash-red font-mono mt-0.5">Quest Available</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
