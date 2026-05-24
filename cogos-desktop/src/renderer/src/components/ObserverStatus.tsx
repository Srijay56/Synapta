// ============================================
// ObserverStatus — Title bar indicator for the autonomous observer
// Shows watching state, observation count, pause/resume toggle
// ============================================

import React, { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { ObserverStatusInfo } from '../types'

export default function ObserverStatus() {
  const [status, setStatus] = useState<ObserverStatusInfo | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  // Poll observer status every 10s
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await window.cognition.getObserverStatus()
        setStatus(result)
      } catch {
        setStatus(null)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)

    // Also listen for real-time updates
    window.cognition.onObserverUpdate((update) => {
      setStatus(prev => prev ? { ...prev, ...update } : null)
    })

    return () => clearInterval(interval)
  }, [])

  const handleToggle = useCallback(async () => {
    if (!status || isToggling) return
    setIsToggling(true)
    try {
      const newPaused = !status.paused
      await window.cognition.setObserverPaused(newPaused)
      setStatus(prev => prev ? { ...prev, paused: newPaused } : null)
    } catch { /* ignore */ }
    setIsToggling(false)
  }, [status, isToggling])

  if (!status) return null

  const isActive = status.status === 'running' && !status.paused
  const isStuck = status.stuck?.is_stuck

  return (
    <div className="observer-status" title={
      isActive
        ? `Watching · ${status.total_observations} observations · ${status.total_learnings} learnings${isStuck ? ' · User may be stuck' : ''}`
        : status.paused ? 'Observer paused' : 'Observer offline'
    }>
      <button
        className={`observer-toggle ${isActive ? 'observer-active' : 'observer-paused'} ${isStuck ? 'observer-stuck' : ''}`}
        onClick={handleToggle}
        disabled={isToggling}
      >
        <span className={`observer-dot ${isActive ? 'dot-active' : 'dot-paused'} ${isStuck ? 'dot-stuck' : ''}`} />
        <span className="observer-eye" style={{ display: 'flex', alignItems: 'center' }}>
          {isActive ? <Eye size={14} /> : <EyeOff size={14} />}
        </span>
        {isActive && (
          <span className="observer-label">
            {isStuck ? 'Watching...' : `${status.total_learnings}`}
          </span>
        )}
      </button>
    </div>
  )
}
