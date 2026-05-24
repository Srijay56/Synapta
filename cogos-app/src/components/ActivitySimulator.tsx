'use client';

import React, { useState } from 'react';
import { ACTIVITY_PRESETS } from '@/types';

interface ActivitySimulatorProps {
  onActivityLog: (activity: string, description: string, duration: number) => void;
  isLogging: boolean;
}

export default function ActivitySimulator({ onActivityLog, isLogging }: ActivitySimulatorProps) {
  const [lastLogged, setLastLogged] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [autoInterval, setAutoInterval] = useState<NodeJS.Timeout | null>(null);

  const handleActivity = (activityType: string) => {
    const preset = ACTIVITY_PRESETS.find((p) => p.activity === activityType);
    if (!preset) return;

    const desc = preset.descriptions[Math.floor(Math.random() * preset.descriptions.length)];
    const duration = Math.floor(Math.random() * 30) + 5; // 5-35 minutes

    setLastLogged(activityType);
    onActivityLog(activityType, desc, duration);

    // Reset the highlight after animation
    setTimeout(() => setLastLogged(null), 600);
  };

  const toggleAutoMode = () => {
    if (autoMode && autoInterval) {
      clearInterval(autoInterval);
      setAutoInterval(null);
      setAutoMode(false);
    } else {
      setAutoMode(true);
      const interval = setInterval(() => {
        const randomPreset = ACTIVITY_PRESETS[Math.floor(Math.random() * ACTIVITY_PRESETS.length)];
        handleActivity(randomPreset.activity);
      }, 2500);
      setAutoInterval(interval);
    }
  };

  return (
    <div className="glass p-5 animate-slide-left" style={{ animationDelay: '0.1s' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Activity Simulator
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Simulate your work activities
          </p>
        </div>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: isLogging ? 'var(--accent-emerald)' : 'var(--text-muted)',
            boxShadow: isLogging ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
          }}
        />
      </div>

      {/* Activity Buttons Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {ACTIVITY_PRESETS.map((preset) => (
          <button
            key={preset.activity}
            onClick={() => handleActivity(preset.activity)}
            disabled={isLogging}
            className="relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left transition-all duration-300 cursor-pointer group overflow-hidden"
            style={{
              background:
                lastLogged === preset.activity
                  ? `${preset.color}18`
                  : 'var(--bg-glass)',
              border: `1px solid ${
                lastLogged === preset.activity
                  ? `${preset.color}40`
                  : 'var(--border-glass)'
              }`,
              transform: lastLogged === preset.activity ? 'scale(0.97)' : 'scale(1)',
            }}
          >
            {/* Hover glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at center, ${preset.color}08, transparent)`,
              }}
            />

            <span className="text-lg relative z-10">{preset.emoji}</span>
            <span
              className="text-xs font-medium relative z-10"
              style={{ color: 'var(--text-primary)' }}
            >
              {preset.label}
            </span>

            {/* Active indicator */}
            {lastLogged === preset.activity && (
              <div
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{
                  background: preset.color,
                  boxShadow: `0 0 6px ${preset.color}80`,
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Auto-simulate Toggle */}
      <button
        onClick={toggleAutoMode}
        className="w-full py-2.5 rounded-xl text-xs font-medium transition-all duration-300 cursor-pointer"
        style={{
          background: autoMode
            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.15))'
            : 'var(--bg-glass)',
          border: `1px solid ${autoMode ? 'rgba(139, 92, 246, 0.3)' : 'var(--border-glass)'}`,
          color: autoMode ? 'var(--accent-purple)' : 'var(--text-secondary)',
        }}
      >
        {autoMode ? '⚡ Auto-Simulating...' : '▶ Auto-Simulate'}
      </button>
    </div>
  );
}
