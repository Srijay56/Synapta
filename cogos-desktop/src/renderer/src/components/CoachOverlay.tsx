// ============================================
// CoachOverlay — Proactive every-minute AI coaching
// Pops up automatically when idle or when significant screen change detected
// Feels like a brilliant mentor tapping your shoulder
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Target, Hand, Search, Lightbulb, Lock, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface CoachInsight {
  insight: string
  suggestions?: { title: string; steps: string[] }[]
  timestamp: number
  window: string
  is_idle: boolean
  idle_seconds: number
  auto_show: boolean
  is_stuck: boolean
}

type CoachState = 'hidden' | 'peek' | 'open' | 'exiting'

export default function CoachOverlay() {
  const [insight, setInsight] = useState<CoachInsight | null>(null)
  const [panelState, setPanelState] = useState<CoachState>('hidden')
  const [isIdle, setIsIdle] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null)
  
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current)
  }

  // Handle incoming coaching insights
  useEffect(() => {
    window.cognition.onCoachInsight((incoming: CoachInsight) => {
      setInsight(incoming)
      setExpandedSuggestion(null) // Reset on new insight

      // User requested: always auto-show the insight panel if the app is open
      clearTimers()
      setPanelState('open')
      // Auto-hide after 45s if not interacted with
      autoDismissRef.current = setTimeout(() => dismiss(), 45000)
    })

    // Track idle state
    window.cognition.onIdle((state: any) => {
      setIsIdle(true)
    })

    window.cognition.onActive((_: any) => {
      setIsIdle(false)
    })
  }, [])

  const dismiss = useCallback(() => {
    clearTimers()
    setPanelState('exiting')
    setTimeout(() => {
      setPanelState('hidden')
      setIsIdle(false)
      setExpandedSuggestion(null)
    }, 300)
  }, [])

  const expand = useCallback(() => {
    clearTimers()
    setPanelState('open')
    // Auto-dismiss after 60s once fully opened
    autoDismissRef.current = setTimeout(() => dismiss(), 60000)
  }, [dismiss])

  const handleTriggerNow = useCallback(async () => {
    setIsThinking(true)
    try {
      await window.cognition.coachTrigger()
      // Insight will arrive via WebSocket, handled by onCoachInsight
    } catch { /* ignore */ }
    setTimeout(() => setIsThinking(false), 3000)
  }, [])

  const toggleSuggestion = (index: number) => {
    // If interacting, clear auto-dismiss so it doesn't close on them
    clearTimers()
    setExpandedSuggestion(prev => prev === index ? null : index)
  }

  return (
    <div className="coach-overlay" style={{ pointerEvents: panelState === 'hidden' ? 'none' : 'auto' }}>
      <AnimatePresence>
        {/* Peek state — minimal tab showing something is ready */}
        {panelState === 'peek' && insight && (
          <motion.div 
            key="peek"
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="coach-peek" 
            onClick={expand}
          >
            <span className="coach-peek-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <Lightbulb size={16} />
            </span>
            <span className="coach-peek-text">New insight from {insight.window || 'your screen'}</span>
            <span className="coach-peek-arrow">›</span>
          </motion.div>
        )}

        {/* Open state — full coaching panel */}
        {(panelState === 'open' || panelState === 'exiting') && insight && (
          <motion.div 
            key="open"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="coach-panel"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="coach-panel-header">
              <div className="coach-header-left">
                <span className="coach-panel-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  {insight.is_idle ? <Hand size={20} /> : insight.is_stuck ? <Search size={20} /> : <Target size={20} />}
                </span>
                <div>
                  <span className="coach-panel-title">
                    {insight.is_idle
                      ? `Welcome back — here's where you left off`
                      : insight.is_stuck
                      ? `Let's get you unstuck`
                      : `Here's what I noticed`}
                  </span>
                  <span className="coach-panel-window">{insight.window}</span>
                </div>
              </div>
              <button className="coach-close-btn" onClick={dismiss} title="Dismiss">×</button>
            </div>

            <div className="coach-panel-body">
              <div className="coach-insight-text">
                {(typeof insight.insight === 'string' ? insight.insight : String(insight.insight || '')).split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return <div key={i} className="coach-spacer" />

                  const isNumbered = /^\d+[\.\)]/.test(trimmed)
                  const isBullet = /^[-•*►]/.test(trimmed)
                  const isHeader = /^#+\s/.test(trimmed) || trimmed.endsWith(':')
                  const isWarning = /^[⚠️🔴🚨]/.test(trimmed) || trimmed.toLowerCase().startsWith('warning')

                  return (
                    <p key={i} className={
                      isWarning ? 'coach-line-warn' :
                      isHeader ? 'coach-line-header' :
                      isNumbered ? 'coach-line-step' :
                      isBullet ? 'coach-line-bullet' :
                      'coach-line-text'
                    }>
                      {trimmed}
                    </p>
                  )
                })}
              </div>

              {(() => {
                // Safely normalize suggestions — the AI may return unexpected shapes
                const rawSuggs = insight.suggestions
                if (!rawSuggs || !Array.isArray(rawSuggs) || rawSuggs.length === 0) return null

                const safeSuggs = rawSuggs
                  .map((s: any) => {
                    if (!s || typeof s !== 'object') return null
                    const title = typeof s.title === 'string' ? s.title : String(s.title || '')
                    const steps = Array.isArray(s.steps)
                      ? s.steps.map((st: any) => String(st))
                      : typeof s.steps === 'string'
                      ? [s.steps]
                      : []
                    if (!title) return null
                    return { title, steps }
                  })
                  .filter(Boolean) as { title: string; steps: string[] }[]

                if (safeSuggs.length === 0) return null

                return (
                  <div className="coach-suggestions-container" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {safeSuggs.map((sugg, idx) => {
                      const isExpanded = expandedSuggestion === idx;
                      return (
                        <div key={idx} className="coach-suggestion-card" style={{ background: 'var(--surface-raised)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <button 
                            onClick={() => toggleSuggestion(idx)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '13px' }}>
                              <Lightbulb size={14} color="var(--accent-amber)" />
                              {sugg.title}
                            </div>
                            {isExpanded ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}
                          </button>
                          
                          <AnimatePresence>
                            {isExpanded && sugg.steps.length > 0 && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {sugg.steps.map((step, stepIdx) => (
                                    <div key={stepIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                      <span style={{ color: 'var(--accent)', marginTop: '2px' }}><CheckCircle size={12} /></span>
                                      <span>{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            <div className="coach-panel-footer">
              <span className="coach-privacy-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} /> On-device
              </span>
              <div className="coach-footer-actions">
                <button className="coach-btn-dismiss" onClick={dismiss}>
                  Got it
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

