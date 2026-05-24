// ============================================
// CognitionOS — Profile Engine
// Aggregates behavioral patterns from events
// ============================================

import type { CogEvent, UserProfile, ActivityType, WorkStyle } from '@/types';

/**
 * Calculate activity distribution as percentages
 */
function calcActivityDistribution(events: CogEvent[]): Record<string, number> {
  if (events.length === 0) return {};
  
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.activity] = (counts[event.activity] || 0) + 1;
  }

  const total = events.length;
  const distribution: Record<string, number> = {};
  for (const [activity, count] of Object.entries(counts)) {
    distribution[activity] = Math.round((count / total) * 100);
  }

  return distribution;
}

/**
 * Find dominant activity
 */
function findDominantActivity(distribution: Record<string, number>): ActivityType | 'unknown' {
  let max = 0;
  let dominant: ActivityType | 'unknown' = 'unknown';

  for (const [activity, pct] of Object.entries(distribution)) {
    if (pct > max) {
      max = pct;
      dominant = activity as ActivityType;
    }
  }

  return dominant;
}

/**
 * Calculate average focus duration (excluding breaks)
 */
function calcAvgFocusMinutes(events: CogEvent[]): number {
  const focusEvents = events.filter((e) => e.activity !== 'break' && e.activity !== 'meeting');
  if (focusEvents.length === 0) return 0;

  const total = focusEvents.reduce((sum, e) => sum + (e.duration_minutes || 5), 0);
  return Math.round(total / focusEvents.length);
}

/**
 * Infer work style from behavioral patterns
 */
function inferWorkStyle(events: CogEvent[], avgFocus: number, distribution: Record<string, number>): WorkStyle {
  if (events.length < 3) return 'unknown';

  const uniqueActivities = new Set(events.map((e) => e.activity)).size;
  const recentEvents = events.slice(0, 10);

  // Check for context switching (different consecutive activities)
  let switches = 0;
  for (let i = 1; i < recentEvents.length; i++) {
    if (recentEvents[i].activity !== recentEvents[i - 1].activity) {
      switches++;
    }
  }
  const switchRate = switches / Math.max(recentEvents.length - 1, 1);

  // Deep focus: long sessions, low switching, dominant activity > 50%
  const dominantPct = Math.max(...Object.values(distribution));
  if (avgFocus >= 25 && switchRate < 0.5 && dominantPct >= 40) {
    return 'deep-focus';
  }

  // Multitasker: high variety, frequent switching
  if (uniqueActivities >= 4 && switchRate > 0.7) {
    return 'multitasker';
  }

  // Sprinter: short intense bursts
  if (avgFocus <= 15 && events.length >= 5) {
    return 'sprinter';
  }

  // Default based on focus duration
  if (avgFocus >= 20) return 'deep-focus';
  return 'sprinter';
}

/**
 * Infer peak hours from event timestamps
 */
function inferPeakHours(events: CogEvent[]): string {
  if (events.length === 0) return 'unknown';

  const hours = events
    .filter((e) => e.created_at)
    .map((e) => new Date(e.created_at!).getHours());

  if (hours.length === 0) {
    // If no timestamps, use current time as proxy
    const now = new Date().getHours();
    if (now >= 5 && now < 12) return 'morning';
    if (now >= 12 && now < 17) return 'afternoon';
    if (now >= 17 && now < 21) return 'evening';
    return 'night';
  }

  const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);

  if (avgHour >= 5 && avgHour < 12) return 'morning';
  if (avgHour >= 12 && avgHour < 17) return 'afternoon';
  if (avgHour >= 17 && avgHour < 21) return 'evening';
  return 'night';
}

/**
 * Generate behavioral insight notes
 */
function generateBehavioralNotes(events: CogEvent[], workStyle: WorkStyle, avgFocus: number, distribution: Record<string, number>): string[] {
  const notes: string[] = [];

  if (events.length < 2) return ['Not enough data to identify patterns yet'];

  // Check for research-before-coding pattern
  for (let i = 1; i < events.length; i++) {
    if (events[i].activity === 'coding' && events[i - 1].activity === 'browsing') {
      notes.push('Tends to research before coding sessions');
      break;
    }
  }

  // Check for break patterns
  let codingStreak = 0;
  let maxStreak = 0;
  for (const event of events) {
    if (event.activity === 'coding') {
      codingStreak++;
      maxStreak = Math.max(maxStreak, codingStreak);
    } else if (event.activity === 'break') {
      if (codingStreak >= 3) {
        notes.push(`Takes breaks after ${codingStreak}+ consecutive coding sessions`);
      }
      codingStreak = 0;
    } else {
      codingStreak = 0;
    }
  }

  // Work style observations
  if (workStyle === 'deep-focus') {
    notes.push(`Maintains deep focus with avg ${avgFocus}-minute sessions`);
  } else if (workStyle === 'multitasker') {
    notes.push('Frequently switches between different activity types');
  } else if (workStyle === 'sprinter') {
    notes.push(`Works in quick ${avgFocus}-minute bursts of intense activity`);
  }

  // Activity preferences
  const sortedActivities = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  if (sortedActivities.length >= 2) {
    notes.push(
      `Primary focus: ${sortedActivities[0][0]} (${sortedActivities[0][1]}%), secondary: ${sortedActivities[1][0]} (${sortedActivities[1][1]}%)`
    );
  }

  // Design after coding pattern
  for (let i = 1; i < events.length; i++) {
    if (events[i].activity === 'designing' && events[i - 1].activity === 'coding') {
      notes.push('Alternates between coding and design thinking');
      break;
    }
  }

  return notes.slice(0, 5); // Cap at 5 notes
}

/**
 * Build a complete user profile from all events
 */
export function buildProfile(events: CogEvent[]): Omit<UserProfile, 'id' | 'updated_at'> {
  const distribution = calcActivityDistribution(events);
  const avgFocus = calcAvgFocusMinutes(events);
  const workStyle = inferWorkStyle(events, avgFocus, distribution);

  return {
    preferred_work_style: workStyle,
    avg_focus_minutes: avgFocus,
    dominant_activity: findDominantActivity(distribution),
    total_sessions: events.length,
    peak_hours: inferPeakHours(events),
    activity_distribution: distribution,
    behavioral_notes: generateBehavioralNotes(events, workStyle, avgFocus, distribution),
  };
}
