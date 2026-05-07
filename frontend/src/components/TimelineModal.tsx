import { useState, useEffect } from 'react'
import { getSnapshots, rollbackSession } from '../api/client'
import type { SessionSnapshot } from '../types'

interface Props {
  show: boolean
  onClose: () => void
  sessionId: string
}

export default function TimelineModal({ show, onClose, sessionId }: Props) {
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([])

  useEffect(() => {
    if (!show) return
    getSnapshots(sessionId).then(r => setSnapshots(r.data)).catch(() => {})
  }, [show, sessionId])

  const handleRollback = async (snapshotId: string) => {
    try {
      await rollbackSession(sessionId, snapshotId)
      onClose()
      window.location.reload()
    } catch (err: any) {
      alert('回档失败: ' + err.message)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="parchment-card w-full max-w-lg max-h-[70vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display text-cthulhu-gold">⏱️ 时间线 - 选择回档点</h3>
          <button onClick={onClose} className="parchment-btn text-xs">关闭</button>
        </div>
        <div className="space-y-3">
          {snapshots.map(snap => (
            <div key={snap.id} className="parchment-card border border-parchment-700/20 hover:border-cthulhu-gold/30 transition-colors">
              <div className="flex justify-between items-start mb-1">
                <span className="font-display text-cthulhu-gold text-sm">回合 {snap.turn_number}</span>
                <button onClick={() => handleRollback(snap.id)} className="parchment-btn text-xs">
                  回档到此
                </button>
              </div>
              <p className="text-xs text-parchment-400 mb-1">行动: {snap.player_action}</p>
              <p className="text-xs text-parchment-500 line-clamp-2">{snap.narrative_chunk}</p>
            </div>
          ))}
          {snapshots.length === 0 && (
            <p className="text-center text-parchment-500 text-sm">暂无存档记录</p>
          )}
        </div>
      </div>
    </div>
  )
}
