'use client';

import React from 'react';
import type { UserProfile } from '@/types';

interface ProfileCardProps {
  profile: UserProfile | null;
}

const WORK_STYLE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  'deep-focus': { label: 'Deep Focus', emoji: '🎯', color: '#8b5cf6' },
  multitasker: { label: 'Multitasker', emoji: '🔄', color: '#3b82f6' },
  sprinter: { label: 'Sprinter', emoji: '⚡', color: '#f59e0b' },
  unknown: { label: 'Learning...', emoji: '🧠', color: '#6b7280' },
};

const ACTIVITY_COLORS: Record<string, string> = {
  coding: '#8b5cf6',
  browsing: '#3b82f6',
  designing: '#ec4899',
  writing: '#10b981',
  meeting: '#f59e0b',
  break: '#6b7280',
};

export default function ProfileCard({ profile }: ProfileCardProps) {
  if (!profile) {
    return (
      <div className="glass p-5 animate-slide-right" style={{ animationDelay: '0.3s' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Behavioral Profile
        </h3>
        <div className="shimmer h-32 rounded-xl" />
      </div>
    );
  }

  const workStyle = WORK_STYLE_CONFIG[profile.preferred_work_style] || WORK_STYLE_CONFIG.unknown;
  const distribution = Object.entries(profile.activity_distribution || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const maxPct = Math.max(...distribution.map(([, v]) => v), 1);

  return (
    <div className="glass p-5 animate-slide-right" style={{ animationDelay: '0.3s' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Behavioral Profile
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {profile.total_sessions} sessions analyzed
          </p>
        </div>
        <div
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: `${workStyle.color}15`,
            color: workStyle.color,
            border: `1px solid ${workStyle.color}25`,
          }}
        >
          {workStyle.emoji} {workStyle.label}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {/* Focus Duration */}
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: 'rgba(139, 92, 246, 0.06)',
            border: '1px solid rgba(139, 92, 246, 0.1)',
          }}
        >
          <div
            className="text-lg font-bold font-mono"
            style={{ color: 'var(--accent-purple)' }}
          >
            {profile.avg_focus_minutes || '—'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            avg focus (min)
          </div>
        </div>

        {/* Peak Hours */}
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.1)',
          }}
        >
          <div
            className="text-lg font-bold capitalize"
            style={{ color: 'var(--accent-blue)' }}
          >
            {profile.peak_hours === 'unknown' ? '—' : profile.peak_hours}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            peak hours
          </div>
        </div>

        {/* Total Sessions */}
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.1)',
          }}
        >
          <div
            className="text-lg font-bold font-mono"
            style={{ color: 'var(--accent-emerald)' }}
          >
            {profile.total_sessions}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            total sessions
          </div>
        </div>

        {/* Dominant Activity */}
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: 'rgba(236, 72, 153, 0.06)',
            border: '1px solid rgba(236, 72, 153, 0.1)',
          }}
        >
          <div
            className="text-lg font-bold capitalize"
            style={{ color: 'var(--accent-pink)' }}
          >
            {profile.dominant_activity === 'unknown' ? '—' : profile.dominant_activity}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            dominant
          </div>
        </div>
      </div>

      {/* Activity Distribution Bar Chart */}
      {distribution.length > 0 && (
        <div className="mb-1">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
            Activity Distribution
          </h4>
          <div className="space-y-2">
            {distribution.map(([activity, pct]) => (
              <div key={activity} className="flex items-center gap-2.5">
                <span
                  className="text-[10px] font-medium capitalize w-16 text-right"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {activity}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${(pct / maxPct) * 100}%`,
                      background: `linear-gradient(90deg, ${ACTIVITY_COLORS[activity] || '#8b5cf6'}, ${ACTIVITY_COLORS[activity] || '#8b5cf6'}88)`,
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-mono w-8"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
