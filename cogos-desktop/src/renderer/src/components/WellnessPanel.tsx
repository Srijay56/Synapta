// ============================================
// WellnessPanel — Behavioral pattern recognition UI
// Mood ring, stress/focus gauges, active signals, recommendations
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as Icons from 'lucide-react'
import type { WellnessState, WellnessSnapshot } from '../types'

const MOOD_ICONS: Record<string, keyof typeof Icons> = {
  'in-flow': 'Flame',
  'focused': 'Target',
  'idle': 'Coffee',
  'scattered': 'Shuffle',
  'fatigued': 'Moon',
  'stressed': 'Zap',
}

const ENERGY_CONFIG: Record<string, { label: string; icon: keyof typeof Icons; color: string }> = {
  high: { label: 'High Energy', icon: 'Zap', color: '#10b981' },
  medium: { label: 'Moderate', icon: 'BatteryMedium', color: '#f59e0b' },
  low: { label: 'Low Energy', icon: 'BatteryWarning', color: '#ef4444' },
}

export default function WellnessPanel() {
  const [wellness, setWellness] = useState<WellnessState | null>(null)
  const [history, setHistory] = useState<WellnessSnapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchWellness = useCallback(async () => {
    try {
      const [state, hist] = await Promise.all([
        window.cognition.getWellness(),
        window.cognition.getWellnessHistory(12),
      ])
      setWellness(state)
      setHistory(hist || [])
    } catch (err) {
      console.error('Failed to fetch wellness:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load + polling every 15s
  useEffect(() => {
    fetchWellness()
    pollRef.current = setInterval(fetchWellness, 15000)

    // Listen for real-time updates
    window.cognition.onWellnessUpdate((state: WellnessState) => {
      setWellness(state)
    })

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchWellness])

  if (isLoading) {
    return (
      <div className="empty-state">
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <div className="empty-state__text">Analyzing your patterns...</div>
      </div>
    )
  }

  if (!wellness) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <Icons.Activity size={32} strokeWidth={2} />
        </div>
        <div className="empty-state__text">Wellness data unavailable</div>
      </div>
    )
  }

  const stressPercent = Math.round(wellness.stress_level * 100)
  const focusPercent = Math.round(wellness.focus_score * 100)
  const switchPercent = Math.round(wellness.context_switch_rate * 100)
  const energyCfg = ENERGY_CONFIG[wellness.energy_estimate] || ENERGY_CONFIG.medium
  const MoodIcon = Icons[MOOD_ICONS[wellness.mood] || 'Brain'] as React.FC<any>
  const EnergyIcon = Icons[energyCfg.icon] as React.FC<any>

  return (
    <div className="wellness-panel">
      {/* Mood Ring */}
      <div className="mood-ring-container">
        <div className="mood-ring" style={{ '--mood-color': wellness.mood_color } as React.CSSProperties}>
          <div className="mood-ring__glow" />
          <div className="mood-ring__inner">
            <span className="mood-ring__emoji" style={{ display: 'flex', alignItems: 'center' }}>
              <MoodIcon size={36} strokeWidth={1.5} color={wellness.mood_color} />
            </span>
            <span className="mood-ring__label">{wellness.mood_label}</span>
          </div>
        </div>
      </div>

      {/* Stress & Focus Gauges */}
      <div className="wellness-gauges">
        <div className="wellness-gauge">
          <div className="wellness-gauge__header">
            <span className="wellness-gauge__label">Stress</span>
            <span className="wellness-gauge__value" style={{ color: stressPercent > 50 ? '#ef4444' : stressPercent > 25 ? '#f59e0b' : '#10b981' }}>
              {stressPercent}%
            </span>
          </div>
          <div className="wellness-gauge__track">
            <div
              className="wellness-gauge__fill wellness-gauge__fill--stress"
              style={{
                width: `${stressPercent}%`,
                background: stressPercent > 50
                  ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                  : stressPercent > 25
                  ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                  : 'linear-gradient(90deg, #10b981, #3b82f6)',
              }}
            />
          </div>
        </div>
        <div className="wellness-gauge">
          <div className="wellness-gauge__header">
            <span className="wellness-gauge__label">Focus</span>
            <span className="wellness-gauge__value" style={{ color: focusPercent >= 60 ? '#10b981' : focusPercent >= 40 ? '#f59e0b' : '#ef4444' }}>
              {focusPercent}%
            </span>
          </div>
          <div className="wellness-gauge__track">
            <div
              className="wellness-gauge__fill wellness-gauge__fill--focus"
              style={{
                width: `${focusPercent}%`,
                background: focusPercent >= 60
                  ? 'linear-gradient(90deg, #3b82f6, #10b981)'
                  : focusPercent >= 40
                  ? 'linear-gradient(90deg, #f59e0b, #3b82f6)'
                  : 'linear-gradient(90deg, #ef4444, #f59e0b)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Session Stats */}
      <div className="wellness-stats">
        <div className="wellness-stat">
          <div className="wellness-stat__value">{Math.round(wellness.session_duration_minutes)}<span className="wellness-stat__unit">min</span></div>
          <div className="wellness-stat__label">session</div>
        </div>
        <div className="wellness-stat">
          <div className="wellness-stat__value">{switchPercent}<span className="wellness-stat__unit">%</span></div>
          <div className="wellness-stat__label">switch rate</div>
        </div>
        <div className="wellness-stat">
          <div className="wellness-stat__value" style={{ color: energyCfg.color, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <EnergyIcon size={24} strokeWidth={2} />
          </div>
          <div className="wellness-stat__label">{energyCfg.label.toLowerCase()}</div>
        </div>
      </div>

      {/* Active Signals */}
      {wellness.active_signals.length > 0 && (
        <div className="wellness-section">
          <div className="section-header">Active Signals</div>
          <div className="wellness-signals">
            {wellness.active_signals.map((signal, i) => (
              <div
                key={signal.name}
                className={`wellness-signal wellness-signal--${signal.category}`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <span className="wellness-signal__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                  {(() => {
                    const SigIcon = (Icons as any)[signal.icon_name] || Icons.Info
                    return <SigIcon size={18} strokeWidth={2.5} />
                  })()}
                </span>
                <div className="wellness-signal__content">
                  <span className="wellness-signal__name">{signal.name.replace(/_/g, ' ')}</span>
                  <span className="wellness-signal__desc">{signal.description}</span>
                </div>
                {signal.severity > 0 && (
                  <div className="wellness-signal__severity">
                    <div className="wellness-signal__severity-fill" style={{
                      width: `${signal.severity * 100}%`,
                      background: signal.category === 'info' ? '#3b82f6' : signal.category === 'fatigue' ? '#f97316' : '#ef4444'
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {wellness.recommendations.length > 0 && (
        <div className="wellness-section">
          <div className="section-header">What You Can Do</div>
          <div className="wellness-recs">
            {wellness.recommendations.map((rec, i) => (
              <div
                key={`${rec.signal_name}-${i}`}
                className="wellness-rec"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <span className="wellness-rec__emoji" style={{ display: 'flex', alignItems: 'center' }}>
                  {(() => {
                    const RecIcon = (Icons as any)[rec.icon_name] || Icons.Lightbulb
                    return <RecIcon size={20} strokeWidth={2} />
                  })()}
                </span>
                <p className="wellness-rec__text">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mood History Sparkline */}
      {history.length > 1 && (
        <div className="wellness-section">
          <div className="section-header">Mood Trail</div>
          <div className="mood-trail">
            {history.map((snap, i) => {
              const time = new Date(snap.timestamp * 1000)
              const label = `${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`
              return (
                <div key={i} className="mood-trail__dot-wrap" title={`${label} — ${snap.mood}`}>
                  <div
                    className="mood-trail__dot"
                    style={{
                      background: snap.mood_color,
                      boxShadow: `0 0 6px ${snap.mood_color}60`,
                    }}
                  />
                  <span className="mood-trail__time">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Privacy note */}
      <div className="wellness-privacy">
        🔒 All analysis runs locally on your device
      </div>
    </div>
  )
}
