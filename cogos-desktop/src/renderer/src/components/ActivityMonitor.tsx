import React, { useState } from 'react'
import { ACTIVITY_PRESETS } from '../types'

interface Props {
  onLog: (activity: string, description: string, duration: number) => void
  isLogging: boolean
}

export default function ActivityMonitor({ onLog, isLogging }: Props) {
  const [lastLogged, setLastLogged] = useState<string | null>(null)

  const handleClick = (activityType: string) => {
    const preset = ACTIVITY_PRESETS.find(p => p.activity === activityType)
    if (!preset) return
    const desc = `Explicit context shift: ${preset.label}`
    const dur = 0
    setLastLogged(activityType)
    onLog(activityType, desc, dur)
    setTimeout(() => setLastLogged(null), 500)
  }

  return (
    <div>
      <div className="section-header">Set Focus Mode</div>
      <div className="activity-grid">
        {ACTIVITY_PRESETS.map(preset => (
          <button
            key={preset.activity}
            className="activity-btn"
            disabled={isLogging}
            onClick={() => handleClick(preset.activity)}
            style={{
              borderColor: lastLogged === preset.activity ? `${preset.color}55` : undefined,
              background: lastLogged === preset.activity ? `${preset.color}12` : undefined,
              transform: lastLogged === preset.activity ? 'scale(0.96)' : undefined,
            }}
          >
            <span className="activity-btn__icon" style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <preset.icon size={16} strokeWidth={2.5} />
            </span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
