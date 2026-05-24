-- ============================================
-- CognitionOS — Supabase Schema Setup
-- Run this in your Supabase SQL Editor
-- ============================================

-- Events: raw activity signals from user simulation
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Memories: distilled, meaningful snapshots from events
CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  mood TEXT DEFAULT 'neutral',
  source_event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Profile: aggregated behavioral patterns
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  preferred_work_style TEXT DEFAULT 'unknown',
  avg_focus_minutes INTEGER DEFAULT 0,
  dominant_activity TEXT DEFAULT 'unknown',
  total_sessions INTEGER DEFAULT 0,
  peak_hours TEXT DEFAULT 'unknown',
  activity_distribution JSONB DEFAULT '{}',
  behavioral_notes TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default profile row
INSERT INTO user_profiles (preferred_work_style)
VALUES ('unknown')
ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
