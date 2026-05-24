import React from 'react'
import { Search, BarChart2, Lightbulb, Puzzle, Settings, Dna } from 'lucide-react'
import type { UserProfile } from '../types'

interface Props { profile: UserProfile | null }

const ICONS = [Search, BarChart2, Lightbulb, Puzzle, Settings]

export default function PatternInsights({ profile }: Props) {
  const notes = profile?.behavioral_notes || []

  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon"><Dna size={32} /></div>
        <div className="empty-state__text">Patterns emerge after a few sessions.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">Pattern Insights</div>
      {notes.map((note, i) => {
        const IconComponent = ICONS[i % ICONS.length]
        return (
          <div key={i} className="insight-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="insight-card__icon" style={{ display: 'flex', alignItems: 'center' }}>
              <IconComponent size={16} />
            </div>
            <div className="insight-card__text">{note}</div>
          </div>
        )
      })}
    </div>
  )
}
