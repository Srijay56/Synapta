'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Memory, UserProfile } from '@/types';
import ActivitySimulator from './ActivitySimulator';
import ActivityPulse from './ActivityPulse';
import MemoryTimeline from './MemoryTimeline';
import ProfileCard from './ProfileCard';
import PatternInsights from './PatternInsights';
import CognitionPanel from './CognitionPanel';

export default function Dashboard() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentActivity, setCurrentActivity] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initial data fetch — now hits the Python backend via Next.js rewrites
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [memRes, profRes] = await Promise.all([
          fetch('/api/memory/all'),
          fetch('/api/profile'),
        ]);

        const memData = await memRes.json();
        const profData = await profRes.json();

        // Python backend returns {items: [...]} for memory
        if (memData.items) {
          // Convert raw memory items into the Memory shape the frontend expects
          const formatted = memData.items.slice(0, 20).map((item: any) => ({
            id: item.id || String(Math.random()),
            activity: item.metadata?.activity || 'unknown',
            summary: item.content || '',
            tags: item.metadata?.tag ? [item.metadata.tag] : [item.metadata?.activity || 'general'],
            mood: 'neutral',
            created_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : new Date().toISOString(),
            duration_minutes: item.metadata?.duration || 5,
          }));
          setMemories(formatted);
        }

        if (profData.profile) setProfile(profData.profile);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    fetchData();
  }, []);

  // Log an activity event — now calls the Python backend's /activity endpoint
  const handleActivityLog = useCallback(
    async (activity: string, description: string, duration: number) => {
      setIsLogging(true);
      setCurrentActivity(activity);

      try {
        const res = await fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity,
            description,
            duration_minutes: duration,
          }),
        });

        const data = await res.json();

        if (data.memory) {
          setMemories((prev) => [data.memory, ...prev].slice(0, 20));
        }
        if (data.profile) {
          setProfile(data.profile);
        }
      } catch (error) {
        console.error('Failed to log activity:', error);
      } finally {
        setIsLogging(false);
        // Keep activity indicator for a moment
        setTimeout(() => setCurrentActivity(null), 1500);
      }
    },
    []
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4 animate-float">🧠</div>
          <h2
            className="text-lg font-semibold mb-2"
            style={{
              background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            CognitionOS
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Connecting to cognitive layer...
          </p>
          <div className="flex justify-center mt-4">
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="glow-line">
        <div
          className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🧠</span>
            <div>
              <h1 className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                CognitionOS
              </h1>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Cognitive Continuity System • Python Backend
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ActivityPulse
              currentActivity={currentActivity}
              isActive={!!currentActivity}
            />
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Sessions: {profile?.total_sessions || 0}
              </p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Memories: {memories.length}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {/* Left Column: Simulator */}
        <div className="flex flex-col gap-4">
          <ActivitySimulator
            onActivityLog={handleActivityLog}
            isLogging={isLogging}
          />
        </div>

        {/* Center Column: CognitionOS Panel */}
        <div className="flex flex-col">
          <CognitionPanel
            memories={memories}
            profile={profile}
          />
        </div>

        {/* Right Column: Memory + Profile + Insights */}
        <div className="flex flex-col gap-4">
          <MemoryTimeline memories={memories} />
          <ProfileCard profile={profile} />
          <PatternInsights profile={profile} />
        </div>
      </main>
    </div>
  );
}
