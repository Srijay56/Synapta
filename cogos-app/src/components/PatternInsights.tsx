'use client';

import React from 'react';
import type { UserProfile } from '@/types';

interface PatternInsightsProps {
  profile: UserProfile | null;
}

const INSIGHT_ICONS: string[] = ['🔍', '📊', '💡', '🧩', '⚙️'];

export default function PatternInsights({ profile }: PatternInsightsProps) {
  const notes = profile?.behavioral_notes || [];

  return (
    <div className="glass p-5 animate-slide-right" style={{ animationDelay: '0.4s' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Pattern Insights
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Inferred from your behavior
          </p>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          🧬
        </span>
      </div>

      {/* Insights */}
      <div className="space-y-2">
        {notes.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2 opacity-30">🧬</div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Patterns emerge after a few sessions
            </p>
          </div>
        ) : (
          notes.map((note, index) => (
            <div
              key={index}
              className="flex items-start gap-2.5 p-3 rounded-xl transition-all duration-300 animate-fade-up"
              style={{
                background: 'rgba(139, 92, 246, 0.04)',
                border: '1px solid rgba(139, 92, 246, 0.08)',
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <span className="text-sm mt-0.5 shrink-0">
                {INSIGHT_ICONS[index % INSIGHT_ICONS.length]}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {note}
                </p>
              </div>
              {/* Confidence dots */}
              <div className="flex gap-0.5 mt-1 shrink-0">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{
                      background:
                        i < Math.min(index + 2, 3)
                          ? 'var(--accent-purple)'
                          : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
