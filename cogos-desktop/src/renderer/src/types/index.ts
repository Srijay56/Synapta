// ============================================
// CognitionOS — Type Definitions
// ============================================

export type ActivityType = 'coding' | 'browsing' | 'designing' | 'writing' | 'meeting' | 'break'
export type MoodType = 'focused' | 'scattered' | 'creative' | 'tired' | 'neutral'
export type WorkStyle = 'deep-focus' | 'multitasker' | 'sprinter' | 'unknown'

export interface CogEvent {
  id?: number
  activity: ActivityType
  description: string
  duration_minutes: number
  created_at?: string
}

export interface Memory {
  id?: number
  activity: ActivityType
  summary: string
  tags: string[]
  mood: MoodType
  source_event_id?: number
  created_at?: string
}

export interface UserProfile {
  id?: number
  preferred_work_style: WorkStyle
  avg_focus_minutes: number
  dominant_activity: ActivityType | 'unknown'
  total_sessions: number
  peak_hours: string
  activity_distribution: Record<string, number>
  behavioral_notes: string[]
  updated_at?: string
}

export interface SimulatedActivity {
  activity: ActivityType
  descriptions: string[]
  icon: any
  color: string
  label: string
}

import { Code, Globe, PenTool, Edit3, PhoneCall, Coffee } from 'lucide-react'

export const ACTIVITY_PRESETS: SimulatedActivity[] = [
  {
    activity: 'coding', icon: Code, color: '#8b5cf6', label: 'Coding',
    descriptions: [
      'Working on authentication module in VS Code',
      'Implementing JWT token refresh logic',
      'Debugging login edge cases in the auth flow',
      'Refactoring user session handler',
      'Writing unit tests for API endpoints',
      'Building REST API for user profiles',
      'Optimizing database queries',
      'Creating React components for dashboard',
    ],
  },
  {
    activity: 'browsing', icon: Globe, color: '#3b82f6', label: 'Research',
    descriptions: [
      'Researching OAuth 2.0 best practices',
      'Reading Next.js documentation on server actions',
      'Looking up CSS animation techniques',
      'Reviewing GitHub issues on auth library',
      'Reading blog post on system design patterns',
    ],
  },
  {
    activity: 'designing', icon: PenTool, color: '#ec4899', label: 'Design',
    descriptions: [
      'Iterating on onboarding flow mockups in Figma',
      'Designing dashboard layout wireframes',
      'Creating color palette for dark theme',
      'Prototyping user settings page',
    ],
  },
  {
    activity: 'writing', icon: Edit3, color: '#10b981', label: 'Writing',
    descriptions: [
      'Drafting API documentation for team',
      'Writing technical design spec for auth system',
      'Updating README with setup instructions',
      'Documenting database schema decisions',
    ],
  },
  {
    activity: 'meeting', icon: PhoneCall, color: '#f59e0b', label: 'Meeting',
    descriptions: [
      'Sprint planning with engineering team',
      'Design review for new dashboard features',
      'One-on-one with tech lead',
      'Architecture discussion for scaling plan',
    ],
  },
  {
    activity: 'break', icon: Coffee, color: '#6b7280', label: 'Break',
    descriptions: [
      'Taking a coffee break',
      'Quick walk to reset focus',
      'Stretching and stepping away',
      'Short meditation break',
    ],
  },
]

export const ACTIVITY_COLORS: Record<string, string> = {
  coding: '#8b5cf6', browsing: '#3b82f6', designing: '#ec4899',
  writing: '#10b981', meeting: '#f59e0b', break: '#6b7280',
}

// ============================================
// Autonomous Observer Types
// ============================================

export interface NudgeEvent {
  type: 'stuck'
  message: string
  context_preview: string
  window: string
  duration_minutes: number
  timestamp: number
}

export interface ObserverStatusInfo {
  status: 'running' | 'stopped' | 'idle' | 'offline'
  paused: boolean
  total_observations: number
  total_learnings: number
  recent_count: number
  stuck: {
    is_stuck: boolean
    stuck_since: number
    stuck_duration_minutes: number
    stuck_context: string
    stuck_window: string
    nudge_sent: boolean
    nudge_count: number
  }
}

export interface HelpResponse {
  ok: boolean
  suggestions: string
  stuck_window?: string
  stuck_duration_minutes?: number
  error?: string
}

// ============================================
// Wellness Engine Types
// ============================================

export type WellnessMood = 'focused' | 'stressed' | 'scattered' | 'fatigued' | 'in-flow' | 'idle'
export type WellnessEnergy = 'high' | 'medium' | 'low'

export interface WellnessSignal {
  name: string
  severity: number
  description: string
  icon_name: string
  category: 'stress' | 'fatigue' | 'distraction' | 'info'
}

export interface WellnessRecommendation {
  text: string
  priority: number
  icon_name: string
  signal_name: string
}

export interface WellnessState {
  mood: WellnessMood
  mood_label: string
  mood_color: string
  stress_level: number
  focus_score: number
  energy_estimate: WellnessEnergy
  session_duration_minutes: number
  context_switch_rate: number
  active_signals: WellnessSignal[]
  recommendations: WellnessRecommendation[]
  timestamp: number
}

export interface WellnessSnapshot {
  mood: WellnessMood
  mood_color: string
  stress_level: number
  focus_score: number
  energy_estimate: WellnessEnergy
  session_duration_minutes: number
  context_switch_rate: number
  signal_count: number
  timestamp: number
}

// Declare the preload API on window
declare global {
  interface Window {
    cognition: import('../../preload/index').CognitionAPI
  }
}

