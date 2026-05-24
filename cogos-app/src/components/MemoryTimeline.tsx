'use client';

import React from 'react';
import type { Memory } from '@/types';

interface MemoryTimelineProps {
  memories: Memory[];
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

const MOOD_EMOJIS: Record<string, string> = {
  focused: '🎯',
  scattered: '🔀',
  creative: '✨',
  tired: '😴',
  neutral: '😐',
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export default function MemoryTimeline({ memories }: MemoryTimelineProps) {
  return (
    <div className="glass p-5 animate-slide-right" style={{ animationDelay: '0.2s' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Memory Timeline
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {memories.length} memories stored
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--accent-purple)',
              boxShadow: '0 0 6px rgba(139, 92, 246, 0.5)',
            }}
          />
          <span className="text-[10px] font-medium" style={{ color: 'var(--accent-purple)' }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div
        className="space-y-2.5 overflow-y-auto pr-1"
        style={{ maxHeight: 'calc(100vh - 320px)' }}
      >
        {memories.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-3xl mb-3 opacity-30">🧠</div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No memories yet. Start logging activities.
            </p>
          </div>
        ) : (
          memories.map((memory, index) => {
            const color = ACTIVITY_COLORS[memory.activity] || '#8b5cf6';
            const emoji = ACTIVITY_EMOJIS[memory.activity] || '📌';
            const moodEmoji = MOOD_EMOJIS[memory.mood] || '😐';

            return (
              <div
                key={memory.id || index}
                className="animate-memory-appear group"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div
                  className="relative rounded-xl p-3.5 transition-all duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${color}08, transparent)`,
                    border: `1px solid ${color}15`,
                  }}
                >
                  {/* Top row: emoji + activity + time */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{emoji}</span>
                      <span
                        className="text-xs font-semibold capitalize"
                        style={{ color }}
                      >
                        {memory.activity}
                      </span>
                      <span className="text-xs opacity-60">{moodEmoji}</span>
                    </div>
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {memory.created_at
                        ? getRelativeTime(memory.created_at)
                        : 'now'}
                    </span>
                  </div>

                  {/* Summary */}
                  <p
                    className="text-xs leading-relaxed mb-2.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {memory.summary}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {memory.tags.slice(0, 4).map((tag, i) => (
                      <span
                        key={i}
                        className="tag-pill"
                        style={{
                          background: `${color}12`,
                          color: `${color}cc`,
                          borderColor: `${color}20`,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Left accent line */}
                  <div
                    className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full transition-opacity duration-300"
                    style={{
                      background: `linear-gradient(to bottom, ${color}, transparent)`,
                      opacity: 0.4,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
