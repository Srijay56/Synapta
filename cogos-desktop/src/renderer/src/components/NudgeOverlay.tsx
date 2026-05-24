// ============================================
// NudgeOverlay — Proactive "friend" nudge when user is stuck
// Slides in from top, offers help or dismissal
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { NudgeEvent, HelpResponse } from '../types'

interface Props {
  nudge: NudgeEvent | null
  onDismiss: () => void
}

type NudgeState = 'showing' | 'loading' | 'helping' | 'dismissed'

export default function NudgeOverlay({ nudge, onDismiss }: Props) {
  const [state, setState] = useState<NudgeState>('dismissed')
  const [helpResponse, setHelpResponse] = useState<HelpResponse | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show nudge when one arrives
  useEffect(() => {
    if (nudge && state === 'dismissed') {
      setState('showing')
      setHelpResponse(null)
      setIsExiting(false)

      // Auto-dismiss after 30 seconds if not interacted with
      autoDismissRef.current = setTimeout(() => {
        handleDismiss()
      }, 30000)
    }

    return () => {
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current)
      }
    }
  }, [nudge])

  const handleDismiss = useCallback(async () => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current)
    }
    setIsExiting(true)
    try {
      await window.cognition.dismissNudge()
    } catch { /* ignore */ }
    setTimeout(() => {
      setState('dismissed')
      setIsExiting(false)
      onDismiss()
    }, 300)
  }, [onDismiss])

  const handleAcceptHelp = useCallback(async () => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current)
    }
    setState('loading')

    try {
      // Accept the nudge first
      await window.cognition.acceptNudge()
      // Then get AI help
      const result = await window.cognition.getHelp()
      setHelpResponse(result)
      setState('helping')
    } catch (err) {
      setHelpResponse({
        ok: false,
        suggestions: 'Something went wrong while analyzing your screen. Try again in a moment.',
        error: String(err),
      })
      setState('helping')
    }
  }, [])

  const handleCloseHelp = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      setState('dismissed')
      setIsExiting(false)
      setHelpResponse(null)
      onDismiss()
    }, 300)
  }, [onDismiss])

  if (state === 'dismissed') return null

  return (
    <div className={`nudge-overlay ${isExiting ? 'nudge-exit' : 'nudge-enter'}`}>
      {/* Nudge notification */}
      {state === 'showing' && nudge && (
        <div className="nudge-card">
          <div className="nudge-icon-pulse">
            <span className="nudge-icon">🤝</span>
          </div>
          <div className="nudge-content">
            <p className="nudge-message">{nudge.message}</p>
            <div className="nudge-meta">
              <span className="nudge-window">{nudge.window}</span>
              <span className="nudge-dot">·</span>
              <span className="nudge-duration">{nudge.duration_minutes.toFixed(0)} min</span>
            </div>
          </div>
          <div className="nudge-actions">
            <button className="nudge-btn nudge-btn-help" onClick={handleAcceptHelp}>
              Help me out
            </button>
            <button className="nudge-btn nudge-btn-dismiss" onClick={handleDismiss}>
              I'm fine
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {state === 'loading' && (
        <div className="nudge-card nudge-card-loading">
          <div className="nudge-loading-content">
            <div className="nudge-thinking-dots">
              <span></span><span></span><span></span>
            </div>
            <p className="nudge-loading-text">Looking at your screen and thinking...</p>
          </div>
        </div>
      )}

      {/* Help suggestions */}
      {state === 'helping' && helpResponse && (
        <div className="nudge-card nudge-card-help">
          <div className="nudge-help-header">
            <span className="nudge-help-icon">💡</span>
            <span className="nudge-help-title">Here's what I see</span>
            <button className="nudge-close-btn" onClick={handleCloseHelp} title="Close">
              ×
            </button>
          </div>
          <div className="nudge-help-body">
            <div className="nudge-suggestions">
              {helpResponse.suggestions.split('\n').map((line, i) => {
                const trimmed = line.trim()
                if (!trimmed) return null

                // Style numbered steps differently
                const isStep = /^\d+[\.\)]/.test(trimmed)
                const isBullet = /^[-•*]/.test(trimmed)

                return (
                  <p
                    key={i}
                    className={
                      isStep ? 'nudge-step' :
                      isBullet ? 'nudge-bullet' :
                      'nudge-text'
                    }
                  >
                    {trimmed}
                  </p>
                )
              })}
            </div>
          </div>
          <div className="nudge-help-footer">
            <span className="nudge-privacy">🔒 All analysis ran locally on your device</span>
            <button className="nudge-btn nudge-btn-dismiss" onClick={handleCloseHelp}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
