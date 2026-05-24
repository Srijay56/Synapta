import React from 'react'
import type { Memory } from '../types'
import { ACTIVITY_COLORS, ACTIVITY_PRESETS } from '../types'
import { Target, Shuffle, Sparkles, Moon, Meh, Brain, Pin } from 'lucide-react'

interface Props {
  memories: Memory[]
}

const MOOD_ICONS: Record<string, any> = {
  focused: Target, scattered: Shuffle, creative: Sparkles, tired: Moon, neutral: Meh
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return 'now'
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MemoryTimeline({ memories }: Props) {
  if (memories.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon"><Brain size={32} /></div>
        <div className="empty-state__text">No memories yet.<br/>Start logging activities.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">Recent Memories ({memories.length})</div>
      {memories.map((m, i) => {
        const color = ACTIVITY_COLORS[m.activity] || '#8b5cf6'
        return (
          <div
            key={m.id || i}
            className="memory-card"
            style={{
              animationDelay: `${i * 0.04}s`,
              borderLeftColor: color,
              borderLeftWidth: 2,
            }}
          >
            <div className="memory-card__header">
              <div className="memory-card__activity" style={{ color }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {(() => {
                    const preset = ACTIVITY_PRESETS.find(p => p.activity === m.activity)
                    const IconComp = preset ? preset.icon : Pin
                    return <IconComp size={14} />
                  })()}
                </span>
                <span>{m.activity}</span>
                <span style={{ opacity: 0.5, display: 'flex', alignItems: 'center' }}>
                  {(() => {
                    const MoodComp = MOOD_ICONS[m.mood]
                    return MoodComp ? <MoodComp size={10} /> : null
                  })()}
                </span>
              </div>
              <div className="memory-card__time">{relativeTime(m.created_at)}</div>
            </div>
            <div className="memory-card__summary">{m.summary}</div>
            <div className="memory-card__tags">
              {m.tags.slice(0, 4).map((tag, j) => (
                <span key={j} className="tag" style={{
                  background: `${color}15`,
                  color: `${color}cc`,
                  borderColor: `${color}22`,
                }}>{tag}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
