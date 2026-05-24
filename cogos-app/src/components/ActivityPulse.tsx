'use client';

import React from 'react';

interface ActivityPulseProps {
  currentActivity: string | null;
  isActive: boolean;
}

const ACTIVITY_COLORS: Record<string, string> = {
  coding: '#8b5cf6',
  browsing: '#3b82f6',
  designing: '#ec4899',
  writing: '#10b981',
  meeting: '#f59e0b',
  break: '#6b7280',
};

const ACTIVITY_EMOJIS: Record<string, string> = {
  coding: '💻',
  browsing: '🌐',
  designing: '🎨',
  writing: '✍️',
  meeting: '📞',
  break: '☕',
};

export default function ActivityPulse({ currentActivity, isActive }: ActivityPulseProps) {
  const color = currentActivity ? ACTIVITY_COLORS[currentActivity] || '#8b5cf6' : '#8b5cf6';
  const emoji = currentActivity ? ACTIVITY_EMOJIS[currentActivity] || '🧠' : '🧠';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pulse rings container */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        {/* Outer rings */}
        {isActive && (
          <>
            <div
              className="absolute inset-0 rounded-full opacity-20"
              style={{
                border: `2px solid ${color}`,
                animation: 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            <div
              className="absolute inset-0 rounded-full opacity-15"
              style={{
                border: `2px solid ${color}`,
                animation: 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.5s',
              }}
            />
            <div
              className="absolute inset-0 rounded-full opacity-10"
              style={{
                border: `2px solid ${color}`,
                animation: 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 1s',
              }}
            />
          </>
        )}

        {/* Center circle */}
        <div
          className="relative w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all duration-500"
          style={{
            background: `radial-gradient(circle, ${color}22, ${color}08)`,
            border: `2px solid ${color}40`,
            boxShadow: isActive ? `0 0 20px ${color}30, 0 0 40px ${color}10` : 'none',
          }}
        >
          {emoji}
        </div>
      </div>

      {/* Status text */}
      <div className="text-center">
        <p
          className="text-xs font-medium transition-colors duration-300"
          style={{ color: isActive ? color : 'var(--text-muted)' }}
        >
          {isActive ? (currentActivity || 'Active') : 'Idle'}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isActive ? 'Recording...' : 'Waiting for input'}
        </p>
      </div>
    </div>
  );
}
