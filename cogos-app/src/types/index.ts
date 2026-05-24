// ============================================
// CognitionOS — Core Type Definitions
// ============================================

export type ActivityType =
  | 'coding'
  | 'browsing'
  | 'designing'
  | 'writing'
  | 'meeting'
  | 'break';

export type MoodType = 'focused' | 'scattered' | 'creative' | 'tired' | 'neutral';

export type WorkStyle = 'deep-focus' | 'multitasker' | 'sprinter' | 'unknown';

// Raw activity event from user simulation
export interface CogEvent {
  id?: string;
  activity: ActivityType;
  description: string;
  duration_minutes: number;
  created_at?: string;
}

// Distilled memory from an event
export interface Memory {
  id?: string;
  activity: ActivityType;
  summary: string;
  tags: string[];
  mood: MoodType;
  source_event_id?: string;
  created_at?: string;
}

// Aggregated user behavioral profile
export interface UserProfile {
  id?: string;
  preferred_work_style: WorkStyle;
  avg_focus_minutes: number;
  dominant_activity: ActivityType | 'unknown';
  total_sessions: number;
  peak_hours: string;
  activity_distribution: Record<string, number>;
  behavioral_notes: string[];
  updated_at?: string;
}

// Simulated activity preset for the simulator
export interface SimulatedActivity {
  activity: ActivityType;
  descriptions: string[];
  emoji: string;
  color: string;
  label: string;
}

// AI Chat response
export interface CognitionResponse {
  response: string;
  memoriesUsed: Memory[];
  profile: UserProfile;
}

// API response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Activity simulation presets
export const ACTIVITY_PRESETS: SimulatedActivity[] = [
  {
    activity: 'coding',
    emoji: '💻',
    color: '#8b5cf6',
    label: 'Coding',
    descriptions: [
      'Working on authentication module in VS Code',
      'Implementing JWT token refresh logic',
      'Debugging login edge cases in the auth flow',
      'Refactoring user session handler',
      'Writing unit tests for API endpoints',
      'Setting up database migrations',
      'Building REST API for user profiles',
      'Optimizing database queries for performance',
      'Implementing WebSocket connection handler',
      'Creating React components for dashboard',
    ],
  },
  {
    activity: 'browsing',
    emoji: '🌐',
    color: '#3b82f6',
    label: 'Browsing',
    descriptions: [
      'Researching OAuth 2.0 best practices',
      'Reading Next.js documentation on server actions',
      'Exploring Supabase real-time features',
      'Looking up CSS animation techniques',
      'Reviewing GitHub issues on auth library',
      'Reading blog post on system design patterns',
      'Checking Stack Overflow for TypeScript generics',
      'Browsing design inspiration on Dribbble',
    ],
  },
  {
    activity: 'designing',
    emoji: '🎨',
    color: '#ec4899',
    label: 'Designing',
    descriptions: [
      'Iterating on onboarding flow mockups in Figma',
      'Designing dashboard layout wireframes',
      'Creating color palette for dark theme',
      'Prototyping user settings page',
      'Refining component library design tokens',
      'Designing notification system UI',
    ],
  },
  {
    activity: 'writing',
    emoji: '✍️',
    color: '#10b981',
    label: 'Writing',
    descriptions: [
      'Drafting API documentation for team',
      'Writing technical design spec for auth system',
      'Updating README with setup instructions',
      'Writing changelog for v2.0 release',
      'Documenting database schema decisions',
      'Creating onboarding guide for new developers',
    ],
  },
  {
    activity: 'meeting',
    emoji: '📞',
    color: '#f59e0b',
    label: 'Meeting',
    descriptions: [
      'Sprint planning with engineering team',
      'Design review for new dashboard features',
      'One-on-one with tech lead',
      'Standup sync with cross-functional team',
      'Architecture discussion for scaling plan',
      'Customer feedback review session',
    ],
  },
  {
    activity: 'break',
    emoji: '☕',
    color: '#6b7280',
    label: 'Break',
    descriptions: [
      'Taking a coffee break',
      'Quick walk to reset focus',
      'Stretching and stepping away',
      'Grabbing lunch',
      'Short meditation break',
      'Casual chat with teammates',
    ],
  },
];
