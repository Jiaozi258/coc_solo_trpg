import { useEffect, useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { getLocations } from '../api/client'

const ICON_MAP: Record<string, string> = {
  university: '🏛', church: '⛪', library: '📚', hospital: '🏥',
  hotel: '🏨', mansion: '🏰', shop: '🏪', police: '🏛',
  office: '🏢', forest: '🌲', cave: '🕳', ruins: '🏚',
  generic: '📍',
}

interface Props {
  moduleId: string | undefined
}

export default function MapArea({ moduleId }: Props) {
  const {
    currentLocations, navStack, mapMode, isCollapsed,
    navigateTo, navigateBack, toggleMapMode, toggleCollapsed, setLocations,
  } = useMapStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!moduleId || loaded) return
    getLocations(moduleId).then(r => {
      setLocations(r.data.locations)
      setLoaded(true)
    }).catch(() => {})
  }, [moduleId, loaded, setLocations])

  const hasParent = navStack.length > 0

  return (
    <div className={`border-b border-parchment-700/30 bg-parchment-950/80 transition-all duration-300 ${
      isCollapsed ? 'h-10' : 'min-h-[180px]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-parchment-700/20">
        <div className="flex items-center gap-3">
          <span className="font-display text-cthulhu-gold text-sm">📍 地图</span>
          <div className="flex items-center gap-1 text-xs text-parchment-500">
            {hasParent && (
              <button onClick={navigateBack} className="hover:text-cthulhu-gold transition-colors">
                ← 返回上层
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMapMode} className="parchment-btn text-xs">
            {mapMode === 'world' ? '🌍 大地图' : '🗺️ 小地图'}
          </button>
          <button onClick={toggleCollapsed} className="parchment-btn text-xs">
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Map Content */}
      {!isCollapsed && (
        <div className="p-4">
          {currentLocations.length === 0 ? (
            <div className="text-center py-8 text-parchment-600 text-sm">
              暂无地点数据 — 上传模组后 AI 将自动提取地点信息
            </div>
          ) : mapMode === 'world' ? (
            <div className="flex flex-wrap gap-4 justify-center">
              {currentLocations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => loc.children.length > 0 && navigateTo(loc)}
                  className="group flex flex-col items-center gap-1 p-3 rounded-lg
                             hover:bg-parchment-800/40 transition-all duration-200
                             hover:scale-110"
                  title={loc.description || loc.name}
                >
                  <span className="text-3xl transition-transform duration-200
                                   group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(201,168,76,0.5)]">
                    {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                  </span>
                  <span className="text-xs text-parchment-300 group-hover:text-cthulhu-gold
                                   transition-colors">
                    {loc.name}
                  </span>
                  {loc.children.length > 0 && (
                    <span className="text-[10px] text-parchment-600">({loc.children.length} 处)</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 max-w-2xl mx-auto">
              {Array.from({ length: 25 }).map((_, i) => {
                const loc = currentLocations[i]
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded border border-parchment-700/20
                                flex items-center justify-center text-lg
                                ${loc
                                  ? 'bg-parchment-900/60 cursor-pointer hover:border-cthulhu-gold/40'
                                  : 'bg-parchment-950/40'
                                } transition-colors`}
                    onClick={() => loc && loc.children.length > 0 && navigateTo(loc)}
                    title={loc?.name}
                  >
                    {loc ? (
                      <span className="relative">
                        {ICON_MAP[loc.icon_type] || ICON_MAP.generic}
                        {loc.has_quest && (
                          <span className="absolute -top-1 -right-1 text-xs
                                           text-cthulhu-blood animate-pulse">!</span>
                        )}
                      </span>
                    ) : null}
                  </div>
                )
              })}
              {currentLocations.length > 25 && (
                <div className="col-span-5 text-center text-xs text-parchment-500 mt-2">
                  ...还有 {currentLocations.length - 25} 个地点
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
